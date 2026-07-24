// v7 单元级验证：GraphQL 映射 / 解析 / 窗口对齐 / 错误处理 / 无 token 兜底
import assert from "node:assert/strict";
import {
	mapGraphQLLevel,
	parseGraphQLCalendar,
	fetchGraphQLContributions,
	fetchJogruberContributions,
	buildCalendarWindow,
} from "../../../src/utils/github-contributions.ts";

let passed = 0;
function ok(name, fn) {
	fn();
	passed++;
	console.log(`  ✓ ${name}`);
}

console.log("== 1. contributionLevel 映射 ==");
ok("NONE→0", () => assert.equal(mapGraphQLLevel("NONE"), 0));
ok("FIRST_QUARTILE→1", () => assert.equal(mapGraphQLLevel("FIRST_QUARTILE"), 1));
ok("SECOND_QUARTILE→2", () => assert.equal(mapGraphQLLevel("SECOND_QUARTILE"), 2));
ok("THIRD_QUARTILE→3", () => assert.equal(mapGraphQLLevel("THIRD_QUARTILE"), 3));
ok("FOURTH_QUARTILE→4", () => assert.equal(mapGraphQLLevel("FOURTH_QUARTILE"), 4));
ok("未知值→0（兜底）", () => assert.equal(mapGraphQLLevel("FUTURE_LEVEL"), 0));

console.log("== 2. GraphQL 响应解析（模拟含私有贡献的响应） ==");
// 模拟 GraphQL 响应：两周，跨整周对齐边界，含各种 level
const mockResponse = {
	data: {
		user: {
			contributionsCollection: {
				contributionCalendar: {
					totalContributions: 21,
					weeks: [
						{
							contributionDays: [
								{ date: "2026-07-19", contributionCount: 0, contributionLevel: "NONE" },
								{ date: "2026-07-20", contributionCount: 3, contributionLevel: "SECOND_QUARTILE" },
								{ date: "2026-07-21", contributionCount: 8, contributionLevel: "FOURTH_QUARTILE" },
								{ date: "2026-07-22", contributionCount: 1, contributionLevel: "FIRST_QUARTILE" },
								{ date: "2026-07-23", contributionCount: 5, contributionLevel: "THIRD_QUARTILE" },
								{ date: "2026-07-24", contributionCount: 0, contributionLevel: "NONE" },
								{ date: "2026-07-25", contributionCount: 4, contributionLevel: "SECOND_QUARTILE" },
							],
						},
						{
							contributionDays: [
								{ date: "2026-07-26", contributionCount: 0, contributionLevel: "NONE" },
							],
						},
					],
				},
			},
		},
	},
};
const parsed = parseGraphQLCalendar(mockResponse);
ok("摊平为 8 条且按日期升序", () => {
	assert.equal(parsed.length, 8);
	assert.equal(parsed[0].date, "2026-07-19");
	assert.equal(parsed.at(-1).date, "2026-07-26");
});
ok("count/level 正确提取", () => {
	assert.deepEqual(parsed[2], { date: "2026-07-21", count: 8, level: 4 });
	assert.deepEqual(parsed[3], { date: "2026-07-22", count: 1, level: 1 });
});
ok("空/异常响应安全返回空数组", () => {
	assert.deepEqual(parseGraphQLCalendar({}), []);
	assert.deepEqual(parseGraphQLCalendar({ data: { user: null } }), []);
});

console.log("== 3. 100 天 UTC 窗口对齐 ==");
const fixedToday = new Date("2026-07-24T15:30:00+08:00"); // 非 UTC 零点，检验时区稳健性
const window = buildCalendarWindow(parsed, 100, fixedToday);
ok("窗口恰好 100 天", () => assert.equal(window.days.length, 100));
ok("窗口结束于 UTC 今天 2026-07-24", () =>
	assert.equal(window.days.at(-1).date, "2026-07-24"));
ok("窗口开始于 2026-04-16", () =>
	assert.equal(window.days[0].date, "2026-04-16"));
ok("窗口内命中数据、缺失日期补 0", () => {
	const d21 = window.days.find((d) => d.date === "2026-07-21");
	assert.deepEqual(d21, { date: "2026-07-21", count: 8, level: 4 });
	const d10 = window.days.find((d) => d.date === "2026-07-10");
	assert.deepEqual(d10, { date: "2026-07-10", count: 0, level: 0 });
});
ok("窗口外记录（07-25/07-26）被丢弃", () =>
	assert.equal(window.days.some((d) => d.date > "2026-07-24"), false));
ok("activeDays/totalContributions 统计正确", () => {
	// 窗口内：07-20,21,22,23 共 4 个活跃天，总计 3+8+1+5=17
	assert.equal(window.activeDays, 4);
	assert.equal(window.totalContributions, 17);
});
ok("空输入得到全 0 的 100 天窗口", () => {
	const w = buildCalendarWindow([], 100, fixedToday);
	assert.equal(w.days.length, 100);
	assert.equal(w.activeDays, 0);
});

console.log("== 4. GraphQL 请求错误处理（stub fetch） ==");
const unauthorized = await fetchGraphQLContributions(
	"Wine-Red", "bad-token", "2026-04-16T00:00:00Z", "2026-07-24T00:00:00Z",
	async () => new Response("unauthorized", { status: 401 }),
).then(() => "no-throw").catch((e) => e.message);
ok("HTTP 401 抛出异常（组件会捕获并回退）", () =>
	assert.match(unauthorized, /HTTP 401/));
const gqlError = await fetchGraphQLContributions(
	"Wine-Red", "token", "2026-04-16T00:00:00Z", "2026-07-24T00:00:00Z",
	async () => new Response(JSON.stringify({ errors: [{ message: "Bad credentials" }] }), { status: 200 }),
).then(() => "no-throw").catch((e) => e.message);
ok("GraphQL errors 字段抛出异常", () =>
	assert.match(gqlError, /Bad credentials/));
const stubbed = await fetchGraphQLContributions(
	"Wine-Red", "token", "2026-04-16T00:00:00Z", "2026-07-24T00:00:00Z",
	async (url, init) => {
		const body = JSON.parse(init.body);
		assert.equal(body.variables.login, "Wine-Red");
		assert.match(init.headers.authorization, /^bearer /);
		return new Response(JSON.stringify(mockResponse), { status: 200 });
	},
);
ok("正常响应解析为 8 条贡献记录", () => assert.equal(stubbed.length, 8));

console.log("== 5. 无 token 兜底路径（真实 jogruber API） ==");
const fallbackEntries = await fetchJogruberContributions("Wine-Red");
ok("jogruber 返回数据", () => assert.ok(fallbackEntries.length > 300));
const realWindow = buildCalendarWindow(fallbackEntries, 100);
ok("真实数据窗口覆盖到 UTC 今天", () => {
	const todayUTC = new Date().toISOString().slice(0, 10);
	assert.equal(realWindow.days.at(-1).date, todayUTC);
});
console.log(`  （jogruber 公开数据：${realWindow.activeDays}/100 活跃天）`);

console.log(`\n全部通过：${passed} 项断言组`);
