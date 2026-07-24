import type { MusicPlayerConfig } from "../types/config";

// 音乐播放器配置
export const musicPlayerConfig: MusicPlayerConfig = {
	// 禁用音乐播放器方法：
	// 模板默认侧边栏和导航栏两个都显示
	// 1. 侧边栏：在sidebarConfig.ts侧边栏配置把音乐组件enable设为false禁用即可
	// 2. 导航栏：在本配置文件把showInNavbar设为false禁用即可

	// 是否在导航栏显示音乐播放器入口
	showInNavbar: true,

	// 使用方式："meting" 使用 Meting API，"local" 使用本地音乐列表
	mode: "local",

	// 默认音量 (0-1)
	volume: 0.7,

	// 播放模式：'list'=列表循环, 'one'=单曲循环, 'random'=随机播放
	playMode: "list",

	// 是否显启用歌词
	showLyrics: true,

	// Meting API 配置
	meting: {
		// Meting API 地址
		// 默认使用官方 API，也可以使用自定义 API
		api: "https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r",
		// 音乐平台：netease=网易云音乐, tencent=QQ音乐, kugou=酷狗音乐, xiami=虾米音乐, baidu=百度音乐
		server: "netease",
		// 类型：song=单曲, playlist=歌单, album=专辑, search=搜索, artist=艺术家
		type: "playlist",
		// 歌单/专辑/单曲 ID 或搜索关键词
		id: "17974416951",
		// 认证 token（可选）
		auth: "",
		// 备用 API 配置（当主 API 失败时使用）
		fallbackApis: [
			"https://api.injahow.cn/meting/?server=:server&type=:type&id=:id",
			"https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id",
		],
	},

	// 本地音乐配置（当 mode 为 'local' 时使用）
	// 1. 支持传入歌词文件的路径
	// lrc: "/assets/music/lrc/使一颗心免于哀伤-哼唱.lrc",
	// 2. 或者直接填入歌词字符串内容
	// lrc: "[00:00.00]歌词内容...",
	local: {
		playlist: [
			{
				name: "Give Up",
				artist: "Low Roar",
				url: "/assets/music/Low Roar - Give Up.mp3",
				cover: "/assets/music/cover/giveup.jpg",
				lrc: "/assets/music/lrc/Give Up - Low Roar .lrc",
			},
			
			{
				name: "君の知らない物語",
				artist: "supercell",
				url: "/assets/music/supercell - 君の知らない物語.mp3",
				cover: "/assets/music/cover/物语.jpg",
				lrc: "/assets/music/lrc/君の知らない物語 - supercell .lrc",
			},
			
			{
				name: "Wish My Life Away",
				artist: "Kan R. Gao / Laura Shigihara",
				url: "/assets/music/Kan R. Gao,Laura Shigihara - Wish My Life Away.mp3",
				cover: "/assets/music/cover/wish_my_life_away.jpg",
				lrc: "/assets/music/lrc/Wish My Life Away - Laura Shigihara .lrc",
			},
			
			{
				name: "Take on Me",
				artist: "Ashley Johnson / Chris Rondinella / Pal Waaktaar / Morten Harket / Magne Furuholmen",
				url: "/assets/music/Ashley Johnson&Chris Rondinella&Pal Waaktaar&Morten Harket&Magne Furuholmen - Ta.mp3",
				cover: "/assets/music/cover/take_on_me.jpg",
				lrc: "/assets/music/lrc/Take on Me - Ashley Johnson&Chris Rondinella&Pal Waaktaar&Morten Harket&Magne Furuholmen .lrc",
			},
			
			{
				name: "Bones",
				artist: "Low Roar / Jófriður",
				url: "/assets/music/Low Roar&Jófriður - Bones.mp3",
				cover: "/assets/music/cover/giveup.jpg",
				lrc: "/assets/music/lrc/Bones - Low Roar&Jófriður .lrc",
			},
			
			{
				name: "Don't Be So Serious",
				artist: "Low Roar",
				url: "/assets/music/Low Roar - Don't Be So Serious.mp3",
				cover: "/assets/music/cover/giveup.jpg",
				lrc: "/assets/music/lrc/Don't Be So Serious - Low Roar .lrc",
			},
			
			{
				name: "いつもの風景から始まる物語",
				artist: "神前暁 / 髙田龍一",
				url: "/assets/music/神前暁,髙田龍一（MONACA) - いつもの風景から始まる物語.mp3",
				cover: "/assets/music/cover/4231583334.jpg",
				lrc: "",
			},
			
			{
				name: "Perfect Night",
				artist: "LE SSERAFIM",
				url: "/assets/music/LE SSERAFIM - Perfect Night.mp3",
				cover: "/assets/music/cover/perfect_night.jpg",
				lrc: "/assets/music/lrc/Perfect Night - LE SSERAFIM .lrc",
			},
		],
	},
};
