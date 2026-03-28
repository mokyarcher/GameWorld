#!/usr/bin/env python3
"""
处理 cyber-avatars 头像
- 压缩到 256x256
- 保留 PNG 格式（带透明）
- 重命名为 avatar12.png ~ avatar31.png
"""

import os
import sys
from PIL import Image

def process_avatar(input_path, output_path, size=(256, 256)):
    """处理头像，输出 PNG 保留透明"""
    try:
        with Image.open(input_path) as img:
            # 转换为 RGBA（保留透明）
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
            
            # 等比例裁剪为正方形
            width, height = img.size
            min_dim = min(width, height)
            left = (width - min_dim) // 2
            top = (height - min_dim) // 2
            right = left + min_dim
            bottom = top + min_dim
            
            img = img.crop((left, top, right, bottom))
            img = img.resize(size, Image.Resampling.LANCZOS)
            
            # 保存为 PNG（保留透明）
            img.save(output_path, 'PNG', optimize=True, compress_level=9)
            
            # 统计
            orig_size = os.path.getsize(input_path) / 1024
            new_size = os.path.getsize(output_path) / 1024
            
            return True, orig_size, new_size
    except Exception as e:
        print(f"  错误: {e}")
        return False, 0, 0

def main():
    # 固定路径
    input_dir = r"C:\Users\Moky\myproject\GameWorld\pic\avaters\cyber-avatars"
    output_dir = r"C:\Users\Moky\myproject\GameWorld\pic\avaters\cyber-avater-png-zip"
    
    # 起始编号
    start_num = 12
    
    if not os.path.exists(input_dir):
        print(f"错误: 输入目录不存在 {input_dir}")
        sys.exit(1)
    
    os.makedirs(output_dir, exist_ok=True)
    
    # 获取所有图片文件
    extensions = ('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp')
    files = [f for f in os.listdir(input_dir) 
             if f.lower().endswith(extensions) and os.path.isfile(os.path.join(input_dir, f))]
    
    # 按文件名排序
    files.sort()
    
    if not files:
        print(f"未找到图片: {input_dir}")
        sys.exit(1)
    
    print(f"找到 {len(files)} 张图片")
    print(f"输出目录: {output_dir}")
    print(f"命名: avatar{start_num}.png ~ avatar{start_num + len(files) - 1}.png")
    print("-" * 60)
    
    success_count = 0
    total_saved = 0
    
    for i, filename in enumerate(files):
        input_path = os.path.join(input_dir, filename)
        
        # 生成新文件名 avatar12.png, avatar13.png...
        avatar_num = start_num + i
        output_filename = f"avatar{avatar_num}.png"
        output_path = os.path.join(output_dir, output_filename)
        
        success, orig_size, new_size = process_avatar(input_path, output_path)
        
        if success:
            saved = orig_size - new_size
            total_saved += saved
            success_count += 1
            print(f"✓ {filename:30s} -> {output_filename:15s} {orig_size:7.1f}K -> {new_size:7.1f}K")
        else:
            print(f"✗ {filename:30s} 处理失败")
    
    print("-" * 60)
    print(f"完成: {success_count}/{len(files)} 张")
    print(f"总节省: {total_saved:.1f}KB ({total_saved/1024:.2f}MB)")
    print(f"\n输出文件:")
    for i in range(success_count):
        print(f"  avatar{start_num + i}.png")

if __name__ == '__main__':
    main()
