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
const String _loginStatusChannelName = 'AxisLoginStatusBridge';
const String _pdfChannelName = 'AxisPdfBridge';
const String _fileChannelName = 'AxisFileBridge';
const String _credentialsListStorageKey = 'axis_saved_credentials_v1';
const String _legacyUsernameStorageKey = 'axis_saved_username';
const String _legacyPasswordStorageKey = 'axis_saved_password';
const String _androidPublicDownloadsPath = '/storage/emulated/0/Download';
const String _loginScreenVersion = 'V26.6.015';

String _normalizeCompanyCode(String value) {
  final String normalized = value
      .trim()
      .toUpperCase()
      .replaceAll(RegExp(r'[^A-Z0-9_-]+'), '');
  if (normalized.length <= 40) {
    return normalized;
  }
  return normalized.substring(0, 40);
}

String _savedCredentialStorageKey(String username, {String companyCode = ''}) {
  final String cleanUsername = username.trim().toLowerCase();
  final String cleanCompanyCode = _normalizeCompanyCode(companyCode);
  return '$cleanCompanyCode::$cleanUsername';
}

class _SavedCredential {
  const _SavedCredential({
    required this.username,
    required this.password,
    required this.updatedAtMs,
    this.companyCode = '',
  });

  final String username;
  final String password;
  final int updatedAtMs;
  final String companyCode;

  String get normalizedCompanyCode => _normalizeCompanyCode(companyCode);

  String get displayLabel =>
      normalizedCompanyCode.isEmpty
          ? username
          : '$username ($normalizedCompanyCode)';

  String get helperLabel =>
      normalizedCompanyCode.isEmpty
          ? 'Tap to use this account'
          : 'Company code: $normalizedCompanyCode';

  Map<String, dynamic> toJson() => <String, dynamic>{
    'username': username,
    'password': password,
    'updatedAtMs': updatedAtMs,
    'companyCode': normalizedCompanyCode,
  };

  static _SavedCredential? tryParse(dynamic raw) {
    if (raw is! Map) return null;
    final String username = (raw['username'] ?? '').toString().trim();
    final String password = (raw['password'] ?? '').toString();
    final String companyCode = _normalizeCompanyCode(
      (raw['companyCode'] ?? raw['company_code'] ?? '').toString(),
    );
    final int updatedAtMs =
        int.tryParse((raw['updatedAtMs'] ?? '').toString()) ??
        DateTime.now().millisecondsSinceEpoch;
    if (username.isEmpty || password.isEmpty) return null;
    return _SavedCredential(
      username: username,
      password: password,
      updatedAtMs: updatedAtMs,
      companyCode: companyCode,
    );
  }
}

class _PendingFileTransfer {
  _PendingFileTransfer({
    required this.fileName,
    required this.totalChunks,
    this.mimeType = 'application/octet-stream',
  }) : chunks = List<String?>.filled(totalChunks, null, growable: false);

  final String fileName;
  final int totalChunks;
  final String mimeType;
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
        throw StateError('Missing file chunk $index/$totalChunks');
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
      title: 'AXIS CMS SYSTEM',
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
  final TextEditingController _offlineCompanyCodeController =
      TextEditingController();
  final TextEditingController _offlineUsernameController =
      TextEditingController();
  final TextEditingController _offlinePasswordController =
      TextEditingController();

  late final WebViewController _controller;
  late final Uri _startUri;

  int _loadingProgress = 0;
  bool _hasMainFrameError = false;
  String _currentUrl = '';
  bool _credentialPromptShownForCurrentLogin = false;
  bool _isShowingCredentialPrompt = false;
  List<_SavedCredential> _savedCredentials = <_SavedCredential>[];
  String _pendingUsername = '';
  String _pendingPassword = '';
  String _pendingCompanyCode = '';
  String _preferredLoginUsername = '';
  String _preferredLoginPassword = '';
  String _preferredLoginCompanyCode = '';
  bool _offlinePasswordVisible = false;
  bool _isOfflineRetryInProgress = false;
  bool _showPasswordUpdateAction = false;
  bool _credentialSaveWarningShown = false;
  String _passwordUpdateUsername = '';
  String _passwordUpdateValue = '';
  String _passwordUpdateCompanyCode = '';
  final Map<String, _PendingFileTransfer> _pendingPdfTransfers =
      <String, _PendingFileTransfer>{};
  final Map<String, _PendingFileTransfer> _pendingFileTransfers =
      <String, _PendingFileTransfer>{};
  String _lastPdfBridgeInjectedUrl = '';
  bool _skipAndroidPublicDownloadPath = false;
  List<Directory>? _cachedDownloadSaveDirectories;

