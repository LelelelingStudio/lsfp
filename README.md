# LSFP Converter & JS Library (LelelelingStudio's Format Picture)

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-success.svg)](https://web.dev/progressive-web-apps/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

> An ultra-fast, privacy-first image compression tool and a standalone JS library powered by the custom **LSFP** format.
> 
> 一款极速、纯本地运行的图像压缩工具，搭载了了了岭工作室自研的 **LSFP** 格式，并包含一个轻量级的独立解码库。

🌐 **Live Demo / 在线体验:** [https://lsfp.leleleling.site/](https://lsfp.leleleling.site/)

---

## 📖 Introduction (项目简介)

**LSFP** (LelelelingStudio's Format Picture) is a custom image format designed specifically for images with large solid-color areas, UI screenshots, and icons. By combining **Color Quantization**, **Run-Length Encoding (RLE)**, and **Gzip compression**, LSFP can drastically reduce file sizes (up to 90% smaller than PNG in specific scenarios).

This repository hosts both a **pure frontend PWA** for converting images and a **standalone JS library (`lsfp.js`)** for developers to render `.lsfp` images on their own websites.

*LSFP 专为色块、截图和图标设计。结合了颜色量化、RLE 编码和 Gzip 压缩，极限情况下能比 PNG 缩小 90% 体积。本项目包含在线转换中心以及供开发者使用的独立 JS 库。*

## ✨ Key Features (核心特性)

- 🔄 **Universal Conversion (全能互转)**: Seamlessly convert between LSFP and 10+ standard formats (PNG, JPG, WebP, BMP, GIF, SVG, ICO, AVIF, TIFF).
- 📦 **Batch Processing (批量转换)**: Drag & drop multiple images at once, convert them in a background queue, and download them individually without annoying ZIP files.
- 🧩 **Standalone JS Library (独立 JS 库)**: Easy to embed `lsfp.js` into any web project to decode LSFP images.
- ⚡ **Extreme Compression (极致压缩)**: Built-in intelligent color clustering and native `CompressionStream` for Gzip achieving maximum file size reduction.
- 🌓 **Color Fidelity (色彩保真)**: Advanced bucket-averaging quantization prevents the image from darkening during conversion.
- 🌍 **i18n Support (多语言)**: Auto-detects browser language (English/Chinese) with a manual toggle.
- 📱 **PWA Support (渐进式应用)**: Install it on macOS, Windows, or mobile devices. Works offline like a native app.

---

## 🧩 How to use the JS Library (如何在你的网页中使用)

You can easily display `.lsfp` images on your own website using our lightweight JS library.

**Step 1:** Include the script in your HTML `<head>`:
```html
<script src="https://lsfp.leleleling.site/lsfp.js"></script>
```

**Step 2:** Fetch the `.lsfp` file and render it to a `<canvas>`:
```html
<canvas id="my-canvas"></canvas>
<script>
    const canvas = document.getElementById('my-canvas');
    const ctx = canvas.getContext('2d');

    fetch('path/to/your/image.lsfp')
        .then(res => res.arrayBuffer())
        .then(async (buffer) => {
            // Decode the LSFP data
            const imgData = await LSFP.decode(buffer);
            
            // Render to canvas
            canvas.width = imgData.width;
            canvas.height = imgData.height;
            ctx.putImageData(imgData, 0, 0);
        })
        .catch(err => console.error("Failed to load LSFP:", err));
</script>
```

---

## 🧬 Under the Hood (底层技术原理)

An `.lsfp` file is structured as follows:
1. **Header**: 4-byte magic number `LSFP`, 1-byte version, 1-byte flags, 4-byte width, 4-byte height.
2. **Palette**: Up to 256 RGB colors. Pixel data only stores the color index ID.
3. **Chunks**: Currently uses `0x01` (RLE chunk) to store sequences of identical colors.
4. **Gzip Layer**: The entire raw binary is finally compressed using the browser's native Gzip API.

## 🗺️ Roadmap (未来路线图)

- [ ] **Rect Chunk (`0x02`)**: Implement connected-component analysis to represent large color blocks with 4 coordinates (X, Y, W, H) for extreme UI screenshot compression.
- [ ] **Web Workers**: Offload heavy pixel processing to background threads for 4K+ images.
- [ ] **NPM Package**: Publish `lsfp.js` to the NPM registry for easier integration.
- [ ] **Native Apps**: Develop native macOS/Windows viewers for double-click file opening.

## 📄 License (开源协议)

This project is licensed under the [Apache License 2.0](LICENSE). You are free to use, modify, and distribute this project, provided you retain the original copyright notices (see the [NOTICE](NOTICE) file for details).

---
*Made with ❤️ by [LelelelingStudio (了了了岭工作室)](https://lsfp.leleleling.site/).*
```

---

### 2. GitHub Release 的 Release notes（复制以下全部内容）

```markdown
## 🚀 What's New in v2.0.0

This is a massive architectural update, turning LSFP from a simple web tool into a fully-fledged format ecosystem.

### ✨ New Features
- **Standalone JS Library (`lsfp.js`)**: You can now embed the LSFP decoder into any website! Just include the script and use `LSFP.decode()` to render images. No dependencies required.
- **Batch Conversion (批量转换)**: Drag and drop multiple images at once. The engine will automatically queue, compress, and allow you to download them individually (No annoying ZIP files).
- **Bilingual Support (中英双语)**: The UI now supports both English and Chinese, with automatic browser language detection.
- **Advanced Quality Controls**: Added image resizing tools and export quality sliders for JPG/WebP.

### 🐛 Bug Fixes & Improvements
- **Color Fidelity Fix**: Replaced the integer truncation algorithm with a bucket-averaging quantization model. Images will no longer become "darker" during conversion.
- **Refactored Architecture**: Separated the UI logic from the core codec logic for better maintainability.
- **PWA Cache Update**: Bumped Service Worker cache to `lsfp-v8`.

### 📦 How to use the new Library
```html
<script src="https://lsfp.leleleling.site/lsfp.js"></script>
<script>
    // LSFP.decode(arrayBuffer).then(imgData => ...)
</script>
```

**Full Documentation:** [https://github.com/LelelelingStudio/lsfp#readme](https://github.com/LelelelingStudio/lsfp#readme)
**Live Demo:** [https://lsfp.leleleling.site/](https://lsfp.leleleling.site/)
