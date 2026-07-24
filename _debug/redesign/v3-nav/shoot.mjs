// 悬浮气泡导航截图：桌面亮/暗（首屏+滚动）、移动端亮/暗 + 移动菜单
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = "http://localhost:4322/";
const OUT = "_debug/redesign/v3-nav";

const udd = mkdtempSync(join(tmpdir(), "cdp-nav-"));
const edge = spawn(EDGE, [
	"--headless=new", "--disable-gpu", `--user-data-dir=${udd}`,
	"--remote-debugging-port=9334", "--window-size=1600,900", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
	for (let i = 0; i < 40; i++) {
		try {
			const res = await fetch("http://127.0.0.1:9334/json/list");
			const list = await res.json();
			const page = list.find((t) => t.type === "page");
			if (page) return page.webSocketDebuggerUrl;
		} catch {}
		await sleep(300);
	}
	throw new Error("CDP not ready");
}

const ws = new WebSocket(await getWsUrl());
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
	const msg = JSON.parse(ev.data);
	if (msg.id && pending.has(msg.id)) {
		pending.get(msg.id)(msg);
		pending.delete(msg.id);
	}
};
const send = (method, params = {}) =>
	new Promise((resolve) => {
		const mid = ++id;
		pending.set(mid, resolve);
		ws.send(JSON.stringify({ id: mid, method, params }));
	});

await new Promise((r) => { ws.onopen = r; });
await send("Page.enable");
await send("Runtime.enable");

const evalJs = async (expr) => {
	const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
	return r.result?.result?.value;
};

const shot = async (name) => {
	const r = await send("Page.captureScreenshot", { format: "png" });
	if (r.result?.data) {
		writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, "base64"));
		console.log("saved:", name);
	}
};

const setViewport = async (w, h, mobile = false) => {
	await send("Emulation.setDeviceMetricsOverride", {
		width: w, height: h, deviceScaleFactor: 1, mobile,
	});
};

const setTheme = async (mode) => {
	await evalJs(`(() => {
		document.documentElement.classList.toggle('dark', ${mode === "dark"});
	})()`);
	await sleep(600);
};

// 预置暗色 localStorage，避免主题脚本回写
await send("Page.navigate", { url: BASE });
await sleep(5000);

// ---- 桌面 1600x900 ----
await setViewport(1600, 900);
await sleep(800);

// 亮色 首屏
await setTheme("light");
await evalJs("window.scrollTo(0,0)");
await sleep(400);
await shot("desktop-light-top");

// 亮色 滚动后（气泡收缩）
await evalJs("window.scrollTo(0, 600)");
await sleep(900);
await shot("desktop-light-scrolled");

// 暗色 首屏
await setTheme("dark");
await evalJs("window.scrollTo(0,0)");
await sleep(400);
await shot("desktop-dark-top");

// 暗色 滚动后
await evalJs("window.scrollTo(0, 600)");
await sleep(900);
await shot("desktop-dark-scrolled");

// 导航栏特写（暗色，裁剪气泡区域）
await evalJs("window.scrollTo(0,0)");
await sleep(400);
const clipShot = await send("Page.captureScreenshot", {
	format: "png",
	clip: { x: 0, y: 0, width: 1600, height: 160, scale: 2 },
});
if (clipShot.result?.data) {
	writeFileSync(`${OUT}/desktop-dark-nav-closeup.png`, Buffer.from(clipShot.result.data, "base64"));
	console.log("saved: desktop-dark-nav-closeup");
}

// ---- 移动端 390x844 ----
await setViewport(390, 844, true);
await send("Page.navigate", { url: BASE });
await sleep(4000);
await setTheme("dark");
await evalJs("window.scrollTo(0,0)");
await sleep(400);
await shot("mobile-dark-top");

// 移动端菜单面板
await evalJs(`(() => {
	const p = document.getElementById('nav-menu-panel');
	if (p) p.classList.remove('float-panel-closed');
})()`);
await sleep(600);
await shot("mobile-dark-menu-open");
await evalJs(`(() => {
	const p = document.getElementById('nav-menu-panel');
	if (p) p.classList.add('float-panel-closed');
})()`);

// 移动端亮色
await setTheme("light");
await sleep(300);
await shot("mobile-light-top");

// 诊断信息
const diag = await evalJs(`(() => {
	const q = (s) => document.querySelector(s);
	const rect = (el) => el ? JSON.parse(JSON.stringify(el.getBoundingClientRect())) : null;
	const nav = q('#navbar');
	const inner = nav ? nav.firstElementChild : null;
	return {
		navbarRect: rect(nav),
		innerRect: rect(inner),
		innerRadius: inner ? getComputedStyle(inner).borderRadius : null,
		innerBg: inner ? getComputedStyle(inner).backgroundColor : null,
		innerBorder: inner ? getComputedStyle(inner).border : null,
		condensed: nav ? nav.classList.contains('nav-condensed') : null,
		moonExists: !!q('.nav-moon'),
		activeDot: !!q('.nav-active-dot'),
	};
})()`);
console.log(JSON.stringify(diag, null, 2));

ws.close();
edge.kill();
process.exit(0);
