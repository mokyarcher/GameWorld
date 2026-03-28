#!/usr/bin/env python3
"""
生成"正在开发"卡牌图片
黑红白风格，竖版
"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_dev_card(output_path, size=(600, 900)):
    """创建正在开发卡牌"""
    width, height = size
    
    # 创建黑色背景
    img = Image.new('RGB', (width, height), (15, 15, 15))
    draw = ImageDraw.Draw(img)
    
    # 绘制红色边框
    border_width = 4
    draw.rectangle(
        [border_width, border_width, width-border_width, height-border_width],
        outline=(220, 20, 60),
        width=border_width
    )
    
    # 绘制内边框（细线）
    inner_border = 20
    draw.rectangle(
        [inner_border, inner_border, width-inner_border, height-inner_border],
        outline=(220, 20, 60, 100),
        width=1
    )
    
    # 绘制顶部装饰线
    line_y = 80
    draw.line([(50, line_y), (width-50, line_y)], fill=(220, 20, 60), width=2)
    
    # 绘制底部装饰线
    line_y_bottom = height - 80
    draw.line([(50, line_y_bottom), (width-50, line_y_bottom)], fill=(220, 20, 60), width=2)
    
    # 尝试加载字体
    try:
        # 尝试使用系统字体
        font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 48)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24)
    except:
        try:
            font_large = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 48)
            font_small = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 24)
        except:
            font_large = ImageFont.load_default()
            font_small = font_large
    
    # 绘制文字
    text = "X"
    # 获取文字尺寸
    bbox = draw.textbbox((0, 0), text, font=font_large)
    text_width = bbox[2] - bbox[0]
    text_x = (width - text_width) // 2
    text_y = height // 2 - 60
    
    # 绘制发光效果（多层）
    for offset in range(3, 0, -1):
        alpha = int(100 / offset)
        glow_color = (220, 20, 60)
        draw.text((text_x, text_y), text, font=font_large, fill=glow_color)
    
    # 绘制主文字
    draw.text((text_x, text_y), text, font=font_large, fill=(255, 255, 255))
    
    # 绘制副标题（英文避免字体问题）
    sub_text = "COMING SOON"
    bbox_sub = draw.textbbox((0, 0), sub_text, font=font_small)
    sub_width = bbox_sub[2] - bbox_sub[0]
    sub_x = (width - sub_width) // 2
    sub_y = text_y + 80
    
    draw.text((sub_x, sub_y), sub_text, font=font_small, fill=(220, 20, 60))
    
    # 绘制底部 GAME 标签
    game_text = "GAME"
    bbox_game = draw.textbbox((0, 0), game_text, font=font_small)
    game_width = bbox_game[2] - bbox_game[0]
    game_x = (width - game_width) // 2
    game_y = height - 140
    
    draw.text((game_x, game_y), game_text, font=font_small, fill=(220, 20, 60))
    
    # 保存
    img.save(output_path, 'JPEG', quality=95)
    print(f"生成: {output_path}")

if __name__ == '__main__':
    output_dir = r"C:\Users\Moky\myproject\GameWorld\frontend\images\cards"
    os.makedirs(output_dir, exist_ok=True)
    
    output_path = os.path.join(output_dir, "dev-card.jpg")
    create_dev_card(output_path)
    print("完成!")
