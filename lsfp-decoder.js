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
            
            offset += 6; // version + flags
            
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
                if (blockType === 0xFF) break;

                if (blockType === 0x01) {
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
                } else {
                    // 跳过所有未知块（包括我们抛弃的0x10）
                    offset += blockLength;
                }
            }
            return imgData;
        }
    };
    global.LSFP_Decoder = Decoder;
})(window);
