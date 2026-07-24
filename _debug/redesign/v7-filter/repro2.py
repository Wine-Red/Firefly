import json, subprocess, time, urllib.request, base64
from pathlib import Path

ROOT = Path(r"E:\Program\Firefly")
NODE = r"C:\Users\lenovo\AppData\Local\Programs\kimi-desktop\resources\resources\runtime\node"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
OUT = ROOT / "_debug" / "redesign" / "v7-filter"

import websocket
server = subprocess.Popen([NODE, "node_modules/astro/bin/astro.mjs", "preview", "--port", "4322", "--host", "127.0.0.1"],
    cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
edge = None
try:
    for i in range(60):
        try:
            urllib.request.urlopen("http://127.0.0.1:4322/", timeout=2); break
        except Exception: time.sleep(1)
    edge = subprocess.Popen([EDGE, "--headless=new", "--disable-gpu", "--remote-debugging-port=9227",
        "--remote-allow-origins=*", "--window-size=390,844",
        "--user-data-dir=" + str(ROOT / "_debug" / ".edge-profile-v7m"), "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws_url = None
    for i in range(20):
        try:
            tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9227/json", timeout=2).read())
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
        return r.get("result", {}).get("value")
    def shot(name):
        data = send("Page.captureScreenshot", {"format": "png"})["data"]
        (OUT / name).write_bytes(base64.b64decode(data))

    send("Page.enable"); send("Runtime.enable")
    send("Page.navigate", {"url": "http://127.0.0.1:4322/"})
    time.sleep(5)

    diag = """
    (() => {
      const btn = document.getElementById('ai-filter-btn');
      const svg = btn.querySelector('svg');
      const use = svg?.querySelector('use');
      const href = use?.getAttribute('href') || use?.getAttribute('xlink:href');
      const id = href?.replace('#','');
      const matches = id ? [...document.querySelectorAll(`symbol[id="${id}"]`), ...document.querySelectorAll(`[id="${id}"]`)] : [];
      const r = svg?.getBoundingClientRect();
      return {href, dupCount: matches.length, svgBox: r ? [r.width, r.height] : null,
              btnBox: (b=>[b.width,b.height])(btn.getBoundingClientRect()),
              symbolIds: [...document.querySelectorAll('symbol')].map(s=>s.id).slice(0,50)};
    })()
    """
    print("BEFORE:", json.dumps(js(diag), ensure_ascii=False))
    js("document.getElementById('ai-filter-btn').click()")
    time.sleep(3)
    print("AFTER FILTER:", json.dumps(js(diag), ensure_ascii=False))
    print("dup symbol ids:", js("(()=>{const ids=[...document.querySelectorAll('symbol')].map(s=>s.id);const dup=ids.filter((v,i)=>ids.indexOf(v)!==i);return [...new Set(dup)]})()"))
    shot("v7-mobile-filtered.png")
    js("document.getElementById('ai-filter-btn').click()")
    time.sleep(3)
    print("AFTER RESTORE:", json.dumps(js(diag), ensure_ascii=False))
    print("dup symbol ids:", js("(()=>{const ids=[...document.querySelectorAll('symbol')].map(s=>s.id);const dup=ids.filter((v,i)=>ids.indexOf(v)!==i);return [...new Set(dup)]})()"))
    shot("v7-mobile-restored.png")
    ws.close()
finally:
    if edge: subprocess.run(["taskkill", "//F", "//T", "//PID", str(edge.pid)], capture_output=True)
    subprocess.run(["taskkill", "//F", "//T", "//PID", str(server.pid)], capture_output=True)
