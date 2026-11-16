param([switch]$Stop, [switch]$Restart, [switch]$Open)
& (Join-Path $PSScriptRoot 'launch.ps1') @PSBoundParameters
exit $LASTEXITCODE
