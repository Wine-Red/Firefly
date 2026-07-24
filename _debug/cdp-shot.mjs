// CDP 诊断：带锚点加载首页，报告滚动位置与关键元素几何，并截图
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const url = process.argv[2] || "http://127.0.0.1:4321/#swup-container";
const out = process.argv[3] || "_debug/redesign/v2/cdp-scrolled.png";
const waitMs = Number(process.argv[4] || 6000);

const udd = mkdtempSync(join(tmpdir(), "cdp-"));
const edge = spawn(EDGE, [
	"--headless=new", "--disable-gpu", `--user-data-dir=${udd}`,
	"--remote-debugging-port=9333", "--window-size=1600,900", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
	for (let i = 0; i < 30; i++) {
		try {
			const res = await fetch("http://127.0.0.1:9333/json/list");
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
await send("Page.navigate", { url });
await sleep(waitMs);

const evalJs = async (expr) => {
	const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
	return r.result?.result?.value;
};

const diag = await evalJs(`(() => {
  const de = document.documentElement;
  const cs = getComputedStyle(de);
  const q = (s) => document.querySelector(s);
  const rect = (el) => el ? JSON.parse(JSON.stringify(el.getBoundingClientRect())) : null;
  return {
    scrollY: window.scrollY,
    innerH: window.innerHeight,
    ch2scroll: cs.getPropertyValue('--ch2-scroll'),
    cdScroll: cs.getPropertyValue('--cd-scroll'),
    heroRect: rect(q('.ch2-hero')),
    heroOpacity: q('.ch2-hero') ? getComputedStyle(q('.ch2-hero')).opacity : null,
    visualOpacity: q('.ch2-visual') ? getComputedStyle(q('.ch2-visual')).opacity : null,
    textOpacity: q('.ch2-text') ? getComputedStyle(q('.ch2-text')).opacity : null,
    swupRect: rect(q('#swup-container')),
    listRect: rect(q('#post-list-container')),
    firstCardRect: rect(q('.post-card-wrapper')),
    cardOpacity: q('.post-card-wrapper') ? getComputedStyle(q('.post-card-wrapper')).opacity : null,
    navbarRect: rect(q('#navbar')),
    bodyClass: document.body.className,
  };
})()`);
console.log(JSON.stringify(diag, null, 2));

const shot = await send("Page.captureScreenshot", { format: "png" });
if (shot.result?.data) {
	writeFileSync(out, Buffer.from(shot.result.data, "base64"));
	console.log("saved:", out);
}
ws.close();
edge.kill();
process.exit(0);
