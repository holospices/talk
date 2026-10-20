$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $PSScriptRoot
$desktopDir = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopDir 'Talk Test Center.lnk'
$iconPath = Join-Path $projectDir 'public\app-icon.ico'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "$env:SystemRoot\System32\cmd.exe"
$shortcut.Arguments = "/k `"cd /d `"`"$projectDir`"`" && npm run test:center`""
$shortcut.WorkingDirectory = $projectDir
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = 'Start Talk PC, Web and Android local live-reload testing'
$shortcut.Save()

Write-Output "Created: $shortcutPath"
