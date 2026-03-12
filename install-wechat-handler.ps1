# Run this script ONCE as Administrator to register the protocol handler

$scriptPath = "$PSScriptRoot\wechat-open.ps1"

$regPath = "HKCU:\Software\Classes\hqqwechat"
New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name "(Default)" -Value "URL:HQQ WeChat Protocol"
Set-ItemProperty -Path $regPath -Name "URL Protocol" -Value ""

$iconPath = "$regPath\DefaultIcon"
New-Item -Path $iconPath -Force | Out-Null
Set-ItemProperty -Path $iconPath -Name "(Default)" -Value "powershell.exe,0"

$cmdPath = "$regPath\shell\open\command"
New-Item -Path $cmdPath -Force | Out-Null
$cmd = "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`" `"%1`""
Set-ItemProperty -Path $cmdPath -Name "(Default)" -Value $cmd

Write-Host ""
Write-Host "Done! Protocol 'hqqwechat://' registered." -ForegroundColor Green
Write-Host "Now WeChat buttons in HQQ OMS will work automatically." -ForegroundColor Cyan
Write-Host ""
