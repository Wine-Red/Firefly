<script lang="ts">
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { onMount } from "svelte";
import Icon from "@/components/common/Icon.svelte";
import { DARK_MODE, LIGHT_MODE, SYSTEM_MODE } from "@/constants/constants";
import type { LIGHT_DARK_MODE } from "@/types/config.ts";
import {
	applyThemeToDocument,
	getStoredTheme,
	setTheme,
} from "@/utils/setting-utils";

// Define Swup type for window object
interface SwupHooks {
	on(event: string, callback: () => void): void;
}

interface SwupInstance {
	hooks?: SwupHooks;
}

type WindowWithSwup = Window & { swup?: SwupInstance };

let mode: LIGHT_DARK_MODE = $state(SYSTEM_MODE);
let displayedMode: LIGHT_DARK_MODE = $state(LIGHT_MODE); // 显示的实际主题（在system模式下会随系统变化）

function switchScheme(newMode: LIGHT_DARK_MODE) {
	mode = newMode;
	setTheme(newMode);
    updateDisplayedMode(); // 主动调用更新显示的模式
}

function toggleScheme() {
    // 无论当前 mode 是什么（包括 system），只根据当前"显示"的状态进行翻转，并将结果固定（脱离 system）
    if (displayedMode === LIGHT_MODE) {
        switchScheme(DARK_MODE);
        displayedMode = DARK_MODE; // 立刻更新UI状态
    } else {
        switchScheme(LIGHT_MODE);
        displayedMode = LIGHT_MODE; // 立刻更新UI状态
    }
}

// 更新显示的主题（用于显示当前实际主题）
function updateDisplayedMode() {
	if (mode === SYSTEM_MODE) {
		// 如果是system模式，显示实际的系统主题
		const isSystemDark = window.matchMedia(
			"(prefers-color-scheme: dark)",
		).matches;
		displayedMode = isSystemDark ? DARK_MODE : LIGHT_MODE;
	} else {
		displayedMode = mode;
	}
}

// 使用onMount确保在组件挂载后正确初始化
onMount(() => {
	// 立即获取并设置正确的主题
	const storedTheme = getStoredTheme();
	mode = storedTheme;
	updateDisplayedMode();

	// 确保DOM状态与存储的主题一致（只对非system模式检查）
	if (storedTheme !== SYSTEM_MODE) {
		const currentTheme = document.documentElement.classList.contains("dark")
			? DARK_MODE
			: LIGHT_MODE;
		if (storedTheme !== currentTheme) {
			applyThemeToDocument(storedTheme);
		}
	}

	// 如果是system模式，监听系统主题变化
	if (storedTheme === SYSTEM_MODE) {
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handleSystemChange = () => {
			updateDisplayedMode();
		};
		mediaQuery.addEventListener("change", handleSystemChange);
	}

	// 添加Swup监听
	const handleContentReplace = () => {
		const newTheme = getStoredTheme();
		mode = newTheme;
		updateDisplayedMode();
	};

	// 检查Swup是否已经加载
	const win = window as WindowWithSwup;
	if (win.swup?.hooks) {
		win.swup.hooks.on("content:replace", handleContentReplace);
	} else {
		document.addEventListener("swup:enable", () => {
			const w = window as WindowWithSwup;
			if (w.swup?.hooks) {
				w.swup.hooks.on("content:replace", handleContentReplace);
			}
		});
	}

	// 监听主题变化事件
	const handleThemeChange = () => {
		// 只有当mode不是system模式时才更新mode
		// system模式下，mode应该保持为SYSTEM_MODE，displayedMode会自动更新
		if (mode !== SYSTEM_MODE) {
			const newTheme = getStoredTheme();
			mode = newTheme;
			updateDisplayedMode();
		} else {
			// system模式下只需要更新displayedMode
			updateDisplayedMode();
		}
	};

	window.addEventListener("theme-change", handleThemeChange);

	// 清理函数
	return () => {
		window.removeEventListener("theme-change", handleThemeChange);
	};
});
</script>

<div class="relative z-50">
    <button aria-label="Toggle Light/Dark Mode" class="relative btn-plain scale-animation rounded-lg h-11 w-11 active:scale-90 overflow-hidden" id="scheme-switch" onclick={toggleScheme}>
        <div class="absolute inset-0 flex items-center justify-center transition-all duration-300 transform" 
             class:opacity-100={displayedMode === LIGHT_MODE} 
             class:opacity-0={displayedMode !== LIGHT_MODE}
             class:rotate-0={displayedMode === LIGHT_MODE}
             class:-rotate-90={displayedMode !== LIGHT_MODE}
             class:scale-100={displayedMode === LIGHT_MODE}
             class:scale-50={displayedMode !== LIGHT_MODE}>
            <Icon icon="material-symbols:wb-sunny-outline-rounded" class="text-[1.25rem]"></Icon>
        </div>
        <div class="absolute inset-0 flex items-center justify-center transition-all duration-300 transform" 
             class:opacity-100={displayedMode === DARK_MODE} 
             class:opacity-0={displayedMode !== DARK_MODE}
             class:rotate-0={displayedMode === DARK_MODE}
             class:rotate-90={displayedMode !== DARK_MODE}
             class:scale-100={displayedMode === DARK_MODE}
             class:scale-50={displayedMode !== DARK_MODE}>
            <Icon icon="material-symbols:dark-mode-outline-rounded" class="text-[1.25rem]"></Icon>
        </div>
    </button>
</div>