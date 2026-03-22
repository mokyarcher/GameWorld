# 贵州扑克 - 游戏桌面设计语言

## 1. 设计概述

### 1.1 设计理念
- **风格**: 高端赌场风格 + 现代扁平化设计
- **氛围**: 沉浸式、专业、优雅
- **主题**: 深色系为主，金色点缀，营造奢华感

### 1.2 视觉层次
```
背景层 → 牌桌层 → 玩家层 → UI层 → 特效层
(深色)   → (绿色)  → (卡片) → (按钮) → (动画)
```

---

## 2. 色彩系统

### 2.1 主色调
| 颜色名称 | 色值 | 用途 |
|---------|------|------|
| **主背景色** | `#1a1a2e` → `#16213e` | 页面背景渐变 |
| **牌桌绿** | `#2d5a3d` → `#1a3d2a` | 牌桌台面渐变 |
| **牌桌边框** | `#3d2817` → `#5a3d2a` | 木纹边框 |
| **金色强调** | `#ffd700` | 筹码、高亮、按钮 |
| **金色渐变** | `#ffd700` → `#ffed4e` | 按钮、重要元素 |

### 2.2 功能色
| 颜色名称 | 色值 | 用途 |
|---------|------|------|
| **庄家蓝** | `#3498db` | 庄家位置标记 |
| **小盲橙** | `#f39c12` | 小盲注标记 |
| **大盲红** | `#e74c3c` | 大盲注标记 |
| **成功绿** | `#27ae60` | 在线状态、成功提示 |
| **警告红** | `#e74c3c` | 离线状态、错误提示 |
| **文字白** | `#ffffff` | 主要文字 |
| **文字灰** | `rgba(255,255,255,0.6)` | 次要文字 |

### 2.3 筹码配色
| 筹码颜色 | 渐变 | 面值建议 |
|---------|------|---------|
| **红色** | `#e74c3c` → `#c0392b` | 5 |
| **蓝色** | `#3498db` → `#2980b9` | 10 |
| **绿色** | `#27ae60` → `#1e8449` | 25 |
| **黑色** | `#2c3e50` → `#1a252f` | 100 |
| **紫色** | `#9b59b6` → `#8e44ad` | 500 |

---

## 3. 牌桌设计

### 3.1 牌桌容器
```css
.poker-table {
    position: absolute;
    width: 90%;           /* 占容器90%宽度 */
    height: 85%;          /* 占容器85%高度 */
    top: 45%;             /* 偏上居中 */
    left: 50%;
    transform: translate(-50%, -50%);
    
    /* 台面渐变 - 从中心向外 */
    background: radial-gradient(
        ellipse at center, 
        #2d5a3d 0%,      /* 中心亮绿 */
        #1a3d2a 60%,     /* 中间深绿 */
        #0d2818 100%     /* 边缘最深 */
    );
    
    /* 椭圆形状 */
    border-radius: 50% / 40%;
    
    /* 多层阴影 */
    box-shadow: 
        inset 0 0 100px rgba(0,0,0,0.5),    /* 内阴影 */
        0 20px 60px rgba(0,0,0,0.8),        /* 外阴影 */
        0 0 0 15px #2a1810,                  /* 内边框 */
        0 0 0 20px #1a0f0a;                  /* 外边框 */
}
```

### 3.2 木纹边框效果
```css
.poker-table::before {
    content: '';
    position: absolute;
    top: -10px;
    left: -10px;
    right: -10px;
    bottom: -10px;
    
    /* 木纹条纹 */
    background: repeating-linear-gradient(
        90deg, 
        #3d2817 0px, 
        #5a3d2a 2px, 
        #3d2817 4px
    );
    
    border-radius: 50% / 40%;
    z-index: -1;
    box-shadow: 0 10px 40px rgba(0,0,0,0.6);
}
```

### 3.3 桌面高光
```css
.table-highlight {
    position: absolute;
    top: 10%;
    left: 20%;
    right: 20%;
    height: 30%;
    background: radial-gradient(
        ellipse at center, 
        rgba(255,255,255,0.1) 0%, 
        transparent 70%
    );
    border-radius: 50%;
    pointer-events: none;
}
```

