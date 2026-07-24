import json, subprocess, time, urllib.request, base64, socket
from pathlib import Path

ROOT = Path(r"E:\Program\Firefly")
NODE = r"C:\Users\lenovo\AppData\Local\Programs\kimi-desktop\resources\resources\runtime\node"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
OUT = ROOT / "_debug" / "redesign" / "v7-filter"

import websocket
server = subprocess.Popen([NODE, "node_modules/astro/bin/astro.mjs", "dev", "--port", "4322", "--host", "127.0.0.1"],
    cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
edge = None
try:
    for i in range(120):
        try:
            urllib.request.urlopen("http://127.0.0.1:4322/", timeout=3); break
        except Exception: time.sleep(1)
    print("server ready")
    edge = subprocess.Popen([EDGE, "--headless=new", "--disable-gpu", "--remote-debugging-port=9229",
        "--remote-allow-origins=*", "--window-size=1440,1000",
        "--user-data-dir=" + str(ROOT / "_debug" / ".edge-profile-v7diag"), "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws_url = None
    for i in range(25):
        try:
            tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9229/json", timeout=2).read())
            page = [t for t in tabs if t.get("type") == "page"]
            if page: ws_url = page[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(1)
    ws = websocket.create_connection(ws_url, timeout=60)
    mid = [0]
    def send(method, params=None):
        mid[0] += 1
        ws.send(json.dumps({"id": mid[0], "method": method, "params": params or {}}))
        deadline = time.time() + 55
        while time.time() < deadline:
            msg = json.loads(ws.recv())
            if msg.get("id") == mid[0]: return msg.get("result", {})
        raise TimeoutError(method)
    def js(expr):
        r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
        return r.get("result", {}).get("value")
    send("Page.enable"); send("Runtime.enable")
    send("Page.navigate", {"url": "http://127.0.0.1:4322/"})
    for w in (4, 8, 15, 25):
        time.sleep(w)
        print(f"after {w}s:", js("JSON.stringify({ready: document.readyState, plc: !!document.getElementById('post-list-container'), cards: document.querySelectorAll('#post-list-container > *').length, swup: !!document.getElementById('swup-container'), cw: !!document.getElementById('content-wrapper'), title: document.title, bodyLen: document.body.innerHTML.length})"))
    ws.close()
finally:
    if edge: subprocess.run(["taskkill", "//F", "//T", "//PID", str(edge.pid)], capture_output=True)
    subprocess.run(["taskkill", "//F", "//T", "//PID", str(server.pid)], capture_output=True)
