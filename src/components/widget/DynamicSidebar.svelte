<script lang="ts">
/**
 * 侧边栏动态组件 - 从 API 获取数据
 * 支持自定义 API 地址，方便接入第三方后端
 */
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { onMount } from "svelte";
import { formatDynamicDate } from "@/utils/date-utils";
import { fetchWithDedup } from "@/utils/fetch-dedup";
import { fetchMemos } from "@/utils/memos-adapter";
import { url } from "@/utils/url-utils";

interface DynamicEntry {
	id: string;
	published: number;
	html: string;
	images?: Array<{ alt: string; src: string; title?: string }>;
	searchText?: string;
	pinned?: boolean;
}

interface MemosConfig {
	enable: boolean;
	apiUrl: string;
	parent?: string;
}

interface Props {
	apiUrl: string;
	limit: number;
	memos?: MemosConfig;
}

let { apiUrl, limit, memos }: Props = $props();

let entries: DynamicEntry[] = $state([]);
let totalCount = $state(0);
let loading = $state(true);
let error = $state(false);

onMount(async () => {
	try {
		let data: DynamicEntry[];
		if (memos?.enable) {
			data = await fetchMemos(memos.apiUrl, { parent: memos.parent });
		} else {
			data = await fetchWithDedup(apiUrl);
		}

		totalCount = data.length;
		entries = data.slice(0, limit);
		updateCountBadge();
	} catch {
		error = true;
	} finally {
		loading = false;
	}
});

function updateCountBadge() {
	const badge = document.querySelector("[data-dynamic-count]");
	if (badge && totalCount > 0) {
		badge.textContent = `(${totalCount})`;
	}
}

// 从 HTML 中提取纯文本摘要
function getPlainText(html: string): string {
	const div = document.createElement("div");
	div.innerHTML = html;
	return div.textContent?.trim() || "";
}

// 格式化日期
// 本地 API 使用 formatDynamicDate（带时区转换）
// 第三方 API 和 Memos 使用浏览器本地时区，不做额外转换
function formatDate(timestamp: number): string {
	if (apiUrl.startsWith("http") || memos?.enable) {
		return new Date(timestamp).toLocaleDateString("zh-CN", {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		});
	}
	return formatDynamicDate(new Date(timestamp));
}
</script>

<div class="dynamic-sidebar-list">
	{#if loading}
		<div class="dynamic-sidebar-state">
			<svg class="size-5 animate-spin text-(--primary)" viewBox="0 0 24 24" fill="none">
				<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25"/>
				<path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
			</svg>
		</div>
	{:else if error || entries.length === 0}
		<p class="dynamic-sidebar-state">
			{i18n(I18nKey.dynamicEmpty)}
		</p>
	{:else}
		{#each entries as entry (entry.id)}
			{@const text = getPlainText(entry.html)}
			{@const image = entry.images?.[0]}
			<a
				href={url(`/dynamic/#dynamic-${entry.id}`)}
				class="dynamic-sidebar-item"
				aria-label={`${i18n(I18nKey.dynamic)}: ${text}`}
			>
				<div class="dynamic-sidebar-copy">
					<div class="dynamic-sidebar-time">
						<svg class="size-4 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
							<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
						</svg>
						<time datetime={new Date(entry.published).toISOString()}>
							{formatDate(entry.published)}
						</time>
						{#if entry.pinned}
							<span class="ml-auto inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded bg-(--primary)/10 text-(--primary) font-medium">
								<svg class="size-3" fill="currentColor" viewBox="0 0 24 24"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2z"/></svg>
								{i18n(I18nKey.pinned)}
							</span>
						{/if}
					</div>
					<p class="dynamic-sidebar-excerpt">
						{text}
					</p>
				</div>
				{#if image}
					<img
						src={image.src}
						alt={image.alt}
						class="dynamic-sidebar-image"
						loading="lazy"
						decoding="async"
					/>
				{/if}
			</a>
		{/each}
	{/if}
</div>

<style>
	.dynamic-sidebar-list {
		display: flex;
		flex-direction: column;
		counter-reset: sidebar-dynamic;
	}

	.dynamic-sidebar-state {
		display: flex;
		min-height: 4rem;
		align-items: center;
		justify-content: center;
		margin: 0;
		color: var(--content-meta);
		font-size: 0.8rem;
	}

	.dynamic-sidebar-item {
		position: relative;
		display: flex;
		min-width: 0;
		min-height: 4.5rem;
		align-items: center;
		gap: 0.75rem;
		border-bottom: 1px solid var(--line-divider);
		padding: 0.7rem 0.2rem 0.7rem 1.55rem;
		color: var(--content-meta);
		transition: color 180ms ease, border-color 180ms ease;
		counter-increment: sidebar-dynamic;
	}

	.dynamic-sidebar-item::before {
		content: counter(sidebar-dynamic, decimal-leading-zero);
		position: absolute;
		top: 0.78rem;
		left: 0;
		color: var(--gold);
		font-size: 0.58rem;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.05em;
	}

	.dynamic-sidebar-item::after {
		content: "";
		position: absolute;
		bottom: -1px;
		left: 0;
		width: 2.75rem;
		height: 1px;
		background: var(--vermilion);
		transform: scaleX(0);
		transform-origin: left;
		transition: transform 180ms ease;
	}

	.dynamic-sidebar-item:hover,
	.dynamic-sidebar-item:focus-visible {
		color: var(--primary);
		border-color: color-mix(in srgb, var(--gold) 52%, transparent);
	}

	.dynamic-sidebar-item:hover::after,
	.dynamic-sidebar-item:focus-visible::after {
		transform: scaleX(1);
	}

	.dynamic-sidebar-item:focus-visible {
		outline: 2px solid var(--vermilion);
		outline-offset: 2px;
	}

	.dynamic-sidebar-copy {
		min-width: 0;
		flex: 1;
	}

	.dynamic-sidebar-time {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-bottom: 0.25rem;
		color: var(--primary);
		font-size: 0.68rem;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.04em;
		line-height: 1rem;
	}

	.dynamic-sidebar-excerpt {
		display: -webkit-box;
		overflow: hidden;
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.25rem;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
	}

	.dynamic-sidebar-image {
		width: 3.5rem;
		height: 3.5rem;
		flex: 0 0 3.5rem;
		border: 1px solid color-mix(in srgb, var(--gold) 45%, transparent);
		border-radius: 0;
		background: var(--btn-plain-bg-hover);
		clip-path: polygon(0 0, 100% 0, 100% 82%, 82% 100%, 0 100%);
		object-fit: cover;
	}

	@media (prefers-reduced-motion: reduce) {
		.dynamic-sidebar-item,
		.dynamic-sidebar-item::after {
			transition: none;
		}
	}
</style>
