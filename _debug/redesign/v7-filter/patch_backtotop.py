from pathlib import Path
p = Path("src/components/controls/BackToTop.astro")
text = p.read_bytes().decode("utf-8")

old = """  function backToTop() {
    // 直接使用原生滚动，避免OverlayScrollbars冲突
    window.scroll({ top: 0, behavior: "smooth" });
  }"""
# 兼容 CRLF
if old not in text:
    old = old.replace("\n", "\r\n")
assert old in text, "backToTop not found"

new = """  function backToTop() {
    // 首页（含分页）与导航栏"主页"tab 行为一致：平滑滚动到文章主体 #swup-container；
    // 其他页面保持回到页面最顶部。
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var behavior = reduced ? "auto" : "smooth";
    var bar = document.getElementById("category-bar");
    var logo = document.getElementById("nav-logo-link");
    var homePath =
      (bar && bar.getAttribute("data-home-path")) ||
      (logo ? new URL(logo.getAttribute("href"), window.location.origin).pathname : "/");
    var normalize = function (p) {
      var n = p.replace(/\\/+$/, "");
      return n || "/";
    };
    var path = normalize(window.location.pathname);
    var home = normalize(homePath);
    var pageSuffix = path.slice(home === "/" ? 0 : home.length);
    var isHome = path === home || /^\\/\\d+$/.test(pageSuffix);

    if (isHome) {
      var target = document.getElementById("swup-container") || document.getElementById("content-wrapper");
      if (target) {
        target.scrollIntoView({ behavior: behavior, block: "start" });
        return;
      }
    }
    // 直接使用原生滚动，避免OverlayScrollbars冲突
    window.scroll({ top: 0, behavior: behavior });
  }"""
new = new.replace("\n", "\r\n") if "\r\n" in old else new
text = text.replace(old, new)
p.write_bytes(text.encode("utf-8"))
print("BackToTop patched OK")
