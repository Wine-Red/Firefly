// 验证修复后的数据获取逻辑：最近 100 天窗口 + 最近 7 天贡献
const username = "Wine-Red";
const HEATMAP_DAYS = 100;

const res = await fetch(
	`https://github-contributions-api.jogruber.de/v4/${username}?y=last&_=${Date.now()}`,
	{ headers: { "user-agent": "Mozilla/5.0" } },
);
if (!res.ok) {
	console.error("API 请求失败:", res.status);
	process.exit(1);
}
const data = await res.json();
const daysData = data.contributions || [];
const countMap = new Map(daysData.map((d) => [d.date, d]));

const MS_DAY = 86400000;
const pad = (n) => String(n).padStart(2, "0");
const fmt = (d) =>
	`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const now = new Date();
const end = new Date(
	Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
);
const start = new Date(end.getTime() - (HEATMAP_DAYS - 1) * MS_DAY);

let active = 0;
for (let t = start.getTime(); t <= end.getTime(); t += MS_DAY) {
	const f = countMap.get(fmt(new Date(t)));
	if (f && f.count > 0) active++;
}

console.log("窗口:", fmt(start), "→", fmt(end), `(UTC 今天: ${fmt(end)})`);
console.log(`活跃天数: ${active}/${HEATMAP_DAYS}`);
console.log("最近 7 天贡献:");
for (let i = 6; i >= 0; i--) {
	const d = new Date(end.getTime() - i * MS_DAY);
	const f = countMap.get(fmt(d));
	console.log(
		`  ${fmt(d)}  count=${f ? f.count : "缺失(显示为0)"}  level=${f ? f.level : 0}`,
	);
}
