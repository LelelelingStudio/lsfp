(function (global) {
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
            } else { rawBuffer = buffer; }

            const dataView = new DataView(rawBuffer);
            let offset = 0;
            const magic = String.fromCharCode(dataView.getUint8(0), dataView.getUint8(1), dataView.getUint8(2), dataView.getUint8(3));
            if (magic !== 'LSFP') throw new Error("Invalid LSFP format");
            
            const version = dataView.getUint8(4);
            offset += 6;
            const width = dataView.getUint32(offset, true); offset += 4;
            const height = dataView.getUint32(offset, true); offset += 4;
            
            // 提前读取调色板（如果后面有 RLE 块会用到）
            let palette = [];
            let colorCount = 0;
            if (version < 4 || version >= 4) { 
                // 我们统一把调色板放在头部读取，因为 v4.0 兼容 v1/v3
                colorCount = dataView.getUint16(offset, true); offset += 2;
                for (let i = 0; i < colorCount; i++) {
                    palette.push([dataView.getUint8(offset++), dataView.getUint8(offset++), dataView.getUint8(offset++)]);
                }
            }

            const imgData = new ImageData(width, height);
            const data = imgData.data;
            let pixelIndex = 0;

            while (offset < rawBuffer.byteLength) {
                const blockType = dataView.getUint8(offset++);
                const blockLength = dataView.getUint32(offset, true); offset += 4;
                if (blockType === 0xFF) break;

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
                } else if (blockType === 0x10) {
                    // 宏块复用层
                    const blockSize = dataView.getUint16(offset, true); offset += 2;
                    const cols = dataView.getUint16(offset, true); offset += 2;
                    const rows = dataView.getUint16(offset, true); offset += 2;
                    
                    const dictLen = dataView.getUint16(offset, true); offset += 2;
                    const tileDict = [];
                    for(let i=0; i<dictLen; i++) {
                        const tile = new Uint8Array(blockSize * blockSize * 4);
                        for(let j=0; j<tile.length; j++) {
                            tile[j] = dataView.getUint8(offset++);
                        }
                        tileDict.push(tile);
                    }

                    for(let ry=0; ry<rows; ry++) {
                        for(let rx=0; rx<cols; rx++) {
                            const tileId = dataView.getUint16(offset, true); offset += 2;
                            const tile = tileDict[tileId];
                            
                            let tIdx = 0;
                            for(let y=0; y<blockSize; y++) {
                                for(let x=0; x<blockSize; x++) {
                                    const px = rx * blockSize + x;
                                    const py = ry * blockSize + y;
                                    if (px < width && py < height) {
                                        const pIdx = (py * width + px) * 4;
                                        data[pIdx] = tile[tIdx++];
                                        data[pIdx+1] = tile[tIdx++];
                                        data[pIdx+2] = tile[tIdx++];
                                        data[pIdx+3] = tile[tIdx++];
                                    } else {
                                        tIdx += 4;
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // 未知块跳过
                    offset += blockLength;
                }
            }
            return imgData;
        }
    };
    global.LSFP_Decoder = Decoder;
})(window);
