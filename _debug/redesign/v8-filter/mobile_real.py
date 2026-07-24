import json, subprocess, time, urllib.request, base64, socket, sys
from pathlib import Path

ROOT = Path(r"E:\Program\Firefly")
NODE = r"C:\Users\lenovo\AppData\Local\Programs\kimi-desktop\resources\resources\runtime\node"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
OUT = ROOT / "_debug" / "redesign" / "v8-filter"

import websocket
server = subprocess.Popen([NODE, "node_modules/astro/bin/astro.mjs", "preview", "--port", "4322", "--host", "127.0.0.1"],
    cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
edge = None
try:
    for i in range(60):
        try:
            urllib.request.urlopen("http://127.0.0.1:4322/", timeout=2); break
        except Exception: time.sleep(1)
    edge = subprocess.Popen([EDGE, "--headless=new", "--disable-gpu", "--remote-debugging-port=9244",
        "--remote-allow-origins=*", "--window-size=390,844",
        "--user-data-dir=" + str(ROOT / "_debug" / ".edge-profile-v8m"), "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws_url = None
    for i in range(25):
        try:
            tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9244/json", timeout=2).read())
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
        res = r.get("result", {})
        if "exceptionDetails" in r: return "JSERR " + json.dumps(r["exceptionDetails"])[:300]
        return res.get("value")
    def shot(name):
        data = send("Page.captureScreenshot", {"format": "png"})["data"]
        (OUT / name).write_bytes(base64.b64decode(data))

    send("Page.enable"); send("Runtime.enable")
    send("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
    send("Page.navigate", {"url": "http://127.0.0.1:4322/"})
    time.sleep(7)

    AUDIT = """
    (() => {
      const vis = (s) => { if (!s) return null; const r = s.getBoundingClientRect(); const cs = getComputedStyle(s); return r.width > 5 && r.height > 5 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0'; };
      const btnSvg = document.querySelector('#ai-filter-btn svg');
      const wrap = document.getElementById('ai-filter-wrap');
      const rw = wrap?.getBoundingClientRect();
      return {
        btnRobotVisible: vis(btnSvg),
        wrapRect: rw ? [Math.round(rw.width), Math.round(rw.height)] : null,
        wrapClass: wrap?.className.slice(-60),
        btnRect: (b=>b?[Math.round(b.width),Math.round(b.height)]:null)(document.getElementById('ai-filter-btn')?.getBoundingClientRect()),
        cards: document.querySelectorAll('#post-list-container > *').length,
        active: document.getElementById('ai-filter-btn')?.hasAttribute('data-active') ?? null,
      };
    })()
    """
    print("mobile before:", json.dumps(js(AUDIT), ensure_ascii=False), flush=True)
    shot("v8-m0-before.png")

    # 真实点击（移动端：按钮可能需横向滚入视野，但按钮在固定区不在滚动区）
    js("document.getElementById('ai-filter-btn')?.scrollIntoView({block:'center'})")
    time.sleep(2.5)
    pos = js("(()=>{const b=document.getElementById('ai-filter-btn');const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
    print("click pos:", pos, flush=True)
    hit = js(f"(()=>{{const el=document.elementFromPoint({pos['x']},{pos['y']});return el?(document.getElementById('ai-filter-btn').contains(el)):false}})()")
    print("hit:", hit, flush=True)
    send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": pos["x"], "y": pos["y"]})
    send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": pos["x"], "y": pos["y"], "button": "left", "clickCount": 1})
    send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": pos["x"], "y": pos["y"], "button": "left", "clickCount": 1})
    time.sleep(4)
    print("mobile after filter:", json.dumps(js(AUDIT), ensure_ascii=False), flush=True)
    shot("v8-m1-filtered.png")

    # 再点恢复
    js("document.getElementById('ai-filter-btn')?.scrollIntoView({block:'center'})")
    time.sleep(2.5)
    pos = js("(()=>{const b=document.getElementById('ai-filter-btn');const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
    send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": pos["x"], "y": pos["y"]})
    send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": pos["x"], "y": pos["y"], "button": "left", "clickCount": 1})
    send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": pos["x"], "y": pos["y"], "button": "left", "clickCount": 1})
    time.sleep(4)
    print("mobile after restore:", json.dumps(js(AUDIT), ensure_ascii=False), flush=True)
    shot("v8-m2-restored.png")
    ws.close()
finally:
    if edge: subprocess.run(["taskkill", "//F", "//T", "//PID", str(edge.pid)], capture_output=True)
    subprocess.run(["taskkill", "//F", "//T", "//PID", str(server.pid)], capture_output=True)
    time.sleep(2)
