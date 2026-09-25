<#
.SYNOPSIS
    Stops the backend and frontend dev servers started by start.ps1.

.DESCRIPTION
    Closes the two PowerShell windows recorded in .dev-pids.json (killing
    their process tree, so uvicorn's reload worker and Vite's node process go
    down too), then frees ports 8000 and 5173 directly as a fallback, in case
    a window was closed manually or the pid file is missing or stale.
#>

$root = $PSScriptRoot
$pidFile = "$root\.dev-pids.json"

function Stop-PortListener {
    param([int]$Port)
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
        Write-Host "Stopping process on port $Port (PID $($conn.OwningProcess))."
        taskkill /PID $conn.OwningProcess /F /T 2>$null | Out-Null
    }
}

if (Test-Path $pidFile) {
    $savedPids = Get-Content $pidFile -Raw | ConvertFrom-Json
    foreach ($name in @("backend", "frontend")) {
        $windowPid = $savedPids.$name
        if ($windowPid -and (Get-Process -Id $windowPid -ErrorAction SilentlyContinue)) {
            Write-Host "Stopping $name window (PID $windowPid)."
            taskkill /PID $windowPid /F /T 2>$null | Out-Null
        }
    }
    Remove-Item $pidFile -Force
} else {
    Write-Host "No .dev-pids.json found -- freeing known ports directly."
}

# Belt and braces, in case a window was closed by hand or the pid file was stale.
Stop-PortListener -Port 8000
Stop-PortListener -Port 5173

Write-Host "Done."
