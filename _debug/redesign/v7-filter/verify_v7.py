import json, subprocess, time, urllib.request, base64, socket, sys
from pathlib import Path

ROOT = Path(r"E:\Program\Firefly")
NODE = r"C:\Users\lenovo\AppData\Local\Programs\kimi-desktop\resources\resources\runtime\node"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
OUT = ROOT / "_debug" / "redesign" / "v7-filter"
OUT.mkdir(parents=True, exist_ok=True)

import websocket
server = subprocess.Popen([sys.executable, "-m", "http.server", "4322", "--bind", "127.0.0.1"],
    cwd=ROOT / "_debug" / "dist-v7", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
edge = None
results = []
def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS" if cond else "FAIL"), name, detail, flush=True)

try:
    for i in range(120):
        try:
            urllib.request.urlopen("http://127.0.0.1:4322/", timeout=3); break
        except Exception: time.sleep(1)
    print("server ready", flush=True)

    edge = subprocess.Popen([EDGE, "--headless=new", "--disable-gpu", "--remote-debugging-port=9231",
        "--remote-allow-origins=*", "--window-size=1440,1000",
        "--user-data-dir=" + str(ROOT / "_debug" / ".edge-profile-v7s"), "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws_url = None
    for i in range(25):
        try:
            tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9231/json", timeout=2).read())
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

    def wait_expr(expr, timeout=60, label=""):
        """等待表达式为真（容忍并行代理触发的 HMR 整页刷新）"""
        deadline = time.time() + timeout
        while time.time() < deadline:
            v = js(expr)
            if v is True:
                return True
            time.sleep(1)
        print("wait_expr timeout:", label, flush=True)
        return False

    def nav(url, wait=5):
        send("Page.navigate", {"url": url}); time.sleep(wait)

    nav("http://127.0.0.1:4322/", 6)
    wait_expr("document.querySelectorAll('#post-list-container > *').length > 0 && !!document.getElementById('swup-container')", 90, "home loaded")

    # ===== 问题1 =====
    n_all = js("document.querySelectorAll('#post-list-container > *').length")
    btn_html_before = js("document.getElementById('ai-filter-btn').innerHTML")
    js("document.getElementById('ai-filter-btn').click()")
    ok = wait_expr("document.getElementById('post-list-container').dataset.aiFiltered === 'true'", 30, "filtered applied")
    time.sleep(2)
    n_filtered = js("document.querySelectorAll('#post-list-container > *').length")
    btn_html_after = js("document.getElementById('ai-filter-btn').innerHTML")
    svg_ok = js("(()=>{const s=document.querySelector('#ai-filter-btn svg');if(!s)return 'missing';const r=s.getBoundingClientRect();return r.width>10&&r.height>10})()")
    check("过滤后数量减少", isinstance(n_filtered,int) and 0 < n_filtered < n_all, f"all={n_all} filtered={n_filtered}")
    check("过滤后机器人 svg 仍在且可见", svg_ok is True, f"svg_ok={svg_ok}")
    check("按钮 innerHTML 未变", btn_html_before == btn_html_after)
    check("无 404 内容注入", js("document.getElementById('post-list-container').textContent.includes('页面未找到')") is False)
    js("document.getElementById('category-bar').scrollIntoView({block:'start'})")
    time.sleep(1)
    shot("v7-01-filtered-robot-visible.png")
    js("document.getElementById('ai-filter-btn').click()")
    wait_expr("!document.getElementById('post-list-container').dataset.aiFiltered", 15, "unfiltered")
    time.sleep(2)
    check("恢复全部", js("document.querySelectorAll('#post-list-container > *').length") == n_all)
    shot("v7-02-restored.png")

    # ===== 问题2a: 首页房子图标 =====
    js("window.scrollTo(0,0)"); time.sleep(1)
    js("document.querySelector('#category-bar .category-pill[data-category-name=\"\"]').click()")
    time.sleep(3)
    main_top = js("(document.getElementById('swup-container')||document.getElementById('content-wrapper')).getBoundingClientRect().top")
    check("首页房子图标滚到主体", isinstance(main_top,(int,float)) and abs(main_top) < 60, f"main_top={main_top}")
    check("首页房子图标不跳转", js("location.pathname") == "/")
    shot("v7-03-house-scroll-main.png")

    # ===== 问题2b: 首页回到顶部按钮 =====
    js("window.scrollTo(0,0)"); time.sleep(0.5)
    js("window.scrollTo(0, document.body.scrollHeight)"); time.sleep(2)
    btt_visible = js("!document.getElementById('back-to-top-btn').classList.contains('hide')")
    js("backToTop()")
    time.sleep(3)
    main_top2 = js("(document.getElementById('swup-container')||document.getElementById('content-wrapper')).getBoundingClientRect().top")
    scroll_y = js("window.pageYOffset")
    check("回顶按钮可见", btt_visible is True)
    check("首页回顶按钮滚到主体(非页面顶部)", isinstance(main_top2,(int,float)) and abs(main_top2) < 60 and isinstance(scroll_y,(int,float)) and scroll_y > 100, f"main_top={main_top2} scrollY={scroll_y}")
    shot("v7-04-backtotop-main.png")

    # ===== 文章页 =====
    wait_expr("!!document.querySelector('#post-list-container a[href*=\"/posts/\"]')", 30, "post link")
    post_url = js("document.querySelector('#post-list-container a[href*=\"/posts/\"]').href")
    print("post_url:", post_url, flush=True)
    nav(post_url, 7)
    wait_expr("document.readyState !== 'loading' && !!document.getElementById('swup-container')", 60, "post loaded")
    js("window.scrollTo(0, 800)"); time.sleep(1.5)
    js("backToTop()")
    time.sleep(3)
    scroll_top_post = js("window.pageYOffset")
    check("文章页回顶按钮回到顶部", isinstance(scroll_top_post,(int,float)) and scroll_top_post < 5, f"scrollY={scroll_top_post}")
    shot("v7-05-post-backtotop.png")

    # 文章页房子图标 → 回首页落位主体
    js("window.scrollTo(0, 800)"); time.sleep(1)
    js("document.querySelector('#category-bar .category-pill[data-category-name=\"\"]')?.click()")
    wait_expr("location.pathname === '/' && !!document.getElementById('swup-container')", 60, "back home")
    time.sleep(4)
    main_top3 = js("(document.getElementById('swup-container')||document.getElementById('content-wrapper')).getBoundingClientRect().top")
    check("文章页房子图标回首页", js("location.pathname") == "/")
    check("落位文章主体", isinstance(main_top3,(int,float)) and abs(main_top3) < 80, f"main_top={main_top3}")
    shot("v7-06-house-from-post.png")

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
