# NotebookLM Bridge

FastAPI bridge for a local `notebooklm-server`.

## Run

Start `notebooklm-server` first:

```bash
set NOTEBOOKLM_SERVER_TOKEN=replace-with-secret
notebooklm-server --host 127.0.0.1 --port 8000
```

Start this bridge:

```bash
cd bridge
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set NOTEBOOKLM_SERVER_BASE_URL=http://127.0.0.1:8000
set NOTEBOOKLM_SERVER_TOKEN=replace-with-secret
set NOTEBOOKLM_BRIDGE_TOKEN=replace-with-public-api-secret
set NOTEBOOKLM_BRIDGE_ALLOWED_ORIGINS=http://localhost:5180,http://127.0.0.1:5180,http://localhost:5173,http://127.0.0.1:5173
uvicorn notebooklm_bridge:app --host 127.0.0.1 --port 8010
```

For Vercel, set the project root directory to `bridge/`. The `app.py` file re-exports
the FastAPI `app` instance for Vercel's Python runtime.

## Ask

Your current notebook:

```text
75ec83b9-348d-4a5e-a70d-bc8d72bf256c
```

```bash
curl -X POST http://127.0.0.1:8010/v1/ask ^
  -H "Authorization: Bearer replace-with-public-api-secret" ^
  -H "Content-Type: application/json" ^
  -d "{\"notebook_id\":\"75ec83b9-348d-4a5e-a70d-bc8d72bf256c\",\"question\":\"สรุปข้อมูลใน notebook นี้ให้หน่อย\"}"
```

Response:

```json
{
  "notebook_id": "YOUR_NOTEBOOK_ID",
  "answer": "...",
  "references": [],
  "conversation_id": "...",
  "raw": {}
}
```
