param([switch]$Stop, [switch]$Restart, [switch]$Open)
$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot
$stateDir = Join-Path $projectDir '.local'
$serverPath = Join-Path $projectDir 'server\index.mjs'
$portNumber = 4317
if ($env:HIVE_PORT) { $portNumber = [int]$env:HIVE_PORT }
if ($portNumber -lt 1 -or $portNumber -gt 65535) { throw 'HIVE_PORT must be between 1 and 65535.' }
$url = "http://127.0.0.1:$portNumber"
$suffix = if ($portNumber -eq 4317) { '' } else { "-$portNumber" }
$pidPath = Join-Path $stateDir "server$suffix.pid"
$outLog = Join-Path $stateDir "server$suffix.log"
$errLog = Join-Path $stateDir "server$suffix-error.log"
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null

function Get-HiveHealth {
    try {
        $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 1
        if ($health.app -eq 'hive-writing-prototype' -and $health.project -eq $projectDir -and $health.ready) { return $health }
    } catch {}
    return $null
}

function Get-OwnedProcess {
    if (-not (Test-Path -LiteralPath $pidPath)) { return $null }
    $savedProcessId = 0
    if (-not [int]::TryParse((Get-Content -LiteralPath $pidPath -Raw).Trim(), [ref]$savedProcessId)) { return $null }
    $candidate = Get-CimInstance Win32_Process -Filter "ProcessId = $savedProcessId" -ErrorAction SilentlyContinue
    if ($candidate -and $candidate.Name -eq 'node.exe' -and $candidate.CommandLine -and $candidate.CommandLine.Contains($serverPath)) { return $candidate }
    return $null
}

$health = Get-HiveHealth
$ownedProcess = Get-OwnedProcess
if ($Stop -or $Restart) {
    if ($ownedProcess) {
        Stop-Process -Id $ownedProcess.ProcessId
        $remaining = Get-Process -Id $ownedProcess.ProcessId -ErrorAction SilentlyContinue
        if ($remaining) { $remaining.WaitForExit(5000) | Out-Null }
        Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
        $health = $null
    } elseif ($health) {
        throw 'A HIVE server is running outside this launcher. Stop its original terminal before restarting.'
    }
    if ($Stop) { Write-Output 'HIVE stopped.'; exit 0 }
}
if ($health) {
    Write-Output "HIVE is ready: $url"
    if ($Open) { Start-Process $url }
    exit 0
}
if ($ownedProcess -and -not $Restart) {
    throw "The recorded HIVE process is not responding. Run launch.ps1 -Restart. Logs: $errLog"
}
if (Get-NetTCPConnection -State Listen -LocalPort $portNumber -ErrorAction SilentlyContinue) {
    throw "Port $portNumber is already in use by another or outdated service. No process was stopped."
}
if (-not (Test-Path -LiteralPath (Join-Path $projectDir 'node_modules'))) {
    throw 'Please run npm install in the prototype directory first.'
}
$runtimePath = (Get-Command node.exe -ErrorAction Stop).Source
$process = Start-Process -FilePath $runtimePath -ArgumentList @('"' + $serverPath + '"') -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
Set-Content -LiteralPath $pidPath -Value $process.Id
$deadline = [DateTime]::UtcNow.AddSeconds(20)
do {
    $process.Refresh()
    if ($process.HasExited) { throw "HIVE exited during startup. Read $errLog" }
    $health = Get-HiveHealth
    if ($health -and [int]$health.pid -eq $process.Id) {
        $page = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
        if ($page.StatusCode -eq 200) {
            Write-Output "HIVE is ready: $url"
            if ($Open) { Start-Process $url }
            exit 0
        }
    }
    Start-Sleep -Milliseconds 200
} while ([DateTime]::UtcNow -lt $deadline)
Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
throw "HIVE did not become ready within 20 seconds. Read $errLog"
