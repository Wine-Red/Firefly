import json, subprocess, time, urllib.request, base64
from pathlib import Path

ROOT = Path(r"E:\Program\Firefly")
NODE = r"C:\Users\lenovo\AppData\Local\Programs\kimi-desktop\resources\resources\runtime\node"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
OUT = ROOT / "_debug" / "redesign" / "v7-filter"
OUT.mkdir(parents=True, exist_ok=True)

import websocket
server = subprocess.Popen([NODE, "node_modules/astro/bin/astro.mjs", "preview", "--port", "4322", "--host", "127.0.0.1"],
    cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
edge = None
try:
    for i in range(60):
        try:
            urllib.request.urlopen("http://127.0.0.1:4322/", timeout=2); break
        except Exception: time.sleep(1)
    edge = subprocess.Popen([EDGE, "--headless=new", "--disable-gpu", "--remote-debugging-port=9226",
        "--remote-allow-origins=*", "--window-size=1440,1200",
        "--user-data-dir=" + str(ROOT / "_debug" / ".edge-profile-v7"), "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws_url = None
    for i in range(20):
        try:
            tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9226/json", timeout=2).read())
            page = [t for t in tabs if t.get("type") == "page"]
            if page: ws_url = page[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(1)
    ws = websocket.create_connection(ws_url, timeout=20)
    mid = [0]
    def send(method, params=None):
        mid[0] += 1
        ws.send(json.dumps({"id": mid[0], "method": method, "params": params or {}}))
        while True:
            msg = json.loads(ws.recv())
            if msg.get("id") == mid[0]: return msg.get("result", {})
    def js(expr):
        r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
        res = r.get("result", {})
        if "exceptionDetails" in r: return "JSERR " + json.dumps(r["exceptionDetails"])[:300]
        return res.get("value")
    def shot(name):
        data = send("Page.captureScreenshot", {"format": "png"})["data"]
        (OUT / name).write_bytes(base64.b64decode(data))

    send("Page.enable"); send("Runtime.enable")
    send("Page.navigate", {"url": "http://127.0.0.1:4322/"})
    time.sleep(5)

    print("BEFORE:", js("document.getElementById('ai-filter-btn').innerHTML.slice(0,300)"))
    print("svg count before:", js("document.getElementById('ai-filter-btn').querySelectorAll('svg').length"))
    js("document.getElementById('ai-filter-btn').click()")
    time.sleep(3)
    print("AFTER:", js("document.getElementById('ai-filter-btn').innerHTML.slice(0,300)"))
    print("svg count after:", js("document.getElementById('ai-filter-btn').querySelectorAll('svg').length"))
    print("btn outerHTML after:", js("document.getElementById('ai-filter-btn').outerHTML.slice(0,500)"))
    shot("v7-repro-after-click.png")
    ws.close()
finally:
    if edge: subprocess.run(["taskkill", "//F", "//T", "//PID", str(edge.pid)], capture_output=True)
    subprocess.run(["taskkill", "//F", "//T", "//PID", str(server.pid)], capture_output=True)
