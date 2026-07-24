// CDP v6 复现：文章页 → 点导航栏"主页" → 落地文章列表位 → 读月亮状态
// 用法: node _debug/cdp-v6.mjs <baseUrl> <postPath>
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const base = process.argv[2] || "http://localhost:4321";
const postPath = process.argv[3] || "/posts/2026-06-25-github-ai-trending-repos-2026-06-25/";
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
const errors = [];
const logs = [];
ws.onmessage = (ev) => {
	const m = JSON.parse(ev.data);
	if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
	if (m.method === "Runtime.exceptionThrown") {
		errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
	}
	if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
		logs.push(m.params.args?.map((a) => a.value ?? a.description).join(" "));
	}
};
const send = (method, params = {}) =>
	new Promise((resolve) => {
		const mid = ++id;
		pending.set(mid, resolve);
		ws.send(JSON.stringify({ id: mid, method, params }));
	});
const ev = async (expression) => {
	const r = await send("Runtime.evaluate", { expression, returnByValue: true });
	if (r.result?.exceptionDetails) return `EVAL-ERR: ${r.result.exceptionDetails.text} ${r.result.exceptionDetails.exception?.description || ""}`;
	return r.result?.result?.value;
};
const state = async (label) => {
	console.log(label, await ev(`JSON.stringify({url:location.pathname,y:Math.round(window.scrollY),dbg:(window.__ch2Debug?window.__ch2Debug():null)})`));
};
const shot = async (file) => {
	const s = await send("Page.captureScreenshot", { format: "png" });
	if (s.result?.data) writeFileSync(file, Buffer.from(s.result.data, "base64"));
};

await new Promise((r) => { ws.onopen = r; });
await send("Runtime.enable");
await send("Page.enable");

// 1. 直接打开文章页
await send("Page.navigate", { url: base + postPath });
await sleep(5000);
await state("on-post:");

// 2. 点击导航栏"主页" tab（href="/#swup-container"）
console.log("home link found:", await ev(`!!document.querySelector('#navbar a[href$="#swup-container"]')`));
const f1 = await ev(`(window.__ch2Debug?window.__ch2Debug().frames:null)`);
await send("Runtime.evaluate", { expression: `document.querySelector('#navbar a[href$="#swup-container"]').click()` });
// 3. 分阶段观察：替换后 / 轮询滚动中 / 稳定后
await sleep(600);
await state("after-click+0.6s:");
await sleep(1400);
await state("after-click+2.0s:");
await sleep(2500);
await state("after-click+4.5s:");
const f2 = await ev(`(window.__ch2Debug?window.__ch2Debug().frames:null)`);
console.log("main-loop frames advanced:", f1, "->", f2);
await shot("_debug/redesign/v6/repro-after-nav.png");

// 4. 回归：回顶再滚到底
await send("Runtime.evaluate", { expression: `window.scrollTo({top:0,behavior:"instant"})` });
await sleep(1500);
await state("back-to-top:");
await send("Runtime.evaluate", { expression: `window.scrollTo({top:900,behavior:"instant"})` });
await sleep(1500);
await state("scroll-900-again:");

if (errors.length) console.log("EXCEPTIONS:", errors.filter((e) => !e.includes("umami") && !e.includes("Swup")).slice(0, 5).join(" | "));
if (logs.length) console.log("CONSOLE-ERR:", logs.slice(0, 5).join(" | "));
ws.close();
edge.kill();
process.exit(0);
