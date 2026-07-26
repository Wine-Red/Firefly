<script lang="ts">
import { onMount } from "svelte";

interface Props {
	shareUrl: string;
	refreshInterval?: number;
}

interface ShareData {
	token: string;
	websiteId: string;
}

interface StatsData {
	visitors: number;
}

interface DateRangeData {
	startDate: string;
}

const { shareUrl, refreshInterval = 60000 }: Props = $props();

let todayVisitors = $state<number | null>(null);
let totalVisitors = $state<number | null>(null);
let failed = $state(false);

const formatter = new Intl.NumberFormat("zh-CN");

function shanghaiDayStart(): number {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(new Date());
	const value = Object.fromEntries(
		parts.map((part) => [part.type, part.value]),
	);
	return Date.parse(`${value.year}-${value.month}-${value.day}T00:00:00+08:00`);
}

async function loadStats() {
	try {
		const share = new URL(shareUrl);
		const slug = share.pathname.split("/").filter(Boolean).pop();
		if (!slug) throw new Error("Invalid Umami share URL");

		const shareResponse = await fetch(
			`${share.origin}/api/share/${encodeURIComponent(slug)}`,
		);
		if (!shareResponse.ok)
			throw new Error(`Share HTTP ${shareResponse.status}`);
		const shareData = (await shareResponse.json()) as ShareData;
		const headers = {
			"x-umami-share-token": shareData.token,
			"x-umami-share-context": "1",
		};
		const rangeResponse = await fetch(
			`${share.origin}/api/websites/${shareData.websiteId}/daterange`,
			{ headers },
		);
		if (!rangeResponse.ok)
			throw new Error(`Date range HTTP ${rangeResponse.status}`);
		const range = (await rangeResponse.json()) as DateRangeData;
		const totalStart = Date.parse(range.startDate);
		if (!Number.isFinite(totalStart))
			throw new Error("Invalid Umami date range");
		const endAt = Date.now();
		const statsUrl = (startAt: number) => {
			const url = new URL(
				`${share.origin}/api/websites/${shareData.websiteId}/stats`,
			);
			url.searchParams.set("startAt", String(startAt));
			url.searchParams.set("endAt", String(endAt));
			return url;
		};

		const [todayResponse, totalResponse] = await Promise.all([
			fetch(statsUrl(shanghaiDayStart()), { headers }),
			fetch(statsUrl(totalStart), { headers }),
		]);
		if (!todayResponse.ok || !totalResponse.ok) {
			throw new Error("Umami stats request failed");
		}
		const [today, total] = (await Promise.all([
			todayResponse.json(),
			totalResponse.json(),
		])) as [StatsData, StatsData];
		todayVisitors = today.visitors;
		totalVisitors = total.visitors;
		failed = false;
	} catch (error) {
		console.warn("Failed to load Umami visitor stats", error);
		failed = true;
	}
}

onMount(() => {
	void loadStats();
	const timer = window.setInterval(
		() => {
			if (!document.hidden) void loadStats();
		},
		Math.max(30000, refreshInterval),
	);
	const refreshOnVisible = () => {
		if (!document.hidden) void loadStats();
	};
	document.addEventListener("visibilitychange", refreshOnVisible);
	return () => {
		window.clearInterval(timer);
		document.removeEventListener("visibilitychange", refreshOnVisible);
	};
});
</script>

<div class="footer-visitor-stats" aria-live="polite">
	<span>本站今日访客 <strong>{todayVisitors === null ? "--" : formatter.format(todayVisitors)}</strong></span>
	<i aria-hidden="true"></i>
	<span>本站累计访客 <strong>{totalVisitors === null ? "--" : formatter.format(totalVisitors)}</strong></span>
	{#if failed && todayVisitors === null}
		<span class="sr-only">访客统计暂时无法加载</span>
	{/if}
</div>

<style>
	.footer-visitor-stats {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.55rem;
		margin-bottom: 0.2rem;
		color: color-mix(in srgb, currentColor 72%, transparent);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
	}

	.footer-visitor-stats strong {
		color: var(--gold);
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}

	.footer-visitor-stats i {
		width: 0.25rem;
		height: 0.25rem;
		background: var(--vermilion);
	}
</style>
