-- ShareX 地图分享模块 - 数据库更新（点赞评论功能）

-- 评论表
CREATE TABLE IF NOT EXISTS map_pin_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pin_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pin_id) REFERENCES map_pins(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 评论索引
CREATE INDEX IF NOT EXISTS idx_map_pin_comments_pin ON map_pin_comments(pin_id);
CREATE INDEX IF NOT EXISTS idx_map_pin_comments_user ON map_pin_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_map_pin_comments_created ON map_pin_comments(created_at DESC);

-- 给 map_pins 表添加点赞数字段（冗余，方便查询）
ALTER TABLE map_pins ADD COLUMN like_count INTEGER DEFAULT 0;
ALTER TABLE map_pins ADD COLUMN comment_count INTEGER DEFAULT 0;
