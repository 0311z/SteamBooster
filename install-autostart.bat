@echo off
rem SteamBooster - enable hidden auto-start on sign-in
set "TARGET=%~dp0start-hidden.vbs"
set "LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SteamBooster.lnk"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%LINK%'); $s.TargetPath='%TARGET%'; $s.WorkingDirectory='%~dp0'; $s.Description='SteamBooster auto (hidden)'; $s.Save()"
echo.
echo Done: SteamBooster will start hidden on sign-in.
echo To remove it run uninstall-autostart.bat
pause
