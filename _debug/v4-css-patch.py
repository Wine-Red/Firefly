# v4 CSS 修改脚本（一次性使用）
import io, re

path = "src/styles/constructivism.css"
with io.open(path, encoding="utf-8", newline="") as f:
    c = f.read().replace("\r\n", "\n")

def sub(old, new, count=1):
    global c
    assert old in c, f"NOT FOUND: {old[:80]}"
    c = c.replace(old, new, count)

# ---- 1. 月亮融合：容器光晕 + 满月柔边 + filter 微调，删 moonrise 动画引用 ----
sub(""".ch3-moon-art {
    width: 100%;
    height: 100%;
    object-fit: contain;
    animation: ch3-moonrise 1.7s cubic-bezier(0.22, 0.61, 0.36, 1) 0.2s backwards;
}

.ch3-moon-for-dark {
    filter: drop-shadow(0 0 64px color-mix(in srgb, var(--gold) 26%, transparent));
}

.ch3-moon-for-light { display: none; }

:root:not(.dark) .ch3-moon-for-dark { display: none; }
:root:not(.dark) .ch3-moon-for-light { display: block; }""",
"""/* 大气辉光：让月亮"挂在天上"而非"贴在屏幕上" */
.ch3-moon::before {
    content: "";
    position: absolute;
    inset: -32%;
    z-index: -1;
    background: radial-gradient(circle,
        color-mix(in srgb, var(--gold) 20%, transparent) 0%,
        color-mix(in srgb, var(--gold) 7%, transparent) 46%,
        transparent 70%);
    pointer-events: none;
}

:root:not(.dark) .ch3-moon::before {
    background: radial-gradient(circle,
        color-mix(in srgb, var(--ink) 10%, transparent) 0%,
        color-mix(in srgb, var(--ink) 4%, transparent) 44%,
        transparent 68%);
}

.ch3-moon-art {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

/* 满月：色温贴近夜空 + 边缘柔化融入天幕（光晕由 ::before 承担，避免 mask 裁切） */
.ch3-moon-for-dark {
    filter: brightness(1.02) saturate(0.92);
    -webkit-mask-image: radial-gradient(circle, #000 63%, transparent 71%);
    mask-image: radial-gradient(circle, #000 63%, transparent 71%);
}

/* 日蚀：保金边不做 mask，仅微调融合纸面 */
.ch3-moon-for-light {
    display: none;
    filter: brightness(0.98) contrast(1.02);
}

:root:not(.dark) .ch3-moon-for-dark { display: none; }
:root:not(.dark) .ch3-moon-for-light { display: block; }""")

# ---- 2. 删除 moonrise keyframes ----
sub("""@keyframes ch3-moonrise {
    from { opacity: 0; transform: translateY(-46px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}

""", "")

# ---- 3. 新元素样式：插在 "竖条群" 注释之前 ----
sub("""/* 竖条群：右下三色立柱 */""",
"""/* 第二条细光束：clip-path 切出的斜带（不用 transform rotate，编舞安全） */
.ch3-beam-thin {
    left: -10%;
    bottom: 38%;
    width: 120%;
    height: 90px;
    z-index: 2;
    background: linear-gradient(90deg,
        transparent 4%,
        color-mix(in srgb, var(--gold) 48%, transparent) 45%,
        color-mix(in srgb, var(--gold) 48%, transparent) 72%,
        transparent 98%);
    clip-path: polygon(0 100%, 100% 12%, 100% 32%, 0 100%);
    animation: ch3-fade-in 1.2s ease-out 1.25s backwards;
}

/* 轨道环：以月亮中心为圆心的同心圆（天空坐标系，不随月亮运动） */
.ch3-orbits {
    --orbit-moon-w: clamp(300px, 32vw, 520px);
    top: calc(6% + var(--orbit-moon-w) / 2);
    right: calc(clamp(1.5rem, 6vw, 7rem) + var(--orbit-moon-w) / 2);
    width: 0;
    height: 0;
    z-index: 2;
}

.ch3-orbit {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--gold) 26%, transparent);
}

.ch3-orbit-a {
    width: calc(var(--orbit-moon-w) * 1.32);
    height: calc(var(--orbit-moon-w) * 1.32);
    animation: ch3-fade-in 1.4s ease-out 1s backwards;
}

.ch3-orbit-b {
    width: calc(var(--orbit-moon-w) * 1.68);
    height: calc(var(--orbit-moon-w) * 1.68);
    border-style: dashed;
    border-color: color-mix(in srgb, var(--gold) 16%, transparent);
    animation: ch3-fade-in 1.4s ease-out 1.15s backwards;
}

/* 天文坐标标注：准星下方的观测数据 */
.ch3-coords {
    left: 54%;
    top: calc(24% + 64px);
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 0.58rem;
    letter-spacing: 0.28em;
    font-weight: 300;
    text-transform: uppercase;
    color: var(--ch3-tick);
    animation: ch3-fade-in 1s ease-out 1.85s backwards;
}

/* 远处星团：左上小星群 */
.ch3-cluster {
    left: 11%;
    top: 13%;
    width: 130px;
    height: 96px;
    z-index: 1;
    animation: ch3-fade-in 1.3s ease-out 0.8s backwards;
}

.ch3-cluster i {
    position: absolute;
    display: block;
    background: var(--ch3-fg);
    border-radius: 50%;
    opacity: 0.75;
}

.ch3-cluster i:nth-child(1) { left: 6px; top: 28px; width: 3px; height: 3px; }
.ch3-cluster i:nth-child(2) { left: 42px; top: 8px; width: 2px; height: 2px; opacity: 0.5; }
.ch3-cluster i:nth-child(3) { left: 78px; top: 34px; width: 4px; height: 4px; background: var(--gold); }
.ch3-cluster i:nth-child(4) { left: 112px; top: 12px; width: 2px; height: 2px; opacity: 0.55; }
.ch3-cluster i:nth-child(5) { left: 58px; top: 66px; width: 2.5px; height: 2.5px; background: var(--gold); opacity: 0.6; }

/* 左缘俄文竖排：构成主义的苏联系注脚 */
.ch3-vertical-l {
    left: clamp(1.6rem, 3vw, 3rem);
    top: 16%;
    bottom: 16%;
    z-index: 5;
    display: flex;
    align-items: center;
    writing-mode: vertical-rl;
    font-size: 0.66rem;
    letter-spacing: 0.5em;
    font-weight: 300;
    color: var(--ch3-sub);
    animation: ch3-fade-in 1s ease-out 1.65s backwards;
}

/* 竖条群：右下三色立柱 */""")

