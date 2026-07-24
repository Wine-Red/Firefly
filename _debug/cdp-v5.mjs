// CDP v5 诊断脚本
// 模式:
//   overflow           — 测量 scrollWidth vs innerWidth，列出右缘/左缘超界元素
//   fade:<paths>       — 多路径滚动，读取月亮 opacity/transform
//                        paths 用分号分隔滚动序列，如 "900;0;900" 表示快滚到底→回顶→再到底
//   parallax:<y1,y2..> — 多滚动位置读取 Hero 各层与正文位移
// 用法: node _debug/cdp-v5.mjs <url> <w> <h> <mode>
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const url = process.argv[2];
const w = Number(process.argv[3] || 1600);
const h = Number(process.argv[4] || 900);
const mode = process.argv[5] || "overflow";
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
const evalJson = async (expression) => {
	const r = await send("Runtime.evaluate", { expression, returnByValue: true });
	return r.result?.result?.value;
};

await new Promise((r) => { ws.onopen = r; });
await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(7000); // 等入场播完

if (mode === "overflow") {
	const out = await evalJson(`(()=>{
const vw = window.innerWidth;
const de = document.documentElement;
const bad = [];
for (const el of document.querySelectorAll('body *')) {
	const r = el.getBoundingClientRect();
	if (r.width === 0 && r.height === 0) continue;
	if (r.right > vw + 1 || r.left < -1) {
		const cs = getComputedStyle(el);
		if (cs.position === 'fixed') continue;
		const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().slice(0, 60);
		bad.push({ tag: el.tagName, cls, left: Math.round(r.left), right: Math.round(r.right), vw });
	}
}
return JSON.stringify({ innerWidth: vw, scrollWidth: de.scrollWidth, bodyScrollWidth: document.body.scrollWidth, count: bad.length, bad: bad.slice(0, 15) });
})()`);
	console.log(JSON.stringify(JSON.parse(out || "{}"), null, 1));
} else if (mode.startsWith("fade:")) {
	const seq = mode.slice(5).split(";").map(Number);
	// 路径 A：入场未稳定就立即快滚（单摆互斥路径）
	await send("Runtime.evaluate", { expression: `window.scrollTo({top:900,behavior:"instant"})` });
	await sleep(400);
	console.log("A immediate-900:", await evalJson(`JSON.stringify({y:window.scrollY,op:getComputedStyle(document.querySelector('[data-ch3-moon]')).opacity})`));
	await send("Runtime.evaluate", { expression: `window.scrollTo({top:0,behavior:"instant"})` });
	await sleep(1200);
	// 路径 B：给定序列逐点滚动
	for (const sy of seq) {
		await send("Runtime.evaluate", { expression: `window.scrollTo({top:${sy},behavior:"instant"})` });
		await sleep(1300); // 等 lerp 收敛
		console.log(`B scroll-${sy}:`, await evalJson(`JSON.stringify({y:window.scrollY,op:getComputedStyle(document.querySelector('[data-ch3-moon]')).opacity,moonT:getComputedStyle(document.querySelector('[data-ch3-moon]')).transform.slice(0,60)})`));
	}
	// 路径 C：快速连滚不等待（模拟快速滚轮）
	for (const sy of [200, 500, 900, 300, 950]) {
		await send("Runtime.evaluate", { expression: `window.scrollTo({top:${sy},behavior:"instant"})` });
		await sleep(80);
	}
	await sleep(1500);
	console.log("C fast-fling-end:", await evalJson(`JSON.stringify({y:window.scrollY,op:getComputedStyle(document.querySelector('[data-ch3-moon]')).opacity})`));
	// 路径 D：回顶复位检查
	await send("Runtime.evaluate", { expression: `window.scrollTo({top:0,behavior:"instant"})` });
	await sleep(1500);
	console.log("D back-to-top:", await evalJson(`JSON.stringify({y:window.scrollY,op:getComputedStyle(document.querySelector('[data-ch3-moon]')).opacity,moonT:getComputedStyle(document.querySelector('[data-ch3-moon]')).transform.slice(0,60)})`));
} else if (mode === "swupfade") {
	// Swup 路径：点文章链接离开 → 点导航回首页 → 滚动 → 读月亮 opacity
	const MOON_OP = `JSON.stringify({y:window.scrollY,op:(document.querySelector('[data-ch3-moon]')?getComputedStyle(document.querySelector('[data-ch3-moon]')).opacity:null)})`;
	const link = await evalJson(`(()=>{const a=document.querySelector('#post-list-container a[href^="/posts/"]');return a?a.getAttribute('href'):null})()`);
	console.log("post link:", link);
	await send("Runtime.evaluate", { expression: `document.querySelector('#post-list-container a[href^="/posts/"]').click()` });
	await sleep(3000);
	console.log("on post:", await evalJson(`JSON.stringify({url:location.pathname})`));
	// 回首页（导航栏主页链接）
	await send("Runtime.evaluate", { expression: `[...document.querySelectorAll('a')].find(a=>a.getAttribute('href')==='/'&&a.closest('#navbar'))?.click()` });
	await sleep(3000);
	console.log("back home:", await evalJson(`JSON.stringify({url:location.pathname,hasMoon:!!document.querySelector('[data-ch3-moon]')})`));
	// 等单摆稳定（回首页会重摆）
	await sleep(6000);
	console.log("top settled:", await evalJson(MOON_OP));
	await send("Runtime.evaluate", { expression: `window.scrollTo({top:900,behavior:"instant"})` });
	await sleep(1500);
	console.log("scrolled 900:", await evalJson(MOON_OP));
	await send("Runtime.evaluate", { expression: `window.scrollTo({top:0,behavior:"instant"})` });
	await sleep(1500);
	console.log("back to top:", await evalJson(MOON_OP));
	// 场景2：离开时在滚动位 900，返回后浏览器恢复滚动
	await send("Runtime.evaluate", { expression: `window.scrollTo({top:900,behavior:"instant"})` });
	await sleep(1200);
	await send("Runtime.evaluate", { expression: `document.querySelector('#post-list-container a[href^="/posts/"]').click()` });
	await sleep(2500);
	await send("Runtime.evaluate", { expression: `[...document.querySelectorAll('a')].find(a=>a.getAttribute('href')==='/'&&a.closest('#navbar'))?.click()` });
	await sleep(4000);
	console.log("back home scrolled-restored:", await evalJson(MOON_OP));
	await sleep(3000);
	console.log("after 3s more:", await evalJson(MOON_OP));
} else if (mode.startsWith("parallax:")) {
	const seq = mode.slice(9).split(",").map(Number);
	for (const sy of seq) {
		await send("Runtime.evaluate", { expression: `window.scrollTo({top:${sy},behavior:"instant"})` });
		await sleep(1300);
		console.log(`s${sy}:`, await evalJson(`(()=>{
const q=(s)=>{const e=document.querySelector(s);if(!e)return null;const m=getComputedStyle(e).transform;const r=e.getBoundingClientRect();return {top:Math.round(r.top),t:m.slice(0,50)}};
return JSON.stringify({
moon:q('[data-ch3-moon]'),
beam:q('.ch3-beam'),
text:q('.ch3-text'),
orbits:q('.ch3-orbits'),
card:q('#post-list-container .post-card-wrapper')});
})()`));
	}
}
if (errors.length) console.log("EXCEPTIONS:", errors.filter((e) => !e.includes("umami") && !e.includes("Swup")).slice(0, 3).join(" | "));
ws.close();
edge.kill();
process.exit(0);
