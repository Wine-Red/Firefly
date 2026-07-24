import json, subprocess, time, urllib.request, base64, socket, sys
from pathlib import Path

ROOT = Path(r"E:\Program\Firefly")
NODE = r"C:\Users\lenovo\AppData\Local\Programs\kimi-desktop\resources\resources\runtime\node"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
OUT = ROOT / "_debug" / "redesign" / "v8-filter"
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
    print("preview ready", flush=True)

    edge = subprocess.Popen([EDGE, "--headless=new", "--disable-gpu", "--remote-debugging-port=9240",
        "--remote-allow-origins=*", "--window-size=1440,1000",
        "--user-data-dir=" + str(ROOT / "_debug" / ".edge-profile-v8"), "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws_url = None
    for i in range(25):
        try:
            tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9240/json", timeout=2).read())
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
        if "exceptionDetails" in r: return "JSERR " + json.dumps(r["exceptionDetails"])[:400]
        return res.get("value")
    def shot(name):
        data = send("Page.captureScreenshot", {"format": "png"})["data"]
        (OUT / name).write_bytes(base64.b64decode(data))

    send("Page.enable"); send("Runtime.enable")
    send("Page.navigate", {"url": "http://127.0.0.1:4322/"})
    time.sleep(6)

    # ============ 全量枚举页面上所有机器人相关图标 ============
    audit = r"""
    (() => {
      const robots = [];
      // 1) 所有引用 robot symbol 的 svg（按钮 + 文章卡徽章 + 任何其他位置）
      document.querySelectorAll('svg[data-icon*="robot"], svg use[href*="robot"]').forEach((el) => {
        const svg = el.tagName === 'use' ? el.closest('svg') : el;
        if (!svg || robots.some(r => r.svg === svg)) return;
        robots.push({ svg });
      });
      // 2) 侧边栏 "AI 运营中" widget 里的图标
      document.querySelectorAll('aside svg, [class*="sidebar"] svg, [class*="widget"] svg').forEach((svg) => {
        const txt = (svg.closest('div')?.textContent || '').slice(0, 60);
        if (txt.includes('AI') && !robots.some(r => r.svg === svg)) robots.push({ svg, widgetHint: txt });
      });
      return robots.map(({ svg, widgetHint }, i) => {
        const use = svg.querySelector('use');
        const href = use?.getAttribute('href') || '';
        const id = href.replace('#', '');
        const r = svg.getBoundingClientRect();
        const cs = getComputedStyle(svg);
        const path = [];
        let n = svg;
        while (n && n !== document.body) {
          path.unshift(n.id ? `#${n.id}` : n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.split(' ')[0] : ''));
          n = n.parentElement;
        }
        return {
          i,
          dataIcon: svg.getAttribute('data-icon'),
          useHref: href,
          symbolExists: id ? !!document.getElementById(id) : null,
          symbolIsDescendantOfSelf: id ? !!svg.querySelector(`symbol[id="${id}"]`) : null,
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
          fill: cs.fill, color: cs.color,
          widgetHint: widgetHint || null,
          domPath: path.join(' > ').slice(-180),
          outerHead: svg.outerHTML.slice(0, 200),
        };
      });
    })()
    """
    before = js(audit)
    print("=== 点击前机器人图标清单 ===", flush=True)
    print(json.dumps(before, ensure_ascii=False, indent=1), flush=True)
    shot("v8-00-before.png")

    # ============ 真实鼠标点击过滤按钮 ============
    pos = js("(()=>{const b=document.getElementById('ai-filter-btn');const r=b.getBoundingClientRect();b.scrollIntoView({block:'center'});const r2=b.getBoundingClientRect();return {x:r2.x+r2.width/2, y:r2.y+r2.height/2}})()")
    print("click at:", pos, flush=True)
    time.sleep(1)
    send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": pos["x"], "y": pos["y"]})
    send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": pos["x"], "y": pos["y"], "button": "left", "clickCount": 1})
    send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": pos["x"], "y": pos["y"], "button": "left", "clickCount": 1})
    time.sleep(4)

    print("URL after real click:", js("location.pathname"), flush=True)
    print("cards after:", js("document.querySelectorAll('#post-list-container > *').length"), flush=True)
    print("sessionStorage:", js("sessionStorage.getItem('aiFilterInPlace')"), flush=True)
    print("btn data-active:", js("document.getElementById('ai-filter-btn')?.hasAttribute('data-active')"), flush=True)
    print("btn exists:", js("!!document.getElementById('ai-filter-btn')"), flush=True)

    after = js(audit)
    print("=== 点击后机器人图标清单 ===", flush=True)
    print(json.dumps(after, ensure_ascii=False, indent=1), flush=True)
    shot("v8-01-after-real-click.png")

    # 按钮自身详细状态
    print("=== 按钮自身详查 ===", flush=True)
    print(js("""
    (() => {
      const btn = document.getElementById('ai-filter-btn');
      if (!btn) return 'BUTTON GONE';
      const wrap = document.getElementById('ai-filter-wrap');
      const svg = btn.querySelector('svg');
      const rb = btn.getBoundingClientRect();
      const rw = wrap?.getBoundingClientRect();
      return JSON.stringify({
        btnOuter: btn.outerHTML.slice(0, 400),
        btnRect: [rb.x, rb.y, rb.width, rb.height],
        wrapRect: rw ? [rw.x, rw.y, rw.width, rw.height] : null,
        wrapClass: wrap?.className,
        wrapStyle: wrap?.getAttribute('style'),
        svgPresent: !!svg,
        svgRect: svg ? (r=>[r.width,r.height])(svg.getBoundingClientRect()) : null,
      }, null, 1);
    })()
    """), flush=True)

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
