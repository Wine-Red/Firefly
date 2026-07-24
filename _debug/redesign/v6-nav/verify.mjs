import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://localhost:4322";
const OUT = "E:\\Program\\Firefly\\_debug\\redesign\\v6-nav";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(EDGE, [
	"--headless=new", "--disable-gpu", "--remote-debugging-port=9333",
	"--window-size=1440,900", "about:blank",
], { stdio: "ignore" });

async function getWsUrl() {
	for (let i = 0; i < 30; i++) {
		try {
			const res = await fetch("http://localhost:9333/json");
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
	await sleep(3000);
}

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const measure = `JSON.stringify({
  path: location.pathname,
  scrollY: Math.round(window.scrollY),
  swupTop: Math.round(document.getElementById('swup-container')?.getBoundingClientRect().top ?? -9999),
  flag: sessionStorage.getItem('firefly:nav-scroll-target'),
  moonOpacity: (function(){const m=document.querySelector('.hero-moon, [class*=moon]');return m?getComputedStyle(m).opacity:'n/a';})()
})`;

const clickHomeTab = `(function(){
  const a = Array.from(document.querySelectorAll('#navbar a[href]')).find(x => {
    try { const u = new URL(x.getAttribute('href'), location.origin); return u.hash === '#swup-container'; } catch { return false; }
  });
  if (a) { a.click(); return true; } return false;
})()`;

// 先拿到一个文章页 URL
await goto(`${BASE}/`);
const postUrl = await evaljs(`(function(){const a=document.querySelector('#swup-container a[href*="/posts/"]');return a?a.href:null;})()`);
console.log("post:", postUrl);

// 场景1：跨页点主页 tab，重复 6 次
let pass = 0;
for (let i = 1; i <= 6; i++) {
	await goto(postUrl);
	const clicked = await evaljs(clickHomeTab);
	await sleep(3500);
	const m = JSON.parse(await evaljs(measure));
	// 落位判定：在首页，且主体锚点距顶 <60px（滚动到位），标记已消费
	const ok = m.path === "/" && Math.abs(m.swupTop) < 60 && m.flag === null;
	if (ok) pass++;
	console.log(`跨页主页 #${i}: clicked=${clicked} ok=${ok}`, JSON.stringify(m));
	if (i === 1) await shot("v6-cross-home-1");
	if (i === 6) await shot("v6-cross-home-6");
}
console.log(`跨页主页通过 ${pass}/6`);

// 场景2：跨页点 logo 回顶部，重复 3 次
for (let i = 1; i <= 3; i++) {
	await goto(postUrl);
	await evaljs(`document.getElementById('nav-logo-link').click()`);
	await sleep(3500);
	const m = JSON.parse(await evaljs(measure));
	console.log(`跨页logo #${i}: ok=${m.path === "/" && m.scrollY === 0 && m.flag === null}`, JSON.stringify(m));
	if (i === 1) await shot("v6-cross-logo");
}

// 场景3：首页内点主页 tab 平滑滚动（先滚回顶部再点）
await goto(`${BASE}/`);
await evaljs(`window.scrollTo(0,0)`);
await sleep(300);
await evaljs(clickHomeTab);
await sleep(300); const mid = JSON.parse(await evaljs(measure));
await sleep(2500); const fin = JSON.parse(await evaljs(measure));
console.log("首页内主页tab 中途:", JSON.stringify(mid), " 落位:", JSON.stringify(fin), "平滑?", mid.scrollY > 0 && mid.scrollY < fin.swupTop + mid.scrollY);
await shot("v6-same-page-home-tab");

// 场景4：落位后月亮淡出检查（首页滚到底部再观察 hero 月亮）
const moon = await evaljs(`(function(){
  const el = document.querySelector('[class*=moon], .nav-moon');
  if (!el) return 'no-moon-el';
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return JSON.stringify({cls: el.className, opacity: cs.opacity, visibility: cs.visibility, rectTop: Math.round(r.top), display: cs.display});
})()`);
console.log("落位后月亮状态:", moon);

ws.close();
edge.kill();
console.log("DONE");
process.exit(0);
