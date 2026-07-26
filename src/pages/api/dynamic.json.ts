import { getCollection } from "astro:content";
import { marked } from "marked";
import { dynamicConfig } from "@/config";
import {
	dynamicSearchText,
	dynamicSlug,
	sortDynamics,
} from "@/utils/dynamic-utils";
import { type DynamicEntry, fetchMemos } from "@/utils/memos-adapter";

const markdownImagePattern = /!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)/g;

export async function GET(): Promise<Response> {
	const dynamics = sortDynamics(await getCollection("dynamic"));
	const localData: DynamicEntry[] = await Promise.all(
		dynamics.map(async (entry) => {
			const images: Array<{ alt: string; src: string; title?: string }> = [];
			const markdown = (entry.body || "").replace(
				markdownImagePattern,
				(_match, alt: string, src: string, title?: string) => {
					images.push({ alt, src, ...(title ? { title } : {}) });
					return "";
				},
			);
			const rendered = await marked.parse(markdown);

			return {
				id: dynamicSlug(entry.id),
				published: entry.data.published.getTime(),
				html: rendered,
				images,
				searchText: dynamicSearchText(entry),
				pinned: entry.data.pinned || false,
				location: entry.data.location.trim(),
			};
		}),
	);
	let data = localData;

	if (dynamicConfig.memos?.enable) {
		const accessToken = import.meta.env.MEMOS_ACCESS_TOKEN?.trim();
		if (!accessToken) {
			console.warn(
				"[Memos] MEMOS_ACCESS_TOKEN is not configured; using local dynamics.",
			);
		} else {
			try {
				data = await fetchMemos(dynamicConfig.memos.apiUrl, {
					accessToken,
					parent: dynamicConfig.memos.parent,
				});
			} catch (error) {
				console.warn("[Memos] Sync failed; using local dynamics.", error);
			}
		}
	}

	return new Response(JSON.stringify(data), {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
		},
	});
}
