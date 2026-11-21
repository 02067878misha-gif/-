# Run in 64-bit Windows PowerShell 5.1 (STA) with CorelDRAW 2025 installed.
[CmdletBinding()]
param([string]$AddonDirectory = (Join-Path $PSScriptRoot 'StrataDraw'))
$ErrorActionPreference = 'Stop'
if ([Threading.Thread]::CurrentThread.ApartmentState -ne 'STA') { throw 'Run powershell.exe -STA -File Check-Corel.ps1' }
$directory = (Resolve-Path -LiteralPath $AddonDirectory).Path
Add-Type -AssemblyName PresentationFramework
$path = Join-Path $directory 'StrataDraw.dll'
$null = [Reflection.Assembly]::LoadFrom($path)
$corel = New-Object -ComObject CorelDRAW.Application.26
$corel.Visible = $true
[StrataDraw.HostVerification]::Run($corel, $directory)
Write-Output 'PASS: CorelDRAW imported the generated features into a new unsaved test document.'
