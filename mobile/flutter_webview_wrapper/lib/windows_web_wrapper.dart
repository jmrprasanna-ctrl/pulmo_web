import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:url_launcher/url_launcher.dart';

import 'app_config.dart';

const String _credentialsStorageKey = 'axis_saved_credentials_v1';

String _normalizeCompanyCode(String value) {
  final String normalized = value
      .trim()
      .toUpperCase()
      .replaceAll(RegExp(r'[^A-Z0-9_-]+'), '');
  return normalized.length > 40 ? normalized.substring(0, 40) : normalized;
}

String _credentialKey(String username, String companyCode) =>
    companyCode.trim().toUpperCase() + '::' + username.trim().toLowerCase();

class _SavedWindowsCredential {
  const _SavedWindowsCredential({
    required this.username,
    required this.password,
    required this.updatedAtMs,
    required this.companyCode,
  });

  final String username;
  final String password;
  final int updatedAtMs;
  final String companyCode;

  String get displayLabel =>
      companyCode.isEmpty ? username : username + ' (' + companyCode + ')';

  Map<String, dynamic> toJson() => <String, dynamic>{
    'username': username,
    'password': password,
    'updatedAtMs': updatedAtMs,
    'companyCode': companyCode,
  };

  static _SavedWindowsCredential? tryParse(dynamic value) {
    if (value is! Map) return null;
    final String username = (value['username'] ?? '').toString().trim();
    final String password = (value['password'] ?? '').toString();
    if (username.isEmpty || password.isEmpty) return null;
    return _SavedWindowsCredential(
      username: username,
      password: password,
      updatedAtMs:
          int.tryParse((value['updatedAtMs'] ?? '').toString()) ??
          DateTime.now().millisecondsSinceEpoch,
      companyCode: _normalizeCompanyCode(
        (value['companyCode'] ?? value['company_code'] ?? '').toString(),
      ),
    );
  }
}

class WindowsWebWrapperPage extends StatefulWidget {
  const WindowsWebWrapperPage({
    required this.webViewEnvironment,
    required this.environmentError,
    super.key,
  });

  final WebViewEnvironment? webViewEnvironment;
  final String? environmentError;

  @override
  State<WindowsWebWrapperPage> createState() => _WindowsWebWrapperPageState();
}

class _WindowsWebWrapperPageState extends State<WindowsWebWrapperPage> {
  static const FlutterSecureStorage _secureStorage = FlutterSecureStorage();
  InAppWebViewController? _controller;
  int _progress = 0;
  bool _hasLoadError = false;
  bool _canGoBack = false;
  String _currentUrl = '';
  String _loadErrorMessage = 'The system could not be reached.';
  List<_SavedWindowsCredential> _savedCredentials =
      <_SavedWindowsCredential>[];
  String _preferredUsername = '';
  String _preferredPassword = '';
  String _preferredCompanyCode = '';
  String _pendingUsername = '';
  String _pendingPassword = '';
  String _pendingCompanyCode = '';
  String _passwordUpdateUsername = '';
  String _passwordUpdateValue = '';
  String _passwordUpdateCompanyCode = '';

