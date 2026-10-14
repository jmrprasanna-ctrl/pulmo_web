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

## Windows desktop build

The Windows build opens the same system in a Pulmo app window using the
Microsoft Edge WebView2 runtime. It does not launch a separate browser. The
system still needs a connection to the configured server.

Install Visual Studio 2022 Build Tools with the **Desktop development with C++**
workload, then run:

```powershell
flutter create --platforms=windows .
flutter pub get
flutter build windows --release
& "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe" .\pulmo_system_installer.iss
```

The release app and its supporting files are written under
`build/windows/x64/runner/Release`. The installer script packages them into
`build/installer/PulmoSystemSetup.exe`. The setup installs per-user and can add
a desktop shortcut. Windows 11 includes WebView2. On Windows 10, install the
WebView2 Runtime if it is not already present.

## 4) Notes

- Android manifest already includes internet, camera, and microphone permissions.
- iOS plist includes camera/mic usage text and allows arbitrary loads (for HTTP test environments).
- For production, prefer HTTPS and tighten transport rules.
