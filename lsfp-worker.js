// 监听主线程发来的像素数据
self.onmessage = function(e) {
    const { data, width, height } = e.data;
    const blockSize = 8; // 采用 8x8 的网格作为复用最小单位
    const cols = Math.floor(width / blockSize);
    const rows = Math.floor(height / blockSize);
    
    const tileDict = []; // 字典：存不重复的方块数据
    const tileMap = [];  // 地图：记录每个网格引用了字典里的哪个方块
    const hashMap = new Map(); // 哈希表：加速查找

    // 遍历全图网格
    for (let ry = 0; ry < rows; ry++) {
        for (let rx = 0; rx < cols; rx++) {
            const tileData = [];
            // 提取 8x8 块的像素
            for (let y = 0; y < blockSize; y++) {
                for (let x = 0; x < blockSize; x++) {
                    const px = rx * blockSize + x;
                    const py = ry * blockSize + y;
                    const idx = (py * width + px) * 4;
                    // 为了加速，这里直接存 RGB
                    tileData.push(data[idx], data[idx+1], data[idx+2], data[idx+3]);
                }
            }
            
            // 生成这个块的快速指纹 (将像素拼成字符串作为 Hash)
            const hash = tileData.join(',');
            
            if (hashMap.has(hash)) {
                // 如果字典里已经有了，直接记录引用 ID
                tileMap.push(hashMap.get(hash));
            } else {
                // 如果没见过，存进字典
                const id = tileDict.length;
                tileDict.push(new Uint8Array(tileData));
                hashMap.set(hash, id);
                tileMap.push(id);
            }
        }
    }

    // 把算好的数据发回主线程
    self.postMessage({ tileDict, tileMap, cols, rows, blockSize });
};
