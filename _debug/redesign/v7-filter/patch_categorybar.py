from pathlib import Path
p = Path("src/components/layout/CategoryBar.astro")
text = p.read_bytes().decode("utf-8")

old_fetch = '''  async function fetchOriginalListHTML(originalPath: string): Promise<string | null> {
    if (cachedOriginalListHTML) return cachedOriginalListHTML;
    if (!originalListFetchPromise) {
      originalListFetchPromise = (async () => {
        try {
          const res = await fetch(originalPath, { credentials: "same-origin" });
          if (!res.ok) return null;
          const doc = new DOMParser().parseFromString(await res.text(), "text/html");
          const src = doc.getElementById("post-list-container");
          if (!src || !src.innerHTML.trim()) return null;
          cachedOriginalListHTML = src.innerHTML;
          return cachedOriginalListHTML;
        } catch {
          return null;
        }
      })();
    }
    return originalListFetchPromise;
  }'''
new_fetch = '''  async function fetchOriginalDoc(originalPath: string): Promise<Document | null> {
    if (cachedOriginalDoc) return cachedOriginalDoc;
    if (!originalListFetchPromise) {
      originalListFetchPromise = (async () => {
        try {
          const res = await fetch(originalPath, { credentials: "same-origin" });
          if (!res.ok) return null;
          const doc = new DOMParser().parseFromString(await res.text(), "text/html");
          const src = doc.getElementById("post-list-container");
          // 校验确实是文章列表（带 data-is-ai 标记的卡片），避免把 404/错误页注入首页
          if (!src || !src.querySelector("[data-is-ai]")) return null;
          cachedOriginalDoc = doc;
          return cachedOriginalDoc;
        } catch {
          return null;
        }
      })();
    }
    return originalListFetchPromise;
  }

  // astro-icon 全页去重：symbol 定义只保留在页面首次出现处（可能在本组件按钮里）。
  // 注入来源页 HTML 时补齐文档中缺失的 symbol 定义，避免 <use href="#ai:..."> 失引用导致图标消失。
  function injectWithIconSymbols(container: HTMLElement, html: string, sourceDoc: Document) {
    const refIds = new Set<string>();
    for (const m of html.matchAll(/href="#(ai:[^"]+)"/g)) {
      refIds.add(m[1]);
    }
    const missingDefs: string[] = [];
    refIds.forEach((id) => {
      if (document.getElementById(id)) return;
      const sym = sourceDoc.querySelector(`symbol[id="${id}"]`);
      if (sym) missingDefs.push(sym.outerHTML);
    });
    if (missingDefs.length > 0) {
      html =
        `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${missingDefs.join("")}</svg>` +
        html;
    }
    container.innerHTML = html;
  }'''
assert old_fetch in text, "fetch block not found"
text = text.replace(old_fetch, new_fetch)

old_decl = '''  let cachedOriginalListHTML: string | null = null;
  let originalListFetchPromise: Promise<string | null> | null = null;'''
new_decl = '''  let cachedOriginalDoc: Document | null = null;
  let originalListFetchPromise: Promise<Document | null> | null = null;'''
assert old_decl in text, "decl not found"
text = text.replace(old_decl, new_decl)

old_swap = '''  function swapPostList(container: HTMLElement, html: string) {
    container.style.opacity = "0";
    window.setTimeout(() => {
      container.innerHTML = html;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          container.style.opacity = "1";
        });
      });
    }, 220);
  }'''
new_swap = '''  function swapPostList(container: HTMLElement, html: string, sourceDoc?: Document) {
    container.style.opacity = "0";
    window.setTimeout(() => {
      if (sourceDoc) {
        injectWithIconSymbols(container, html, sourceDoc);
      } else {
        container.innerHTML = html;
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          container.style.opacity = "1";
        });
      });
    }, 220);
  }'''
assert old_swap in text, "swap not found"
text = text.replace(old_swap, new_swap)

