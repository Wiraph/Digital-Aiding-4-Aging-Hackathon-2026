$ErrorActionPreference = "Stop"

$NotebookId = "75ec83b9-348d-4a5e-a70d-bc8d72bf256c"
$ServerToken = if ($env:NOTEBOOKLM_SERVER_TOKEN) { $env:NOTEBOOKLM_SERVER_TOKEN } else { [guid]::NewGuid().ToString("N") }
$BridgeToken = if ($env:NOTEBOOKLM_BRIDGE_TOKEN) { $env:NOTEBOOKLM_BRIDGE_TOKEN } else { [guid]::NewGuid().ToString("N") }

Write-Host "Notebook ID: $NotebookId"
Write-Host "Bridge token: $BridgeToken"

$serverCommand = "`$env:NOTEBOOKLM_SERVER_TOKEN='$ServerToken'; notebooklm-server --host 127.0.0.1 --port 8000"
$bridgeCommand = "cd '$PSScriptRoot'; `$env:NOTEBOOKLM_SERVER_BASE_URL='http://127.0.0.1:8000'; `$env:NOTEBOOKLM_SERVER_TOKEN='$ServerToken'; `$env:NOTEBOOKLM_BRIDGE_TOKEN='$BridgeToken'; `$env:NOTEBOOKLM_BRIDGE_ALLOWED_ORIGINS='http://localhost:5180,http://127.0.0.1:5180,http://localhost:5173,http://127.0.0.1:5173'; uvicorn notebooklm_bridge:app --host 127.0.0.1 --port 8010"

Start-Process powershell.exe -ArgumentList @("-NoExit", "-Command", $serverCommand)
Start-Sleep -Seconds 2
Start-Process powershell.exe -ArgumentList @("-NoExit", "-Command", $bridgeCommand)

Write-Host ""
Write-Host "Test request:"
Write-Host "curl -X POST http://127.0.0.1:8010/v1/ask ``"
Write-Host "  -H `"Authorization: Bearer $BridgeToken`" ``"
Write-Host "  -H `"Content-Type: application/json`" ``"
Write-Host "  -d `"{\`"notebook_id\`":\`"$NotebookId\`",\`"question\`":\`"Summarize this notebook\`"}`""
