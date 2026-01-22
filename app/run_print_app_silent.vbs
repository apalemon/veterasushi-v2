Set WshShell = CreateObject("WScript.Shell")
appDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

pythonw = "pythonw"
cmd = """" & pythonw & """ """" & appDir & "\app.py" & """"

WshShell.CurrentDirectory = appDir
WshShell.Run cmd, 0, False
