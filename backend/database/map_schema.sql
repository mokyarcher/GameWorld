-- ShareX 地图分享模块 - 数据库表结构
-- 完全独立，不影响其他模块

-- 地图标记表
CREATE TABLE IF NOT EXISTS map_pins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,                    -- 发布者ID（可选，匿名发布时为NULL）
    lat REAL NOT NULL,                  -- 纬度
    lng REAL NOT NULL,                  -- 经度
    title TEXT,                         -- 标题
    content TEXT,                       -- 文字内容
    images TEXT,                        -- 图片JSON数组 ["filename1.jpg", "filename2.jpg"]
    address TEXT,                       -- 地址描述
    is_public BOOLEAN DEFAULT 1,        -- 是否公开
    view_count INTEGER DEFAULT 0,       -- 浏览次数
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 地图标记索引（加速地理查询）
CREATE INDEX IF NOT EXISTS idx_map_pins_location ON map_pins(lat, lng);
CREATE INDEX IF NOT EXISTS idx_map_pins_user ON map_pins(user_id);
CREATE INDEX IF NOT EXISTS idx_map_pins_created ON map_pins(created_at DESC);

-- 地图标记点赞表（可选，先行版可不用）
CREATE TABLE IF NOT EXISTS map_pin_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pin_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pin_id) REFERENCES map_pins(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(pin_id, user_id)
);
