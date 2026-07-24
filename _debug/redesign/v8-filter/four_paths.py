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
fails = []
def expect(name, cond, detail=""):
    print(("PASS" if cond else "FAIL"), name, detail, flush=True)
    if not cond: fails.append(name)

try:
    for i in range(60):
        try:
            urllib.request.urlopen("http://127.0.0.1:4322/", timeout=2); break
        except Exception: time.sleep(1)
    edge = subprocess.Popen([EDGE, "--headless=new", "--disable-gpu", "--remote-debugging-port=9243",
        "--remote-allow-origins=*", "--window-size=1440,1000",
        "--user-data-dir=" + str(ROOT / "_debug" / ".edge-profile-v8d"), "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws_url = None
    for i in range(25):
        try:
            tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9243/json", timeout=2).read())
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

    def real_click(selector, label):
        js(f"document.querySelector('{selector}')?.scrollIntoView({{block:'center'}})")
        time.sleep(2.5)
        pos = js(f"(()=>{{const b=document.querySelector('{selector}');if(!b)return null;const r=b.getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}}}})()")
        if not pos:
            print(label, "NOT FOUND"); return False
        hit = js(f"(()=>{{const el=document.elementFromPoint({pos['x']},{pos['y']});if(!el)return false;const b=document.querySelector('{selector}');return b.contains(el)||b===el}})()")
        if hit is not True:
            print(label, "hit miss", flush=True); return False
        send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": pos["x"], "y": pos["y"]})
        send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": pos["x"], "y": pos["y"], "button": "left", "clickCount": 1})
        send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": pos["x"], "y": pos["y"], "button": "left", "clickCount": 1})
        return True

    AUDIT = """
    (() => {
      const vis = (s) => { if (!s) return null; const r = s.getBoundingClientRect(); const cs = getComputedStyle(s); return r.width > 5 && r.height > 5 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0'; };
      const btnSvg = document.querySelector('#ai-filter-btn svg');
      const btnUse = btnSvg?.querySelector('use')?.getAttribute('href');
      return {
        btnRobotVisible: vis(btnSvg),
        btnUseHref: btnUse || null,
        btnSymbolInDoc: btnUse ? !!document.getElementById(btnUse.slice(1)) : null,
        cards: document.querySelectorAll('#post-list-container > *').length,
        badges: [...document.querySelectorAll('#post-list-container svg[data-icon*="robot"]')].map(vis),
        active: document.getElementById('ai-filter-btn')?.hasAttribute('data-active') ?? null,
        state: sessionStorage.getItem('aiFilterInPlace'),
      };
    })()
    """

    def nav(url, wait=6):
        send("Page.navigate", {"url": url}); time.sleep(wait)

    # ========== 路径 1: 过滤 ==========
    nav("http://127.0.0.1:4322/", 7)
    a0 = js(AUDIT)
    print("P1 before:", json.dumps(a0, ensure_ascii=False), flush=True)
    expect("P1 前置: 按钮机器人可见", a0.get("btnRobotVisible") is True)
    expect("P1 前置: 5 个徽章可见", a0.get("badges") == [True]*5, str(a0.get("badges")))
    real_click("#ai-filter-btn", "P1 filter")
    time.sleep(4)
    a1 = js(AUDIT)
    print("P1 after:", json.dumps(a1, ensure_ascii=False), flush=True)
    expect("P1 过滤后按钮机器人仍可见", a1.get("btnRobotVisible") is True, str(a1))
    expect("P1 过滤后 symbol 在文档中", a1.get("btnSymbolInDoc") is True)
    expect("P1 过滤生效", a1.get("cards") == 2 and a1.get("active") is True)
    shot("v8-p1-filtered.png")

    # ========== 路径 2: 恢复 ==========
    real_click("#ai-filter-btn", "P2 unfilter")
    time.sleep(4)
    a2 = js(AUDIT)
    print("P2 after:", json.dumps(a2, ensure_ascii=False), flush=True)
    expect("P2 恢复后按钮机器人可见", a2.get("btnRobotVisible") is True)
    expect("P2 恢复后 7 卡 + 5 徽章可见", a2.get("cards") == 7 and a2.get("badges") == [True]*5, str(a2.get("badges")))
    shot("v8-p2-restored.png")

    # ========== 路径 3: 刷新后过滤保持 ==========
    real_click("#ai-filter-btn", "P3 filter")
    time.sleep(3)
    nav("http://127.0.0.1:4322/", 8)
    a3 = js(AUDIT)
    print("P3 after reload:", json.dumps(a3, ensure_ascii=False), flush=True)
    expect("P3 刷新后过滤保持", a3.get("cards") == 2 and a3.get("active") is True, str(a3))
    expect("P3 刷新后按钮机器人可见", a3.get("btnRobotVisible") is True)
    shot("v8-p3-reload-filtered.png")

    # ========== 路径 4: Swup 往返后过滤 ==========
    # 从过滤态点进一篇文章（真实点击卡片链接），再真实点击浏览器"返回"等效：用房子图标回首页? 用 history.back 更贴近往返
    href = js("document.querySelector('#post-list-container a[href*=\"/posts/\"]')?.getAttribute('href')")
    print("P4 post href:", href, flush=True)
    # 真实点击卡片标题链接
    js("document.querySelector('#post-list-container a[href*=\"/posts/\"]')?.scrollIntoView({block:'center'})")
    time.sleep(2)
    pos = js("(()=>{const b=document.querySelector('#post-list-container a[href*=\"/posts/\"]');const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
    send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": pos["x"], "y": pos["y"]})
    send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": pos["x"], "y": pos["y"], "button": "left", "clickCount": 1})
    send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": pos["x"], "y": pos["y"], "button": "left", "clickCount": 1})
    time.sleep(6)
    print("P4 at post:", js("location.pathname"), flush=True)
    js("history.back()")
    time.sleep(6)
    print("P4 back at:", js("location.pathname"), flush=True)
    a4 = js(AUDIT)
    print("P4 after swup back:", json.dumps(a4, ensure_ascii=False), flush=True)
    expect("P4 Swup 返回后过滤保持", a4.get("cards") == 2 and a4.get("active") is True, str(a4))
    expect("P4 Swup 返回后按钮机器人可见", a4.get("btnRobotVisible") is True)
    expect("P4 Swup 返回后 symbol 存在", a4.get("btnSymbolInDoc") is True)
    shot("v8-p4-swup-back-filtered.png")
    # 再从该状态真实点击恢复
    real_click("#ai-filter-btn", "P4 unfilter")
    time.sleep(4)
    a5 = js(AUDIT)
    expect("P4 往返后恢复: 7 卡 + 5 徽章可见", a5.get("cards") == 7 and a5.get("badges") == [True]*5, str(a5.get("badges")))
    expect("P4 往返后恢复: 按钮机器人可见", a5.get("btnRobotVisible") is True)
    shot("v8-p5-swup-restored.png")

    print("SUMMARY:", "ALL PASS" if not fails else f"{len(fails)} FAILS: {fails}", flush=True)
    ws.close()
finally:
    if edge: subprocess.run(["taskkill", "//F", "//T", "//PID", str(edge.pid)], capture_output=True)
    subprocess.run(["taskkill", "//F", "//T", "//PID", str(server.pid)], capture_output=True)
    time.sleep(2)
