# Flutter WebView Wrapper (Pulmo)

This is a Flutter mobile wrapper for your existing web application.

## What it does

- Loads your web app URL in a WebView.
- Keeps JavaScript enabled for your existing frontend.
- Handles external links (`tel:`, `mailto:`, custom schemes) via device apps.
- Adds:
  - Top progress bar while pages load
  - App-bar refresh button
  - WebView back navigation on Android back gesture/button
  - Retry UI when main page load fails

## 1) Set your web app URL

This wrapper reads URL from Dart define key `WEB_APP_URL`.

Run with:

```bash
flutter run --dart-define=WEB_APP_URL=https://your-domain.com/pages/login.html
```

If you do not pass this define, it uses the fallback in `lib/main.dart`.

## 2) Install dependencies

```bash
cd mobile/flutter_webview_wrapper
flutter pub get
```

## 3) Run app

```bash
flutter run
```

or with URL override:

```bash
flutter run --dart-define=WEB_APP_URL=https://your-domain.com/pages/login.html
```

## 4) Notes

- Android manifest already includes internet, camera, and microphone permissions.
- iOS plist includes camera/mic usage text and allows arbitrary loads (for HTTP test environments).
- For production, prefer HTTPS and tighten transport rules.
