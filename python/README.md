# LSFP for Python (LelelelingStudio's Format Picture)

An ultra-fast, hybrid image compression library for Python. 

LSFP is designed to reduce file sizes drastically for images with large solid-color areas, UI screenshots, and icons by combining **Color Quantization**, **Run-Length Encoding (RLE)**, and **Gzip compression**.

## 📦 Installation

*Note: This package is currently under development and will be available on PyPI soon.*

```bash
pip install lsfp
🚀 Quick Start
The library automatically installs its only dependency (Pillow) for reading and writing standard image formats.

python
import lsfp

# 1. Encode a standard image to LSFP
lsfp.LSFP.encode("input.png", "output.lsfp")

# 2. Decode an LSFP file back to a standard image
lsfp.LSFP.decode("output.lsfp", "restored.png")
✨ Features
Extreme Compression: Up to 80% smaller than PNG for UI screenshots.

Cross-Platform: Fully compatible with the LSFP Web implementation (JS).

Zero-Config: Built-in intelligent color quantization prevents image darkening.

📄 License
This project is licensed under the Apache License 2.0. See the LICENSE file for details.

Made with ❤️ by LelelelingStudio.