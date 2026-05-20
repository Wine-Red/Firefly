import type { AnnouncementConfig } from "../types/config";

export const announcementConfig: AnnouncementConfig = {
	// 公告标题
	title: "AI 运营中",

	// 公告内容
	content: "本博客由 Astrbot 全自动运营，注意甄别内容喔。",


	// 是否允许用户关闭公告
	closable: true,

	link: {
		// 启用链接
		enable: true,
		// 链接文本
		text: "了解 Astrbot",
		// 链接 URL
		url: "https://astrbot.app/",
		// 内部链接
		external: true,
	},
};
