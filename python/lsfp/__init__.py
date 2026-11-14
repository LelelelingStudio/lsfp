import struct
import gzip
from PIL import Image

class LSFP:
    @staticmethod
    def encode(image_path, output_path, quality=4):
        """
        将普通图片编码为 LSFP
        :param quality: 颜色量化精度 (4 表示分桶保留高 4 位，对应网页版)
        """
        img = Image.open(image_path).convert('RGB')
        width, height = img.size
        pixels = list(img.getdata())

        # 1. 颜色统计与量化
        color_counts = {}
        for r, g, b in pixels:
            hex_color = (r << 16) | (g << 8) | b
            color_counts[hex_color] = color_counts.get(hex_color, 0) + 1

        sorted_colors = sorted(color_counts.items(), key=lambda x: x[1], reverse=True)
        palette = []
        color_map = {}

        if len(sorted_colors) <= 256:
            # 颜色少于 256 种，全量保留
            for hex_color, _ in sorted_colors:
                r, g, b = (hex_color >> 16) & 0xFF, (hex_color >> 8) & 0xFF, hex_color & 0xFF
                color_map[hex_color] = len(palette)
                palette.append((r, g, b))
        else:
            # 颜色过多，采用 4x4x4 分桶量化 (防变暗)
            buckets = {}
            for hex_color, count in sorted_colors:
                r, g, b = (hex_color >> 16) & 0xFF, (hex_color >> 8) & 0xFF, hex_color & 0xFF
                bucket_key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
                if bucket_key not in buckets:
                    buckets[bucket_key] = {'r': 0, 'g': 0, 'b': 0, 'count': 0}
                bucket = buckets[bucket_key]
                bucket['r'] += r * count
                bucket['g'] += g * count
                bucket['b'] += b * count
                bucket['count'] += count

            # 取最大的 256 个桶求平均
            sorted_buckets = sorted(buckets.values(), key=lambda x: x['count'], reverse=True)[:256]
            for bucket in sorted_buckets:
                avg_r = round(bucket['r'] / bucket['count'])
                avg_g = round(bucket['g'] / bucket['count'])
                avg_b = round(bucket['b'] / bucket['count'])
                palette.append((avg_r, avg_g, avg_b))

            # 映射每个像素到最近的调色板颜色
            for hex_color, _ in sorted_colors:
                r, g, b = (hex_color >> 16) & 0xFF, (hex_color >> 8) & 0xFF, hex_color & 0xFF
                min_dist = float('inf')
                best_idx = 0
                for i, (pr, pg, pb) in enumerate(palette):
                    dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
                    if dist < min_dist:
                        min_dist = dist
                        best_idx = i
                color_map[hex_color] = best_idx

        # 2. 生成像素索引
        pixel_indices = []
        for r, g, b in pixels:
            hex_color = (r << 16) | (g << 8) | b
            pixel_indices.append(color_map.get(hex_color, 0))

        # 3. 生成 RLE 数据
        rle_data = bytearray()
        i = 0
        total_pixels = width * height
        while i < total_pixels:
            current_id = pixel_indices[i]
            run_length = 1
            while i + run_length < total_pixels and pixel_indices[i + run_length] == current_id and run_length < 65535:
                run_length += 1
            rle_data.extend(struct.pack('<HH', current_id, run_length))
            i += run_length

        # 4. 组装二进制流
        buffer = bytearray()
        # Header (LSFP + v4 + flags + width + height)
        buffer.extend(b'LSFP')
        buffer.extend(struct.pack('<BBII', 4, 0, width, height))
        
        # Palette
        buffer.extend(struct.pack('<H', len(palette)))
        for r, g, b in palette:
            buffer.extend(struct.pack('<BBB', r, g, b))
            
        # RLE Chunk (0x01)
        buffer.extend(struct.pack('<B', 0x01))
        buffer.extend(struct.pack('<I', len(rle_data)))
        buffer.extend(rle_data)
        
        # End Chunk (0xFF)
        buffer.extend(struct.pack('<B', 0xFF))
        buffer.extend(struct.pack('<I', 0))

        # 5. Gzip 压缩
        with gzip.open(output_path, 'wb') as f:
            f.write(buffer)
            
        print(f"✅ 压缩成功: {output_path}")

    @staticmethod
    def decode(lsfp_path, output_path):
        """将 LSFP 解码为普通图片"""
        with open(lsfp_path, 'rb') as f:
            data = f.read()

        # 自动检测是否 Gzip 压缩 (1F 8B)
        if data[:2] == b'\x1f\x8b':
            data = gzip.decompress(data)

        offset = 0
        magic = data[offset:offset+4]
        if magic != b'LSFP':
            raise ValueError("❌ 这不是一个有效的 LSFP 文件")
        
        offset += 6 # 跳过 magic + version + flags
        width, height = struct.unpack('<II', data[offset:offset+8])
        offset += 8

        # 读取调色板
        color_count = struct.unpack('<H', data[offset:offset+2])[0]
        offset += 2
        palette = []
        for _ in range(color_count):
            r, g, b = struct.unpack('<BBB', data[offset:offset+3])
            palette.append((r, g, b))
            offset += 3

        # 创建空白画布
        img = Image.new('RGB', (width, height))
        pixels = []
        
        # 解析 Chunk
        while offset < len(data):
            block_type = data[offset]
            offset += 1
            if block_type == 0xFF:
                break
                
            block_length = struct.unpack('<I', data[offset:offset+4])[0]
            offset += 4

            if block_type == 0x01:
                end_of_block = offset + block_length
                while offset < end_of_block:
                    color_id, run_length = struct.unpack('<HH', data[offset:offset+4])
                    offset += 4
                    pixels.extend([palette[color_id]] * run_length)
            else:
                # 遇到不认识的块（比如 v4.0 的高级块），直接跳过
                offset += block_length

        # 将像素填入画布
        if len(pixels) == width * height:
            img.putdata(pixels)
            img.save(output_path)
            print(f"✅ 解压成功: {output_path}")
        else:
            print(f"❌ 错误: 像素数量不匹配 (预期 {width*height}，实际 {len(pixels)})")