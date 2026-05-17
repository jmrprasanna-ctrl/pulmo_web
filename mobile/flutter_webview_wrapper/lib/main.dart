import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

const String kWebAppUrl = String.fromEnvironment(
  'WEB_APP_URL',
  defaultValue: 'http://54.242.44.172/pages/login.html',
);

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
  late final WebViewController _controller;
  late final Uri _startUri;

  int _loadingProgress = 0;
  bool _hasMainFrameError = false;
  String _errorText = '';

  @override
  void initState() {
    super.initState();
    _startUri = Uri.tryParse(kWebAppUrl) ?? Uri.parse('about:blank');

    final WebViewController controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (int progress) {
            setState(() {
              _loadingProgress = progress;
            });
          },
          onPageStarted: (_) {
            setState(() {
              _hasMainFrameError = false;
              _errorText = '';
            });
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
