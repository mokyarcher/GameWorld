-- ShareX 加入我们模块 - 数据库表结构

-- 开发计划申请表
CREATE TABLE IF NOT EXISTS join_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,                    -- 提交用户ID
    username TEXT,                      -- 提交用户名（冗余存储）
    project_name TEXT NOT NULL,         -- 项目名称
    project_type TEXT NOT NULL,         -- 项目类型：game_card, game_board, game_casino, feature_social, feature_tool, other
    project_features TEXT NOT NULL,     -- 核心功能描述
    project_highlights TEXT,            -- 项目特点/创新点
    project_plan TEXT,                  -- 简要规划
    image TEXT,                         -- 规划图片文件名
    status TEXT DEFAULT 'pending',      -- 状态：pending(待审核), approved(已通过), rejected(已拒绝)
    admin_reply TEXT,                   -- 管理员回复
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 申请表索引
CREATE INDEX IF NOT EXISTS idx_join_applications_user ON join_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_join_applications_status ON join_applications(status);
CREATE INDEX IF NOT EXISTS idx_join_applications_created ON join_applications(created_at DESC);
