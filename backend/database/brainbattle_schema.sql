-- 脑力对决题库表
CREATE TABLE IF NOT EXISTS brainbattle_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,           -- 题型：速算题、逻辑题、知识题、反应题、趣味题
    difficulty INTEGER DEFAULT 1, -- 难度：1-简单, 2-中等, 3-困难
    question TEXT NOT NULL,       -- 题目内容
    options TEXT NOT NULL,        -- 选项，JSON数组格式：["选项A", "选项B", "选项C", "选项D"]
    answer INTEGER NOT NULL,      -- 正确答案索引：0-3
    explanation TEXT,             -- 答案解析
    tags TEXT,                    -- 标签，逗号分隔
    use_count INTEGER DEFAULT 0,  -- 使用次数
    correct_count INTEGER DEFAULT 0, -- 答对次数
    is_active BOOLEAN DEFAULT 1,  -- 是否启用
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 脑力对决对战记录表
CREATE TABLE IF NOT EXISTS brainbattle_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT UNIQUE NOT NULL, -- 房间ID
    player1_id INTEGER NOT NULL,  -- 玩家1 ID
    player2_id INTEGER,           -- 玩家2 ID（可能为空，等待匹配）
    winner_id INTEGER,            -- 获胜者ID
    player1_score INTEGER DEFAULT 0,
    player2_score INTEGER DEFAULT 0,
    questions TEXT,               -- 使用的题目ID列表，JSON数组
    status TEXT DEFAULT 'waiting', -- waiting, playing, finished
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME,
    FOREIGN KEY (player1_id) REFERENCES users(id),
    FOREIGN KEY (player2_id) REFERENCES users(id),
    FOREIGN KEY (winner_id) REFERENCES users(id)
);

-- 脑力对决玩家答题记录表
CREATE TABLE IF NOT EXISTS brainbattle_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    round INTEGER NOT NULL,       -- 第几轮 1-5
    answer INTEGER,               -- 玩家选择的答案 0-3，-1表示超时未答
    is_correct BOOLEAN,           -- 是否正确
    answer_time INTEGER,          -- 答题用时（毫秒）
    score INTEGER DEFAULT 0,      -- 本轮得分
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES brainbattle_games(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (question_id) REFERENCES brainbattle_questions(id)
);

-- 玩家题目历史记录表（用于避免重复出题）
CREATE TABLE IF NOT EXISTS brainbattle_user_question_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,         -- 玩家ID
    question_id INTEGER NOT NULL,     -- 题目ID
    game_id INTEGER,                  -- 游戏ID
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (question_id) REFERENCES brainbattle_questions(id),
    FOREIGN KEY (game_id) REFERENCES brainbattle_games(id),
    UNIQUE(user_id, question_id)      -- 每个玩家每道题只记录一次
);

-- 用户脑力对决统计字段（需要添加到 users 表）
-- ALTER TABLE users ADD COLUMN brain_total INTEGER DEFAULT 0;
-- ALTER TABLE users ADD COLUMN brain_wins INTEGER DEFAULT 0;
-- ALTER TABLE users ADD COLUMN brain_streak INTEGER DEFAULT 0;
-- ALTER TABLE users ADD COLUMN brain_rating INTEGER DEFAULT 500;
-- ALTER TABLE users ADD COLUMN brain_max_rating INTEGER DEFAULT 500;

-- 注意：题库数据不再通过此文件硬编码插入
-- 请使用后台管理界面添加题目，或通过 admin API 批量导入
-- 路径：/admin/brainbattle/questions
