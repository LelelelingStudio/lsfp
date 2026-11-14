(function (global) {
    // 动态获取当前 lsfp.js 所在的路径，确保能找到同级目录的文件
    const scriptSrc = document.currentScript.src;
    const basePath = scriptSrc.substring(0, scriptSrc.lastIndexOf('/') + 1);

    // 动态注入 script 标签
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    // 建立全局门面对象，保证原本的 LSFP 接口完全存在
    global.LSFP = {
        encode: async (imgData, options) => {
            // 如果模块还没加载好，动态等待
            if (!global.LSFP_Encoder) {
                await loadScript(basePath + 'lsfp-encoder.js');
            }
            return global.LSFP_Encoder.encode(imgData, options);
        },
        decode: async (buffer) => {
            if (!global.LSFP_Decoder) {
                await loadScript(basePath + 'lsfp-decoder.js');
            }
            return global.LSFP_Decoder.decode(buffer);
        }
    };

    // 预加载（可选，让用户无感）
    loadScript(basePath + 'lsfp-decoder.js');
    loadScript(basePath + 'lsfp-encoder.js');

})(window);
