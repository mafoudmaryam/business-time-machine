<#
.SYNOPSIS
    Starts the Business Time Machine backend and frontend dev servers.

.DESCRIPTION
    Opens two new PowerShell windows: one running the FastAPI backend
    (uvicorn --reload, port 8000), one running the Vite frontend (npm run dev).
    Sets NO_PROXY=localhost,127.0.0.1 in both windows so a system HTTP proxy
    doesn't intercept local traffic. If an old uvicorn (or anything else) is
    still holding port 8000, it's stopped first.

    Run from the repo root:  .\start.ps1
    Stop both servers with:  .\stop.ps1
#>

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Stop-PortListener {
    param([int]$Port)
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
        Write-Host "Port $Port is in use by PID $($conn.OwningProcess) -- stopping it."
        taskkill /PID $conn.OwningProcess /F /T 2>$null | Out-Null
    }
}

Stop-PortListener -Port 8000

$env:NO_PROXY = "localhost,127.0.0.1"

$backendCmd = "`$env:NO_PROXY = 'localhost,127.0.0.1'; Set-Location '$root\backend'; . .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --port 8000"
$frontendCmd = "`$env:NO_PROXY = 'localhost,127.0.0.1'; Set-Location '$root\frontend'; npm run dev"

$backendProc = Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $backendCmd -PassThru
$frontendProc = Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $frontendCmd -PassThru

[PSCustomObject]@{ backend = $backendProc.Id; frontend = $frontendProc.Id } |
    ConvertTo-Json | Set-Content -Path "$root\.dev-pids.json" -Encoding utf8

Write-Host ""
Write-Host "Backend:  http://localhost:8000  (window PID $($backendProc.Id))"
Write-Host "Frontend: http://localhost:5173  (window PID $($frontendProc.Id) -- Vite prints the real port/URL in its own window)"
Write-Host "Run .\stop.ps1 to stop both."