---

## 4. 玩家座位信息卡设计

### 4.1 座位容器
```css
.player-seat {
    position: absolute;
    width: 140px;           /* 固定宽度 */
    min-height: 100px;      /* 最小高度 */
    transition: all 0.3s ease;
}

/* 当前行动玩家高亮 */
.player-seat.active {
    filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.6));
}
```

### 4.2 信息卡片
```css
.player-card {
    /* 背景 - 深色渐变 */
    background: linear-gradient(
        145deg, 
        rgba(30,30,30,0.95), 
        rgba(10,10,10,0.98)
    );
    
    border-radius: 12px;
    padding: 12px;
    
    /* 边框 - 半透明 */
    border: 1px solid rgba(255,255,255,0.1);
    
    /* 阴影 */
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    
    text-align: center;
    position: relative;
    
    /* 毛玻璃效果 */
    backdrop-filter: blur(10px);
}
```

### 4.3 位置标记 (BTN/SB/BB)
```css
.player-position {
    position: absolute;
    top: -12px;                    /* 卡片上方 */
    left: 50%;
    transform: translateX(-50%);
    
    /* 默认金色渐变 */
    background: linear-gradient(135deg, #ffd700, #ffed4e);
    color: #1a1a1a;
    
    font-size: 0.75rem;
    font-weight: 700;
    padding: 4px 12px;
    border-radius: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    
    box-shadow: 0 2px 8px rgba(255, 215, 0, 0.4);
    white-space: nowrap;
    z-index: 10;
}

/* 庄家 - 蓝色 */
.player-position.dealer { 
    background: linear-gradient(135deg, #3498db, #2980b9);
    color: white;
}

/* 小盲 - 橙色 */
.player-position.small-blind { 
    background: linear-gradient(135deg, #f39c12, #e67e22);
    color: white;
}

/* 大盲 - 红色 */
.player-position.big-blind { 
    background: linear-gradient(135deg, #e74c3c, #c0392b);
    color: white;
}
```

### 4.4 玩家信息
```css
/* 玩家名称 */
.player-name {
    color: #fff;
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 4px;
    margin-top: 5px;
}

/* 筹码数量 - 金色高亮 */
.player-chips {
    color: #ffd700;
    font-size: 0.9rem;
    font-weight: 700;
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.3);
}

/* 当前下注显示 */
.player-current-bet {
    color: #fff;
    font-size: 0.75rem;
    font-weight: 600;
    margin-top: 4px;
    padding: 2px 8px;
    background: rgba(231, 76, 60, 0.8);
    border-radius: 10px;
    display: inline-block;
    min-height: 18px;
}
```

### 4.5 状态标记
```css
.player-status {
    position: absolute;
    top: -8px;
    right: -8px;
    background: #e74c3c;
    color: white;
    font-size: 0.7rem;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 600;
    display: none;
}

/* 各种状态 */
.player-status.dealer { background: #3498db; display: block; }
.player-status.small-blind { background: #f39c12; display: block; }
.player-status.big-blind { background: #e74c3c; display: block; }
```

---

## 5. 座位布局规则

### 5.1 座位位置分布 (2-8人桌)

```
                    [上中 - 6号位]
                       top: 5%
                       left: 50%
                         
[左上 - 7号位]                        [右上 - 5号位]
 top: 18%                                 top: 18%
 left: 8%                                 right: 8%

[左中 - 8号位]                        [右中 - 4号位]
 top: 40%                                 top: 40%
 left: 5%                                 right: 5%

[左下 - 1号位]                        [右下 - 3号位]
 bottom: 18%                              bottom: 18%
 left: 8%                                 right: 8%

                    [中下 - 0号位/自己]
                       bottom: 12%
                       left: 50%
```

