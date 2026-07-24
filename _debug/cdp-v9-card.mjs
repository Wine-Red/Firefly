// v4 卡片自检截图：深/浅色 × 普通/hover × 设置面板
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = "http://localhost:4321/";
const OUTDIR = "_debug/redesign/v9-card";
mkdirSync(OUTDIR, { recursive: true });

const udd = mkdtempSync(join(tmpdir(), "cdp-v7-"));
const edge = spawn(EDGE, [
	"--headless=new", "--disable-gpu", `--user-data-dir=${udd}`,
	"--remote-debugging-port=9555", "--window-size=1600,900", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
	for (let i = 0; i < 30; i++) {
		try {
			const res = await fetch("http://127.0.0.1:9555/json/list");
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
	if (r.result?.exceptionDetails) console.log("EVAL ERR:", JSON.stringify(r.result.exceptionDetails).slice(0, 300));
	return r.result?.result?.value;
};

const shot = async (name) => {
	const s = await send("Page.captureScreenshot", { format: "png" });
	if (s.result?.data) {
		writeFileSync(`${OUTDIR}/${name}.png`, Buffer.from(s.result.data, "base64"));
		console.log("saved:", `${OUTDIR}/${name}.png`);
	}
};

for (const theme of ["dark", "light"]) {
	await send("Page.navigate", { url: BASE });
	await sleep(5000);
	// 强制主题
	await evalJs(`(() => {
		localStorage.setItem('theme', '${theme}');
		document.documentElement.classList.toggle('dark', '${theme}' === 'dark');
		return document.documentElement.className;
	})()`);
	await sleep(800);
	// 滚到文章列表
	await evalJs(`window.scrollTo({top: 700, behavior: 'instant'})`);
	await sleep(3000);
	await shot(`home-${theme}-s700`);

	// hover 第一张卡片
	const rect = await evalJs(`(() => {
		const el = document.querySelector('#post-list-container .post-card-wrapper');
		if (!el) return null;
		const r = el.getBoundingClientRect();
		return { x: r.x + r.width * 0.4, y: r.y + r.height * 0.5 };
	})()`);
	if (rect) {
		await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: rect.y });
		await sleep(900);
		// 校验：hover 时标题行数与卡片高度是否变化
		const stable = await evalJs(`(() => {
			const el = document.querySelector('#post-list-container .post-card-wrapper');
			const t = el.querySelector('.post-card-title');
			const img = el.querySelector('.post-card-image');
			const content = el.querySelector('.post-card-content');
			const cardW = el.getBoundingClientRect().width;
			const imgR = img.getBoundingClientRect();
			// 用 clip-path 上/下端点估算可视宽度占比
			const clip = getComputedStyle(img).clipPath;
			return {
				cardH: el.getBoundingClientRect().height,
				titleH: t.getBoundingClientRect().height,
				clip,
				imgWidthPct: ((imgR.width / cardW) * 100).toFixed(1),
				imgLeftPct: (((imgR.left - el.getBoundingClientRect().left) / cardW) * 100).toFixed(1),
				contentOpacity: getComputedStyle(content).opacity,
			};
		})()`);
		console.log(theme, "hover state:", JSON.stringify(stable));
		await shot(`home-${theme}-s700-hover`);
		await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 10, y: 10 });
		await sleep(600);
		const rest = await evalJs(`(() => {
			const el = document.querySelector('#post-list-container .post-card-wrapper');
			return { cardH: el.getBoundingClientRect().height };
		})()`);
		console.log(theme, "rest state:", JSON.stringify(rest));
	}
}

// 设置面板（深色）：打开显示设置
await send("Page.navigate", { url: BASE });
await sleep(5000);
await evalJs(`(() => {
	localStorage.setItem('theme', 'dark');
	document.documentElement.classList.add('dark');
	const panel = document.getElementById('display-setting');
	if (panel) panel.classList.remove('float-panel-closed');
	return !!panel;
})()`);
await sleep(1000);
const panelInfo = await evalJs(`(() => {
	const panel = document.getElementById('display-setting');
	return {
		hasHue: !!document.getElementById('colorSlider'),
		hasThemeColorText: panel ? panel.textContent.includes('主题色') || panel.textContent.includes('Theme') : null,
		sections: panel ? Array.from(panel.querySelectorAll('.font-bold.text-lg')).map(e => e.textContent.trim()) : [],
	};
})()`);
console.log("panel:", JSON.stringify(panelInfo));
await shot("settings-panel-dark");

ws.close();
edge.kill();
process.exit(0);
