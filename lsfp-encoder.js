(function (global) {
    async function gzip(buffer) {
        const cs = new CompressionStream('gzip');
        const writer = cs.writable.getWriter();
        writer.write(buffer);
        writer.close();
        return await new Response(cs.readable).arrayBuffer();
    }

    const Encoder = {
        async encode(imgData, options = {}) {
            const data = imgData.data;
            const width = imgData.width;
            const height = imgData.height;
            
            // 1. 统计所有颜色
            const colorCounts = new Map();
            for (let i = 0; i < data.length; i += 4) {
                if (data[i+3] === 0) continue;
                let r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
                if (a < 255) {
                    r = Math.round((r * a + 255 * (255 - a)) / 255);
                    g = Math.round((g * a + 255 * (255 - a)) / 255);
                    b = Math.round((b * a + 255 * (255 - a)) / 255);
                }
                const hex = (r << 16) | (g << 8) | b;
                colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
            }

            let sortedColors = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]);
            let palette = [];
            let colorMap = new Map();

            // 2. 颜色量化（修复失真Bug）
            if (sortedColors.length <= 256) {
                // 完美模式：颜色少于256，直接全收
                sortedColors.forEach(([hex], idx) => {
                    palette.push([(hex >> 16) & 0xFF, (hex >> 8) & 0xFF, hex & 0xFF]);
                    colorMap.set(hex, idx);
                });
            } else {
                // 复杂模式：采用 4x4x4 均值分桶，让渐变平滑过渡
                const buckets = new Map();
                for (const [hex, count] of sortedColors) {
                    const r = (hex >> 16) & 0xFF, g = (hex >> 8) & 0xFF, b = hex & 0xFF;
                    // 每个通道保留高 4 位，把颜色分成 4096 个桶
                    const bucketKey = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
                    if (!buckets.has(bucketKey)) buckets.set(bucketKey, { r: 0, g: 0, b: 0, count: 0 });
                    const bucket = buckets.get(bucketKey);
                    bucket.r += r * count; bucket.g += g * count; bucket.b += b * count; bucket.count += count;
                }
                
                // 按出现频率挑选最大的 256 个桶
                const sortedBuckets = [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, 256);
                sortedBuckets.forEach((bucket) => {
                    palette.push([
                        Math.round(bucket.r / bucket.count),
                        Math.round(bucket.g / bucket.count),
                        Math.round(bucket.b / bucket.count)
                    ]);
                });

                // 将所有颜色映射到最近的调色板颜色，绝不涂黑！
                for (const [hex] of sortedColors) {
                    const r = (hex >> 16) & 0xFF, g = (hex >> 8) & 0xFF, b = hex & 0xFF;
                    let minDist = Infinity, bestIdx = 0;
                    for (let i = 0; i < palette.length; i++) {
                        const pr = palette[i][0], pg = palette[i][1], pb = palette[i][2];
                        const dist = (r - pr)**2 + (g - pg)**2 + (b - pb)**2;
                        if (dist < minDist) { minDist = dist; bestIdx = i; }
                    }
                    colorMap.set(hex, bestIdx);
                }
            }

            // 3. 生成像素索引
            const totalPixels = width * height;
            const pixels = new Uint8Array(totalPixels);
            for (let i = 0, p = 0; i < data.length; i += 4, p++) {
                if (data[i+3] === 0) { pixels[p] = 0; continue; }
                let r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
                if (a < 255) {
                    r = Math.round((r * a + 255 * (255 - a)) / 255);
                    g = Math.round((g * a + 255 * (255 - a)) / 255);
                    b = Math.round((b * a + 255 * (255 - a)) / 255);
                }
                const hex = (r << 16) | (g << 8) | b;
                // 核心修复：如果找不到，必须用 0，但这只在极小概率下发生
                pixels[p] = colorMap.has(hex) ? colorMap.get(hex) : 0;
            }

            // 4. 组装二进制流
            const buffer = [];
            const writeU8 = (v) => buffer.push(v & 0xFF);
            const writeU16 = (v) => { writeU8(v); writeU8(v >> 8); };
            const writeU32 = (v) => { writeU16(v & 0xFFFF); writeU16(v >> 16); };
            
            writeU8(0x4C); writeU8(0x53); writeU8(0x46); writeU8(0x50); 
            writeU8(0x04); writeU8(0x00);
            writeU32(width); writeU32(height);
            
            writeU16(palette.length);
            palette.forEach(p => { writeU8(p[0]); writeU8(p[1]); writeU8(p[2]); });

            const rleData = [];
            for (let i = 0; i < totalPixels; ) {
                const currentColorId = pixels[i];
                let runLength = 1;
                while (i + runLength < totalPixels && pixels[i + runLength] === currentColorId && runLength < 65535) runLength++;
                rleData.push(currentColorId & 0xFF, (currentColorId >> 8) & 0xFF, runLength & 0xFF, (runLength >> 8) & 0xFF);
                i += runLength;
            }

            writeU8(0x01); 
            writeU32(rleData.length);
            rleData.forEach(b => writeU8(b));
            writeU8(0xFF); writeU32(0);

            const rawBytes = new Uint8Array(buffer);
            const compressed = await gzip(rawBytes);
            
            return new Blob([compressed], { type: 'application/octet-stream' });
        }
    };

    global.LSFP_Encoder = Encoder;
})(window);