### 5.2 动态座位计算
```javascript
// 0号位始终是当前玩家（中下）
// 其他玩家按顺时针排列
function calculateSeatPosition(seatIndex, totalPlayers) {
    const positions = {
        0: { bottom: '12%', left: '50%' },      // 自己
        1: { bottom: '18%', left: '8%' },       // 左下
        2: { top: '18%', left: '8%' },          // 左上
        3: { top: '5%', left: '50%' },          // 上中
        4: { top: '18%', right: '8%' },         // 右上
        5: { bottom: '18%', right: '8%' },      // 右下
        // ... 根据人数动态调整
    };
    return positions[seatIndex];
}
```

---

## 6. 手牌位置规则

### 6.1 设计原则
- **靠左玩家**（left属性）：手牌在信息框**右侧**
- **靠右玩家**（right属性）：手牌在信息框**左侧**
- **中间玩家**（left: 50%）：手牌统一在**左侧**

### 6.2 具体规则
```css
/* ========== 中下位置（本人）：手牌在左侧 ========== */
.player-seat[style*="bottom: 12%"][style*="left: 50%"] .player-hand { 
    top: 50%;
    right: 100%;
    transform: translateY(-50%);
    margin-right: 8px;
}

/* ========== 左下位置（靠左）：手牌在正右侧 ========== */
.player-seat[style*="bottom: 18%"][style*="left: 8%"] .player-hand { 
    top: 50%;
    left: 100%;
    transform: translateY(-50%);
    margin-left: 8px;
}

/* ========== 右下位置（靠右）：手牌在左侧 ========== */
.player-seat[style*="bottom: 18%"][style*="right: 8%"] .player-hand { 
    top: 50%;
    right: 100%;
    transform: translateY(-50%);
    margin-right: 8px;
}

/* ========== 上中位置：手牌在左侧 ========== */
.player-seat[style*="top: 5%"][style*="left: 50%"] .player-hand { 
    top: 50%;
    right: 100%;
    transform: translateY(-50%);
    margin-right: 8px;
}

/* ========== 左上位置（靠左）：手牌在正右侧 ========== */
.player-seat[style*="top: 18%"][style*="left: 8%"] .player-hand { 
    top: 50%;
    left: 100%;
    transform: translateY(-50%);
    margin-left: 8px;
}

/* ========== 右上位置（靠右）：手牌在左侧 ========== */
.player-seat[style*="top: 18%"][style*="right: 8%"] .player-hand { 
    top: 50%;
    right: 100%;
    transform: translateY(-50%);
    margin-right: 8px;
}
```

### 6.3 手牌重叠效果
```css
.player-hand {
    position: absolute;
    display: flex;
    z-index: 5;
}

/* 扑克牌重叠 */
.player-hand .playing-card {
    margin-right: -25px;    /* 负边距实现重叠 */
}

.player-hand .playing-card:last-child {
    margin-right: 0;
}
```

---

## 7. 扑克牌设计

### 7.1 扑克牌尺寸
```css
.playing-card {
    width: 70px;
    height: 98px;
    border-radius: 8px;
    /* 长宽比: 1 : 1.4 (标准扑克比例) */
}
```

### 7.2 扑克牌样式
```css
.playing-card {
    background: linear-gradient(145deg, #fff 0%, #f0f0f0 100%);
    border: 1px solid #ddd;
    box-shadow: 
        0 2px 8px rgba(0,0,0,0.3),
        0 1px 2px rgba(0,0,0,0.2);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 6px;
    position: relative;
}

/* 牌背 */
.playing-card.back {
    background: 
        repeating-linear-gradient(
            45deg,
            #e74c3c,
            #e74c3c 10px,
            #c0392b 10px,
            #c0392b 20px
        );
    border: 2px solid #fff;
}
```

---

## 8. 动画效果

### 8.1 发牌动画
```css
@keyframes dealCard {
    0% {
        opacity: 0;
        transform: translateY(-50px) rotateY(180deg);
    }
    50% {
        opacity: 1;
    }
    100% {
        transform: translateY(0) rotateY(0);
    }
}

.community-cards .playing-card {
    animation: dealCard 0.5s ease-out;
}
```

