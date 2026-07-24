// CDP v4 截图：两种模式
//   timed 模式: 导航后按时间点截图，验证单摆入场轨迹
//   scroll 模式: 多滚动位置截图，验证月落/联动
// 用法: node _debug/cdp-v4.mjs <url> <outPrefix> <w> <h> timed:<ms1,ms2,...> | scroll:<y1,y2,...>
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const url = process.argv[2];
const prefix = process.argv[3];
const w = Number(process.argv[4] || 1600);
const h = Number(process.argv[5] || 900);
const modeArg = process.argv[6] || "scroll:0";
const [mode, listRaw] = modeArg.split(":");
const list = listRaw.split(",").map(Number);
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
		const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
		const page = l.find((t) => t.type === "page");
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

const DIAG = `(()=>{
const m=document.querySelector('[data-ch3-moon]');
const a=document.querySelector('[data-ch3-moon] .ch3-moon-art');
const t=document.querySelector('.ch3-text');
const c=document.querySelector('#post-list-container .post-card-wrapper');
return JSON.stringify({
y:Math.round(window.scrollY),
moon:m?getComputedStyle(m).opacity:null,
moonT:m?getComputedStyle(m).transform.slice(0,70):null,
artT:a?getComputedStyle(a).transform.slice(0,70):null,
text:t?getComputedStyle(t).opacity:null,
rise:c?getComputedStyle(c).opacity+"/"+getComputedStyle(c).transform.slice(0,60):null});
})()`;

const diag = async () => {
	const d = await send("Runtime.evaluate", { expression: DIAG, returnByValue: true });
	return d.result?.result?.value || "";
};
const shot = async (file) => {
	const s = await send("Page.captureScreenshot", { format: "png" });
	if (s.result?.data) { writeFileSync(file, Buffer.from(s.result.data, "base64")); console.log(file, await diag()); }
};

await new Promise((r) => { ws.onopen = r; });
await send("Runtime.enable");
await send("Page.enable");

if (mode === "timed") {
	// 摆入轨迹：导航后立即开始按偏移时间点截图
	const t0 = Date.now();
	await send("Page.navigate", { url });
	for (const ms of list) {
		const wait = t0 + ms - Date.now();
		if (wait > 0) await sleep(wait);
		await shot(`${prefix}-t${ms}.png`);
	}
} else {
	await send("Page.navigate", { url });
	await sleep(6500); // 等入场播完
	for (const sy of list) {
		await send("Runtime.evaluate", { expression: `window.scrollTo({top:${sy},behavior:"instant"})` });
		await sleep(1000); // 等 lerp 收敛
		await shot(`${prefix}-s${sy}.png`);
	}
}
if (errors.length) console.log("EXCEPTIONS:", errors.filter((e) => !e.includes("umami")).slice(0, 4).join(" | "));
else console.log("no exceptions");
ws.close();
edge.kill();
process.exit(0);
