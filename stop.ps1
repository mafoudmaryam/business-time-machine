<#
.SYNOPSIS
    Stops the backend and frontend dev servers started by start.ps1.

.DESCRIPTION
    1. Closes the two PowerShell windows recorded in .dev-pids.json (killing their
       process tree, so uvicorn and Vite's node process go down too).
    2. Frees ports 8000 and 5173. uvicorn --reload starts a child worker that inherits
       the listening socket: if only its parent is killed, the port stays "listening"
       under a dead PID and nothing new can start. So this script also kills every
       child of a listener, any uvicorn of this app, and any Vite of this project,
       then checks the ports again and repeats until they are really free.
#>

$root = $PSScriptRoot
$pidFile = "$root\.dev-pids.json"
$ports = @(8000, 5173)

function Stop-Tree {
    param([int]$ProcessId)
    taskkill /PID $ProcessId /F /T 2>$null | Out-Null
}

function Get-ListenerPids {
    param([int]$Port)
    # netstat also shows listeners whose owner is already dead, which Get-NetTCPConnection can miss.
    $found = @()
    foreach ($line in (netstat -ano | Select-String ":$Port\s+\S+\s+LISTENING")) {
        $found += [int]($line.ToString().Trim() -split "\s+")[-1]
    }
    return $found | Where-Object { $_ -gt 0 } | Sort-Object -Unique
}

function Stop-DevProcesses {
    $all = Get-CimInstance Win32_Process
    $listeners = @()
    foreach ($port in $ports) { $listeners += Get-ListenerPids -Port $port }

    # Children of a listener (the uvicorn reload worker), even when the listener itself is already dead.
    foreach ($listener in ($listeners | Sort-Object -Unique)) {
        foreach ($child in ($all | Where-Object { $_.ParentProcessId -eq $listener })) {
            Write-Host "Stopping child process $($child.ProcessId) of listener $listener."
            Stop-Tree -ProcessId $child.ProcessId
        }
        if (Get-Process -Id $listener -ErrorAction SilentlyContinue) {
            Write-Host "Stopping listener process $listener."
            Stop-Tree -ProcessId $listener
        }
    }

    # uvicorn of this app / Vite of this project, wherever they are hiding.
    foreach ($p in $all) {
        $cmd = $p.CommandLine
        if (-not $cmd) { continue }
        $isUvicorn = ($cmd -match "uvicorn") -and ($cmd -match "app\.main:app")
        $isVite = ($cmd -match "vite") -and ($cmd -like "*$($root -replace '\\','\\')*" -or $cmd -like "*business-time-machine*")
        if ($isUvicorn -or $isVite) {
            Write-Host "Stopping $($p.Name) $($p.ProcessId) ($(if ($isUvicorn) {'uvicorn'} else {'vite'}))."
            Stop-Tree -ProcessId $p.ProcessId
        }
    }
}

if (Test-Path $pidFile) {
    $savedPids = Get-Content $pidFile -Raw | ConvertFrom-Json
    foreach ($name in @("backend", "frontend")) {
        $windowPid = $savedPids.$name
        if ($windowPid -and (Get-Process -Id $windowPid -ErrorAction SilentlyContinue)) {
            Write-Host "Stopping $name window (PID $windowPid)."
            Stop-Tree -ProcessId $windowPid
        }
    }
    Remove-Item $pidFile -Force
} else {
    Write-Host "No .dev-pids.json found -- freeing known ports directly."
}

# Repeat until nothing listens on the dev ports any more (max 5 rounds).
for ($round = 1; $round -le 5; $round++) {
    Stop-DevProcesses
    Start-Sleep -Milliseconds 700
    $still = @()
    foreach ($port in $ports) { if (Get-ListenerPids -Port $port) { $still += $port } }
    if ($still.Count -eq 0) { break }
}

if ($still.Count -gt 0) {
    Write-Host "WARNING: still something listening on port(s) $($still -join ', '). Close the terminal windows by hand." -ForegroundColor Yellow
    exit 1
}
Write-Host "Done. Ports $($ports -join ' and ') are free."
