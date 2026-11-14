(function (global) {
    // 内部工具：解压
    async function gunzip(buffer) {
        const ds = new DecompressionStream('gzip');
        const writer = ds.writable.getWriter();
        writer.write(buffer);
        writer.close();
        return await new Response(ds.readable).arrayBuffer();
    }

    const Decoder = {
        async decode(buffer) {
            const uint8Array = new Uint8Array(buffer);
            let rawBuffer;

            if (uint8Array[0] === 0x1F && uint8Array[1] === 0x8B) {
                rawBuffer = await gunzip(uint8Array);
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

            const imgData = new ImageData(width, height);
            const data = imgData.data;
            let pixelIndex = 0;

            while (offset < rawBuffer.byteLength) {
                const blockType = dataView.getUint8(offset++);
                const blockLength = dataView.getUint32(offset, true); offset += 4;
                
                if (blockType === 0xFF) break; // 结束

                if (blockType === 0x01) { 
                    // 基础 RLE 块 (兼容所有老版本)
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
                    // v4.0 矩形块 (覆盖渲染)
                    const endOfBlock = offset + blockLength;
                    while (offset < endOfBlock) {
                        const colorId = dataView.getUint8(offset++);
                        const x = dataView.getUint16(offset, true); offset += 2;
                        const y = dataView.getUint16(offset, true); offset += 2;
                        const w = dataView.getUint16(offset, true); offset += 2;
                        const h = dataView.getUint16(offset, true); offset += 2;
                        const rgb = palette[colorId] || [0,0,0];
                        
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

    global.LSFP_Decoder = Decoder;
})(window);
