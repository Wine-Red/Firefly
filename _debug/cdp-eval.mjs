// 一次性诊断：检查首页 rise 目标元素的 inline/computed 状态
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const url = process.argv[2];
const scrollY = Number(process.argv[3] || 0);
const port = 9400 + Math.floor(Math.random() * 200);
const udd = mkdtempSync(join(tmpdir(), "cdp-"));
const edge = spawn(EDGE, [
	"--headless=new", "--disable-gpu", `--user-data-dir=${udd}`,
	`--remote-debugging-port=${port}`, "--window-size=1600,900", "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 30; i++) {
	try {
		const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
		const page = l.find((t) => t.type === "page");
		if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
	} catch {}
	await sleep(300);
}
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
	const m = JSON.parse(ev.data);
	if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) =>
	new Promise((resolve) => {
		const mid = ++id;
		pending.set(mid, resolve);
		ws.send(JSON.stringify({ id: mid, method, params }));
	});
await new Promise((r) => { ws.onopen = r; });
await send("Runtime.enable");
await send("Page.navigate", { url });
await sleep(7000);
await send("Runtime.evaluate", { expression: `window.scrollTo({top:${scrollY},behavior:"instant"})` });
await sleep(1200);
const r = await send("Runtime.evaluate", {
	expression: `(()=>{
const els=[...document.querySelectorAll('#post-list-container .post-card-wrapper')];
const e=els[0];
return JSON.stringify({
count:els.length,
inline:e?e.style.cssText:null,
cls:e?e.className:null,
opacity:e?getComputedStyle(e).opacity:null,
transform:e?getComputedStyle(e).transform:null,
animation:e?getComputedStyle(e).animationName:null,
transition:e?getComputedStyle(e).transitionProperty:null,
y:window.scrollY});
})()`,
	returnByValue: true,
});
console.log(JSON.stringify(JSON.parse(r.result?.result?.value || "{}"), null, 1));
ws.close();
edge.kill();
process.exit(0);
