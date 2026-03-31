# GameWorld 技术文档

## 项目概述

GameWorld 是一个多人在线游戏平台，采用 Node.js + Express 后端和原生 JavaScript 前端架构。目前支持贵州扑克游戏，设计为可扩展的多游戏平台。

## 技术栈

### 后端
- **Node.js** - 运行环境
- **Express** - Web 框架
- **Socket.io** - 实时通信
- **SQLite3** - 数据库
- **JWT** - 用户认证
- **bcryptjs** - 密码加密

### 前端
- **原生 HTML/CSS/JavaScript** - 无框架依赖
- **Socket.io Client** - WebSocket 客户端

## 项目结构

```
GameWorld/
├── backend/                    # 后端代码
│   ├── core/
│   │   └── server.js          # 服务器入口，Express + Socket.io 配置
│   ├── database/
│   │   ├── db.js              # 数据库连接和工具函数
│   │   ├── schema.sql         # 数据库表结构
│   │   └── gameworld.db       # SQLite 数据库文件
│   ├── modules/               # 业务模块
│   │   ├── user/              # 用户模块
│   │   │   └── user.controller.js
│   │   └── gamehall/          # 游戏大厅模块
│   │       └── gamehall.controller.js
│   ├── games/                 # 游戏逻辑
│   │   └── poker/             # 贵州扑克
│   │       ├── poker.socket.js    # Socket.io 事件处理
│   │       └── PokerGame.js       # 游戏核心逻辑
│   └── package.json
├── frontend/                   # 前端代码
│   ├── pages/                 # 页面
│   │   ├── login.html         # 登录/注册页
│   │   └── gamehall.html      # 游戏大厅
│   ├── games/                 # 游戏页面
│   │   └── poker/
│   │       ├── lobby.html     # 房间列表
│   │       ├── room.html      # 游戏房间
│   │       └── game.html      # 游戏界面
│   └── assets/                # 静态资源
└── README.md
```

## 数据库结构

### 用户表 (users)
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT,
    nickname TEXT,
    avatar TEXT DEFAULT 'default.png',
    chips INTEGER DEFAULT 1000,
    is_guest INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
);
```

### 筹码流水表 (chips_transactions)
```sql
CREATE TABLE chips_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 游戏表 (games)
```sql
CREATE TABLE games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    icon TEXT,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0
);
```

### 房间表 (poker_rooms)
```sql
CREATE TABLE poker_rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id INTEGER NOT NULL,
    small_blind INTEGER DEFAULT 10,
    big_blind INTEGER DEFAULT 20,
    max_players INTEGER DEFAULT 6,
    status TEXT DEFAULT 'waiting',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 房间玩家表 (poker_room_players)
```sql
CREATE TABLE poker_room_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    seat_number INTEGER DEFAULT 0,
    is_host INTEGER DEFAULT 0,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 核心功能模块

### 1. 用户系统

**文件**: `backend/modules/user/user.controller.js`

**功能**:
- 用户注册（初始筹码：200000）
- 用户登录（JWT Token 认证）
- 游客登录（临时账号，1天有效期）
- 获取/更新用户信息
- 筹码流水查询

**API 端点**:
- `POST /api/user/register` - 注册
- `POST /api/user/login` - 登录
- `POST /api/user/guest` - 游客登录
- `GET /api/user/profile` - 获取用户信息（需认证）
- `PUT /api/user/profile` - 更新用户信息（需认证）
- `GET /api/user/chips-history` - 筹码流水（需认证）

### 2. 游戏大厅

**文件**: `backend/modules/gamehall/gamehall.controller.js`

**功能**:
- 游戏列表展示
- 在线人数统计（模拟数据）
- 排行榜（按筹码排序）
- 系统公告

**API 端点**:
- `GET /api/gamehall/games` - 游戏列表
- `GET /api/gamehall/online-count` - 在线人数
- `GET /api/gamehall/leaderboard` - 排行榜
- `GET /api/gamehall/announcements` - 公告

### 3. 贵州扑克游戏

**核心文件**:
- `backend/games/poker/poker.socket.js` - Socket 事件处理
- `backend/games/poker/PokerGame.js` - 游戏逻辑类

**游戏流程**:

```
1. 创建/加入房间 → 等待玩家准备
2. 房主点击开始 → 游戏开始
3. Pre-flop（翻牌前）→ 发2张手牌，下盲注
4. Flop（翻牌）→ 发3张公共牌
5. Turn（转牌）→ 发第4张公共牌
6. River（河牌）→ 发第5张公共牌
7. Showdown（摊牌）→ 比较牌型，决出胜者
8. 结算 → 10秒决策时间（继续/离开）
9. 5秒倒计时 → 开始新一局
```

**玩家操作**:
- `fold` - 弃牌
- `check` - 过牌（无人下注时）
- `call` - 跟注
- `raise` - 加注
- `allin` - 全押

**决策机制**:
- 每局结束后，玩家有10秒时间选择"继续"或"离开"
- 筹码 < 1000 的玩家只能选择离开
- 所有玩家做出选择后，提前结束决策阶段
- 5秒倒计时后开始新一局

**Socket.io 事件**:

**客户端发送**:
- `get-rooms` - 获取房间列表
- `create-room` - 创建房间
- `join-room` - 加入房间
- `leave-room` - 离开房间
- `player-ready` - 玩家准备状态
- `start-game` - 开始游戏（房主）
- `join-game` - 加入游戏
- `player-action` - 玩家行动
- `player-choice` - 决策选择（继续/离开）

