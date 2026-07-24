# Minimal CDP screenshot driver using stdlib WebSocket client.
import base64, json, socket, struct, sys, time, urllib.request, os

DEBUG_PORT = 9223
PAGE_URL = "http://127.0.0.1:4324/"
OUT_DIR = r"E:\Program\Firefly\_debug\redesign\v7-nasa"


def http_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{DEBUG_PORT}{path}", timeout=10) as r:
        return json.loads(r.read())


class WS:
    def __init__(self, url):
        # ws://host:port/path
        rest = url.split("://", 1)[1]
        hostport, _, path = rest.partition("/")
        host, _, port = hostport.partition(":")
        self.sock = socket.create_connection((host, int(port)), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (f"GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\n"
               f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
        self.sock.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.sock.recv(4096)
        assert b"101" in buf.split(b"\r\n", 1)[0], buf[:200]
        self.buf = buf.split(b"\r\n\r\n", 1)[1]

    def send(self, payload: str):
        data = payload.encode()
        header = bytearray([0x81])
        n = len(data)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", n)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", n)
        mask = os.urandom(4)
        header += mask
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        self.sock.sendall(bytes(header) + masked)

    def _read_exact(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("ws closed")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def recv(self):
        # returns full text message (handles continuation minimally)
        payload = b""
        while True:
            b1, b2 = self._read_exact(2)
            fin = b1 & 0x80
            opcode = b1 & 0x0F
            n = b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read_exact(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read_exact(8))[0]
            if b2 & 0x80:
                mask = self._read_exact(4)
                data = bytes(x ^ mask[i % 4] for i, x in enumerate(self._read_exact(n)))
            else:
                data = self._read_exact(n)
            payload += data
            if fin:
                return payload.decode("utf-8", "replace")


class CDP:
    def __init__(self, ws_url):
        self.ws = WS(ws_url)
        self.next_id = 1

    def call(self, method, params=None, timeout=60):
        mid = self.next_id
        self.next_id += 1
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})
        raise TimeoutError(method)


def wait_for_debugger():
    for _ in range(60):
        try:
            return http_json("/json/list")
        except Exception:
            time.sleep(1)
    raise RuntimeError("debugger not up")


def shoot(cdp, scheme, outfile, clip=None):
    cdp.call("Emulation.setEmulatedMedia", {
        "features": [{"name": "prefers-color-scheme", "value": scheme}]})
    cdp.call("Page.navigate", {"url": PAGE_URL})
    time.sleep(12)  # let SSR + NASA fetch + fade-in settle
    # scroll card into view and get its rect
    res = cdp.call("Runtime.evaluate", {"expression": """
        (() => {
            const el = document.querySelector('#time-greeting');
            if (!el) return null;
            el.scrollIntoView({block:'start'});
            const r = el.getBoundingClientRect();
            return {x:r.x, y:r.y, w:r.width, h:r.height, dpr:window.devicePixelRatio};
        })()
    """, "returnByValue": True})
    rect = res.get("result", {}).get("value")
    print(scheme, "rect:", rect)
    time.sleep(2)
    params = {"format": "png"}
    if rect:
        pad = 14
        params["clip"] = {
            "x": max(rect["x"] - pad, 0),
            "y": max(rect["y"] - pad, 0),
            "width": rect["w"] + pad * 2,
            "height": rect["h"] + pad * 2,
            "scale": 2,
        }
    shot = cdp.call("Page.captureScreenshot", params, timeout=60)
    with open(os.path.join(OUT_DIR, outfile), "wb") as f:
        f.write(base64.b64decode(shot["data"]))
    print("saved", outfile)


def main():
    targets = wait_for_debugger()
    page = next(t for t in targets if t["type"] == "page")
    cdp = CDP(page["webSocketDebuggerUrl"])
    cdp.call("Page.enable")
    cdp.call("Emulation.setDeviceMetricsOverride",
             {"width": 1440, "height": 1200, "deviceScaleFactor": 1, "mobile": False})
    shoot(cdp, "light", "card-light.png")
    shoot(cdp, "dark", "card-dark.png")


if __name__ == "__main__":
    main()