old_apply = '''  async function applyInPlaceAIFilter(bar: HTMLElement, btn: HTMLElement) {
    const container = document.getElementById("post-list-container");
    if (!container) return;
    const originalPath = bar.getAttribute("data-original-path") || "/original/";
    const originalHTML = await fetchOriginalListHTML(originalPath);
    if (!originalHTML || !isAIFilterActive()) return;
    // 每次都基于当前 DOM 备份，Swup 换页后恢复的是当前页列表
    fullListBackupHTML = container.innerHTML;
    swapPostList(container, originalHTML);
    setPaginationHidden(true);
    updateAIFilterButton(btn, true);
  }

  function removeInPlaceAIFilter(btn: HTMLElement) {
    const container = document.getElementById("post-list-container");
    if (container && fullListBackupHTML) {
      swapPostList(container, fullListBackupHTML);
      fullListBackupHTML = null;
    }
    setPaginationHidden(false);
    updateAIFilterButton(btn, false);
  }'''
new_apply = '''  async function applyInPlaceAIFilter(bar: HTMLElement, btn: HTMLElement) {
    const container = document.getElementById("post-list-container");
    if (!container || container.dataset.aiFiltered === "true") return;
    const originalPath = bar.getAttribute("data-original-path") || "/original/";
    const originalDoc = await fetchOriginalDoc(originalPath);
    const originalHTML = originalDoc?.getElementById("post-list-container")?.innerHTML;
    if (!originalDoc || !originalHTML) {
      // 抓取失败：回滚状态，保持原列表与按钮视觉一致
      setAIFilterActive(false);
      updateAIFilterButton(btn, false);
      return;
    }
    if (!isAIFilterActive()) return;
    // 每次都基于当前 DOM 备份，Swup 换页后恢复的是当前页列表
    fullListBackupHTML = container.innerHTML;
    container.dataset.aiFiltered = "true";
    swapPostList(container, originalHTML, originalDoc);
    setPaginationHidden(true);
    updateAIFilterButton(btn, true);
  }

  function removeInPlaceAIFilter(btn: HTMLElement) {
    const container = document.getElementById("post-list-container");
    if (container) delete container.dataset.aiFiltered;
    if (container && fullListBackupHTML) {
      swapPostList(container, fullListBackupHTML);
      fullListBackupHTML = null;
    }
    setPaginationHidden(false);
    updateAIFilterButton(btn, false);
  }'''
assert old_apply in text, "apply block not found"
text = text.replace(old_apply, new_apply)

old_tail = "  initAIFilter();"
new_tail = '''  // 房子图标与导航栏"主页"tab 行为一致：
  // 首页点击 → 平滑滚动到文章主体（#swup-container）；
  // 其他页面点击 → 写入导航共用的 sessionStorage 标记，到首页后由 Navbar watcher 接管滚动。
  function scrollToMainContent() {
    const target = document.getElementById("swup-container") || document.getElementById("content-wrapper");
    if (!target) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }

  function initHomePillScroll() {
    const bar = document.getElementById("category-bar");
    if (!bar || bar.dataset.homeScrollBound === "true") return;
    bar.dataset.homeScrollBound = "true";

    bar.addEventListener(
      "click",
      (event) => {
        if (!(event.target instanceof Element)) return;
        const pill = event.target.closest<HTMLAnchorElement>('a.category-pill[data-category-name=""]');
        if (!pill) return;
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        const { isHome } = getCategoryBarState(bar, new URL(window.location.href));
        if (isHome) {
          event.preventDefault();
          event.stopPropagation();
          scrollToMainContent();
        } else {
          try {
            sessionStorage.setItem("firefly:nav-scroll-target", "main");
          } catch {
            /* sessionStorage 不可用时静默降级 */
          }
        }
      },
      true,
    );
  }

  initHomePillScroll();
  document.addEventListener("astro:page-load", initHomePillScroll);
  document.addEventListener("swup:contentReplaced", initHomePillScroll);

  initAIFilter();'''
assert old_tail in text, "tail not found"
text = text.replace(old_tail, new_tail, 1)

p.write_bytes(text.encode("utf-8"))
print("CategoryBar patched OK")