**服务端发送**:
- `rooms-list` - 房间列表
- `room-created` - 房间创建成功
- `joined-room` - 加入房间成功
- `player-joined` / `player-left` - 玩家进出
- `game-started` - 游戏开始
- `game-state` - 游戏状态（私有）
- `public-state` - 公开状态
- `your-turn` - 轮到行动
- `action-broadcast` - 行动广播
- `new-round` - 新一轮开始
- `game-end` - 游戏结束
- `game-decision-start` - 决策阶段开始
- `game-decision-countdown` - 决策倒计时
- `game-decision-result` - 决策结果
- `game-start-countdown` - 游戏开始倒计时
- `game-start-countdown-finished` - 倒计时结束
- `player-disconnected` - 玩家断开
- `disconnect-countdown` - 断开倒计时

## 关键数据结构

### PokerGame 类

```javascript
{
  roomId: String,           // 房间ID
  roomName: String,         // 房间名称
  ownerId: String,          // 房主ID
  ownerName: String,        // 房主昵称
  players: [Player],        // 玩家数组
  communityCards: [Card],   // 公共牌
  pot: Number,              // 底池
  currentRound: Number,     // 当前轮次 (0-4)
  currentPlayer: Number,    // 当前行动玩家索引
  dealer: Number,           // 庄家位置
  smallBlind: Number,       // 小盲注
  bigBlind: Number,         // 大盲注
  currentBet: Number,       // 当前下注额
  status: String            // 状态: waiting/playing/finished
}
```

### Player 对象

```javascript
{
  userId: String,           // 用户ID
  username: String,         // 用户名
  nickname: String,         // 昵称
  avatar: String,           // 头像
  chips: Number,            // 筹码
  seatNumber: Number,       // 座位号
  hand: [Card],             // 手牌
  folded: Boolean,          // 是否弃牌
  allIn: Boolean,           // 是否全押
  currentBet: Number,       // 当前下注
  isReady: Boolean,         // 是否准备
  disconnected: Boolean,    // 是否断开
  socketId: String          // Socket ID
}
```

### Card 对象

```javascript
{
  suit: String,    // 花色: ♠ ♥ ♦ ♣
  rank: String,    // 点数: 2-10 J Q K A
  value: Number    // 数值: 2-14
}
```

## 牌型判定

**牌型等级**（从高到低）:
1. 皇家同花顺 (Royal Flush)
2. 同花顺 (Straight Flush)
3. 四条 (Four of a Kind)
4. 葫芦 (Full House)
5. 同花 (Flush)
6. 顺子 (Straight)
7. 三条 (Three of a Kind)
8. 两对 (Two Pair)
9. 一对 (One Pair)
10. 高牌 (High Card)

## 开发指南

### 启动开发服务器

```bash
cd backend
npm install
npm run dev
```

### 生产部署

```bash
cd backend
npm install
npm start
```

### 添加新游戏

1. 在 `backend/games/` 下创建新游戏目录
2. 创建游戏逻辑文件（参考 PokerGame.js）
3. 创建 Socket 处理文件（参考 poker.socket.js）
4. 在 `server.js` 中注册 Socket 处理器
5. 在 `frontend/games/` 下创建前端页面

### 数据库迁移

修改 `backend/database/schema.sql`，重启服务器自动执行。

## 注意事项

### 1. Socket.io 命名空间

贵州扑克使用 `/poker` 命名空间：
```javascript
const socket = io('/poker');
```

### 2. 用户ID处理

所有用户ID统一转为字符串处理：
```javascript
const userId = String(rawUserId);
```

### 3. 断线重连

- 玩家断线后保留60秒倒计时
- 期间可重新连接恢复游戏
- 超时自动弃牌

### 4. 筹码检查

- 每局开始前检查筹码 >= 大盲注
- 决策阶段筹码 < 1000 强制离开

### 5. 防御性编程

关键函数已添加防御性检查（如 evaluateHand、compareHands），防止数组参数异常导致崩溃。

### 6. 状态同步

- 私有状态（toPrivateJSON）：包含玩家自己的手牌
- 公开状态（toJSON）：不包含任何玩家的手牌

## 配置文件

### 环境变量

```bash
PORT=3000              # 服务器端口
HOST=0.0.0.0          # 监听地址
JWT_SECRET=xxx        # JWT 密钥
```

### Kimi CLI 配置（可选）

如需使用 Kimi CLI 辅助开发，配置 `~/.kimi/config.toml`：

```toml
default_model = "kimi-for-coding"

[models.kimi-for-coding]
provider = "anthropic"
model = "kimi-for-coding"
max_context_size = 200000

[providers.anthropic]
type = "anthropic"
base_url = "https://kimi.a7m.com.cn"
api_key = "your-api-key"
```

## 浏览器访问

- 登录页: http://localhost:3000/pages/login.html
- 游戏大厅: http://localhost:3000/pages/gamehall.html
- 扑克房间: http://localhost:3000/games/poker/lobby.html

## 后续开发建议

1. **游戏扩展**: 可添加更多扑克变体或其他卡牌游戏
2. **房间密码**: 支持私密房间
3. **观战模式**: 允许非玩家观看对局
4. **战绩统计**: 添加胜率、盈亏等统计
5. **聊天系统**: 房间内文字聊天
6. **好友系统**: 添加好友、邀请对战
7. **AI 玩家**: 机器人填补空位
8. **反作弊**: 异常行为检测

## 联系方式

如有问题，请查看代码注释或联系开发团队。
