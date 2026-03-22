-- GameWorld 数据库表结构

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT,
    nickname TEXT,
    avatar TEXT DEFAULT 'default.png',
    chips INTEGER DEFAULT 1000,
    is_guest BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 筹码流水表
CREATE TABLE IF NOT EXISTS chips_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    game_type TEXT,
    room_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 游戏类型表
CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_code TEXT UNIQUE NOT NULL,
    game_name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    min_chips INTEGER DEFAULT 0,
    max_players INTEGER DEFAULT 9,
    is_active BOOLEAN DEFAULT 1,
    sort_order INTEGER DEFAULT 0
);

-- 好友表
CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    friend_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (friend_id) REFERENCES users(id),
    UNIQUE(user_id, friend_id)
);

-- 德州扑克房间表
CREATE TABLE IF NOT EXISTS poker_rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id INTEGER NOT NULL,
    small_blind INTEGER DEFAULT 10,
    big_blind INTEGER DEFAULT 20,
    min_buyin INTEGER DEFAULT 200,
    max_buyin INTEGER DEFAULT 2000,
    max_players INTEGER DEFAULT 9,
    status TEXT DEFAULT 'waiting',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id)
);

-- 房间玩家表
CREATE TABLE IF NOT EXISTS poker_room_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    seat_number INTEGER,
    chips_in_table INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    is_host BOOLEAN DEFAULT 0,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES poker_rooms(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(room_id, user_id)
);

-- 初始化游戏数据
INSERT OR IGNORE INTO games (game_code, game_name, description, icon, min_chips, max_players, sort_order) VALUES
('poker', '德州扑克', '经典的德州扑克游戏，考验你的策略和运气', 'poker.png', 100, 9, 1);