  @override
  void initState() {
    super.initState();
    unawaited(_loadSavedCredentials());
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
          await _secureStorage.read(key: _credentialsStorageKey) ?? '';
      final dynamic decoded = raw.trim().isEmpty ? null : jsonDecode(raw);
      if (decoded is List) {
        _savedCredentials = decoded
            .map(_SavedWindowsCredential.tryParse)
            .whereType<_SavedWindowsCredential>()
            .toList();
      }
      _savedCredentials.sort(
        (a, b) => b.updatedAtMs.compareTo(a.updatedAtMs),
      );
      if (_savedCredentials.isNotEmpty) {
        final _SavedWindowsCredential latest = _savedCredentials.first;
        _preferredUsername = latest.username;
        _preferredPassword = latest.password;
        _preferredCompanyCode = latest.companyCode;
      }
    } catch (_) {
      _savedCredentials = <_SavedWindowsCredential>[];
    }
    if (mounted) setState(() {});
    if (_isLoginPageUrl(_currentUrl)) {
      unawaited(_enhanceLoginAutofill());
    }
  }

  Future<bool> _persistSavedCredentials() async {
    try {
      await _secureStorage.write(
        key: _credentialsStorageKey,
        value: jsonEncode(
          _savedCredentials.map((item) => item.toJson()).toList(),
        ),
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> _saveCredentials(
    String username,
    String password, {
    String companyCode = '',
  }) async {
    final String cleanUsername = username.trim();
    final String cleanCompanyCode = _normalizeCompanyCode(companyCode);
    if (cleanUsername.isEmpty || password.isEmpty) return false;

    final String key = _credentialKey(cleanUsername, cleanCompanyCode);
    final int existingIndex = _savedCredentials.indexWhere(
      (item) => _credentialKey(item.username, item.companyCode) == key,
    );
    final _SavedWindowsCredential updated = _SavedWindowsCredential(
      username: cleanUsername,
      password: password,
      updatedAtMs: DateTime.now().millisecondsSinceEpoch,
      companyCode: cleanCompanyCode,
    );
    if (existingIndex >= 0) {
      _savedCredentials[existingIndex] = updated;
    } else {
      _savedCredentials.add(updated);
    }
    _savedCredentials.sort((a, b) => b.updatedAtMs.compareTo(a.updatedAtMs));
    if (_savedCredentials.length > 20) {
      _savedCredentials = _savedCredentials.take(20).toList();
    }
    if (mounted) setState(() {});
    return _persistSavedCredentials();
  }

  Future<void> _refreshNavigationState() async {
    final InAppWebViewController? controller = _controller;
    if (controller == null) return;
    final bool canGoBack = await controller.canGoBack();
    if (mounted && canGoBack != _canGoBack) {
      setState(() => _canGoBack = canGoBack);
    }
  }

  Future<void> _goBack() async {
    final InAppWebViewController? controller = _controller;
    if (controller == null || !await controller.canGoBack()) return;
    await controller.goBack();
    await _refreshNavigationState();
  }

  Future<void> _reload() async {
    final InAppWebViewController? controller = _controller;
    if (controller == null) return;
    setState(() {
      _hasLoadError = false;
      _loadErrorMessage = 'The system could not be reached.';
      _progress = 0;
    });
    await controller.reload();
  }

  Future<NavigationActionPolicy> _handleNavigation(
    InAppWebViewController controller,
    NavigationAction action,
  ) async {
    final WebUri? webUri = action.request.url;
    final Uri? uri = webUri == null ? null : Uri.tryParse(webUri.toString());
    if (uri == null) return NavigationActionPolicy.CANCEL;
    if (uri.scheme == 'http' || uri.scheme == 'https') {
      return NavigationActionPolicy.ALLOW;
    }
    if (uri.scheme == 'mailto' || uri.scheme == 'tel') {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
    return NavigationActionPolicy.CANCEL;
  }

  Future<bool?> _handleCreateWindow(
    InAppWebViewController controller,
    CreateWindowAction action,
  ) async {
    final WebUri? webUri = action.request.url;
    final Uri? uri = webUri == null ? null : Uri.tryParse(webUri.toString());
    if (uri == null) return false;
    if (uri.scheme == 'http' || uri.scheme == 'https') {
      await controller.loadUrl(urlRequest: action.request);
    } else if (uri.scheme == 'mailto' || uri.scheme == 'tel') {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
    return false;
  }

  void _handleCredentialBridge(List<dynamic> args) {
    if (args.isEmpty) return;
    try {
      final dynamic decoded = jsonDecode(args.first.toString());
      if (decoded is! Map) return;
      final String type = (decoded['type'] ?? '').toString();
      if (type == 'login-alert') {
        _handleLoginAlert(decoded);
        return;
      }
      if (type.isNotEmpty && type != 'login-credentials') return;
      final String username = (decoded['username'] ?? '').toString().trim();
      final String password = (decoded['password'] ?? '').toString();
      if (username.isEmpty || password.isEmpty) return;
      _pendingUsername = username;
      _pendingPassword = password;
      _pendingCompanyCode = _normalizeCompanyCode(
        (decoded['companyCode'] ?? decoded['company_code'] ?? '').toString(),
      );
    } catch (_) {
      // Ignore malformed page messages.
    }
  }

  void _handleLoginAlert(Map<dynamic, dynamic> payload) {
    final String message = (payload['message'] ?? '').toString().toLowerCase();
    final bool failed = message.contains('invalid password') ||
        message.contains('invalid credentials') ||
        message.contains('incorrect password') ||
        message.contains('wrong password') ||
        message.contains('login failed');
    if (!failed) return;
    final String username =
        (payload['username'] ?? _pendingUsername).toString().trim();
    final String password = (payload['password'] ?? _pendingPassword).toString();
    final String companyCode = _normalizeCompanyCode(
      (payload['companyCode'] ??
              payload['company_code'] ??
              _pendingCompanyCode)
          .toString(),
    );
    final _SavedWindowsCredential? saved = _findSavedCredential(
      username,
      companyCode: companyCode,
    );
    if (saved == null || saved.password == password || !mounted) return;
    setState(() {
      _passwordUpdateUsername = username;
      _passwordUpdateValue = password;
      _passwordUpdateCompanyCode = companyCode;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Password changed for $username. Use the lock button to save it.',
        ),
      ),
    );
  }

  _SavedWindowsCredential? _findSavedCredential(
    String username, {
    String companyCode = '',
  }) {
    final String normalizedUser = username.trim().toLowerCase();
    final String normalizedCompany = _normalizeCompanyCode(companyCode);
    for (final _SavedWindowsCredential credential in _savedCredentials) {
      if (credential.username.trim().toLowerCase() != normalizedUser) {
        continue;
      }
      if (normalizedCompany.isEmpty ||
          credential.companyCode == normalizedCompany) {
        return credential;
      }
    }
    return null;
  }

  Future<void> _updateSavedPassword() async {
    final String username = _passwordUpdateUsername;
    final bool saved = await _saveCredentials(
      username,
      _passwordUpdateValue,
      companyCode: _passwordUpdateCompanyCode,
    );
    if (!saved) {
      _showStorageError();
      return;
    }
    final _SavedWindowsCredential? credential = _findSavedCredential(
      username,
      companyCode: _passwordUpdateCompanyCode,
    );
    if (credential != null) await _applyCredentialToLoginForm(credential);
    if (!mounted) return;
    setState(() {
      _passwordUpdateUsername = '';
      _passwordUpdateValue = '';
      _passwordUpdateCompanyCode = '';
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Saved password updated for $username.')),
    );
  }

  Future<bool> _isAuthenticatedInWebSession() async {
    try {
      final dynamic result = await _controller?.evaluateJavascript(
        source: '''
          (function () {
            try {
              return window.localStorage &&
                String(window.localStorage.getItem('token') || '').trim()
                ? '1' : '0';
            } catch (_) { return '0'; }
          })();
        ''',
      );
      final String raw = (result ?? '').toString().toLowerCase();
      return raw.contains('1') || raw.contains('true');
    } catch (_) {
      return false;
    }
  }

  Future<void> _savePendingCredentialsIfLoginSucceeded(String url) async {
    if (_pendingUsername.isEmpty || _pendingPassword.isEmpty) return;
    if (_isLoginPageUrl(url)) return;
    if (!_isDashboardPageUrl(url) && !await _isAuthenticatedInWebSession()) {
      return;
    }
    final bool saved = await _saveCredentials(
      _pendingUsername,
      _pendingPassword,
      companyCode: _pendingCompanyCode,
    );
    _pendingUsername = '';
    _pendingPassword = '';
    _pendingCompanyCode = '';
    if (!mounted) return;
    if (saved) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password saved securely on this PC.')),
      );
    } else {
      _showStorageError();
    }
  }

  void _showStorageError() {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'The password could not be saved in Windows secure storage.',
        ),
      ),
    );
  }

  Future<void> _applyCredentialToLoginForm(
    _SavedWindowsCredential credential,
  ) async {
    _preferredUsername = credential.username;
    _preferredPassword = credential.password;
    _preferredCompanyCode = credential.companyCode;
    final InAppWebViewController? controller = _controller;
    if (controller == null || !_isLoginPageUrl(_currentUrl)) return;
    final String company = jsonEncode(credential.companyCode);
    final String username = jsonEncode(credential.username);
    final String password = jsonEncode(credential.password);
    await controller.evaluateJavascript(
      source: '''
        (function () {
          try {
            var company = document.getElementById('companyCode');
            var user = document.getElementById('User') ||
              document.getElementById('user') || document.getElementById('email');
            var pass = document.getElementById('password');
            var fill = function (field, value) {
              if (!field) return;
              field.value = value;
              field.dispatchEvent(new Event('input', { bubbles: true }));
              field.dispatchEvent(new Event('change', { bubbles: true }));
            };
            fill(company, $company);
            fill(user, $username);
            fill(pass, $password);
          } catch (_) {}
        })();
      ''',
    );
  }

  Future<void> _enhanceLoginAutofill() async {
    final InAppWebViewController? controller = _controller;
    if (controller == null || !_isLoginPageUrl(_currentUrl)) return;
    final String preferredUser = jsonEncode(_preferredUsername);
    final String preferredPass = jsonEncode(_preferredPassword);
    final String preferredCompany = jsonEncode(_preferredCompanyCode);
    await controller.evaluateJavascript(
      source: '''
        (function () {
          try {
            var preferredUser = $preferredUser;
            var preferredPass = $preferredPass;
            var preferredCompany = $preferredCompany;
            var form = document.getElementById('loginForm');
            var company = document.getElementById('companyCode');
            var user = document.getElementById('User') ||
              document.getElementById('user') || document.getElementById('email');
            var pass = document.getElementById('password');
            var loginButton = document.getElementById('loginBtn');
            var sendCredentials = function (source) {
              try {
                var bridge = window.flutter_inappwebview;
                if (!bridge || typeof bridge.callHandler !== 'function' ||
                    !user || !pass) return;
                var userValue = String(user.value || '').trim();
                var passValue = String(pass.value || '');
                if (!userValue || !passValue) return;
                bridge.callHandler('AxisCredentialsBridge', JSON.stringify({
                  type: 'login-credentials',
                  source: source || 'unknown',
                  username: userValue,
                  password: passValue,
                  company_code: company ? String(company.value || '').trim() : ''
                }));
              } catch (_) {}
            };
            if (form) {
              form.setAttribute('method', 'post');
              form.setAttribute('autocomplete', 'off');
            }
            if (company) company.setAttribute('autocomplete', 'off');
            if (user) {
              user.setAttribute('autocomplete', 'off');
              user.setAttribute('autocapitalize', 'none');
            }
            if (pass) pass.setAttribute('autocomplete', 'off');
            if (loginButton && loginButton.tagName === 'BUTTON') {
              loginButton.setAttribute('type', 'submit');
            }
            var dispatch = function (field) {
              if (!field) return;
              field.dispatchEvent(new Event('input', { bubbles: true }));
              field.dispatchEvent(new Event('change', { bubbles: true }));
            };
            if (company && !String(company.value || '').trim() &&
                String(preferredCompany || '').trim()) {
              company.value = preferredCompany;
              dispatch(company);
            }
            if (user && !String(user.value || '').trim() &&
                String(preferredUser || '').trim()) {
              user.value = preferredUser;
              dispatch(user);
            }
            if (pass && !String(pass.value || '') &&
                String(preferredPass || '')) {
              pass.value = preferredPass;
              dispatch(pass);
            }
            if (!window.__axisWindowsCredentialHooks) {
              window.__axisWindowsCredentialHooks = true;
              if (form) form.addEventListener('submit', function () {
                sendCredentials('submit');
              });
              if (loginButton) loginButton.addEventListener('click', function () {
                sendCredentials('click');
              });
              if (user) user.addEventListener('keydown', function (event) {
                if (event && event.key === 'Enter') sendCredentials('user-enter');
              });
              if (pass) pass.addEventListener('keydown', function (event) {
                if (event && event.key === 'Enter') sendCredentials('pass-enter');
              });
              if (typeof window.login === 'function') {
                var originalLogin = window.login;
                window.login = function () {
                  sendCredentials('window-login');
                  return originalLogin.apply(this, arguments);
                };
              }
              var originalAlert = window.alert ? window.alert.bind(window) : null;
              window.alert = function (message) {
                try {
                  var bridge = window.flutter_inappwebview;
                  if (bridge && typeof bridge.callHandler === 'function') {
                    bridge.callHandler('AxisCredentialsBridge', JSON.stringify({
                      type: 'login-alert',
                      message: String(message || ''),
                      company_code: company ? String(company.value || '').trim() : '',
                      username: user ? String(user.value || '').trim() : '',
                      password: pass ? String(pass.value || '') : ''
                    }));
                  }
                } catch (_) {}
                if (originalAlert) return originalAlert(message);
              };
            }
          } catch (_) {}
        })();
      ''',
    );
  }

  Future<void> _onLoadFinished(String url) async {
    if (!mounted) return;
    setState(() {
      _currentUrl = url;
      _progress = 100;
    });
    await _refreshNavigationState();
    if (_isLoginPageUrl(url)) {
      await _enhanceLoginAutofill();
    } else {
      await _savePendingCredentialsIfLoginSucceeded(url);
    }
  }

  Future<void> _onVisitedUrl(String url) async {
    _currentUrl = url;
    if (mounted) setState(() {});
    await _refreshNavigationState();
    if (_isLoginPageUrl(url)) {
      await _enhanceLoginAutofill();
    } else {
      await _savePendingCredentialsIfLoginSucceeded(url);
    }
  }

  Future<void> _showSavedAccounts() async {
    if (_savedCredentials.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No saved accounts yet. Login once to save a password.'),
        ),
      );
      return;
    }
    final _SavedWindowsCredential? selected =
        await showDialog<_SavedWindowsCredential>(
          context: context,
          builder: (BuildContext context) => AlertDialog(
            title: const Text('Saved Accounts'),
            content: SizedBox(
              width: 420,
              child: ListView(
                shrinkWrap: true,
                children: _savedCredentials.map((credential) {
                  return ListTile(
                    leading: const Icon(Icons.person_outline),
                    title: Text(credential.displayLabel),
                    subtitle: Text(
                      credential.companyCode.isEmpty
                          ? 'Tap to fill login'
                          : 'Company code: ' + credential.companyCode,
                    ),
                    onTap: () => Navigator.of(context).pop(credential),
                  );
                }).toList(),
              ),
            ),
            actions: <Widget>[
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Close'),
              ),
            ],
          ),
        );
    if (selected != null) await _applyCredentialToLoginForm(selected);
  }

  @override
  Widget build(BuildContext context) {
    final String? environmentError = widget.environmentError;
    final bool canShowWebView =
        environmentError == null && widget.webViewEnvironment != null;
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: <Widget>[
            ClipRRect(
              borderRadius: BorderRadius.circular(5),
              child: Image.asset(
                'assets/branding/axis-logo.png',
                width: 34,
                height: 34,
                fit: BoxFit.cover,
              ),
            ),
            const SizedBox(width: 10),
            const Flexible(
              child: Text(
                'AXIS CMS SYSTEM',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        actions: <Widget>[
          IconButton(
            tooltip: 'Back',
            onPressed: _canGoBack ? _goBack : null,
            icon: const Icon(Icons.arrow_back),
          ),
          if (_isLoginPageUrl(_currentUrl))
            IconButton(
              tooltip: 'Saved Accounts',
              onPressed: _showSavedAccounts,
              icon: const Icon(Icons.key_outlined),
            ),
          if (_isLoginPageUrl(_currentUrl) &&
              _passwordUpdateUsername.isNotEmpty)
            IconButton(
              tooltip: 'Update Saved Password',
              onPressed: _updateSavedPassword,
              icon: const Icon(Icons.lock_reset),
            ),
          IconButton(
            tooltip: 'Refresh',
            onPressed: canShowWebView ? _reload : null,
            icon: const Icon(Icons.refresh),
          ),
          const SizedBox(width: 8),
        ],
        bottom: _progress < 100 && canShowWebView
            ? PreferredSize(
                preferredSize: const Size.fromHeight(3),
                child: LinearProgressIndicator(value: _progress / 100),
              )
            : null,
      ),
      body: SafeArea(
        child: !canShowWebView
            ? _DesktopMessageView(
                title: 'WebView2 is required',
                message:
                    environmentError ??
                    'The embedded web view could not be initialized.',
                onRetry: null,
              )
            : _hasLoadError
            ? _DesktopMessageView(
                title: 'Could not connect to AXIS CMS SYSTEM',
                message: _loadErrorMessage,
                onRetry: _reload,
              )
            : InAppWebView(
                webViewEnvironment: widget.webViewEnvironment,
                initialUrlRequest: URLRequest(url: WebUri(kWebAppUrl)),
                initialSettings: InAppWebViewSettings(
                  javaScriptEnabled: true,
                  javaScriptCanOpenWindowsAutomatically: true,
                  mediaPlaybackRequiresUserGesture: false,
                  useShouldOverrideUrlLoading: true,
                  supportMultipleWindows: true,
                ),
                onWebViewCreated: (InAppWebViewController controller) {
                  _controller = controller;
                  controller.addJavaScriptHandler(
                    handlerName: 'AxisCredentialsBridge',
                    callback: (List<dynamic> args) {
                      _handleCredentialBridge(args);
                      return null;
                    },
                  );
                },
                onLoadStart: (InAppWebViewController controller, WebUri? url) {
                  if (!mounted) return;
                  setState(() {
                    _hasLoadError = false;
                    _loadErrorMessage = 'The system could not be reached.';
                    _currentUrl = url?.toString() ?? '';
                    _progress = 0;
                  });
                },
                onProgressChanged:
                    (InAppWebViewController controller, int progress) {
                      if (mounted) setState(() => _progress = progress);
                    },
                onLoadStop: (InAppWebViewController controller, WebUri? url) {
                  final String currentUrl = url?.toString() ?? '';
                  if (currentUrl.isNotEmpty) {
                    unawaited(_onLoadFinished(currentUrl));
                  }
                },
                onUpdateVisitedHistory:
                    (
                      InAppWebViewController controller,
                      WebUri? url,
                      bool? isReload,
                    ) {
                      final String currentUrl = url?.toString() ?? '';
                      if (currentUrl.isNotEmpty) {
                        unawaited(_onVisitedUrl(currentUrl));
                      }
                    },
                onReceivedError:
                    (
                      InAppWebViewController controller,
                      WebResourceRequest request,
                      WebResourceError error,
                    ) {
                      if ((request.isForMainFrame ?? true) && mounted) {
                        setState(() {
                          _hasLoadError = true;
                          _loadErrorMessage = error.description;
                        });
                      }
                    },
                shouldOverrideUrlLoading: _handleNavigation,
                onCreateWindow: _handleCreateWindow,
              ),
      ),
    );
  }
}

class _DesktopMessageView extends StatelessWidget {
  const _DesktopMessageView({
    required this.title,
    required this.message,
    required this.onRetry,
  });

  final String title;
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(
                Icons.cloud_off_outlined,
                size: 56,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(height: 18),
              Text(
                title,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 10),
              Text(message, textAlign: TextAlign.center),
              if (onRetry != null) ...<Widget>[
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Try again'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
