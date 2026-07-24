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
    edge = subprocess.Popen([EDGE, "--headless=new", "--disable-gpu", "--remote-debugging-port=9241",
        "--remote-allow-origins=*", "--window-size=1440,1000",
        "--user-data-dir=" + str(ROOT / "_debug" / ".edge-profile-v8b"), "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws_url = None
    for i in range(25):
        try:
            tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9241/json", timeout=2).read())
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

    send("Page.enable"); send("Runtime.enable")
    send("Page.navigate", {"url": "http://127.0.0.1:4322/"})
    time.sleep(6)

    # 安装事件记录仪
    js("""
    window.__evtLog = [];
    ['pointerdown','mousedown','mouseup','click'].forEach(t => {
      document.addEventListener(t, (e) => {
        const el = e.target;
        window.__evtLog.push(t + ' @ ' + (el.id ? '#'+el.id : el.tagName + '.' + (typeof el.className==='string'?el.className.slice(0,40):'')) + ' defaultPrevented=' + e.defaultPrevented);
      }, true);
    });
    """)

    pos = js("(()=>{const b=document.getElementById('ai-filter-btn');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2, y:r.y+r.height/2}})()")
    print("btn center:", pos, flush=True)
    hit = js(f"(()=>{{const el=document.elementFromPoint({pos['x']},{pos['y']});return el ? (el.id?'#'+el.id:el.tagName+'.'+(typeof el.className==='string'?el.className.slice(0,60):'')) + ' | outer: ' + el.outerHTML.slice(0,150) : 'null'}})()")
    print("elementFromPoint:", hit, flush=True)
    time.sleep(1)
    send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": pos["x"], "y": pos["y"]})
    send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": pos["x"], "y": pos["y"], "button": "left", "clickCount": 1})
    send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": pos["x"], "y": pos["y"], "button": "left", "clickCount": 1})
    time.sleep(2)
    print("event log:", json.dumps(js("window.__evtLog"), ensure_ascii=False, indent=1), flush=True)
    print("filtered?:", js("sessionStorage.getItem('aiFilterInPlace')"), flush=True)
    ws.close()
finally:
    if edge: subprocess.run(["taskkill", "//F", "//T", "//PID", str(edge.pid)], capture_output=True)
    subprocess.run(["taskkill", "//F", "//T", "//PID", str(server.pid)], capture_output=True)
    time.sleep(2)
