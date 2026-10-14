#define AppName "AXIS CMS SYSTEM"
#define AppVersion "1.0.0"
#define AppPublisher "Axis CMS"
#define AppExeName "axis_cms_system.exe"

[Setup]
AppId={{5B7EBA43-107B-4EA0-B9C8-8A8F3C7F0A10}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\AXIS CMS SYSTEM
DefaultGroupName={#AppName}
PrivilegesRequired=lowest
OutputDir=build\installer
OutputBaseFilename=AxisCmsSystemSetup
SetupIconFile=windows\runner\resources\app_icon.ico
UninstallDisplayIcon={app}\{#AppExeName}
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Files]
Source: "build\windows\x64\runner\Release\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName}"; Flags: postinstall nowait skipifsilent
