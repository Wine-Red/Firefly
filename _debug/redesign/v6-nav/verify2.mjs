import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://localhost:4322";
const OUT = "E:\\Program\\Firefly\\_debug\\redesign\\v6-nav";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(EDGE, [
	"--headless=new", "--disable-gpu", "--remote-debugging-port=9334",
	"--window-size=1440,900", "about:blank",
], { stdio: "ignore" });

async function getWsUrl() {
	for (let i = 0; i < 30; i++) {
		try {
			const res = await fetch("http://localhost:9334/json");
			const list = await res.json();
			const page = list.find((t) => t.type === "page");
			if (page) return page.webSocketDebuggerUrl;
		} catch {}
		await sleep(500);
	}
	throw new Error("no CDP");
}

const ws = new WebSocket(await getWsUrl());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
	const msg = JSON.parse(e.data);
	if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
function send(method, params = {}) {
	return new Promise((resolve) => {
		const mid = ++id;
		pending.set(mid, resolve);
		ws.send(JSON.stringify({ id: mid, method, params }));
	});
}
async function evaljs(expr) {
	const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
	if (r.result?.exceptionDetails) console.log("JS ERR:", JSON.stringify(r.result.exceptionDetails).slice(0, 300));
	return r.result?.result?.value;
}
async function shot(name) {
	const r = await send("Page.captureScreenshot", { format: "png" });
	writeFileSync(`${OUT}\\${name}.png`, Buffer.from(r.result.data, "base64"));
}
async function goto(url) {
	await send("Page.navigate", { url });
	await sleep(3500);
}

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const POST = `${BASE}/posts/2026-06-25-github-ai-trending-repos-2026-06-25/`;
const measure = `JSON.stringify({path: location.pathname, scrollY: Math.round(window.scrollY), swupTop: Math.round(document.getElementById('swup-container')?.getBoundingClientRect().top ?? -9999), flag: sessionStorage.getItem('firefly:nav-scroll-target')})`;
const clickHomeTab = `(function(){
  const a = Array.from(document.querySelectorAll('#navbar a[href]')).find(x => {
    try { const u = new URL(x.getAttribute('href'), location.origin); return u.hash === '#swup-container'; } catch { return false; }
  });
  if (a) { a.click(); return true; } return false;
})()`;

// 确认文章页可达
await goto(POST);
const onPost = await evaljs(`location.pathname`);
console.log("文章页确认:", onPost);

let pass = 0;
for (let i = 1; i <= 6; i++) {
	await goto(POST);
	const before = await evaljs(`location.pathname`);
	const clicked = await evaljs(clickHomeTab);
	await sleep(4000);
	const m = JSON.parse(await evaljs(measure));
	const ok = before.includes("/posts/") && m.path === "/" && Math.abs(m.swupTop) < 60 && m.flag === null;
	if (ok) pass++;
	console.log(`真·跨页主页 #${i}: from=${before} clicked=${clicked} ok=${ok}`, JSON.stringify(m));
	if (i === 1 || i === 6) await shot(`v6-real-cross-home-${i}`);
}
console.log(`真·跨页主页通过 ${pass}/6`);

// 跨页 logo 重复 3 次
let lpass = 0;
for (let i = 1; i <= 3; i++) {
	await goto(POST);
	await evaljs(`document.getElementById('nav-logo-link').click()`);
	await sleep(4000);
	const m = JSON.parse(await evaljs(measure));
	const ok = m.path === "/" && m.scrollY === 0 && m.flag === null;
	if (ok) lpass++;
	console.log(`真·跨页logo #${i}: ok=${ok}`, JSON.stringify(m));
}
console.log(`真·跨页logo通过 ${lpass}/3`);

ws.close();
edge.kill();
console.log("DONE");
process.exit(0);
