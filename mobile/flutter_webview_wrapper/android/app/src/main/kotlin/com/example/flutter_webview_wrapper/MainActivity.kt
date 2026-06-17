package com.example.flutter_webview_wrapper

import android.app.Activity
import android.content.Intent
import android.net.Uri
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

private const val FILE_SELECTOR_CHANNEL = "AxisAndroidFileSelectorBridge"
private const val FILE_PICKER_REQUEST_CODE = 9025

class MainActivity : FlutterFragmentActivity() {
    private var pendingFilePickerResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            FILE_SELECTOR_CHANNEL,
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "pickFiles" -> {
                    if (pendingFilePickerResult != null) {
                        result.error(
                            "file_picker_busy",
                            "Another file selection is already in progress.",
                            null,
                        )
                        return@setMethodCallHandler
                    }

                    val allowMultiple = call.argument<Boolean>("allowMultiple") ?: false
                    val acceptTypes =
                        call.argument<List<String>>("acceptTypes")
                            ?.map { value -> value.trim() }
                            ?.filter { value -> value.isNotEmpty() }
                            .orEmpty()

                    launchFilePicker(
                        allowMultiple = allowMultiple,
                        acceptTypes = acceptTypes,
                        result = result,
                    )
                }

                else -> result.notImplemented()
            }
        }
    }

    private fun launchFilePicker(
        allowMultiple: Boolean,
        acceptTypes: List<String>,
        result: MethodChannel.Result,
    ) {
        val intent =
            Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, allowMultiple)

                val mimeTypes = normalizeMimeTypes(acceptTypes)
                if (mimeTypes.isEmpty() || mimeTypes.contains("*/*")) {
                    type = "*/*"
                } else if (mimeTypes.size == 1) {
                    type = mimeTypes.first()
                } else {
                    type = "*/*"
                    putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes.toTypedArray())
                }
            }

        pendingFilePickerResult = result
        try {
            startActivityForResult(Intent.createChooser(intent, "Choose file"), FILE_PICKER_REQUEST_CODE)
        } catch (err: Exception) {
            pendingFilePickerResult = null
            result.error(
                "file_picker_unavailable",
                err.message ?: "Unable to open the file picker.",
                null,
            )
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != FILE_PICKER_REQUEST_CODE) {
            return
        }

        val pendingResult = pendingFilePickerResult ?: return
        pendingFilePickerResult = null

        if (resultCode != Activity.RESULT_OK) {
            pendingResult.success(emptyList<String>())
            return
        }

        pendingResult.success(collectSelectedUris(data))
    }

    private fun collectSelectedUris(data: Intent?): List<String> {
        val uris = linkedSetOf<String>()
        val clipData = data?.clipData
        if (clipData != null) {
            for (index in 0 until clipData.itemCount) {
                addUriIfPresent(clipData.getItemAt(index)?.uri, uris)
            }
        } else {
            addUriIfPresent(data?.data, uris)
        }
        return uris.toList()
    }

    private fun addUriIfPresent(uri: Uri?, uris: MutableSet<String>) {
        if (uri == null) return
        try {
            contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION,
            )
        } catch (_: SecurityException) {
            // Some providers do not expose persistable permissions. Temporary access is enough.
        }
        uris.add(uri.toString())
    }

    private fun normalizeMimeTypes(acceptTypes: List<String>): List<String> {
        val normalized = linkedSetOf<String>()
        acceptTypes.forEach { rawType ->
            normalizeMimeType(rawType)?.let { mimeType ->
                normalized.add(mimeType)
            }
        }
        return normalized.toList()
    }

    private fun normalizeMimeType(rawType: String): String? {
        val value = rawType.trim().lowercase()
        if (value.isEmpty()) return null
        if (value == "*/*") return value
        if (value.startsWith(".")) {
            return extensionToMimeType(value)
        }
        if (value.contains("/")) {
            return value.substringBefore(";").trim().ifEmpty { null }
        }
        return null
    }

    private fun extensionToMimeType(extension: String): String? =
        when (extension.lowercase()) {
            ".jpg", ".jpeg" -> "image/jpeg"
            ".png" -> "image/png"
            ".gif" -> "image/gif"
            ".bmp" -> "image/bmp"
            ".tif", ".tiff" -> "image/tiff"
            ".webp" -> "image/webp"
            ".pdf" -> "application/pdf"
            ".csv" -> "text/csv"
            ".txt" -> "text/plain"
            ".json" -> "application/json"
            else -> null
        }
}