# ---- 4. hover 物理回弹点缀：附在 scrollcue 样式后 ----
sub(""".ch3-scrollcue-text {
    font-size: 0.58rem;
    letter-spacing: 0.44em;
    text-transform: uppercase;
    color: var(--ch3-sub);
}""",
""".ch3-scrollcue-text {
    font-size: 0.58rem;
    letter-spacing: 0.44em;
    text-transform: uppercase;
    color: var(--ch3-sub);
    transition: color 0.3s ease;
}

/* hover 弹性回弹（spring 曲线，克制点缀） */
.ch3-scrollcue {
    transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.ch3-scrollcue:hover {
    transform: translateX(-50%) translateY(4px);
}

.ch3-scrollcue:hover .ch3-scrollcue-text {
    color: var(--gold);
}

.ch3-swatch {
    pointer-events: auto;
}

.ch3-swatch i {
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.ch3-swatch i:hover {
    transform: translateY(-4px);
}""")

# ---- 5. 移动端：隐藏新增装饰 ----
sub("""    .ch3-vertical,
    .ch3-cross,
    .ch3-swatch,
    .ch3-ruler {
        display: none;
    }
}""",
"""    .ch3-vertical,
    .ch3-vertical-l,
    .ch3-cross,
    .ch3-coords,
    .ch3-cluster,
    .ch3-orbits,
    .ch3-beam-thin,
    .ch3-swatch,
    .ch3-ruler {
        display: none;
    }
}""")

# ---- 6. reduced-motion：新元素动画禁用 + 弹性 transition 禁用 ----
sub("""    .ch3-moon-art,
    .ch3-char,
    .ch3-no,
    .ch3-eyebrow,
    .ch3-rule,
    .ch3-subtitle,
    .ch3-meta-row,
    .ch3-vertical,
    .ch3-cross,
    .ch3-swatch,
    .ch3-scrollcue,
    .ch3-beam-core,
    .ch3-beam-edge,
    .ch3-bar,
    .ch3-ruler,
    .ch3-horizon-line,
    .ch3-scrollcue-line {
        animation: none !important;
    }""",
"""    .ch3-moon-art,
    .ch3-char,
    .ch3-no,
    .ch3-eyebrow,
    .ch3-rule,
    .ch3-subtitle,
    .ch3-meta-row,
    .ch3-vertical,
    .ch3-vertical-l,
    .ch3-cross,
    .ch3-coords,
    .ch3-cluster,
    .ch3-orbit,
    .ch3-beam-thin,
    .ch3-swatch,
    .ch3-scrollcue,
    .ch3-beam-core,
    .ch3-beam-edge,
    .ch3-bar,
    .ch3-ruler,
    .ch3-horizon-line,
    .ch3-scrollcue-line {
        animation: none !important;
    }

    .ch3-scrollcue,
    .ch3-scrollcue-text,
    .ch3-swatch i {
        transition: none !important;
    }""")

with io.open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(c)
print("done, total lines:", c.count("\n"))
