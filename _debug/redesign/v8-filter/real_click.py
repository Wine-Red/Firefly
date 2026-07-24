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
    edge = subprocess.Popen([EDGE, "--headless=new", "--disable-gpu", "--remote-debugging-port=9242",
        "--remote-allow-origins=*", "--window-size=1440,1000",
        "--user-data-dir=" + str(ROOT / "_debug" / ".edge-profile-v8c"), "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws_url = None
    for i in range(25):
        try:
            tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9242/json", timeout=2).read())
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
        if "exceptionDetails" in r: return "JSERR " + json.dumps(r["exceptionDetails"])[:400]
        return res.get("value")
    def shot(name):
        data = send("Page.captureScreenshot", {"format": "png"})["data"]
        (OUT / name).write_bytes(base64.b64decode(data))

    send("Page.enable"); send("Runtime.enable")
    send("Page.navigate", {"url": "http://127.0.0.1:4322/"})
    time.sleep(6)

    def real_click_selector(selector, label):
        # 等滚动稳定 → 命中确认 → 真实点击
        js(f"document.querySelector('{selector}')?.scrollIntoView({{block:'center'}})")
        time.sleep(2.5)  # 等平滑滚动结束
        pos = js(f"(()=>{{const b=document.querySelector('{selector}');if(!b)return null;const r=b.getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}}}})()")
        if not pos:
            print(label, "selector not found"); return False
        hit = js(f"(()=>{{const el=document.elementFromPoint({pos['x']},{pos['y']});if(!el)return null;const b=document.querySelector('{selector}');return b.contains(el) || b === el}})()")
        print(f"{label}: pos={pos} hit_button={hit}", flush=True)
        if hit is not True:
            return False
        send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": pos["x"], "y": pos["y"]})
        send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": pos["x"], "y": pos["y"], "button": "left", "clickCount": 1})
        send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": pos["x"], "y": pos["y"], "button": "left", "clickCount": 1})
        return True

    def robot_audit(tag):
        res = js("""
        (() => {
          const out = {};
          const btnSvg = document.querySelector('#ai-filter-btn svg');
          out.btnSvg = btnSvg ? {rect: (r=>[Math.round(r.width),Math.round(r.height)])(btnSvg.getBoundingClientRect()), opacity: getComputedStyle(btnSvg).opacity, display: getComputedStyle(btnSvg).display} : null;
          out.btnActive = document.getElementById('ai-filter-btn')?.hasAttribute('data-active') ?? null;
          out.cards = document.querySelectorAll('#post-list-container > *').length;
          out.badgeCount = document.querySelectorAll('#post-list-container svg[data-icon*="robot"]').length;
          out.badgeVisible = [...document.querySelectorAll('#post-list-container svg[data-icon*="robot"]')].map(s => (r=>[Math.round(r.width),Math.round(r.height)])(s.getBoundingClientRect()));
          out.filterState = sessionStorage.getItem('aiFilterInPlace');
          return out;
        })()
        """)
        print(f"[{tag}]", json.dumps(res, ensure_ascii=False), flush=True)
        return res

    robot_audit("before")
    ok = real_click_selector("#ai-filter-btn", "filter click")
    time.sleep(4)
    after1 = robot_audit("after-real-click-filter")
    shot("v8-02-after-real-filter.png")
    print("URL:", js("location.pathname"), flush=True)

    # 恢复
    ok2 = real_click_selector("#ai-filter-btn", "unfilter click")
    time.sleep(4)
    robot_audit("after-real-click-restore")
    shot("v8-03-after-real-restore.png")

    ws.close()
finally:
    if edge: subprocess.run(["taskkill", "//F", "//T", "//PID", str(edge.pid)], capture_output=True)
    subprocess.run(["taskkill", "//F", "//T", "//PID", str(server.pid)], capture_output=True)
    time.sleep(2)
