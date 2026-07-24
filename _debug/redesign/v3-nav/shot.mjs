// CDP 截图工具：控制主题（light/dark）、滚动位置、视口，输出 PNG
// 用法: node shot.mjs <url> <out.png> <width> <height> <dark|light> <scrollY> [delayMs]
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import http from "node:http";

const [url, out, w, h, theme, scrollY, delay] = process.argv.slice(2);
const width = parseInt(w), height = parseInt(h);
const port = 9333 + Math.floor(Math.random() * 500);

const edge = spawn(
	"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	[
		"--headless=new", "--disable-gpu", "--remote-debugging-port=" + port,
		`--window-size=${width},${height}`, "--no-first-run", "--user-data-dir=" + process.env.TEMP + "\\edge-cdp-" + port,
		"about:blank",
	],
	{ stdio: "ignore" },
);

const getJson = (path) => new Promise((res, rej) => {
	http.get({ host: "127.0.0.1", port, path }, (r) => {
		let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d)));
	}).on("error", rej);
});

async function waitEndpoint() {
	for (let i = 0; i < 60; i++) {
		try { return await getJson("/json/list"); } catch { await new Promise((r) => setTimeout(r, 500)); }
	}
	throw new Error("CDP endpoint not ready");
}

try {
	const targets = await waitEndpoint();
	const page = targets.find((t) => t.type === "page");
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	let id = 0;
	const pending = new Map();
	ws.onmessage = (e) => {
		const m = JSON.parse(e.data);
		if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
	};
	const send = (method, params = {}) => new Promise((res) => {
		const mid = ++id; pending.set(mid, res);
		ws.send(JSON.stringify({ id: mid, method, params }));
	});
	await new Promise((r) => (ws.onopen = r));

	await send("Page.enable");
	await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 800 });
	await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme === "dark" ? "dark" : "light" }] });
	await send("Page.navigate", { url });
	await new Promise((r) => setTimeout(r, parseInt(delay || "4500")));
	// localStorage 主题键也同步设置，双保险
	await send("Runtime.evaluate", { expression: `localStorage.setItem('theme','${theme === "dark" ? "dark" : "light"}');` });
	const sy = parseInt(scrollY || "0");
	if (sy > 0) {
		await send("Runtime.evaluate", { expression: `window.scrollTo({top:${sy},behavior:'instant'});` });
		await new Promise((r) => setTimeout(r, 1200));
	}
	const clickSel = process.argv[9];
	if (clickSel) {
		await send("Runtime.evaluate", { expression: `document.querySelector('${clickSel}')?.click();` });
		await new Promise((r) => setTimeout(r, 900));
	}
	const shot = await send("Page.captureScreenshot", { format: "png" });
	writeFileSync(out, Buffer.from(shot.result.data, "base64"));
	console.log("saved", out);
	ws.close();
} finally {
	edge.kill("SIGKILL");
}
