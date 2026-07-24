// 聚焦诊断：违规瞬间的编舞器内部状态
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const base = process.argv[2] || "http://localhost:4321";
const postPath = process.argv[3] || "/posts/2026-06-25-github-ai-trending-repos-2026-06-25/";
const port = 9400 + Math.floor(Math.random() * 200);
const udd = mkdtempSync(join(tmpdir(), "cdp-"));
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--user-data-dir=${udd}`, `--remote-debugging-port=${port}`, "--window-size=1600,900", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 30; i++) {
	try {
		const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
		const p = l.find((t) => t.type === "page");
		if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; }
	} catch {}
	await sleep(300);
}
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
	const m = JSON.parse(ev.data);
	if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
	if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result?.result?.value;
const FULL = `JSON.stringify({
url:location.pathname, y:Math.round(window.scrollY),
hasDebug: !!window.__ch2Debug,
flag: window.__ch2Motion ?? null,
dbg: window.__ch2Debug ? window.__ch2Debug() : null,
moons: document.querySelectorAll('[data-ch3-moon]').length,
moonContainers: [...document.querySelectorAll('[data-ch3-moon]')].map(m=>({connected:m.isConnected, op:getComputedStyle(m).opacity, inline:m.style.cssText.slice(0,80)})),
swupContainers: document.querySelectorAll('#swup-container').length,
pendulumMoon: null
})`;
await new Promise((r) => { ws.onopen = r; });
await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: base + postPath });
await sleep(6000);
console.log("== on post:", await ev(FULL));
await send("Runtime.evaluate", { expression: `document.querySelector('#navbar a[href$="#swup-container"]').click()` });
await sleep(1000);
console.log("== +1s:", await ev(FULL));
await sleep(2500);
console.log("== +3.5s:", await ev(FULL));
await send("Runtime.evaluate", { expression: `window.scrollTo({top:900,behavior:"instant"})` });
await sleep(400);
console.log("== scroll-900 +0.4s:", await ev(FULL));
await sleep(1200);
console.log("== scroll-900 +1.6s:", await ev(FULL));
// 探针：scroll 事件是否到达、rAF 是否活着
const probe = await send("Runtime.evaluate", { expression: `(async()=>{
let scrolled=0; const h=()=>{scrolled++}; document.addEventListener('scroll',h,{once:true});
window.scrollTo({top:920,behavior:'instant'});
await new Promise(r=>setTimeout(r,300));
const f1=window.__ch2Debug?window.__ch2Debug().frames:-1;
await new Promise(r=>setTimeout(r,500));
const f2=window.__ch2Debug?window.__ch2Debug().frames:-1;
document.removeEventListener('scroll',h);
return JSON.stringify({scrollEventFired:scrolled,framesDelta:f2-f1});
})()`, returnByValue: true, awaitPromise: true });
console.log("== probes:", probe.result?.result?.value);
if (errors.length) console.log("EXC:", errors.filter((e) => !e.includes("umami") && !e.includes("Swup") && !e.includes("Pagefind")).slice(0, 6).join(" | "));
ws.close(); edge.kill(); process.exit(0);
