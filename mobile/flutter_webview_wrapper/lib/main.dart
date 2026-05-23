import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

const String kWebAppUrl = String.fromEnvironment(
  'WEB_APP_URL',
  defaultValue: 'http://54.242.44.172/pages/login.html',
);
const String _credentialsChannelName = 'AxisCredentialsBridge';
const String _pdfChannelName = 'AxisPdfBridge';
const String _credentialsListStorageKey = 'axis_saved_credentials_v1';
const String _legacyUsernameStorageKey = 'axis_saved_username';
const String _legacyPasswordStorageKey = 'axis_saved_password';

class _SavedCredential {
  const _SavedCredential({
    required this.username,
    required this.password,
    required this.updatedAtMs,
  });

  final String username;
  final String password;
  final int updatedAtMs;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'username': username,
    'password': password,
    'updatedAtMs': updatedAtMs,
  };

  static _SavedCredential? tryParse(dynamic raw) {
    if (raw is! Map) return null;
    final String username = (raw['username'] ?? '').toString().trim();
    final String password = (raw['password'] ?? '').toString();
    final int updatedAtMs = int.tryParse((raw['updatedAtMs'] ?? '').toString()) ??
        DateTime.now().millisecondsSinceEpoch;
    if (username.isEmpty || password.isEmpty) return null;
    return _SavedCredential(
      username: username,
      password: password,
      updatedAtMs: updatedAtMs,
    );
  }
}

class _PendingPdfTransfer {
  _PendingPdfTransfer({
    required this.fileName,
    required this.totalChunks,
  }) : chunks = List<String?>.filled(totalChunks, null, growable: false);

  final String fileName;
  final int totalChunks;
  final List<String?> chunks;

  void setChunk(int index, String data) {
    if (index < 0 || index >= totalChunks) return;
    chunks[index] = data;
  }

  String assembleBase64() {
    final StringBuffer buffer = StringBuffer();
    for (int index = 0; index < chunks.length; index += 1) {
      final String? part = chunks[index];
      if (part == null) {
        throw StateError('Missing PDF chunk $index/$totalChunks');
      }
      buffer.write(part);
    }
    return buffer.toString();
  }
}

void main() {
  runApp(const PulmoWebMobileApp());
}

class PulmoWebMobileApp extends StatelessWidget {
  const PulmoWebMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AXIS CMS PULMO',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0F6ABF)),
        useMaterial3: true,
      ),
      home: const WebWrapperPage(),
    );
  }
}

class WebWrapperPage extends StatefulWidget {
  const WebWrapperPage({super.key});

  @override
  State<WebWrapperPage> createState() => _WebWrapperPageState();
}

