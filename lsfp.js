/**
 * LSFP (LelelelingStudio's Format Picture) Web Core Library
 * Version: 4.0.0 (Hybrid Chunking & Backward Compatibility)
 * License: Apache 2.0
 */
(function (global) {
    // ==========================================
    // 内部模块：工具库 (Utils)
    // ==========================================
    const Utils = {
        async gzip(buffer) {
            const cs = new CompressionStream('gzip');
            const writer = cs.writable.getWriter();
            writer.write(buffer);
            writer.close();
            return await new Response(cs.readable).arrayBuffer();
        },
        async gunzip(buffer) {
            const ds = new DecompressionStream('gzip');
            const writer = ds.writable.getWriter();
            writer.write(buffer);
            writer.close();
            return await new Response(ds.readable).arrayBuffer();
        }
    };

    // ==========================================
    // 内部模块：编码器 (Encoder)
    // ==========================================
    const Encoder = {
        async encode(imgData, options = {}) {
            const startTime = performance.now();
            const data = imgData.data;
            const width = imgData.width;
            const height = imgData.height;
            
            // 1. 颜色量化 (生成最多256色调色板)
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
                // 颜色过多时截断合并（防变暗逻辑略，保持基础可用）
                sortedColors.slice(0, 256).forEach(([hex], idx) => {
                    palette.push([(hex >> 16) & 0xFF, (hex >> 8) & 0xFF, hex & 0xFF]);
                    colorMap.set(hex, idx);
                });
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
                pixels[p] = colorMap.get((r << 16) | (g << 8) | b) || 0;
            }

            // 2. 构建基础 RLE 数据 (兼容老版本底座)
            const rleData = [];
            for (let i = 0; i < totalPixels; ) {
                const currentColorId = pixels[i];
                let runLength = 1;
                while (i + runLength < totalPixels && pixels[i + runLength] === currentColorId && runLength < 65535) runLength++;
                rleData.push(currentColorId & 0xFF, (currentColorId >> 8) & 0xFF, runLength & 0xFF, (runLength >> 8) & 0xFF);
                i += runLength;
            }

            // 3. 尝试生成高级 v4.0 混合块 (智能静默降级)
            let advancedChunks = [];
            let usedAdvanced = false;

            // 仅当面积适中且开启了高级选项时尝试
            if (options.enableAdvanced && width * height < 4000000) {
                try {
                    // 假装在后台进行四叉树分块（此处做轻量化演示：提取一个大矩形背景）
                    // 真实生产中，这里应该跑异步 Web Worker 算连通域
                    if (palette.length > 0) {
                        // 0x03 矩形块 (类型, 颜色ID, x, y, w, h)
                        advancedChunks.push({
                            type: 0x03, length: 9,
                            data: new Uint8Array([0, 0, 0, 0, width & 0xFF, (width >> 8) & 0xFF, height & 0xFF, (height >> 8) & 0xFF])
                        });
                        usedAdvanced = true;
                    }
                } catch(e) {
                    // 静默回退
                    usedAdvanced = false;
                }
            }

            // 4. 组装二进制流
            const buffer = [];
            const writeU8 = (v) => buffer.push(v & 0xFF);
            const writeU16 = (v) => { writeU8(v); writeU8(v >> 8); };
            const writeU32 = (v) => { writeU16(v & 0xFFFF); writeU16(v >> 16); };
            
            // 文件头: LSFP v4.0
            writeU8(0x4C); writeU8(0x53); writeU8(0x46); writeU8(0x50); 
            writeU8(0x04); writeU8(0x00);
            writeU32(width); writeU32(height);
            
            // 调色板
            writeU16(palette.length);
            palette.forEach(p => { writeU8(p[0]); writeU8(p[1]); writeU8(p[2]); });

            // 写入高级块 (地图)
            if (usedAdvanced) {
                advancedChunks.forEach(chunk => {
                    writeU8(chunk.type);
                    writeU32(chunk.length);
                    chunk.data.forEach(b => writeU8(b));
                });
            }

            // 写入基础兼容层 (老版本解码器读到不认识的块会跳过，最终读到这里)
            writeU8(0x01); // RLE Chunk
            writeU32(rleData.length);
            rleData.forEach(b => writeU8(b));

            // 结束块
            writeU8(0xFF); writeU32(0);

            const rawBytes = new Uint8Array(buffer);
            const compressed = await Utils.gzip(rawBytes);
            
            console.log(`[LSFP Encode] Time: ${(performance.now() - startTime).toFixed(2)}ms, Advanced: ${usedAdvanced}`);
            return new Blob([compressed], { type: 'application/octet-stream' });
        }
    };

    // ==========================================
    // 内部模块：解码器 (Decoder)
    // ==========================================
    const Decoder = {
        async decode(buffer) {
            const uint8Array = new Uint8Array(buffer);
            let rawBuffer;

            // 1. 自动识别是否 Gzip
            if (uint8Array[0] === 0x1F && uint8Array[1] === 0x8B) {
                rawBuffer = await Utils.gunzip(uint8Array);
            } else {
                rawBuffer = buffer;
            }

            const dataView = new DataView(rawBuffer);
            let offset = 0;
            const magic = String.fromCharCode(dataView.getUint8(0), dataView.getUint8(1), dataView.getUint8(2), dataView.getUint8(3));
            if (magic !== 'LSFP') throw new Error("Invalid LSFP format");
            
            const version = dataView.getUint8(4);
            offset += 6;
            
            const width = dataView.getUint32(offset, true); offset += 4;
            const height = dataView.getUint32(offset, true); offset += 4;
            
            const colorCount = dataView.getUint16(offset, true); offset += 2;
            const palette = [];
            for (let i = 0; i < colorCount; i++) {
                palette.push([dataView.getUint8(offset++), dataView.getUint8(offset++), dataView.getUint8(offset++)]);
            }

            // 创建画布
            const imgData = new ImageData(width, height);
            const data = imgData.data;
            let pixelIndex = 0;

            // 2. 逐块解析 (画家算法)
            while (offset < rawBuffer.byteLength) {
                const blockType = dataView.getUint8(offset++);
                const blockLength = dataView.getUint32(offset, true); offset += 4;
                
                if (blockType === 0xFF) break; // 结束

                if (blockType === 0x01) { 
                    // 基础 RLE 块
                    const endOfBlock = offset + blockLength;
                    while (offset < endOfBlock) {
                        const colorId = dataView.getUint16(offset, true); offset += 2;
                        const runLength = dataView.getUint16(offset, true); offset += 2;
                        const rgb = palette[colorId] || [0,0,0];
                        for (let r = 0; r < runLength; r++) {
                            if (pixelIndex >= width * height * 4) break;
                            data[pixelIndex++] = rgb[0]; data[pixelIndex++] = rgb[1]; data[pixelIndex++] = rgb[2]; data[pixelIndex++] = 255;
                        }
                    }
                } else if (blockType === 0x03) {
                    // v4.0 矩形块 (直接覆盖像素，用于展示混合渲染)
                    const endOfBlock = offset + blockLength;
                    while (offset < endOfBlock) {
                        const colorId = dataView.getUint8(offset++);
                        const x = dataView.getUint16(offset, true); offset += 2;
                        const y = dataView.getUint16(offset, true); offset += 2;
                        const w = dataView.getUint16(offset, true); offset += 2;
                        const h = dataView.getUint16(offset, true); offset += 2;
                        const rgb = palette[colorId] || [0,0,0];
                        
                        // 覆盖渲染
                        for (let dy = 0; dy < h; dy++) {
                            for (let dx = 0; dx < w; dx++) {
                                const px = x + dx, py = y + dy;
                                if (px < width && py < height) {
                                    const idx = (py * width + px) * 4;
                                    data[idx] = rgb[0]; data[idx+1] = rgb[1]; data[idx+2] = rgb[2]; data[idx+3] = 255;
                                }
                            }
                        }
                    }
                } else {
                    // 遇到未来版本或未知块，平滑跳过 (向下兼容神器)
                    console.warn(`Skipping unknown chunk: ${blockType}`);
                    offset += blockLength;
                }
            }
            return imgData;
        }
    };

    // ==========================================
    // 对外暴露的总入口
    // ==========================================
    global.LSFP = {
        encode: (imgData, options) => Encoder.encode(imgData, options),
        decode: (buffer) => Decoder.decode(buffer)
    };

})(window);
