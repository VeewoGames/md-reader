param([Parameter(Mandatory = $true)][string]$DocumentPath)

$directoryPath = [IO.Path]::GetDirectoryName($DocumentPath)
$fileName = [IO.Path]::GetFileName($DocumentPath)

$shell = New-Object -ComObject Shell.Application
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ExplorerWindow {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr processId);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
}
'@
$deadline = (Get-Date).AddSeconds(3)
$startedExplorer = $false
do {
  foreach ($window in @($shell.Windows())) {
    try {
      $locationPath = ([uri]$window.LocationURL).LocalPath
      if ($locationPath -and [IO.Path]::GetFullPath($locationPath) -eq [IO.Path]::GetFullPath($directoryPath)) {
        $item = $window.Document.Folder.ParseName($fileName)
        if ($item) { $window.Document.SelectItem($item, 25) }
        $handle = [IntPtr]$window.HWND
        [void][ExplorerWindow]::ShowWindowAsync($handle, 9)
        [void][ExplorerWindow]::SetWindowPos($handle, [IntPtr](-1), 0, 0, 0, 0, 3)
        [void][ExplorerWindow]::SetWindowPos($handle, [IntPtr](-2), 0, 0, 0, 0, 3)
        $currentThread = [ExplorerWindow]::GetCurrentThreadId()
        $foregroundThread = [ExplorerWindow]::GetWindowThreadProcessId([ExplorerWindow]::GetForegroundWindow(), [IntPtr]::Zero)
        if ($foregroundThread -ne 0 -and $foregroundThread -ne $currentThread) {
          [void][ExplorerWindow]::AttachThreadInput($currentThread, $foregroundThread, $true)
        }
        [void][ExplorerWindow]::BringWindowToTop($handle)
        [void][ExplorerWindow]::SetForegroundWindow($handle)
        if ($foregroundThread -ne 0 -and $foregroundThread -ne $currentThread) {
          [void][ExplorerWindow]::AttachThreadInput($currentThread, $foregroundThread, $false)
        }
        exit 0
      }
    } catch {}
  }
  if (-not $startedExplorer) {
    Start-Process -FilePath explorer.exe -ArgumentList "/e,/select,`"$DocumentPath`""
    $startedExplorer = $true
  }
  Start-Sleep -Milliseconds 100
} while ((Get-Date) -lt $deadline)

exit 1