  @override
  void initState() {
    super.initState();
    _startUri = Uri.tryParse(kWebAppUrl) ?? Uri.parse('about:blank');
    unawaited(_loadSavedCredentials());

    final WebViewController controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        _credentialsChannelName,
        onMessageReceived: (JavaScriptMessage message) {
          _handleCredentialsBridgeMessage(message.message);
        },
      )
      ..addJavaScriptChannel(
        _loginStatusChannelName,
        onMessageReceived: (JavaScriptMessage message) {
          _handleLoginStatusBridgeMessage(message.message);
        },
      )
      ..addJavaScriptChannel(
        _pdfChannelName,
        onMessageReceived: (JavaScriptMessage message) {
          _handlePdfBridgeMessage(message.message);
        },
      )
      ..addJavaScriptChannel(
        _fileChannelName,
        onMessageReceived: (JavaScriptMessage message) {
          _handleFileBridgeMessage(message.message);
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (int progress) {
            final int normalized = progress.clamp(0, 100);
            final int delta = (normalized - _loadingProgress).abs();
            final bool shouldUpdate =
                normalized == 0 || normalized == 100 || delta >= 4;
            if (!shouldUpdate || !mounted) return;
            setState(() {
              _loadingProgress = normalized;
            });
          },
          onPageStarted: (String url) {
            setState(() {
              _hasMainFrameError = false;
              _currentUrl = url;
              _loadingProgress = 0;
              _pendingPdfTransfers.clear();
              _pendingFileTransfers.clear();
              _lastPdfBridgeInjectedUrl = '';
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
    _offlineCompanyCodeController.dispose();
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
      final String raw = await _readSavedCredentialsRaw();
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
              companyCode: '',
            ),
          ];
          await _persistSavedCredentials();
        }
      }

      _savedCredentials.sort((a, b) => b.updatedAtMs.compareTo(a.updatedAtMs));
      if (_savedCredentials.isNotEmpty) {
        final _SavedCredential latest = _savedCredentials.first;
        _preferredLoginCompanyCode = latest.normalizedCompanyCode;
        if (_offlineCompanyCodeController.text.trim().isEmpty) {
          _offlineCompanyCodeController.text = latest.normalizedCompanyCode;
        }
        if (_offlineUsernameController.text.trim().isEmpty) {
          _offlineUsernameController.text = latest.username;
        }
        if (_offlinePasswordController.text.isEmpty) {
          _offlinePasswordController.text = latest.password;
        }
      }
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

  Future<String> _readSavedCredentialsRaw() async {
    try {
      final String raw =
          await _secureStorage.read(key: _credentialsListStorageKey) ?? '';
      if (raw.trim().isNotEmpty) return raw;
    } catch (_) {
      // Fallback to local file below.
    }
    try {
      final Directory docsDir = await getApplicationDocumentsDirectory();
      final File fallbackFile = File(
        '${docsDir.path}${Platform.pathSeparator}axis_saved_credentials_v1.json',
      );
      if (await fallbackFile.exists()) {
        return await fallbackFile.readAsString();
      }
    } catch (_) {
      // Ignore fallback read errors.
    }
    return '';
  }

  Future<bool> _writeSavedCredentialsRaw(String raw) async {
    var wroteSecure = false;
    try {
      await _secureStorage.write(key: _credentialsListStorageKey, value: raw);
      wroteSecure = true;
    } catch (_) {
      // Fallback to local file below.
    }
    if (wroteSecure) return true;
    try {
      final Directory docsDir = await getApplicationDocumentsDirectory();
      final File fallbackFile = File(
        '${docsDir.path}${Platform.pathSeparator}axis_saved_credentials_v1.json',
      );
      await fallbackFile.writeAsString(raw, flush: true);
      return true;
    } catch (_) {
      // Ignore fallback write errors.
      return false;
    }
  }

  Future<bool> _persistSavedCredentials() async {
    final List<Map<String, dynamic>> payload = _savedCredentials
        .map((item) => item.toJson())
        .toList();
    return _writeSavedCredentialsRaw(jsonEncode(payload));
  }

  String _savedCredentialKey(String username, {String companyCode = ''}) {
    return _savedCredentialStorageKey(
      username,
      companyCode: companyCode,
    );
  }

  Future<void> _saveCredentials(
    String username,
    String password, {
    String companyCode = '',
  }) async {
    final String cleanUsername = username.trim();
    final String cleanCompanyCode = _normalizeCompanyCode(companyCode);
    if (cleanUsername.isEmpty || password.isEmpty) return;
    try {
      final int nowMs = DateTime.now().millisecondsSinceEpoch;
      final String key = _savedCredentialKey(
        cleanUsername,
        companyCode: cleanCompanyCode,
      );
      final int existingIndex = _savedCredentials.indexWhere(
        (item) => _savedCredentialKey(
          item.username,
          companyCode: item.companyCode,
        ) == key,
      );
      final _SavedCredential next = _SavedCredential(
        username: cleanUsername,
        password: password,
        updatedAtMs: nowMs,
        companyCode: cleanCompanyCode,
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
      final bool persisted = await _persistSavedCredentials();
      if (!persisted && mounted && !_credentialSaveWarningShown) {
        _credentialSaveWarningShown = true;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Login worked, but this phone blocked credential save. Check app storage permission/settings.',
            ),
          ),
        );
      }
    } catch (_) {
      if (mounted && !_credentialSaveWarningShown) {
        _credentialSaveWarningShown = true;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Login worked, but this phone blocked credential save. Check app storage permission/settings.',
            ),
          ),
        );
      }
    }
  }

  void _setPendingCredentials(
    String username,
    String password, {
    String companyCode = '',
  }) {
    final String cleanUsername = username.trim();
    if (cleanUsername.isEmpty || password.isEmpty) return;
    _pendingUsername = cleanUsername;
    _pendingPassword = password;
    _pendingCompanyCode = _normalizeCompanyCode(companyCode);
  }

  void _handleCredentialsBridgeMessage(String rawMessage) {
    try {
      final dynamic payload = jsonDecode(rawMessage);
      if (payload is! Map) return;
      final String type = (payload['type'] ?? '').toString().trim();
      if (type.isNotEmpty && type != 'login-credentials') return;
      final String username = (payload['username'] ?? '').toString().trim();
      final String password = (payload['password'] ?? '').toString();
      final String companyCode = _normalizeCompanyCode(
        (payload['companyCode'] ?? payload['company_code'] ?? '').toString(),
      );
      if (username.isEmpty || password.isEmpty) return;
      _setPendingCredentials(
        username,
        password,
        companyCode: companyCode,
      );
    } catch (_) {
      // Ignore malformed bridge messages.
    }
  }

  Future<void> _clearPendingCredentialState() async {
    _pendingUsername = '';
    _pendingPassword = '';
    _pendingCompanyCode = '';
    _preferredLoginUsername = '';
    _preferredLoginPassword = '';
    _preferredLoginCompanyCode = '';
    if (mounted) {
      setState(() {
        _showPasswordUpdateAction = false;
        _passwordUpdateUsername = '';
        _passwordUpdateValue = '';
        _passwordUpdateCompanyCode = '';
      });
    } else {
      _showPasswordUpdateAction = false;
      _passwordUpdateUsername = '';
      _passwordUpdateValue = '';
      _passwordUpdateCompanyCode = '';
    }
  }

  Future<bool> _isAuthenticatedInWebSession() async {
    try {
      final dynamic result = await _controller.runJavaScriptReturningResult('''
        (function () {
          try {
            var token = '';
            if (window.localStorage && typeof window.localStorage.getItem === 'function') {
              token = String(window.localStorage.getItem('token') || '').trim();
            }
            return token ? '1' : '0';
          } catch (_) {
            return '0';
          }
        })();
      ''');
      final String raw = (result ?? '').toString().toLowerCase();
      return raw.contains('1') || raw.contains('true');
    } catch (_) {
      return false;
    }
  }

  Future<void> _savePendingCredentialsIfLoginSucceeded(String url) async {
    if (_pendingUsername.isEmpty || _pendingPassword.isEmpty) return;
    if (_isLoginPageUrl(url)) return;

    final bool authenticated = await _isAuthenticatedInWebSession();
    if (!authenticated) return;

    await _saveCredentials(
      _pendingUsername,
      _pendingPassword,
      companyCode: _pendingCompanyCode,
    );
    await _clearPendingCredentialState();
  }

  bool _isLoginFailureMessage(String message) {
    final String lower = message.trim().toLowerCase();
    if (lower.isEmpty) return false;
    return lower.contains('invalid password') ||
        lower.contains('invalid credentials') ||
        lower.contains('incorrect password') ||
        lower.contains('wrong password') ||
        lower.contains('login failed');
  }

  void _handleLoginStatusBridgeMessage(String rawMessage) {
    try {
      final dynamic payload = jsonDecode(rawMessage);
      if (payload is! Map) return;
      final String type = (payload['type'] ?? '').toString().trim();
      if (type != 'login-alert') return;

      final String message = (payload['message'] ?? '').toString();
      if (!_isLoginFailureMessage(message)) return;

      final String username = (payload['username'] ?? '').toString().trim();
      final String password = (payload['password'] ?? '').toString();
      final String companyCode = _normalizeCompanyCode(
        (payload['companyCode'] ?? payload['company_code'] ?? '').toString(),
      );
      final String pickedUsername = username.isNotEmpty
          ? username
          : _pendingUsername.trim();
      final String pickedPassword = password.isNotEmpty
          ? password
          : _pendingPassword;
      final String pickedCompanyCode = companyCode.isNotEmpty
          ? companyCode
          : _pendingCompanyCode;
      if (pickedUsername.isEmpty || pickedPassword.isEmpty) return;

      final _SavedCredential? saved = _findSavedCredential(
        pickedUsername,
        companyCode: pickedCompanyCode,
      );
      if (saved == null) return;
      if (saved.password == pickedPassword) {
        return;
      }

      if (!mounted) return;
      setState(() {
        _showPasswordUpdateAction = true;
        _passwordUpdateUsername = pickedUsername;
        _passwordUpdateValue = pickedPassword;
        _passwordUpdateCompanyCode = pickedCompanyCode;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Password changed for $pickedUsername. Tap update button to save new password.',
          ),
        ),
      );
    } catch (_) {
      // Ignore malformed bridge messages.
    }
  }

  Future<void> _updateSavedPasswordFromFailureState() async {
    final String username = _passwordUpdateUsername.trim();
    final String password = _passwordUpdateValue;
    final String companyCode = _passwordUpdateCompanyCode;
    if (username.isEmpty || password.isEmpty) return;

    await _saveCredentials(
      username,
      password,
      companyCode: companyCode,
    );
    _preferredLoginUsername = username;
    _preferredLoginPassword = password;
    _preferredLoginCompanyCode = companyCode;
    final _SavedCredential? saved = _findSavedCredential(
      username,
      companyCode: companyCode,
    );
    if (saved != null) {
      await _applyCredentialToLoginForm(saved);
    }

    if (!mounted) return;
    setState(() {
      _showPasswordUpdateAction = false;
      _passwordUpdateUsername = '';
      _passwordUpdateValue = '';
      _passwordUpdateCompanyCode = '';
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Saved password updated for $username.')),
    );
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
      await _saveCredentials(
        _pendingUsername,
        _pendingPassword,
        companyCode: _pendingCompanyCode,
      );
      await _clearPendingCredentialState();
    }

    // Fallback save path: some login flows do not land exactly on dashboard URL.
    await _savePendingCredentialsIfLoginSucceeded(url);

    if (_isLoginPageUrl(url)) {
      await _enhanceLoginAutofill(url);
      return;
    }
    if (_shouldInstallPdfBridge(url) && _lastPdfBridgeInjectedUrl != url) {
      await _installPdfSaveBridge();
      _lastPdfBridgeInjectedUrl = url;
    }
  }

  bool _shouldInstallPdfBridge(String url) {
    final Uri? uri = Uri.tryParse(url);
    if (uri == null) return false;
    final String scheme = uri.scheme.toLowerCase();
    return scheme == 'http' || scheme == 'https';
  }

  Future<void> _applyCredentialToLoginForm(_SavedCredential credential) async {
    if (!_isLoginPageUrl(_currentUrl)) return;
    _preferredLoginUsername = credential.username;
    _preferredLoginPassword = credential.password;
    _preferredLoginCompanyCode = credential.normalizedCompanyCode;
    final String usernameJs = jsonEncode(credential.username);
    final String passwordJs = jsonEncode(credential.password);
    final String companyCodeJs = jsonEncode(credential.normalizedCompanyCode);
    final String js =
        '''
      (function () {
        try {
          var companyCode = document.getElementById('companyCode');
          var user = document.getElementById('User') || document.getElementById('user') || document.getElementById('email');
          var pass = document.getElementById('password');
          if (companyCode) {
            companyCode.value = $companyCodeJs;
            companyCode.dispatchEvent(new Event('input', { bubbles: true }));
            companyCode.dispatchEvent(new Event('change', { bubbles: true }));
          }
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

    final _SavedCredential? picked =
        await showModalBottomSheet<_SavedCredential>(
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
                    subtitle: Text(
                      'Select an account to fill company code, username and password',
                    ),
                  ),
                  ConstrainedBox(
                    constraints: BoxConstraints(maxHeight: maxHeight),
                    child: ListView.builder(
                      shrinkWrap: true,
                      itemCount: _savedCredentials.length,
                      itemBuilder: (BuildContext context, int index) {
                        final _SavedCredential credential =
                            _savedCredentials[index];
                        return ListTile(
                          leading: const Icon(Icons.person_outline),
                          title: Text(credential.displayLabel),
                          subtitle: Text(credential.helperLabel),
                          onTap: () => Navigator.of(context).pop(credential),
                        );
                      },
                    ),
                  ),
                ],
              ),
            );
          },
        );

    _isShowingCredentialPrompt = false;
    if (picked != null) {
      if (mounted) {
        setState(() {
          _fillOfflineControllersFromCredential(picked);
        });
      } else {
        _fillOfflineControllersFromCredential(picked);
      }
      if (!_hasMainFrameError) {
        await _applyCredentialToLoginForm(picked);
      }
    }
  }

  Future<void> _enhanceLoginAutofill(String url) async {
    if (!_isLoginPageUrl(url)) return;
    final String preferredUser = _preferredLoginUsername.trim();
    final String preferredPassword = _preferredLoginPassword;
    final String preferredCompanyCode = _preferredLoginCompanyCode;
    final String preferredUserJs = jsonEncode(preferredUser);
    final String preferredPasswordJs = jsonEncode(preferredPassword);
    final String preferredCompanyCodeJs = jsonEncode(preferredCompanyCode);
    final String js =
        '''
      (function () {
        try {
          var preferredUser = $preferredUserJs;
          var preferredPassword = $preferredPasswordJs;
          var preferredCompanyCode = $preferredCompanyCodeJs;
          var hasPreferred = !!String(preferredUser || '').trim() && !!String(preferredPassword || '');
          var hasPreferredCompanyCode = !!String(preferredCompanyCode || '').trim();
          var form = document.getElementById('loginForm');
          var companyCode = document.getElementById('companyCode');
          var user = document.getElementById('User') || document.getElementById('user') || document.getElementById('email');
          var pass = document.getElementById('password');
          var loginBtn = document.getElementById('loginBtn');
          var credentialBridge = window.$_credentialsChannelName;
          var loginStatusBridge = window.$_loginStatusChannelName;

          if (form) {
            form.setAttribute('method', 'post');
            form.setAttribute('autocomplete', 'off');
          }
          if (companyCode) {
            companyCode.setAttribute('autocomplete', 'off');
            companyCode.setAttribute('autocapitalize', 'none');
            companyCode.setAttribute('autocorrect', 'off');
            companyCode.setAttribute('spellcheck', 'false');
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
            if (hasPreferredCompanyCode && companyCode && !String(companyCode.value || '').trim()) {
              companyCode.value = preferredCompanyCode;
              dispatchFieldEvents(companyCode);
            }
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
              var companyCodeValue = companyCode ? String(companyCode.value || '').trim() : '';
              if (!usernameValue || !passwordValue) return;
              credentialBridge.postMessage(JSON.stringify({
                type: 'login-credentials',
                source: source || 'unknown',
                username: usernameValue,
                password: passwordValue,
                company_code: companyCodeValue
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
            if (user) {
              user.addEventListener('keydown', function (ev) {
                if (ev && ev.key === 'Enter') {
                  sendCredentialsToApp('user-enter');
                }
              });
            }
            if (pass) {
              pass.addEventListener('keydown', function (ev) {
                if (ev && ev.key === 'Enter') {
                  sendCredentialsToApp('pass-enter');
                }
              });
            }
            if (typeof window.login === 'function' && !window.__axisLoginFnWrapped) {
              window.__axisLoginFnWrapped = true;
              var originalLogin = window.login;
              window.login = function () {
                try { sendCredentialsToApp('window-login-fn'); } catch (_) {}
                return originalLogin.apply(this, arguments);
              };
            }
          }

          if (!window.__axisLoginAlertHooked) {
            window.__axisLoginAlertHooked = true;
            var originalAlert = typeof window.alert === 'function' ? window.alert.bind(window) : null;
            window.alert = function (msg) {
              try {
                var alertText = String(msg == null ? '' : msg);
                if (loginStatusBridge && typeof loginStatusBridge.postMessage === 'function') {
                  loginStatusBridge.postMessage(JSON.stringify({
                    type: 'login-alert',
                    message: alertText,
                    company_code: companyCode ? String(companyCode.value || '').trim() : '',
                    username: user ? String(user.value || '').trim() : '',
                    password: pass ? String(pass.value || '') : ''
                  }));
                }
              } catch (_) {}
              if (originalAlert) {
                return originalAlert(msg);
              }
            };
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

  void _handleFileBridgeMessage(String rawMessage) {
    unawaited(_processFileBridgeMessage(rawMessage));
  }

  Future<void> _processFileBridgeMessage(String rawMessage) async {
    try {
      final dynamic payload = jsonDecode(rawMessage);
      if (payload is! Map) return;
      final String type = (payload['type'] ?? '').toString().trim();
      switch (type) {
        case 'file-base64':
          await _handleSingleFilePayload(payload);
          return;
        case 'file-start':
          _handleChunkedFileStart(payload);
          return;
        case 'file-chunk':
          _handleChunkedFileData(payload);
          return;
        case 'file-complete':
          await _handleChunkedFileComplete(payload);
          return;
        default:
          return;
      }
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to save file from app view. $error')),
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

  Future<void> _handleSingleFilePayload(Map payload) async {
    final String encodedData = (payload['data'] ?? '').toString().trim();
    if (encodedData.isEmpty) return;
    final String fileName = _sanitizeDownloadFileName(
      (payload['filename'] ?? 'download.bin').toString(),
    );
    final String mimeType = _normalizeMimeType(payload['mimeType']);
    await _saveBase64File(fileName, encodedData, mimeType);
  }

  void _handleChunkedPdfStart(Map payload) {
    final String transferId = (payload['transferId'] ?? '').toString().trim();
    final String fileName = _sanitizePdfFileName(
      (payload['filename'] ?? 'Document.pdf').toString(),
    );
    final int totalChunks =
        int.tryParse((payload['totalChunks'] ?? '').toString()) ?? 0;
    if (transferId.isEmpty || totalChunks <= 0) return;
    _pendingPdfTransfers[transferId] = _PendingFileTransfer(
      fileName: fileName,
      totalChunks: totalChunks,
      mimeType: 'application/pdf',
    );
  }

  void _handleChunkedFileStart(Map payload) {
    final String transferId = (payload['transferId'] ?? '').toString().trim();
    final String fileName = _sanitizeDownloadFileName(
      (payload['filename'] ?? 'download.bin').toString(),
    );
    final int totalChunks =
        int.tryParse((payload['totalChunks'] ?? '').toString()) ?? 0;
    if (transferId.isEmpty || totalChunks <= 0) return;
    _pendingFileTransfers[transferId] = _PendingFileTransfer(
      fileName: fileName,
      totalChunks: totalChunks,
      mimeType: _normalizeMimeType(payload['mimeType']),
    );
  }

  void _handleChunkedPdfData(Map payload) {
    final String transferId = (payload['transferId'] ?? '').toString().trim();
    final int index = int.tryParse((payload['index'] ?? '').toString()) ?? -1;
    final String chunk = (payload['data'] ?? '').toString();
    if (transferId.isEmpty || index < 0 || chunk.isEmpty) return;
    final _PendingFileTransfer? transfer = _pendingPdfTransfers[transferId];
    if (transfer == null) return;
    transfer.setChunk(index, chunk);
  }

  void _handleChunkedFileData(Map payload) {
    final String transferId = (payload['transferId'] ?? '').toString().trim();
    final int index = int.tryParse((payload['index'] ?? '').toString()) ?? -1;
    final String chunk = (payload['data'] ?? '').toString();
    if (transferId.isEmpty || index < 0 || chunk.isEmpty) return;
    final _PendingFileTransfer? transfer = _pendingFileTransfers[transferId];
    if (transfer == null) return;
    transfer.setChunk(index, chunk);
  }

  Future<void> _handleChunkedPdfComplete(Map payload) async {
    final String transferId = (payload['transferId'] ?? '').toString().trim();
    if (transferId.isEmpty) return;
    final _PendingFileTransfer? transfer = _pendingPdfTransfers.remove(
      transferId,
    );
    if (transfer == null) return;
    final String encodedData = transfer.assembleBase64();
    await _saveAndOpenPdf(transfer.fileName, encodedData);
  }

  Future<void> _handleChunkedFileComplete(Map payload) async {
    final String transferId = (payload['transferId'] ?? '').toString().trim();
    if (transferId.isEmpty) return;
    final _PendingFileTransfer? transfer = _pendingFileTransfers.remove(
      transferId,
    );
    if (transfer == null) return;
    final String encodedData = transfer.assembleBase64();
    await _saveBase64File(transfer.fileName, encodedData, transfer.mimeType);
  }

  String _sanitizePdfFileName(String input) {
    final String cleaned = input.trim().replaceAll(
      RegExp(r'[\\/:*?"<>|]+'),
      '_',
    );
    if (cleaned.isEmpty) return 'Document.pdf';
    return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : '$cleaned.pdf';
  }

  String _sanitizeDownloadFileName(String input) {
    final String cleaned = input.trim().replaceAll(
      RegExp(r'[\\/:*?"<>|]+'),
      '_',
    );
    return cleaned.isEmpty ? 'download.bin' : cleaned;
  }

  String _normalizeMimeType(dynamic input) {
    final String mimeType = (input ?? '').toString().trim();
    return mimeType.isEmpty ? 'application/octet-stream' : mimeType;
  }

  Future<void> _saveAndOpenPdf(String fileName, String encodedData) async {
    final List<int> bytes = base64Decode(base64.normalize(encodedData));
    final File pdfFile = await _writeDownloadWithFallback(fileName, bytes);

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
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('PDF saved to ${pdfFile.path}')));
    }
  }

  Future<void> _saveBase64File(
    String fileName,
    String encodedData,
    String mimeType,
  ) async {
    final List<int> bytes = base64Decode(base64.normalize(encodedData));
    final File savedFile = await _writeDownloadWithFallback(fileName, bytes);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          '${_describeDownloadType(mimeType)} saved to ${savedFile.path}',
        ),
      ),
    );
  }

  String _describeDownloadType(String mimeType) {
    final String lower = mimeType.toLowerCase();
    if (lower.contains('sql')) return 'SQL backup';
    if (lower.contains('pdf')) return 'PDF';
    return 'File';
  }

  Future<File> _writeDownloadWithFallback(
    String fileName,
    List<int> bytes,
  ) async {
    final List<Directory> saveDirs = await _resolveDownloadSaveDirectories();
    Object? lastError;
    for (final Directory dir in saveDirs) {
      try {
        if (!await dir.exists()) {
          await dir.create(recursive: true);
        }
        final File candidate = File(
          '${dir.path}${Platform.pathSeparator}$fileName',
        );
        await candidate.writeAsBytes(bytes, flush: true);
        return candidate;
      } catch (err) {
        lastError = err;
        if (_isAndroidPublicDownloadPermissionIssue(dir, err)) {
          _skipAndroidPublicDownloadPath = true;
          _cachedDownloadSaveDirectories = null;
        }
      }
    }
    if (lastError != null) {
      throw lastError;
    }
    throw StateError(
      'Failed to save file: no writable storage directory found.',
    );
  }

  bool _isAndroidPublicDownloadPermissionIssue(Directory dir, Object err) {
    if (!Platform.isAndroid) return false;
    if (dir.path != _androidPublicDownloadsPath) return false;
    if (err is! FileSystemException) return false;
    final String errorText = err.toString().toLowerCase();
    return errorText.contains('permission denied') ||
        errorText.contains('errno = 13') ||
        errorText.contains('operation not permitted');
  }

  Future<List<Directory>> _resolveDownloadSaveDirectories() async {
    final List<Directory>? cachedDirs = _cachedDownloadSaveDirectories;
    if (cachedDirs != null && cachedDirs.isNotEmpty) {
      return List<Directory>.from(cachedDirs);
    }

    final List<Directory> dirs = <Directory>[];
    final Set<String> seen = <String>{};
    void addDir(Directory dir) {
      final String key = dir.path.toLowerCase();
      if (seen.contains(key)) return;
      seen.add(key);
      dirs.add(dir);
    }

    if (Platform.isAndroid) {
      if (!_skipAndroidPublicDownloadPath) {
        // Try public Downloads first when allowed.
        addDir(Directory(_androidPublicDownloadsPath));
      }

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
    _cachedDownloadSaveDirectories = List<Directory>.from(dirs);
    return dirs;
  }

  Future<void> _installPdfSaveBridge() async {
    final String channelNameJs = jsonEncode(_pdfChannelName);
    final String js =
        '''
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

  _SavedCredential? _findSavedCredential(
    String username, {
    String companyCode = '',
  }) {
    final String key = username.trim().toLowerCase();
    final String normalizedCompanyCode = _normalizeCompanyCode(companyCode);
    if (key.isEmpty) return null;
    for (final _SavedCredential credential in _savedCredentials) {
      if (credential.username.trim().toLowerCase() != key) {
        continue;
      }
      if (normalizedCompanyCode.isNotEmpty &&
          credential.normalizedCompanyCode != normalizedCompanyCode) {
        continue;
      }
      if (normalizedCompanyCode.isEmpty ||
          credential.normalizedCompanyCode == normalizedCompanyCode) {
        return credential;
      }
    }
    return null;
  }

  void _fillOfflineControllersFromCredential(_SavedCredential credential) {
    _offlineCompanyCodeController.text = credential.normalizedCompanyCode;
    _offlineUsernameController.text = credential.username;
    _offlinePasswordController.text = credential.password;
    _preferredLoginUsername = credential.username;
    _preferredLoginPassword = credential.password;
    _preferredLoginCompanyCode = credential.normalizedCompanyCode;
  }

  void _onOfflineSavedUserPicked(String? credentialKey) {
    if (credentialKey == null || credentialKey.trim().isEmpty) return;
    final int credentialIndex = _savedCredentials.indexWhere(
      (item) =>
          _savedCredentialKey(
            item.username,
            companyCode: item.companyCode,
          ) ==
          credentialKey,
    );
    if (credentialIndex < 0) return;
    final _SavedCredential credential = _savedCredentials[credentialIndex];
    setState(() {
      _fillOfflineControllersFromCredential(credential);
    });
  }

  Future<void> _retryOnlineLoginFromOffline() async {
    if (_isOfflineRetryInProgress) return;
    final String companyCode = _normalizeCompanyCode(
      _offlineCompanyCodeController.text,
    );
    final String username = _offlineUsernameController.text.trim();
    final String password = _offlinePasswordController.text;
    final _SavedCredential? matchedCredential = _findSavedCredential(
      username,
      companyCode: companyCode,
    );
    final String resolvedCompanyCode =
        matchedCredential?.normalizedCompanyCode.isNotEmpty == true
            ? matchedCredential!.normalizedCompanyCode
            : companyCode;
    if (companyCode.isEmpty || username.isEmpty || password.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enter company code, email and password.'),
        ),
      );
      return;
    }

    _setPendingCredentials(
      username,
      password,
      companyCode: resolvedCompanyCode,
    );
    _preferredLoginUsername = username;
    _preferredLoginPassword = password;
    _preferredLoginCompanyCode = resolvedCompanyCode;

    if (mounted) {
      setState(() {
        _hasMainFrameError = false;
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
            'AXIS CMS SYSTEM',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
          ),
          actions: [
            if (_hasMainFrameError || _isLoginPageUrl(_currentUrl))
              IconButton(
                tooltip: 'Saved Accounts',
                onPressed: _openSavedAccountsFromKeyButton,
                icon: const Icon(Icons.key_outlined),
              ),
            if (_isLoginPageUrl(_currentUrl) && _showPasswordUpdateAction)
              IconButton(
                tooltip: 'Update Saved Password',
                onPressed: () {
                  unawaited(_updateSavedPasswordFromFailureState());
                },
                icon: const Icon(Icons.lock_reset),
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
                  companyCodeController: _offlineCompanyCodeController,
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
                  versionLabel: _loginScreenVersion,
                )
              : WebViewWidget(controller: _controller),
        ),
      ),
    );
  }
}

class _OfflineLoginView extends StatelessWidget {
  const _OfflineLoginView({
    required this.companyCodeController,
    required this.usernameController,
    required this.passwordController,
    required this.passwordVisible,
    required this.onTogglePasswordVisible,
    required this.savedCredentials,
    required this.retryInProgress,
    required this.onSavedCredentialSelected,
    required this.onRetryOnlineLogin,
    required this.onTryAgain,
    required this.versionLabel,
  });

  final TextEditingController companyCodeController;
  final TextEditingController usernameController;
  final TextEditingController passwordController;
  final bool passwordVisible;
  final VoidCallback onTogglePasswordVisible;
  final List<_SavedCredential> savedCredentials;
  final bool retryInProgress;
  final ValueChanged<String?> onSavedCredentialSelected;
  final Future<void> Function() onRetryOnlineLogin;
  final Future<void> Function() onTryAgain;
  final String versionLabel;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return SafeArea(
      child: Container(
        width: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: <Color>[
              Color(0xFF5E8FBE),
              Color(0xFF2F5C84),
            ],
          ),
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight:
                  MediaQuery.of(context).size.height -
                  MediaQuery.of(context).padding.top -
                  MediaQuery.of(context).padding.bottom -
                  40,
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: double.infinity,
                  constraints: const BoxConstraints(maxWidth: 420),
                  padding: const EdgeInsets.fromLTRB(22, 28, 22, 20),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(28),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x260A2744),
                        blurRadius: 28,
                        offset: Offset(0, 16),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SizedBox(height: 10),
                      const Text(
                        'User Login',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 21,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF1D2430),
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'AXIS CMS SYSTEM',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 17,
                          color: Color(0xFF6F7E8E),
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 14),
                      Text(
                        'Offline mode. Connect internet and tap Login.',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: const Color(0xFF6F7E8E),
                          height: 1.35,
                        ),
                      ),
                      if (savedCredentials.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        TextButton.icon(
                          onPressed: () {
                            final _SavedCredential item = savedCredentials.first;
                            onSavedCredentialSelected(
                              _savedCredentialStorageKey(
                                item.username,
                                companyCode: item.companyCode,
                              ),
                            );
                          },
                          icon: const Icon(Icons.key_outlined, size: 18),
                          label: const Text('Use last saved account'),
                          style: TextButton.styleFrom(
                            foregroundColor: const Color(0xFF4F7EAB),
                          ),
                        ),
                      ],
                      const SizedBox(height: 12),
                      const _OfflineFieldLabel(label: 'Company Code'),
                      const SizedBox(height: 8),
                      _OfflineTextField(
                        controller: companyCodeController,
                        hintText: 'Company Code',
                        autocorrect: false,
                        textCapitalization: TextCapitalization.characters,
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 14),
                      const _OfflineFieldLabel(label: 'Email'),
                      const SizedBox(height: 8),
                      _OfflineTextField(
                        controller: usernameController,
                        hintText: 'Email',
                        autocorrect: false,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 14),
                      const _OfflineFieldLabel(label: 'Password'),
                      const SizedBox(height: 8),
                      _OfflineTextField(
                        controller: passwordController,
                        hintText: 'Password',
                        obscureText: !passwordVisible,
                        textInputAction: TextInputAction.done,
                        onSubmitted: (_) {
                          unawaited(onRetryOnlineLogin());
                        },
                        suffixIcon: IconButton(
                          onPressed: onTogglePasswordVisible,
                          icon: Icon(
                            passwordVisible
                                ? Icons.visibility_off
                                : Icons.visibility,
                            color: const Color(0xFF8E98A7),
                          ),
                        ),
                      ),
                      const SizedBox(height: 18),
                      SizedBox(
                        height: 56,
                        child: ElevatedButton(
                          onPressed: retryInProgress
                              ? null
                              : () {
                                  unawaited(onRetryOnlineLogin());
                                },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF4F7EAB),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(18),
                            ),
                            textStyle: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          child: retryInProgress
                              ? const SizedBox(
                                  width: 22,
                                  height: 22,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2.2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Text('Login'),
                        ),
                      ),
                      const SizedBox(height: 14),
                      Center(
                        child: TextButton(
                          onPressed: retryInProgress
                              ? null
                              : () {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text(
                                        'Forgot password needs internet connection.',
                                      ),
                                    ),
                                  );
                                },
                          child: const Text('Forgot password?'),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerRight,
                        child: Text(
                          versionLabel,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF6F7E8E),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                OutlinedButton.icon(
                  onPressed: retryInProgress
                      ? null
                      : () {
                          unawaited(onTryAgain());
                        },
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white70),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                    ),
                    minimumSize: const Size(220, 50),
                  ),
                  icon: const Icon(Icons.refresh),
                  label: const Text('Try Again'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _OfflineFieldLabel extends StatelessWidget {
  const _OfflineFieldLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: const TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w700,
        color: Color(0xFF37475A),
      ),
    );
  }
}

class _OfflineTextField extends StatelessWidget {
  const _OfflineTextField({
    required this.controller,
    required this.hintText,
    this.obscureText = false,
    this.autocorrect = false,
    this.keyboardType,
    this.textInputAction,
    this.textCapitalization = TextCapitalization.none,
    this.suffixIcon,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String hintText;
  final bool obscureText;
  final bool autocorrect;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final TextCapitalization textCapitalization;
  final Widget? suffixIcon;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      obscureText: obscureText,
      autocorrect: autocorrect,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      textCapitalization: textCapitalization,
      onSubmitted: onSubmitted,
      style: const TextStyle(
        fontSize: 16,
        color: Color(0xFF1D2430),
      ),
      decoration: InputDecoration(
        hintText: hintText,
        hintStyle: const TextStyle(color: Color(0xFF8F98A5)),
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 18,
          vertical: 18,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: Color(0xFFD3D9E2)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: Color(0xFFD3D9E2)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: Color(0xFF4F7EAB), width: 1.3),
        ),
        suffixIcon: suffixIcon,
      ),
    );
  }
}
