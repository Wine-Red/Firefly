import json, subprocess, time, urllib.request, sys, base64
from pathlib import Path

ROOT = Path(r"E:\Program\Firefly")
NODE = r"C:\Users\lenovo\AppData\Local\Programs\kimi-desktop\resources\resources\runtime\node"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
OUT = ROOT / "_debug" / "redesign" / "v6-filter"
OUT.mkdir(parents=True, exist_ok=True)

import websocket

server = subprocess.Popen([NODE, "node_modules/astro/bin/astro.mjs", "preview", "--port", "4322", "--host", "127.0.0.1"],
    cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
edge = None
results = []
def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS" if cond else "FAIL"), name, detail)

try:
    for i in range(60):
        try:
            urllib.request.urlopen("http://127.0.0.1:4322/", timeout=2); break
        except Exception: time.sleep(1)
    else:
        raise RuntimeError("preview server not ready")
    print("server ready")

    edge = subprocess.Popen([EDGE, "--headless=new", "--disable-gpu", "--remote-debugging-port=9224",
        "--remote-allow-origins=*", "--window-size=1440,900",
        "--user-data-dir=" + str(ROOT / "_debug" / ".edge-profile-v6b"), "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    ws_url = None
    for i in range(20):
        try:
            tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9224/json", timeout=2).read())
            page = [t for t in tabs if t.get("type") == "page"]
            if page:
                ws_url = page[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(1)
    if not ws_url: raise RuntimeError("no CDP target")

    ws = websocket.create_connection(ws_url, timeout=20)
    mid = [0]
    def send(method, params=None):
        mid[0] += 1
        ws.send(json.dumps({"id": mid[0], "method": method, "params": params or {}}))
        deadline = time.time() + 20
        while time.time() < deadline:
            msg = json.loads(ws.recv())
            if msg.get("id") == mid[0]:
                return msg.get("result", {})
        raise TimeoutError(method)
    def js(expr):
        r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
        res = r.get("result", {})
        return res.get("value")
    def shot(name):
        data = send("Page.captureScreenshot", {"format": "png"})["data"]
        (OUT / name).write_bytes(base64.b64decode(data))

    send("Page.enable"); send("Runtime.enable")
    send("Page.navigate", {"url": "http://127.0.0.1:4322/"})
    time.sleep(4)

    url0 = js("location.pathname")
    n_all = js("document.querySelectorAll('#post-list-container > *').length")
    print("initial cards:", n_all, "url:", url0)

    # 1. click filter
    js("document.getElementById('ai-filter-btn').click()")
    time.sleep(3)
    check("点击后 URL 不变", js("location.pathname") == url0, f"{url0} -> {js('location.pathname')}")
    n_filtered = js("document.querySelectorAll('#post-list-container > *').length")
    check("过滤后数量减少", isinstance(n_filtered, int) and 0 < n_filtered < n_all, f"all={n_all} filtered={n_filtered}")
    check("按钮激活态", js("document.getElementById('ai-filter-btn').hasAttribute('data-active')") is True)
    shot("01-filtered-light.png")

    # 2. click again -> restore
    js("document.getElementById('ai-filter-btn').click()")
    time.sleep(3)
    check("再点恢复全部", js("document.querySelectorAll('#post-list-container > *').length") == n_all)
    check("恢复后按钮非激活", js("document.getElementById('ai-filter-btn').hasAttribute('data-active')") is False)
    shot("02-restored-light.png")

    # 3. activate then full reload -> persist
    js("document.getElementById('ai-filter-btn').click()")
    time.sleep(3)
    send("Page.navigate", {"url": "http://127.0.0.1:4322/"})
    time.sleep(5)
    n_reload = js("document.querySelectorAll('#post-list-container > *').length")
    active3 = js("document.getElementById('ai-filter-btn').hasAttribute('data-active')")
    check("刷新后保持过滤", n_reload == n_filtered and active3 is True, f"reload={n_reload} expect={n_filtered}")

    # 4. swup: archive -> home, filter persists
    js("document.querySelector('.category-pill[data-category-name=\"__archive__\"]').click()")
    time.sleep(4)
    check("Swup 到归档页", "archive" in (js("location.pathname") or ""), js("location.pathname"))
    js("document.querySelector('.category-pill[data-category-name=\"\"]').click()")
    time.sleep(4)
    n_swup = js("document.querySelectorAll('#post-list-container > *').length")
    active4 = js("document.getElementById('ai-filter-btn') && document.getElementById('ai-filter-btn').hasAttribute('data-active')")
    check("Swup 回首页过滤保持", n_swup == n_filtered and active4 is True, f"n={n_swup} url={js('location.pathname')}")

    # 5. dark mode
    js("localStorage.setItem('theme','dark'); document.documentElement.classList.add('dark');")
    time.sleep(1)
    shot("03-filtered-dark.png")
    js("document.getElementById('ai-filter-btn').click()")
    time.sleep(3)
    check("暗色下恢复全部", js("document.querySelectorAll('#post-list-container > *').length") == n_all)
    shot("04-restored-dark.png")

    print("SUMMARY:", f"{sum(results)}/{len(results)} passed")
    ws.close()
finally:
    if edge: subprocess.run(["taskkill", "//F", "//T", "//PID", str(edge.pid)], capture_output=True)
    subprocess.run(["taskkill", "//F", "//T", "//PID", str(server.pid)], capture_output=True)
    time.sleep(2)
    import socket
    s = socket.socket()
    try:
        s.connect(("127.0.0.1", 4322)); print("WARN: port 4322 still open")
    except Exception:
        print("port 4322 closed")
    s.close()
