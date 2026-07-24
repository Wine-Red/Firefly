// CDP 多滚动位置截图：验证 v3 滚动编舞
// 用法: node _debug/cdp-v3.mjs <url> <outPrefix> <w> <h> [scrollY1,scrollY2,...]
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const url = process.argv[2];
const prefix = process.argv[3];
const w = Number(process.argv[4] || 1600);
const h = Number(process.argv[5] || 900);
const scrolls = (process.argv[6] || "0").split(",").map(Number);
const port = 9400 + Math.floor(Math.random() * 200);

const udd = mkdtempSync(join(tmpdir(), "cdp-"));
const edge = spawn(EDGE, [
	"--headless=new", "--disable-gpu", `--user-data-dir=${udd}`,
	`--remote-debugging-port=${port}`, `--window-size=${w},${h}`, "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws;
for (let i = 0; i < 30; i++) {
	try {
		const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
		const page = list.find((t) => t.type === "page");
		if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
	} catch {}
	await sleep(300);
}
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
	const m = JSON.parse(ev.data);
	if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
	if (m.method === "Runtime.exceptionThrown") {
		errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
	}
};
const send = (method, params = {}) =>
	new Promise((resolve) => {
		const mid = ++id;
		pending.set(mid, resolve);
		ws.send(JSON.stringify({ id: mid, method, params }));
	});

await new Promise((r) => { ws.onopen = r; });
await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(6500); // 等入场动画播完

for (const sy of scrolls) {
	await send("Runtime.evaluate", { expression: `window.scrollTo({top:${sy},behavior:"instant"})` });
	await sleep(900); // 让编舞 rAF 跑几帧
	const shot = await send("Page.captureScreenshot", { format: "png" });
	const file = `${prefix}-s${sy}.png`;
	if (shot.result?.data) {
		writeFileSync(file, Buffer.from(shot.result.data, "base64"));
		const diag = await send("Runtime.evaluate", {
			expression: `(()=>{const m=document.querySelector('[data-ch3-moon]');const t=document.querySelector('.ch3-text');return JSON.stringify({y:window.scrollY,moon:m?getComputedStyle(m).opacity:null,moonT:m?getComputedStyle(m).transform.slice(0,60):null,text:t?getComputedStyle(t).opacity:null})})()`,
			returnByValue: true,
		});
		console.log(file, diag.result?.result?.value || "");
	}
}
if (errors.length) console.log("EXCEPTIONS:", errors.filter((e) => !e.includes("umami")).slice(0, 4).join(" | "));
ws.close();
edge.kill();
process.exit(0);
