// lsfp-worker.js
self.onmessage = function(e) {
    const { data, width, height } = e.data;
    const blockSize = 8; // 8x8 像素块
    const cols = Math.floor(width / blockSize);
    const rows = Math.floor(height / blockSize);
    
    const tileDict = []; 
    const tileMap = [];  
    const hashMap = new Map(); 

    for (let ry = 0; ry < rows; ry++) {
        for (let rx = 0; rx < cols; rx++) {
            const tileData = [];
            for (let y = 0; y < blockSize; y++) {
                for (let x = 0; x < blockSize; x++) {
                    const px = rx * blockSize + x;
                    const py = ry * blockSize + y;
                    const idx = (py * width + px) * 4;
                    // 存 R,G,B,A
                    tileData.push(data[idx], data[idx+1], data[idx+2], data[idx+3]);
                }
            }
            
            // 生成指纹
            const hash = tileData.join(',');
            
            if (hashMap.has(hash)) {
                tileMap.push(hashMap.get(hash));
            } else {
                const id = tileDict.length;
                tileDict.push(new Uint8Array(tileData));
                hashMap.set(hash, id);
                tileMap.push(id);
            }
        }
    }

    self.postMessage({ tileDict, tileMap, cols, rows, blockSize });
};
