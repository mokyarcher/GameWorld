#!/usr/bin/env python3
"""
头像图片处理脚本（保留原始格式）
用法: python resize_avatars_keep_format.py <输入目录> [输出目录]
"""

import os
import sys
from PIL import Image

def process_avatar(input_path, output_path, size=(256, 256)):
    """处理头像，保留格式"""
    try:
        with Image.open(input_path) as img:
            # 获取文件扩展名
            ext = os.path.splitext(input_path)[1].lower()
            
            # 转换为 RGB（处理透明背景）
            if img.mode in ('RGBA', 'P'):
                if img.mode == 'P':
                    img = img.convert('RGBA')
                # PNG保留透明，其他转RGB
                if ext == '.png':
                    pass  # 保持RGBA
                else:
                    background = Image.new('RGB', img.size, (20, 20, 20))
                    background.paste(img, mask=img.split()[-1])
                    img = background
            
            # 等比例裁剪为正方形
            width, height = img.size
            min_dim = min(width, height)
            left = (width - min_dim) // 2
            top = (height - min_dim) // 2
            right = left + min_dim
            bottom = top + min_dim
            
            img = img.crop((left, top, right, bottom))
            img = img.resize(size, Image.Resampling.LANCZOS)
            
            # 根据格式保存
            if ext == '.png':
                # PNG保留透明，压缩级别9
                img.save(output_path, 'PNG', optimize=True, compress_level=9)
            elif ext in ('.jpg', '.jpeg'):
                if img.mode == 'RGBA':
                    img = img.convert('RGB')
                img.save(output_path, 'JPEG', quality=90, optimize=True)
            else:
                # 其他格式转JPEG
                output_path = os.path.splitext(output_path)[0] + '.jpg'
                if img.mode == 'RGBA':
                    img = img.convert('RGB')
                img.save(output_path, 'JPEG', quality=90, optimize=True)
            
            # 统计信息
            original_size = os.path.getsize(input_path) / 1024
            new_size = os.path.getsize(output_path) / 1024
            
            return True, original_size, new_size, output_path
    except Exception as e:
        return False, 0, 0, str(e)

def main():
    if len(sys.argv) < 2:
        print("用法: python resize_avatars_keep_format.py <输入目录> [输出目录]")
        print("示例: python resize_avatars_keep_format.py ../pic ../frontend/avatars")
        sys.exit(1)
    
    input_dir = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(input_dir, 'resized')
    
    if not os.path.exists(input_dir):
        print(f"错误: 目录不存在 {input_dir}")
        sys.exit(1)
    
    os.makedirs(output_dir, exist_ok=True)
    
    # 支持的图片格式
    extensions = ('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp')
    
    files = [f for f in os.listdir(input_dir) if f.lower().endswith(extensions)]
    
    if not files:
        print(f"未找到图片文件: {input_dir}")
        sys.exit(1)
    
    print(f"找到 {len(files)} 张图片")
    print(f"输出目录: {output_dir}")
    print("-" * 50)
    
    success_count = 0
    total_saved = 0
    
    for filename in files:
        input_path = os.path.join(input_dir, filename)
        output_path = os.path.join(output_dir, filename)
        
        success, orig_size, new_size, result = process_avatar(input_path, output_path)
        
        if success:
            saved = orig_size - new_size
            total_saved += saved
            success_count += 1
            print(f"✓ {filename:20s} {orig_size:6.1f}KB → {new_size:6.1f}KB (节省 {saved:6.1f}KB)")
        else:
            print(f"✗ {filename:20s} 处理失败: {result}")
    
    print("-" * 50)
    print(f"完成: {success_count}/{len(files)} 张")
    print(f"总节省: {total_saved:.1f}KB ({total_saved/1024:.1f}MB)")

if __name__ == '__main__':
    main()
