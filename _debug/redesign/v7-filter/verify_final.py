import json, subprocess, time, urllib.request, base64, socket, sys
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
results = []
def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS" if cond else "FAIL"), name, detail, flush=True)

try:
    for i in range(60):
        try:
            urllib.request.urlopen("http://127.0.0.1:4322/", timeout=2); break
        except Exception: time.sleep(1)
    print("preview ready", flush=True)

    edge = subprocess.Popen([EDGE, "--headless=new", "--disable-gpu", "--remote-debugging-port=9232",
        "--remote-allow-origins=*", "--window-size=1440,1000",
        "--user-data-dir=" + str(ROOT / "_debug" / ".edge-profile-v7final"), "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws_url = None
    for i in range(25):
        try:
            tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9232/json", timeout=2).read())
            page = [t for t in tabs if t.get("type") == "page"]
            if page: ws_url = page[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(1)
    if not ws_url: raise RuntimeError("no CDP target")

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
        res = r.get("result", {})
        if "exceptionDetails" in r: return "JSERR " + json.dumps(r["exceptionDetails"])[:300]
        return res.get("value")
    def shot(name):
        data = send("Page.captureScreenshot", {"format": "png"})["data"]
        (OUT / name).write_bytes(base64.b64decode(data))

    send("Page.enable"); send("Runtime.enable")
    send("Page.navigate", {"url": "http://127.0.0.1:4322/"})
    time.sleep(6)

    # 过滤态 + 分类栏可见截图（机器人在栏内）
    n_all = js("document.querySelectorAll('#post-list-container > *').length")
    btn_html_before = js("document.getElementById('ai-filter-btn').innerHTML")
    js("document.getElementById('ai-filter-btn').click()")
    time.sleep(3)
    js("document.getElementById('category-bar').scrollIntoView({block:'center'})")
    time.sleep(1.5)
    n_filtered = js("document.querySelectorAll('#post-list-container > *').length")
    check("过滤 7->2", n_all == 7 and n_filtered == 2, f"{n_all}->{n_filtered}")
    check("机器人 svg 可见", js("(()=>{const s=document.querySelector('#ai-filter-btn svg');if(!s)return false;const r=s.getBoundingClientRect();return r.width>10&&r.height>10&&getComputedStyle(s).visibility!=='hidden'})()") is True)
    check("按钮 innerHTML 未变", btn_html_before == js("document.getElementById('ai-filter-btn').innerHTML"))
    check("按钮激活态", js("document.getElementById('ai-filter-btn').hasAttribute('data-active')") is True)
    shot("v7-07-bar-filtered-robot.png")
    # 再点恢复
    js("document.getElementById('ai-filter-btn').click()")
    time.sleep(3)
    check("恢复 2->7", js("document.querySelectorAll('#post-list-container > *').length") == 7)
    shot("v7-08-bar-restored.png")

    print("SUMMARY:", f"{sum(results)}/{len(results)} passed", flush=True)
    ws.close()
finally:
    if edge: subprocess.run(["taskkill", "//F", "//T", "//PID", str(edge.pid)], capture_output=True)
    subprocess.run(["taskkill", "//F", "//T", "//PID", str(server.pid)], capture_output=True)
    time.sleep(2)
    s = socket.socket()
    try:
        s.connect(("127.0.0.1", 4322)); print("WARN: port 4322 still open")
    except Exception:
        print("port 4322 closed")
    s.close()
