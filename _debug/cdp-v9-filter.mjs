// v9 过滤按钮机器人图标自检：点击过滤前后检查按钮 svg 可见性
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.BASE || "http://localhost:4321/";
const OUTDIR = "_debug/redesign/v9-card";
mkdirSync(OUTDIR, { recursive: true });

const udd = mkdtempSync(join(tmpdir(), "cdp-v9f-"));
const edge = spawn(EDGE, [
  "--headless=new", "--disable-gpu", `--user-data-dir=${udd}`,
  "--remote-debugging-port=9556", "--window-size=1600,900", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9556/json/list");
      const page = (await res.json()).find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(300);
  }
  throw new Error("CDP not ready");
}
const ws = new WebSocket(await getWsUrl());
let id = 0; const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await new Promise((r) => { ws.onopen = r; });
await send("Page.enable"); await send("Runtime.enable");
const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) console.log("EVAL ERR:", JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
};
const shot = async (name) => {
  const s = await send("Page.captureScreenshot", { format: "png" });
  if (s.result?.data) { writeFileSync(`${OUTDIR}/${name}.png`, Buffer.from(s.result.data, "base64")); console.log("saved:", name); }
};

const iconState = `(() => {
  const btn = document.getElementById('ai-filter-btn');
  if (!btn) return { btn: false };
  const svg = btn.querySelector('svg');
  if (!svg) return { btn: true, svg: false };
  const r = svg.getBoundingClientRect();
  const cs = getComputedStyle(svg);
  return { btn: true, svg: true, w: r.width, h: r.height, display: cs.display, visibility: cs.visibility,
    opacity: cs.opacity, hasUse: !!svg.querySelector('use'), hasPath: !!svg.querySelector('path'),
    useHref: svg.querySelector('use')?.getAttribute('href') || null,
    symbolExists: svg.querySelector('use') ? !!document.getElementById((svg.querySelector('use').getAttribute('href')||'').slice(1)) : null };
})()`;

await send("Page.navigate", { url: BASE });
await sleep(6000);
await evalJs(`localStorage.setItem('theme','dark'); document.documentElement.classList.add('dark');`);
await evalJs(`window.scrollTo({top: 700, behavior: 'instant'})`);
await sleep(1500);
console.log("BEFORE click:", JSON.stringify(await evalJs(iconState)));

// 真实点击过滤按钮
const pt = await evalJs(`(() => { const r = document.getElementById('ai-filter-btn').getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()`);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
await sleep(2500);
console.log("AFTER filter ON:", JSON.stringify(await evalJs(iconState)));
await shot("filter-on-dark");

// 再点击取消过滤
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
await sleep(2500);
console.log("AFTER filter OFF:", JSON.stringify(await evalJs(iconState)));
await shot("filter-off-dark");

ws.close(); edge.kill(); process.exit(0);