class _WebWrapperPageState extends State<WebWrapperPage> {
  final FlutterSecureStorage _secureStorage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );
  final TextEditingController _offlineUsernameController =
      TextEditingController();
  final TextEditingController _offlinePasswordController =
      TextEditingController();

  late final WebViewController _controller;
  late final Uri _startUri;
  Future<void>? _credentialsLoadFuture;

  int _loadingProgress = 0;
  bool _hasMainFrameError = false;
  String _errorText = '';
  String _currentUrl = '';
  bool _credentialPromptShownForCurrentLogin = false;
  bool _isShowingCredentialPrompt = false;
  List<_SavedCredential> _savedCredentials = <_SavedCredential>[];
  String _pendingUsername = '';
  String _pendingPassword = '';
  String _preferredLoginUsername = '';
  String _preferredLoginPassword = '';
  bool _offlinePasswordVisible = false;
  bool _isOfflineRetryInProgress = false;
  final Map<String, _PendingPdfTransfer> _pendingPdfTransfers =
      <String, _PendingPdfTransfer>{};

  @override
  void initState() {
    super.initState();
    _startUri = Uri.tryParse(kWebAppUrl) ?? Uri.parse('about:blank');
    _credentialsLoadFuture = _loadSavedCredentials();

    final WebViewController controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        _credentialsChannelName,
        onMessageReceived: (JavaScriptMessage message) {
          _handleCredentialsBridgeMessage(message.message);
        },
      )
      ..addJavaScriptChannel(
        _pdfChannelName,
        onMessageReceived: (JavaScriptMessage message) {
          _handlePdfBridgeMessage(message.message);
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (int progress) {
            setState(() {
              _loadingProgress = progress;
            });
          },
          onPageStarted: (String url) {
            setState(() {
              _hasMainFrameError = false;
              _errorText = '';
              _currentUrl = url;
              _pendingPdfTransfers.clear();
              if (_isLoginPageUrl(url)) {
                _credentialPromptShownForCurrentLogin = false;
              }
            });
          },
          onPageFinished: (String url) {
            _handlePageFinished(url);
          },
          onWebResourceError: (WebResourceError error) {
            if (error.isForMainFrame ?? true) {
              setState(() {
                _hasMainFrameError = true;
                _errorText = error.description;
                _isOfflineRetryInProgress = false;
              });
            }
          },
          onNavigationRequest: (NavigationRequest request) {
            final Uri? uri = Uri.tryParse(request.url);
            if (uri == null) {
              return NavigationDecision.prevent;
            }
            if (_shouldOpenInsideWebView(uri)) {
              return NavigationDecision.navigate;
            }
            _openExternally(uri);
            return NavigationDecision.prevent;
          },
        ),
      )
      ..loadRequest(_startUri);

    if (controller.platform is AndroidWebViewController) {
      final AndroidWebViewController androidController =
          controller.platform as AndroidWebViewController;
      if (kDebugMode) {
        AndroidWebViewController.enableDebugging(true);
      }
      androidController.setMediaPlaybackRequiresUserGesture(false);
    }

    _controller = controller;
  }

  @override
  void dispose() {
    _offlineUsernameController.dispose();
    _offlinePasswordController.dispose();
    super.dispose();
  }

  bool _isLoginPageUrl(String url) {
    final String lower = url.toLowerCase();
    return lower.contains('/pages/login.html') || lower.endsWith('/login.html');
  }

  bool _isDashboardPageUrl(String url) {
    final String lower = url.toLowerCase();
    return lower.contains('/pages/dashboard.html') ||
        lower.endsWith('/dashboard.html');
  }

  Future<void> _loadSavedCredentials() async {
    try {
      final String raw =
          await _secureStorage.read(key: _credentialsListStorageKey) ?? '';
      if (raw.trim().isNotEmpty) {
        final dynamic decoded = jsonDecode(raw);
        if (decoded is List) {
          _savedCredentials = decoded
              .map(_SavedCredential.tryParse)
              .whereType<_SavedCredential>()
              .toList();
        }
      }

      // Migrate from old single-account storage format.
      if (_savedCredentials.isEmpty) {
        final String legacyUsername =
            (await _secureStorage.read(key: _legacyUsernameStorageKey) ?? '')
                .trim();
        final String legacyPassword =
            await _secureStorage.read(key: _legacyPasswordStorageKey) ?? '';
        if (legacyUsername.isNotEmpty && legacyPassword.isNotEmpty) {
          _savedCredentials = <_SavedCredential>[
            _SavedCredential(
              username: legacyUsername,
              password: legacyPassword,
              updatedAtMs: DateTime.now().millisecondsSinceEpoch,
            ),
          ];
          await _persistSavedCredentials();
        }
      }

      _savedCredentials.sort((a, b) => b.updatedAtMs.compareTo(a.updatedAtMs));
      if (mounted) {
        setState(() {});
      }
    } catch (_) {
      _savedCredentials = <_SavedCredential>[];
      if (mounted) {
        setState(() {});
      }
    }
  }

  Future<void> _persistSavedCredentials() async {
    final List<Map<String, dynamic>> payload =
        _savedCredentials.map((item) => item.toJson()).toList();
    await _secureStorage.write(
      key: _credentialsListStorageKey,
      value: jsonEncode(payload),
    );
  }

  Future<void> _saveCredentials(String username, String password) async {
    final String cleanUsername = username.trim();
    if (cleanUsername.isEmpty || password.isEmpty) return;
    try {
      final int nowMs = DateTime.now().millisecondsSinceEpoch;
      final String key = cleanUsername.toLowerCase();
      final int existingIndex = _savedCredentials.indexWhere(
        (item) => item.username.toLowerCase() == key,
      );
      final _SavedCredential next = _SavedCredential(
        username: cleanUsername,
        password: password,
        updatedAtMs: nowMs,
      );
      if (existingIndex >= 0) {
        _savedCredentials[existingIndex] = next;
      } else {
        _savedCredentials.add(next);
      }
      _savedCredentials.sort((a, b) => b.updatedAtMs.compareTo(a.updatedAtMs));
      if (_savedCredentials.length > 20) {
        _savedCredentials = _savedCredentials.take(20).toList();
      }
      await _persistSavedCredentials();
    } catch (_) {
      // Ignore storage errors to keep login flow stable.
    }
  }

  void _handleCredentialsBridgeMessage(String rawMessage) {
    try {
      final dynamic payload = jsonDecode(rawMessage);
      if (payload is! Map) return;
      final String type = (payload['type'] ?? '').toString().trim();
      if (type.isNotEmpty && type != 'login-credentials') return;
      final String username = (payload['username'] ?? '').toString().trim();
      final String password = (payload['password'] ?? '').toString();
      if (username.isEmpty || password.isEmpty) return;
      _pendingUsername = username;
      _pendingPassword = password;
    } catch (_) {
      // Ignore malformed bridge messages.
    }
  }

  Future<void> _handlePageFinished(String url) async {
    if (mounted) {
      setState(() {
        _currentUrl = url;
        _isOfflineRetryInProgress = false;
      });
    } else {
      _currentUrl = url;
    }

    if (_isDashboardPageUrl(url) &&
        _pendingUsername.isNotEmpty &&
        _pendingPassword.isNotEmpty) {
      await _saveCredentials(_pendingUsername, _pendingPassword);
      _pendingUsername = '';
      _pendingPassword = '';
      _preferredLoginUsername = '';
      _preferredLoginPassword = '';
    }

    if (_isLoginPageUrl(url)) {
      await _enhanceLoginAutofill(url);
      await _installPdfSaveBridge();
      return;
    }
    await _enhanceLoginAutofill(url);
    await _installPdfSaveBridge();
  }

  Future<void> _applyCredentialToLoginForm(_SavedCredential credential) async {
    if (!_isLoginPageUrl(_currentUrl)) return;
    final String usernameJs = jsonEncode(credential.username);
    final String passwordJs = jsonEncode(credential.password);
    final String js = '''
      (function () {
        try {
          var user = document.getElementById('User') || document.getElementById('user') || document.getElementById('email');
          var pass = document.getElementById('password');
          if (user) {
            user.value = $usernameJs;
            user.dispatchEvent(new Event('input', { bubbles: true }));
            user.dispatchEvent(new Event('change', { bubbles: true }));
            try { user.focus(); } catch (_) {}
          }
          if (pass) {
            pass.value = $passwordJs;
            pass.dispatchEvent(new Event('input', { bubbles: true }));
            pass.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } catch (_) {}
      })();
    ''';
    try {
      await _controller.runJavaScript(js);
    } catch (_) {
      // Ignore JS injection failures.
    }
  }

  Future<void> _maybeShowSavedAccountsPrompt({bool force = false}) async {
    if (!_isLoginPageUrl(_currentUrl)) return;
    if (_savedCredentials.isEmpty) return;
    if (!force &&
        (_credentialPromptShownForCurrentLogin || _isShowingCredentialPrompt)) {
      return;
    }
    if (force && _isShowingCredentialPrompt) return;
    if (!mounted) return;

    if (!force) {
      _credentialPromptShownForCurrentLogin = true;
    }
    _isShowingCredentialPrompt = true;

    final _SavedCredential? picked = await showModalBottomSheet<_SavedCredential>(
      context: context,
      showDragHandle: true,
      builder: (BuildContext context) {
        final double maxHeight = MediaQuery.of(context).size.height * 0.6;
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const ListTile(
                leading: Icon(Icons.lock_outline),
                title: Text('Saved Accounts'),
                subtitle: Text('Select an account to fill username and password'),
              ),
              ConstrainedBox(
                constraints: BoxConstraints(maxHeight: maxHeight),
                child: ListView.builder(
                    shrinkWrap: true,
                    itemCount: _savedCredentials.length,
                    itemBuilder: (BuildContext context, int index) {
                      final _SavedCredential credential = _savedCredentials[index];
                      return ListTile(
                        leading: const Icon(Icons.person_outline),
                        title: Text(credential.username),
                        subtitle: const Text('Tap to use this account'),
                        onTap: () => Navigator.of(context).pop(credential),
                      );
                    }),
              ),
            ],
          ),
        );
      },
    );

    _isShowingCredentialPrompt = false;
    if (picked != null) {
      await _applyCredentialToLoginForm(picked);
    }
  }

  Future<void> _enhanceLoginAutofill(String url) async {
    if (!_isLoginPageUrl(url)) return;
    final String preferredUser = _preferredLoginUsername.trim();
    final String preferredPassword = _preferredLoginPassword;
    final String preferredUserJs = jsonEncode(preferredUser);
    final String preferredPasswordJs = jsonEncode(preferredPassword);
    final String js = '''
      (function () {
        try {
          var preferredUser = $preferredUserJs;
          var preferredPassword = $preferredPasswordJs;
          var hasPreferred = !!String(preferredUser || '').trim() && !!String(preferredPassword || '');
          var form = document.getElementById('loginForm');
          var user = document.getElementById('User') || document.getElementById('user') || document.getElementById('email');
          var pass = document.getElementById('password');
          var loginBtn = document.getElementById('loginBtn');
          var credentialBridge = window.$_credentialsChannelName;

          if (form) {
            form.setAttribute('method', 'post');
            form.setAttribute('autocomplete', 'off');
          }
          if (user) {
            user.setAttribute('name', user.getAttribute('name') || 'username');
            user.setAttribute('autocomplete', 'off');
            user.setAttribute('autocapitalize', 'none');
            user.setAttribute('autocorrect', 'off');
            user.setAttribute('spellcheck', 'false');
          }
          if (pass) {
            pass.setAttribute('name', pass.getAttribute('name') || 'password');
            pass.setAttribute('autocomplete', 'off');
          }
          if (loginBtn && loginBtn.tagName === 'BUTTON') {
            loginBtn.setAttribute('type', 'submit');
          }

          var dispatchFieldEvents = function (inputEl) {
            if (!inputEl) return;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
          };

          var clearLoginValues = function () {
            if (hasPreferred) return;
            if (user && String(user.value || '').trim()) {
              user.value = '';
              dispatchFieldEvents(user);
            }
            if (pass && String(pass.value || '')) {
              pass.value = '';
              dispatchFieldEvents(pass);
            }
          };

          var fillPreferredValues = function () {
            if (!hasPreferred) return;
            if (user && !String(user.value || '').trim()) {
              user.value = preferredUser;
              dispatchFieldEvents(user);
            }
            if (pass && !String(pass.value || '')) {
              pass.value = preferredPassword;
              dispatchFieldEvents(pass);
            }
          };

          var sendCredentialsToApp = function (source) {
            try {
              if (!credentialBridge || typeof credentialBridge.postMessage !== 'function') return;
              if (!user || !pass) return;
              var usernameValue = String(user.value || '').trim();
              var passwordValue = String(pass.value || '');
              if (!usernameValue || !passwordValue) return;
              credentialBridge.postMessage(JSON.stringify({
                type: 'login-credentials',
                source: source || 'unknown',
                username: usernameValue,
                password: passwordValue
              }));
            } catch (_) {}
          };

          if (!window.__axisCredentialsHooked) {
            window.__axisCredentialsHooked = true;
            if (form) {
              form.addEventListener('submit', function () {
                sendCredentialsToApp('submit');
              });
            }
            if (loginBtn) {
              loginBtn.addEventListener('click', function () {
                sendCredentialsToApp('click');
              });
            }
          }

          clearLoginValues();
          fillPreferredValues();

          if (user) {
            window.setTimeout(function () {
              clearLoginValues();
              fillPreferredValues();
              try { user.focus(); } catch (_) {}
            }, 120);
          }
        } catch (_) {}
      })();
    ''';
    try {
      await _controller.runJavaScript(js);
    } catch (_) {
      // Keep app stable even if injected script fails on some pages.
    }
  }

  void _handlePdfBridgeMessage(String rawMessage) {
    unawaited(_processPdfBridgeMessage(rawMessage));
  }

  Future<void> _processPdfBridgeMessage(String rawMessage) async {
    try {
      final dynamic payload = jsonDecode(rawMessage);
      if (payload is! Map) return;
      final String type = (payload['type'] ?? '').toString().trim();
      switch (type) {
        case 'pdf-base64':
          await _handleSinglePdfPayload(payload);
          return;
        case 'pdf-start':
          _handleChunkedPdfStart(payload);
          return;
        case 'pdf-chunk':
          _handleChunkedPdfData(payload);
          return;
        case 'pdf-complete':
          await _handleChunkedPdfComplete(payload);
          return;
        default:
          return;
      }
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to open PDF from app view. $error')),
      );
    }
  }

  Future<void> _handleSinglePdfPayload(Map payload) async {
    final String encodedData = (payload['data'] ?? '').toString().trim();
    if (encodedData.isEmpty) return;
    final String fileName = _sanitizePdfFileName(
      (payload['filename'] ?? 'Document.pdf').toString(),
    );
    await _saveAndOpenPdf(fileName, encodedData);
  }

  void _handleChunkedPdfStart(Map payload) {
    final String transferId = (payload['transferId'] ?? '').toString().trim();
    final String fileName = _sanitizePdfFileName(
      (payload['filename'] ?? 'Document.pdf').toString(),
    );
    final int totalChunks = int.tryParse(
          (payload['totalChunks'] ?? '').toString(),
        ) ??
        0;
    if (transferId.isEmpty || totalChunks <= 0) return;
    _pendingPdfTransfers[transferId] = _PendingPdfTransfer(
      fileName: fileName,
      totalChunks: totalChunks,
    );
  }

  void _handleChunkedPdfData(Map payload) {
    final String transferId = (payload['transferId'] ?? '').toString().trim();
    final int index = int.tryParse((payload['index'] ?? '').toString()) ?? -1;
    final String chunk = (payload['data'] ?? '').toString();
    if (transferId.isEmpty || index < 0 || chunk.isEmpty) return;
    final _PendingPdfTransfer? transfer = _pendingPdfTransfers[transferId];
    if (transfer == null) return;
    transfer.setChunk(index, chunk);
  }

  Future<void> _handleChunkedPdfComplete(Map payload) async {
    final String transferId = (payload['transferId'] ?? '').toString().trim();
    if (transferId.isEmpty) return;
    final _PendingPdfTransfer? transfer = _pendingPdfTransfers.remove(transferId);
    if (transfer == null) return;
    final String encodedData = transfer.assembleBase64();
    await _saveAndOpenPdf(transfer.fileName, encodedData);
  }

  String _sanitizePdfFileName(String input) {
    final String cleaned = input.trim().replaceAll(
      RegExp(r'[\\/:*?"<>|]+'),
      '_',
    );
    if (cleaned.isEmpty) return 'Document.pdf';
    return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : '$cleaned.pdf';
  }

  Future<void> _saveAndOpenPdf(String fileName, String encodedData) async {
    final List<int> bytes = base64Decode(base64.normalize(encodedData));
    final File pdfFile = await _writePdfWithFallback(fileName, bytes);

    final dynamic openResult = await OpenFilex.open(
      pdfFile.path,
      type: 'application/pdf',
    );
    final String resultType = (openResult?.type ?? '').toString().toLowerCase();
    final bool opened = resultType.contains('done');
    if (!opened && mounted) {
      final String message = (openResult?.message ?? '').toString().trim();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            message.isNotEmpty
                ? 'PDF saved to ${pdfFile.path}, but open failed: $message'
                : 'PDF saved to ${pdfFile.path}, but no app could open it.',
          ),
        ),
      );
    } else if (opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('PDF saved to ${pdfFile.path}')),
      );
    }
  }

  Future<File> _writePdfWithFallback(String fileName, List<int> bytes) async {
    final List<Directory> saveDirs = await _resolvePdfSaveDirectories();
    Object? lastError;
    for (final Directory dir in saveDirs) {
      try {
        if (!await dir.exists()) {
          await dir.create(recursive: true);
        }
        final File candidate =
            File('${dir.path}${Platform.pathSeparator}$fileName');
        await candidate.writeAsBytes(bytes, flush: true);
        return candidate;
      } catch (err) {
        lastError = err;
      }
    }
    if (lastError != null) {
      throw lastError;
    }
    throw StateError('Failed to save PDF: no writable storage directory found.');
  }

  Future<List<Directory>> _resolvePdfSaveDirectories() async {
    final List<Directory> dirs = <Directory>[];
    final Set<String> seen = <String>{};
    void addDir(Directory dir) {
      final String key = dir.path.toLowerCase();
      if (seen.contains(key)) return;
      seen.add(key);
      dirs.add(dir);
    }

    if (Platform.isAndroid) {
      // Try public Downloads first when allowed.
      addDir(Directory('/storage/emulated/0/Download'));

      final Directory? externalDir = await getExternalStorageDirectory();
      if (externalDir != null) {
        addDir(
          Directory('${externalDir.path}${Platform.pathSeparator}downloads'),
        );
        addDir(externalDir);
      }
    }

    final Directory docsDir = await getApplicationDocumentsDirectory();
    addDir(Directory('${docsDir.path}${Platform.pathSeparator}downloads'));
    addDir(docsDir);

    if (dirs.isEmpty) {
      addDir(Directory.systemTemp);
    }
    return dirs;
  }

  Future<void> _installPdfSaveBridge() async {
    final String channelNameJs = jsonEncode(_pdfChannelName);
    final String js = '''
      (function () {
        try {
          if (window.__axisPdfBridgeInstallStarted) return;
          window.__axisPdfBridgeInstallStarted = true;
          var bridgeName = $channelNameJs;
          var maxAttempts = 40;
          var attempt = 0;

          function installPatch() {
            attempt += 1;
            try {
              var jsPdfCtor = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : null;
              if (!jsPdfCtor || !jsPdfCtor.API) {
                if (attempt < maxAttempts) {
                  window.setTimeout(installPatch, 250);
                }
                return;
              }

              var api = jsPdfCtor.API;
              if (api.__axisPdfSavePatched) return;

              var originalSave = typeof api.save === 'function' ? api.save : null;
              api.__axisPdfSavePatched = true;
              api.__axisOriginalSave = originalSave;

              api.save = function (fileName, options) {
                try {
                  var safeFileName = typeof fileName === 'string' && fileName.trim()
                    ? fileName.trim()
                    : 'Document.pdf';
                  if (!/\\.pdf\$/i.test(safeFileName)) {
                    safeFileName += '.pdf';
                  }

                  var bridge = window[bridgeName];
                  if (!bridge || typeof bridge.postMessage !== 'function') {
                    if (originalSave) {
                      return originalSave.call(this, fileName, options);
                    }
                    return this;
                  }

                  var pdfBlob = this.output('blob');
                  var reader = new FileReader();
                  reader.onloadend = function () {
                    try {
                      var dataUrl = String(reader.result || '');
                      var commaIndex = dataUrl.indexOf(',');
                      var base64 = commaIndex >= 0 ? dataUrl.substring(commaIndex + 1) : dataUrl;
                      var postPayload = function(payload) {
                        bridge.postMessage(JSON.stringify(payload));
                      };
                      var chunkSize = 120000;
                      if (base64.length <= chunkSize) {
                        postPayload({
                          type: 'pdf-base64',
                          filename: safeFileName,
                          data: base64
                        });
                        return;
                      }
                      var transferId = 'pdf_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
                      var totalChunks = Math.ceil(base64.length / chunkSize);
                      postPayload({
                        type: 'pdf-start',
                        transferId: transferId,
                        filename: safeFileName,
                        totalChunks: totalChunks
                      });
                      for (var chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
                        var start = chunkIndex * chunkSize;
                        var end = Math.min(start + chunkSize, base64.length);
                        postPayload({
                          type: 'pdf-chunk',
                          transferId: transferId,
                          index: chunkIndex,
                          data: base64.slice(start, end)
                        });
                      }
                      postPayload({
                        type: 'pdf-complete',
                        transferId: transferId
                      });
                    } catch (_) {
                      if (originalSave) {
                        originalSave.call(this, fileName, options);
                      }
                    }
                  }.bind(this);

                  reader.onerror = function () {
                    if (originalSave) {
                      originalSave.call(this, fileName, options);
                    }
                  }.bind(this);

                  reader.readAsDataURL(pdfBlob);
                  return this;
                } catch (_) {
                  if (originalSave) {
                    return originalSave.call(this, fileName, options);
                  }
                  return this;
                }
              };
            } catch (_) {}
          }

          installPatch();
        } catch (_) {}
      })();
    ''';
    try {
      await _controller.runJavaScript(js);
    } catch (_) {
      // Ignore patch install failures and keep default page behavior.
    }
  }

  _SavedCredential? _findSavedCredentialByUsername(String username) {
    final String key = username.trim().toLowerCase();
    if (key.isEmpty) return null;
    for (final _SavedCredential credential in _savedCredentials) {
      if (credential.username.trim().toLowerCase() == key) {
        return credential;
      }
    }
    return null;
  }

  void _onOfflineSavedUserPicked(String? username) {
    if (username == null || username.trim().isEmpty) return;
    final _SavedCredential? credential = _findSavedCredentialByUsername(username);
    if (credential == null) return;
    setState(() {
      _offlineUsernameController.text = credential.username;
      _offlinePasswordController.text = credential.password;
    });
  }

  Future<void> _retryOnlineLoginFromOffline() async {
    if (_isOfflineRetryInProgress) return;
    final String username = _offlineUsernameController.text.trim();
    final String password = _offlinePasswordController.text;
    if (username.isEmpty || password.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter username and password.')),
      );
      return;
    }

    _pendingUsername = username;
    _pendingPassword = password;
    _preferredLoginUsername = username;
    _preferredLoginPassword = password;

    if (mounted) {
      setState(() {
        _hasMainFrameError = false;
        _errorText = '';
        _isOfflineRetryInProgress = true;
      });
    }

    try {
      await _controller.loadRequest(_startUri);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _hasMainFrameError = true;
        _isOfflineRetryInProgress = false;
        _errorText = error.toString();
      });
    }
  }

  Future<void> _reload() async {
    await _controller.reload();
  }

  Future<void> _openExternally(Uri uri) async {
    final bool launched = await launchUrl(
      uri,
      mode: LaunchMode.externalApplication,
    );
    if (!launched && mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Could not open: $uri')));
    }
  }

  bool _shouldOpenInsideWebView(Uri uri) {
    final String scheme = uri.scheme.toLowerCase();
    return scheme == 'http' || scheme == 'https';
  }

  Future<bool> _handleWillPop() async {
    if (await _controller.canGoBack()) {
      await _controller.goBack();
      return false;
    }
    return true;
  }

  void _openSavedAccountsFromKeyButton() {
    if (_savedCredentials.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No saved users yet. Login once to save credentials.'),
        ),
      );
      return;
    }
    unawaited(_maybeShowSavedAccountsPrompt(force: true));
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (bool didPop, dynamic _) async {
        if (didPop) return;
        final NavigatorState navigator = Navigator.of(context);
        final bool shouldPop = await _handleWillPop();
        if (shouldPop && navigator.mounted) {
          navigator.pop();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text(
            'AXIS CMS PULMO',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
          ),
          actions: [
            if (_isLoginPageUrl(_currentUrl))
              IconButton(
                tooltip: 'Saved Accounts',
                onPressed: _openSavedAccountsFromKeyButton,
                icon: const Icon(Icons.key_outlined),
              ),
            IconButton(
              tooltip: 'Refresh',
              onPressed: _reload,
              icon: const Icon(Icons.refresh),
            ),
          ],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(3),
            child: _loadingProgress < 100
                ? LinearProgressIndicator(value: _loadingProgress / 100)
                : const SizedBox(height: 3),
          ),
        ),
        body: SafeArea(
          child: _hasMainFrameError
              ? _OfflineLoginView(
                  message: _errorText,
                  usernameController: _offlineUsernameController,
                  passwordController: _offlinePasswordController,
                  passwordVisible: _offlinePasswordVisible,
                  onTogglePasswordVisible: () {
                    setState(() {
                      _offlinePasswordVisible = !_offlinePasswordVisible;
                    });
                  },
                  savedCredentials: _savedCredentials,
                  retryInProgress: _isOfflineRetryInProgress,
                  onSavedCredentialSelected: _onOfflineSavedUserPicked,
                  onRetryOnlineLogin: _retryOnlineLoginFromOffline,
                  onTryAgain: _reload,
                )
              : WebViewWidget(controller: _controller),
        ),
      ),
    );
  }
}

