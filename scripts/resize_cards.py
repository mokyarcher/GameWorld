#!/usr/bin/env python3
"""
竖式卡片图压缩脚本
保持竖版比例，压缩到适合网页展示的尺寸
"""

import os
import sys
from PIL import Image

def resize_card(input_path, output_path, max_height=900, quality=90):
    """
    压缩卡片图片
    - 保持原始比例
    - 限制最大高度为 900px（竖版）
    - 使用高质量压缩
    """
    try:
        with Image.open(input_path) as img:
            # 转换为 RGB
            if img.mode in ('RGBA', 'P'):
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background = Image.new('RGB', img.size, (20, 20, 20))
                background.paste(img, mask=img.split()[-1])
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # 获取原始尺寸
            width, height = img.size
            
            # 计算新尺寸（保持比例，限制高度）
            if height > max_height:
                ratio = max_height / height
                new_width = int(width * ratio)
                new_height = max_height
            else:
                new_width, new_height = width, height
            
            # 使用 LANCZOS 高质量缩放
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # 保存为高质量 JPEG
            img.save(output_path, 'JPEG', quality=quality, optimize=True, progressive=True)
            
            # 统计
            orig_size = os.path.getsize(input_path) / 1024
            new_size = os.path.getsize(output_path) / 1024
            
            return True, (width, height), (new_width, new_height), orig_size, new_size
            
    except Exception as e:
        print(f"  错误: {e}")
        return False, (0, 0), (0, 0), 0, 0

def main():
    # 默认路径
    input_dir = sys.argv[1] if len(sys.argv) > 1 else "../pic/cards"
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "../frontend/images/cards"
    
    if not os.path.exists(input_dir):
        print(f"错误: 目录不存在 {input_dir}")
        sys.exit(1)
    
    os.makedirs(output_dir, exist_ok=True)
    
    # 支持的格式
    extensions = ('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp')
    
    files = [f for f in os.listdir(input_dir) 
             if f.lower().endswith(extensions) and os.path.isfile(os.path.join(input_dir, f))]
    
    if not files:
        print(f"未找到图片: {input_dir}")
        sys.exit(1)
    
    print(f"找到 {len(files)} 张卡片图")
    print(f"输出目录: {output_dir}")
    print("-" * 60)
    print(f"{'文件名':<25} {'原尺寸':>12} {'新尺寸':>12} {'原大小':>10} {'新大小':>10} {'节省':>8}")
    print("-" * 60)
    
    total_saved = 0
    success_count = 0
    
    for filename in files:
        input_path = os.path.join(input_dir, filename)
        
        # 输出文件名
        name_without_ext = os.path.splitext(filename)[0]
        output_filename = f"{name_without_ext}.jpg"
        output_path = os.path.join(output_dir, output_filename)
        
        success, orig_dim, new_dim, orig_size, new_size = resize_card(input_path, output_path)
        
        if success:
            saved = orig_size - new_size
            total_saved += saved
            success_count += 1
            
            orig_dim_str = f"{orig_dim[0]}x{orig_dim[1]}"
            new_dim_str = f"{new_dim[0]}x{new_dim[1]}"
            
            print(f"{filename:<25} {orig_dim_str:>12} {new_dim_str:>12} "
                  f"{orig_size:>9.1f}K {new_size:>9.1f}K {saved:>7.1f}K")
        else:
            print(f"{filename:<25} 处理失败")
    
    print("-" * 60)
    print(f"完成: {success_count}/{len(files)} 张")
    print(f"总节省: {total_saved:.1f}KB ({total_saved/1024:.2f}MB)")
    print(f"平均压缩率: {(1 - (total_saved / (total_saved + os.path.getsize(output_path) if success_count > 0 else 1))) * 100:.1f}%")

if __name__ == '__main__':
    main()
