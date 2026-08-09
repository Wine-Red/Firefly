import {
	LinkPreset,
	type NavBarConfig,
	type NavBarLink,
	type NavBarSearchConfig,
	NavBarSearchMethod,
} from "../types/config";
import { siteConfig } from "./siteConfig";

// 根据页面开关动态生成导航栏配置
const getDynamicNavBarConfig = (): NavBarConfig => {
	// 基础导航栏链接
	const links: (NavBarLink | LinkPreset)[] = [
		// 主页（锚点改写为 #swup-container 在 Navbar.astro 渲染时进行，
		// 这里不能 import LinkPresets —— 该模块使用 @ 别名，会在 Astro 配置加载阶段失败）
		LinkPreset.Home,

		// 归档
		LinkPreset.Archive,
	];

	if (siteConfig.pages.dynamic) {
		links.push({
			name: "动态",
			url: "/dynamic/",
			icon: "material-symbols:dynamic-feed-rounded",
		});
	}

	if (siteConfig.pages.bangumi) {
		links.push({
			name: "游戏",
			url: "/bangumi/",
			icon: "material-symbols:stadia-controller",
		});
	}

	// 根据配置决定是否添加友链，在siteConfig关闭pages.friends时导航栏不显示友链
	if (siteConfig.pages.friends) {
		links.push(LinkPreset.Friends);
	}

	// 根据配置决定是否添加留言板，在siteConfig关闭pages.guestbook时导航栏不显示留言板
	if (siteConfig.pages.guestbook) {
		links.push(LinkPreset.Guestbook);
	}

	// 关于及其子菜单
	links.push({
		name: "关于我",
		url: "/about/",
		icon: "material-symbols:info",
		/*children: [
			// 根据配置决定是否添加赞助，在siteConfig关闭pages.sponsor时导航栏不显示赞助
			...(siteConfig.pages.sponsor ? [LinkPreset.Sponsor] : []),

			// 关于页面
			LinkPreset.About,
		], */
	});

	// 次要外部入口统一收纳，复用导航下拉菜单以保持桌面与移动端交互一致。
	links.push({
		name: "更多",
		url: "/",
		icon: "material-symbols:more-horiz",
		children: [
			{
				name: "监测",
				url: "https://status.winered-0v0.com/status/winered",
				icon: "material-symbols:monitor-heart-rounded",
				external: true,
				hideExternalIcon: true,
			},
			{
				name: "分享",
				url: "https://drive.winered-0v0.com/",
				icon: "material-symbols:folder-shared-rounded",
				external: true,
				hideExternalIcon: true,
			},
		],
	});

	// 仅返回链接，其它导航搜索相关配置在模块顶层常量中独立导出
	return { links } as NavBarConfig;
};

// 导航搜索配置
export const navBarSearchConfig: NavBarSearchConfig = {
	method: NavBarSearchMethod.PageFind,
};

export const navBarConfig: NavBarConfig = getDynamicNavBarConfig();