class _OfflineLoginView extends StatelessWidget {
  const _OfflineLoginView({
    required this.message,
    required this.usernameController,
    required this.passwordController,
    required this.passwordVisible,
    required this.onTogglePasswordVisible,
    required this.savedCredentials,
    required this.retryInProgress,
    required this.onSavedCredentialSelected,
    required this.onRetryOnlineLogin,
    required this.onTryAgain,
  });

  final String message;
  final TextEditingController usernameController;
  final TextEditingController passwordController;
  final bool passwordVisible;
  final VoidCallback onTogglePasswordVisible;
  final List<_SavedCredential> savedCredentials;
  final bool retryInProgress;
  final ValueChanged<String?> onSavedCredentialSelected;
  final Future<void> Function() onRetryOnlineLogin;
  final Future<void> Function() onTryAgain;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 16),
            const Icon(Icons.cloud_off, size: 56),
            const SizedBox(height: 12),
            const Text(
              'Offline Login',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              message.isEmpty ? 'Server is unreachable right now.' : message,
              style: const TextStyle(fontSize: 14),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            if (savedCredentials.isNotEmpty)
              DropdownButtonFormField<String>(
                decoration: const InputDecoration(
                  labelText: 'Saved Users',
                  border: OutlineInputBorder(),
                ),
                items: savedCredentials
                    .map(
                      (item) => DropdownMenuItem<String>(
                        value: item.username,
                        child: Text(item.username),
                      ),
                    )
                    .toList(),
                onChanged: onSavedCredentialSelected,
              ),
            if (savedCredentials.isNotEmpty) const SizedBox(height: 14),
            TextField(
              controller: usernameController,
              autocorrect: false,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Username',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: passwordController,
              obscureText: !passwordVisible,
              textInputAction: TextInputAction.done,
              decoration: InputDecoration(
                labelText: 'Password',
                border: const OutlineInputBorder(),
                suffixIcon: IconButton(
                  onPressed: onTogglePasswordVisible,
                  icon: Icon(
                    passwordVisible ? Icons.visibility_off : Icons.visibility,
                  ),
                ),
              ),
              onSubmitted: (_) {
                unawaited(onRetryOnlineLogin());
              },
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: retryInProgress
                  ? null
                  : () {
                      unawaited(onRetryOnlineLogin());
                    },
              icon: retryInProgress
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.login),
              label: Text(
                retryInProgress ? 'Opening Login...' : 'Login When Online',
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: retryInProgress
                  ? null
                  : () {
                      unawaited(onTryAgain());
                    },
              icon: const Icon(Icons.refresh),
              label: const Text('Try Again'),
            ),
          ],
        ),
      ),
    );
  }
}