### 8.2 下注动画
```css
@keyframes betFlash {
    0% {
        opacity: 0;
        transform: translateX(-50%) translateY(10px) scale(0.8);
    }
    20% {
        opacity: 1;
        transform: translateX(-50%) translateY(0) scale(1.1);
    }
    40% {
        transform: translateX(-50%) translateY(-5px) scale(1);
    }
    80% {
        opacity: 1;
        transform: translateX(-50%) translateY(-20px);
    }
    100% {
        opacity: 0;
        transform: translateX(-50%) translateY(-30px);
    }
}

.bet-flash {
    position: absolute;
    top: -40px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #e74c3c, #c0392b);
    color: white;
    font-size: 1rem;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 20px;
    box-shadow: 0 4px 15px rgba(231, 76, 60, 0.5);
    z-index: 20;
    animation: betFlash 1.5s ease-out forwards;
}
```

### 8.3 思考中动画
```css
.thinking {
    position: absolute;
    top: -25px;
    left: 50%;
    transform: translateX(-50%);
    background: #ffd700;
    color: #1a1a1a;
    padding: 3px 10px;
    border-radius: 10px;
    font-size: 0.75rem;
    animation: pulse 1s infinite;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}
```

### 8.4 获胜动画
```css
.winner {
    animation: winnerPulse 1s ease-in-out infinite;
}

@keyframes winnerPulse {
    0%, 100% { 
        box-shadow: 0 0 20px rgba(255, 215, 0, 0.8);
        border-color: #ffd700;
    }
    50% { 
        box-shadow: 0 0 40px rgba(255, 215, 0, 1), 0 0 60px rgba(255, 215, 0, 0.5);
        border-color: #ffed4e;
    }
}
```

---

## 9. 公共牌区域

### 9.1 容器设计
```css
.community-area {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
}

.community-cards {
    display: flex;
    gap: 10px;
    padding: 20px;
    background: rgba(0,0,0,0.3);
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.1);
    box-shadow: inset 0 2px 10px rgba(0,0,0,0.3);
}
```

### 9.2 底池显示
```css
.pot-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}

.pot-label {
    color: rgba(255,255,255,0.7);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 2px;
}

.pot-amount {
    color: #ffd700;
    font-size: 1.8rem;
    font-weight: 700;
    text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
    font-family: 'Crimson Pro', serif;
}
```

---

## 10. 响应式设计

### 10.1 断点设置
```css
/* 大屏幕 */
@media (min-width: 1400px) {
    .player-seat { width: 160px; }
    .playing-card { width: 80px; height: 112px; }
}

/* 中等屏幕 */
@media (max-width: 1200px) {
    .player-seat { width: 130px; }
    .playing-card { width: 65px; height: 91px; }
}

/* 小屏幕 */
@media (max-width: 768px) {
    .poker-table { width: 95%; height: 70%; }
    .player-seat { width: 110px; min-height: 80px; }
    .player-card { padding: 8px; }
    .playing-card { width: 50px; height: 70px; }
}
```

---

## 11. 设计要点总结

### 11.1 视觉层次
1. **背景**: 深色渐变，不抢戏
2. **牌桌**: 绿色椭圆，木纹边框
3. **玩家**: 深色卡片，金色高亮
4. **信息**: 白色文字，清晰可读
5. **特效**: 金色光晕，适度使用

### 11.2 交互反馈
- **悬停**: 轻微放大 + 阴影增强
- **点击**: 颜色变化 + 缩放动画
- **激活**: 金色边框 + 发光效果
- **禁用**: 透明度降低 + 灰度滤镜

### 11.3 一致性原则
- 所有圆角使用 8px, 12px, 16px 等8的倍数
- 间距使用 4px, 8px, 12px, 16px, 20px 等4的倍数
- 阴影统一使用 rgba(0,0,0,0.x) 格式
- 渐变方向统一使用 135deg 或 145deg

---

*本文档最后更新于: 2026-03-21*
*版本: v1.5.0*
