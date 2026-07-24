import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://localhost:4322";
const OUT = "E:\\Program\\Firefly\\_debug\\redesign\\v5-nav";
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
	return r.result?.result?.value;
}
async function shot(name) {
	const r = await send("Page.captureScreenshot", { format: "png" });
	writeFileSync(`${OUT}\\${name}.png`, Buffer.from(r.result.data, "base64"));
	console.log("shot:", name);
}
async function goto(url) {
	await send("Page.navigate", { url });
	await sleep(2500);
}

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

// 1. 首页：检查游戏 tab 是否隐藏、点击主页 tab 定位到主体
await goto(`${BASE}/`);
const navLinks = await evaljs(`Array.from(document.querySelectorAll('#navbar a')).map(a => a.textContent.trim() + ' => ' + a.getAttribute('href'))`);
console.log("nav links:", JSON.stringify(navLinks, null, 1));
const hasGame = await evaljs(`document.getElementById('navbar').textContent.includes('游戏')`);
console.log("游戏 tab 存在?", hasGame);

// 点击主页 tab（桌面 DropdownMenu 链接）
await evaljs(`(function(){
  const a = Array.from(document.querySelectorAll('#navbar .dropdown-container > a[href]')).find(x => x.getAttribute('href').includes('#swup-container'));
  if (a) a.click();
  return !!a;
})()`);
await sleep(2500);
const afterHomeClick = await evaljs(`JSON.stringify({scrollY: Math.round(window.scrollY), swupTop: document.getElementById('swup-container')?.getBoundingClientRect().top})`);
console.log("首页点击主页 tab 后:", afterHomeClick);
await shot("01-home-click-home-tab");

// 点击 logo 回顶部
await evaljs(`document.getElementById('nav-logo-link').click()`);
await sleep(2500);
const afterLogo = await evaljs(`Math.round(window.scrollY)`);
console.log("首页点击 logo 后 scrollY:", afterLogo);
await shot("02-home-click-logo");

// 2. 从文章页点击主页 tab
const postUrl = await evaljs(`(function(){const a=document.querySelector('#swup-container a[href*="/posts/"]');return a?a.href:null;})()`);
console.log("post url:", postUrl);
if (postUrl) {
	await goto(postUrl);
	await evaljs(`(function(){
	  const a = Array.from(document.querySelectorAll('#navbar .dropdown-container > a[href]')).find(x => x.getAttribute('href').includes('#swup-container'));
	  if (a) a.click();
	  return !!a;
	})()`);
	await sleep(3000);
	const crossPage = await evaljs(`JSON.stringify({path: location.pathname, scrollY: Math.round(window.scrollY), hash: location.hash})`);
	console.log("文章页点击主页 tab 后:", crossPage);
	await shot("03-post-click-home-tab");

	// 从文章页点击 logo
	await goto(postUrl);
	await evaljs(`document.getElementById('nav-logo-link').click()`);
	await sleep(3000);
	const crossLogo = await evaljs(`JSON.stringify({path: location.pathname, scrollY: Math.round(window.scrollY)})`);
	console.log("文章页点击 logo 后:", crossLogo);
	await shot("04-post-click-logo");
}

// 3. 移动端菜单检查（游戏 tab 隐藏 + 主页项 href）
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await goto(`${BASE}/`);
const mobileLinks = await evaljs(`Array.from(document.querySelectorAll('#nav-menu-panel a')).map(a => a.textContent.trim() + ' => ' + a.getAttribute('href'))`);
console.log("mobile menu links:", JSON.stringify(mobileLinks, null, 1));
await shot("05-mobile-menu-check");

ws.close();
edge.kill();
console.log("DONE");
process.exit(0);
