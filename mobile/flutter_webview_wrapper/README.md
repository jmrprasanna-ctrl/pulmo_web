# AXIS CMS SYSTEM Flutter app

This Flutter app wraps your existing web application on mobile and Windows.

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

If you do not pass this define, it uses the fallback in `lib/app_config.dart`.

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

The Windows build opens the same system in an AXIS CMS SYSTEM window using the
Microsoft Edge WebView2 runtime. It does not launch a separate browser. The
system still needs a connection to the configured server.

Install Visual Studio 2022 Build Tools with the **Desktop development with C++**
workload, NuGet CLI, and Inno Setup 6. Run the following from the repository root.
The temporary W: drive keeps generated CMake paths short on Windows:

```powershell
$projectRoot = (Get-Location).Path
$mobileRoot = Join-Path $projectRoot 'mobile'
if (Test-Path 'W:\') { throw 'Drive W: is already in use.' }
subst W: $mobileRoot
try {
  Set-Location W:\flutter_webview_wrapper
  flutter pub get
  if ($LASTEXITCODE -ne 0) { throw 'flutter pub get failed.' }
  flutter build windows --release
  if ($LASTEXITCODE -ne 0) { throw 'Flutter build failed.' }
  & "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe" .\axis_cms_system_installer.iss
  if ($LASTEXITCODE -ne 0) { throw 'Installer packaging failed.' }
} finally {
  Set-Location $projectRoot
  subst W: /D
}
```

The release app and its supporting files are written under
`build/windows/x64/runner/Release`. The installer script packages them into
`build/installer/AxisCmsSystemSetup.exe`. The setup installs per-user and can add
a desktop shortcut. Windows 11 includes WebView2. On Windows 10, install the
WebView2 Runtime if it is not already present.

## 4) Notes

- Android manifest already includes internet, camera, and microphone permissions.
- iOS plist includes camera/mic usage text and allows arbitrary loads (for HTTP test environments).
- For production, prefer HTTPS and tighten transport rules.
