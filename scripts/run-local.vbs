Option Explicit
Dim shell, command
Set shell = CreateObject("WScript.Shell")
command = Chr(34) & WScript.Arguments.Item(0) & Chr(34) & " --env-file-if-exists=.env server.js"
WScript.Quit shell.Run(command, 0, True)
