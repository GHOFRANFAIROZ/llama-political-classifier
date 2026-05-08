import requests
import json

resp = requests.post(
    "https://my-classifier-v2.onrender.com/classify_v2",
    json={
        "text": "هذا إعلان عن نشاط توعوي ولا يتضمن أي تحريض",
        "source": "X",
        "url": "https://x.com/test/status/render-smoke-001",
        "author": "Render Test",
        "post_time": "2026-05-08T14:00:00.000Z"
    },
    headers={"Content-Type": "application/json; charset=utf-8"},
    timeout=90
)

print(json.dumps(resp.json(), ensure_ascii=False, indent=2))