# v3 CSS 章节替换脚本（一次性使用）
import io

path = "src/styles/constructivism.css"
with io.open(path, encoding="utf-8", newline="") as f:
    content = f.read()
content = content.replace("\r\n", "\n")
lines = content.split("\n")

assert lines[47].startswith("/* ---"), lines[47]
assert lines[48].strip().startswith("2. 全局几何装饰层"), lines[48]
assert lines[523] == "}", repr(lines[523])
assert lines[525].startswith("/* ---"), lines[525]

with io.open("_debug/v3-section2.css", encoding="utf-8", newline="") as f:
    new_section = f.read().replace("\r\n", "\n").rstrip("\n")

lines[47:524] = new_section.split("\n")
content = "\n".join(lines)

assert "ch2-" in content
content = content.replace("ch2-", "ch3-")
assert "ch2-" not in content

marker = "/* --------------------------------------------------------------------------\n   11. 动效克制：尊重 prefers-reduced-motion\n   -------------------------------------------------------------------------- */"
idx = content.find(marker)
assert idx > 0
head = content[:idx]

new_rm = marker + '''

@media (prefers-reduced-motion: reduce) {
    .ch3-moon-art,
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
    }

    /* 编舞与倾斜已由 JS 侧禁用，这里兜底保证静态呈现 */
    .ch3-stage,
    .ch3-layer,
    .ch3-moon {
        transform: none !important;
        opacity: 1 !important;
    }

    .ch3-reveal {
        opacity: 1;
        transform: none;
        transition: none;
    }

    .post-card-wrapper::before,
    .post-card-wrapper::after,
    .post-card-title,
    .post-card-image,
    #navbar .dropdown-container > a::after,
    #navbar .dropdown-container > button::after {
        transition: none !important;
    }
}
'''
content = head + new_rm

with io.open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print("done, total lines:", content.count("\n"))
