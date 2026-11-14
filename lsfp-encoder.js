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
            
            // 1. 颜色量化 (标准防变暗算法)
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

            if (sortedColors.length <= 256) {
                sortedColors.forEach(([hex], idx) => {
                    palette.push([(hex >> 16) & 0xFF, (hex >> 8) & 0xFF, hex & 0xFF]);
                    colorMap.set(hex, idx);
                });
            } else {
                const buckets = new Map();
                for (const [hex, count] of sortedColors) {
                    const r = (hex >> 16) & 0xFF, g = (hex >> 8) & 0xFF, b = hex & 0xFF;
                    const bucketKey = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
                    if (!buckets.has(bucketKey)) buckets.set(bucketKey, { r: 0, g: 0, b: 0, count: 0 });
                    const bucket = buckets.get(bucketKey);
                    bucket.r += r * count; bucket.g += g * count; bucket.b += b * count; bucket.count += count;
                }
                const sortedBuckets = [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, 256);
                sortedBuckets.forEach((bucket) => {
                    palette.push([
                        Math.round(bucket.r / bucket.count),
                        Math.round(bucket.g / bucket.count),
                        Math.round(bucket.b / bucket.count)
                    ]);
                });
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
                pixels[p] = colorMap.has((r << 16) | (g << 8) | b) ? colorMap.get((r << 16) | (g << 8) | b) : 0;
            }

            // 2. 构建基础 RLE 数据 (保证向下兼容)
            const rleData = [];
            for (let i = 0; i < totalPixels; ) {
                const currentColorId = pixels[i];
                let runLength = 1;
                while (i + runLength < totalPixels && pixels[i + runLength] === currentColorId && runLength < 65535) runLength++;
                rleData.push(currentColorId & 0xFF, (currentColorId >> 8) & 0xFF, runLength & 0xFF, (runLength >> 8) & 0xFF);
                i += runLength;
            }

            // 3. 调用 Worker 寻找宏块 (加入熔断机制)
            let workerResult = null;
            if (options.enableAdvanced && width * height < 4000000) {
                try {
                    workerResult = await new Promise((resolve) => {
                        const worker = new Worker('lsfp-worker.js');
                        const timeoutId = setTimeout(() => {
                            worker.terminate();
                            resolve(null); // 超时熔断，确保不卡顿
                        }, 800);

                        worker.onmessage = (e) => {
                            clearTimeout(timeoutId);
                            worker.terminate();
                            resolve(e.data);
                        };
                        worker.postMessage({ data: data.slice(0), width, height });
                    });
                } catch(e) { console.warn("Worker failed, falling back to RLE"); }
            }

            // 4. 组装文件
            const buffer = [];
            const writeU8 = (v) => buffer.push(v & 0xFF);
            const writeU16 = (v) => { writeU8(v); writeU8(v >> 8); };
            const writeU32 = (v) => { writeU16(v & 0xFFFF); writeU16(v >> 16); };
            
            writeU8(0x4C); writeU8(0x53); writeU8(0x46); writeU8(0x50); writeU8(0x04); writeU8(0x00); // LSFP v4.0
            writeU32(width); writeU32(height);
            
            // 调色板
            writeU16(palette.length);
            palette.forEach(p => { writeU8(p[0]); writeU8(p[1]); writeU8(p[2]); });

            // 写入底层：RLE 块
            writeU8(0x01); 
            writeU32(rleData.length);
            rleData.forEach(b => writeU8(b));

            // 写入顶层：宏块复用 (如果计算成功且有效)
            if (workerResult) {
                writeU8(0x10);
                const lenIndex = buffer.length;
                writeU32(0); // 长度占位
                
                writeU16(workerResult.blockSize);
                writeU16(workerResult.cols);
                writeU16(workerResult.rows);
                
                writeU16(workerResult.tileDict.length);
                for (let i = 0; i < workerResult.tileDict.length; i++) {
                    const tile = workerResult.tileDict[i];
                    for (let j = 0; j < tile.length; j++) writeU8(tile[j]);
                }
                
                for (let i = 0; i < workerResult.tileMap.length; i++) {
                    writeU16(workerResult.tileMap[i]);
                }

                // 回填长度
                const chunkLen = buffer.length - lenIndex - 4;
                buffer[lenIndex] = chunkLen & 0xFF;
                buffer[lenIndex+1] = (chunkLen >> 8) & 0xFF;
                buffer[lenIndex+2] = (chunkLen >> 16) & 0xFF;
                buffer[lenIndex+3] = (chunkLen >> 24) & 0xFF;
            }

            writeU8(0xFF); writeU32(0);

            const rawBytes = new Uint8Array(buffer);
            const compressed = await gzip(rawBytes);
            
            return new Blob([compressed], { type: 'application/octet-stream' });
        }
    };

    global.LSFP_Encoder = Encoder;
})(window);
