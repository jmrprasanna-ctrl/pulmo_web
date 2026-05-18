import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

const String kWebAppUrl = String.fromEnvironment(
  'WEB_APP_URL',
  defaultValue: 'http://54.242.44.172/pages/login.html',
);
const String _credentialsChannelName = 'AxisCredentialsBridge';
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
    } catch (_) {
      _savedCredentials = <_SavedCredential>[];
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
    }

    if (_isLoginPageUrl(url)) {
      await _enhanceLoginAutofill(url);
      await _maybeShowSavedAccountsPrompt();
      return;
    }
    await _enhanceLoginAutofill(url);
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
    await (_credentialsLoadFuture ?? Future<void>.value());
    final _SavedCredential? latest =
        _savedCredentials.isNotEmpty ? _savedCredentials.first : null;
    final String savedUserJs = jsonEncode(latest?.username ?? '');
    final String savedPasswordJs = jsonEncode(latest?.password ?? '');
    final String js = '''
      (function () {
        try {
          var savedUser = $savedUserJs;
          var savedPassword = $savedPasswordJs;
          var form = document.getElementById('loginForm');
          var user = document.getElementById('User') || document.getElementById('user') || document.getElementById('email');
          var pass = document.getElementById('password');
          var loginBtn = document.getElementById('loginBtn');
          var credentialBridge = window.$_credentialsChannelName;

          if (form) {
            form.setAttribute('method', 'post');
            form.setAttribute('autocomplete', 'on');
          }
          if (user) {
            user.setAttribute('name', user.getAttribute('name') || 'username');
            user.setAttribute('autocomplete', 'username');
            user.setAttribute('autocapitalize', 'none');
            user.setAttribute('autocorrect', 'off');
            user.setAttribute('spellcheck', 'false');
          }
          if (pass) {
            pass.setAttribute('name', pass.getAttribute('name') || 'password');
            pass.setAttribute('autocomplete', 'current-password');
          }
          if (loginBtn && loginBtn.tagName === 'BUTTON') {
            loginBtn.setAttribute('type', 'submit');
          }

          var syncFilledValues = function () {
            if (user && savedUser && !String(user.value || '').trim()) {
              user.value = savedUser;
              user.dispatchEvent(new Event('input', { bubbles: true }));
              user.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (pass && savedPassword && !String(pass.value || '')) {
              pass.value = savedPassword;
              pass.dispatchEvent(new Event('input', { bubbles: true }));
              pass.dispatchEvent(new Event('change', { bubbles: true }));
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

          syncFilledValues();

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

          if (user) {
            window.setTimeout(function () {
              syncFilledValues();
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
          title: const Text('AXIS CMS PULMO'),
          actions: [
            if (_isLoginPageUrl(_currentUrl) && _savedCredentials.isNotEmpty)
              IconButton(
                tooltip: 'Saved Accounts',
                onPressed: () => _maybeShowSavedAccountsPrompt(force: true),
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
              ? _ErrorView(message: _errorText, onRetry: _reload)
              : WebViewWidget(controller: _controller),
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, size: 48),
            const SizedBox(height: 12),
            const Text(
              'Failed to load the web app.',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              message.isEmpty ? 'Unknown network or server error.' : message,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Try Again'),
            ),
          ],
        ),
      ),
    );
  }
}
