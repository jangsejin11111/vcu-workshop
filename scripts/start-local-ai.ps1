param(
  [string]$Site = 'https://helpful-platypus-92c08f.netlify.app',
  [Parameter(Mandatory=$true)][string]$Room,
  [string]$Model = 'qwen3:4b-instruct'
)
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot
$ollamaExe = Join-Path $projectRoot '.local-ai/ollama/ollama.exe'
if (-not (Test-Path $ollamaExe)) {
  $ollamaExe = (Get-Command ollama -ErrorAction Stop).Source
}
New-Item -ItemType Directory -Force .local-ai | Out-Null
try { Invoke-RestMethod http://127.0.0.1:11434/api/version -TimeoutSec 3 | Out-Null }
catch {
  $env:OLLAMA_HOST = '127.0.0.1:11434'
  $env:OLLAMA_NO_CLOUD = '1'
  Start-Process -FilePath $ollamaExe -ArgumentList 'serve' -WindowStyle Hidden -RedirectStandardOutput '.local-ai/ollama-out.log' -RedirectStandardError '.local-ai/ollama-error.log'
  Start-Sleep -Seconds 3
}
if (-not $env:VCU_ADMIN_PASSWORD) {
  $secret = Read-Host '진행자 비밀번호' -AsSecureString
  $env:VCU_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $secret).Password
}
# Foreground worker gives the facilitator an explicit running/stopped indicator.
& .venv/Scripts/python.exe scripts/local_ai_worker.py --site $Site --room $Room --model $Model

