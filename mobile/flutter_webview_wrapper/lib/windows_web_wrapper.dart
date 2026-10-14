import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:url_launcher/url_launcher.dart';

import 'app_config.dart';

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
  InAppWebViewController? _controller;
  int _progress = 0;
  bool _hasLoadError = false;
  bool _canGoBack = false;
  String _loadErrorMessage = 'The system could not be reached.';

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

  @override
  Widget build(BuildContext context) {
    final String? environmentError = widget.environmentError;
    final bool canShowWebView =
        environmentError == null && widget.webViewEnvironment != null;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pulmo System'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Back',
            onPressed: _canGoBack ? _goBack : null,
            icon: const Icon(Icons.arrow_back),
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
                title: 'Could not connect to Pulmo System',
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
                },
                onLoadStart: (InAppWebViewController controller, WebUri? url) {
                  if (!mounted) return;
                  setState(() {
                    _hasLoadError = false;
                    _loadErrorMessage = 'The system could not be reached.';
                    _progress = 0;
                  });
                },
                onProgressChanged:
                    (InAppWebViewController controller, int progress) {
                      if (mounted) setState(() => _progress = progress);
                    },
                onLoadStop: (InAppWebViewController controller, WebUri? url) {
                  if (mounted) setState(() => _progress = 100);
                  unawaited(_refreshNavigationState());
                },
                onUpdateVisitedHistory:
                    (
                      InAppWebViewController controller,
                      WebUri? url,
                      bool? isReload,
                    ) {
                      unawaited(_refreshNavigationState());
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
