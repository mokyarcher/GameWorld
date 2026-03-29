-- ShareX 意见反馈模块 - 数据库表结构

-- 意见反馈表
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,                    -- 提交用户ID（可选，未登录时为NULL）
    username TEXT,                      -- 提交用户名（冗余存储，方便查看）
    type TEXT NOT NULL,                 -- 反馈类型：game_poker, game_other, feature_map, feature_other, bug, other
    content TEXT NOT NULL,              -- 反馈内容
    image TEXT,                         -- 图片文件名（可选）
    status TEXT DEFAULT 'pending',      -- 状态：pending(待处理), processing(处理中), resolved(已解决), rejected(已拒绝)
    admin_reply TEXT,                   -- 管理员回复（最新回复，冗余存储）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 反馈回复历史表（支持多次回复）
CREATE TABLE IF NOT EXISTS feedback_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id INTEGER NOT NULL,       -- 关联的反馈ID
    admin_id INTEGER,                   -- 管理员ID
    admin_username TEXT,                -- 管理员用户名
    reply_content TEXT NOT NULL,        -- 回复内容
    status_changed_to TEXT,             -- 状态变更（如果有）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE
);

-- 反馈表索引
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);

-- 回复历史表索引
CREATE INDEX IF NOT EXISTS idx_feedback_replies_feedback_id ON feedback_replies(feedback_id);
CREATE INDEX IF NOT EXISTS idx_feedback_replies_created ON feedback_replies(created_at DESC);
