param(
  [Parameter(Mandatory = $true)][string]$RunId,
  [Parameter(Mandatory = $true)][int]$ParentPid
)

$ErrorActionPreference = 'Stop'
$source = "md-reader-console-trace-$RunId"

function Write-Frame([object]$Frame) {
  [Console]::Out.WriteLine(($Frame | ConvertTo-Json -Compress -Depth 6))
}

function Get-ProcessSnapshot([int]$ProcessIdentifier, [int]$SessionId) {
  $item = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessIdentifier" -ErrorAction Stop
  if ($item.SessionId -ne $SessionId) { return $null }
  return [ordered]@{
    pid = [int]$item.ProcessId
    parentPid = [int]$item.ParentProcessId
    name = [string]$item.Name
    commandLine = [string]$item.CommandLine
  }
}

try {
  $sessionId = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
  $query = "SessionId = $sessionId AND (Name = 'node.exe' OR Name = 'WindowsTerminal.exe' OR Name = 'wt.exe')"
  $known = @{}
  Get-CimInstance Win32_Process -Filter $query -ErrorAction Stop | ForEach-Object { $known[[int]$_.ProcessId] = $true }
  Write-Frame ([ordered]@{ type = 'ready'; runId = $RunId; sessionId = $sessionId; mode = 'poll' })

  while ($true) {
    if (-not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 250
    $current = @(Get-CimInstance Win32_Process -Filter $query -ErrorAction Stop)
    foreach ($started in $current) {
      $targetPid = [int]$started.ProcessId
      if ($known.ContainsKey($targetPid)) { continue }
      $known[$targetPid] = $true
      try {
      $target = Get-ProcessSnapshot -ProcessIdentifier $targetPid -SessionId $sessionId
      if ($null -eq $target) { continue }
      $ancestors = @()
      $nextPid = [int]$target.parentPid
      $seen = @([int]$target.pid)
      for ($i = 0; $i -lt 4 -and $nextPid -gt 0 -and -not ($seen -contains $nextPid); $i++) {
        $seen += $nextPid
        try {
          $ancestor = Get-ProcessSnapshot -ProcessIdentifier $nextPid -SessionId $sessionId
          if ($null -eq $ancestor) { break }
          $ancestors += $ancestor
          $nextPid = [int]$ancestor.parentPid
        } catch { break }
      }
      Write-Frame ([ordered]@{
        type = 'record'
        runId = $RunId
        sessionId = $sessionId
        at = [DateTime]::UtcNow.ToString('o')
        process = $target
        ancestors = $ancestors
      })
      } catch {
      Write-Frame ([ordered]@{ type = 'error'; runId = $RunId; message = $_.Exception.Message })
      }
    }
  }
} catch {
  Write-Frame ([ordered]@{ type = 'failure'; runId = $RunId; message = $_.Exception.Message })
  exit 1
} finally {
}
