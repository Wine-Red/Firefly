// 一次性 CDP 求值：导航序列中检查 __ch2Motion 守卫与闭包计数
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const base = process.argv[2] || "http://localhost:4321";
const postPath = process.argv[3] || "/posts/2026-06-25-github-ai-trending-repos-2026-06-25/";
const port = 9400 + Math.floor(Math.random() * 200);
const udd = mkdtempSync(join(tmpdir(), "cdp-"));
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--user-data-dir=${udd}`, `--remote-debugging-port=${port}`, "--window-size=1600,900", "about:blank"], { stdio: "ignore" });
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
await new Promise((r) => { ws.onopen = r; });
await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: base + postPath });
await sleep(5000);
console.log("post:", await ev(`JSON.stringify({flag:window.__ch2Motion??null,frames:window.__ch2Debug?window.__ch2Debug().frames:null,scripts:[...document.scripts].filter(s=>s.textContent.includes('__ch2Motion')||((s.src||'').includes('StarField'))).length,sfScripts:[...document.querySelectorAll('canvas.starfield')].length})`));
await send("Runtime.evaluate", { expression: `document.querySelector('#navbar a[href$="#swup-container"]').click()` });
await sleep(2500);
console.log("home+2.5s:", await ev(`JSON.stringify({flag:window.__ch2Motion??null,frames:window.__ch2Debug?window.__ch2Debug().frames:null})`));
await sleep(2000);
console.log("home+4.5s:", await ev(`JSON.stringify({flag:window.__ch2Motion??null,frames:window.__ch2Debug?window.__ch2Debug().frames:null})`));
// 再次往返：回文章页再回主页
await send("Runtime.evaluate", { expression: `document.querySelector('#post-list-container a[href^="/posts/"]').click()` });
await sleep(3000);
console.log("post again:", await ev(`JSON.stringify({flag:window.__ch2Motion??null,frames:window.__ch2Debug?window.__ch2Debug().frames:null})`));
await send("Runtime.evaluate", { expression: `[...document.querySelectorAll('#navbar a[href$="#swup-container"]')][0]?.click()` });
await sleep(4000);
console.log("home again:", await ev(`JSON.stringify({flag:window.__ch2Motion??null,frames:window.__ch2Debug?window.__ch2Debug().frames:null,moon:window.__ch2Debug?window.__ch2Debug().moonComputedOpacity:null,y:Math.round(window.scrollY)})`));
if (errors.length) console.log("EXC:", errors.filter((e) => !e.includes("umami") && !e.includes("Swup")).slice(0, 5).join(" | "));
ws.close(); edge.kill(); process.exit(0);
