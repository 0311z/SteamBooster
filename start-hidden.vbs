' SteamBooster - hidden launch (no CMD window)
' Use: double-click, Startup shortcut, or scheduled task.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
' 0 = hidden window, False = don't wait for it to finish
sh.Run "node ""src\accountHandler.js"" --auto", 0, False
