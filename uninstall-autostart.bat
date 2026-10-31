@echo off
rem SteamBooster - remove auto-start
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SteamBooster.lnk" 2>nul
echo Auto-start removed.
pause
