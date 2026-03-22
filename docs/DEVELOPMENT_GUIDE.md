# 贵州扑克 - 开发文档

## 1. 项目概述

### 1.1 项目结构
```
Texas-Hold-em-LAN/
├── backend/                    # 后端服务
│   ├── server.js              # 主服务器入口
│   ├── db/
│   │   └── database.js        # 数据库操作
│   ├── routes/
│   │   ├── auth.js           # 认证路由
│   │   └── rooms.js          # 房间路由
│   ├── socket/
│   │   ├── gameHandler.js    # 游戏逻辑处理
│   │   └── roomHandler.js    # 房间Socket处理
│   └── middleware/
│       └── auth.js           # JWT认证中间件
├── frontend/                   # 前端页面
│   ├── login.html           # 登录页
│   ├── lobby.html           # 游戏大厅
│   ├── room.html            # 游戏房间
│   └── game.html            # 游戏桌面
├── avatars/                   # 头像资源
├── docs/                      # 文档目录
└── package.json
```

### 1.2 技术栈
- **后端**: Node.js + Express + Socket.io
- **数据库**: SQLite3
- **前端**: HTML5 + CSS3 + Vanilla JavaScript
- **认证**: JWT (jsonwebtoken)
- **加密**: bcryptjs

---

## 2. 开发环境搭建

### 2.1 环境要求
- Node.js >= 16.0.0
- npm >= 8.0.0
- Git (可选)

### 2.2 安装步骤
```bash
# 1. 克隆项目
git clone https://github.com/mokyarcher/Texas-Hold-em-LAN.git
cd Texas-Hold-em-LAN

# 2. 安装依赖
cd backend
npm install

# 3. 启动开发服务器
npm run dev

# 4. 访问
# 浏览器打开 http://localhost:3000
```

### 2.3 目录权限
- 确保对 `backend/db/` 有写入权限（数据库存储位置）
- 确保对 `avatars/` 有读取权限

---

## 3. 后端开发指南

### 3.1 服务器入口 (server.js)
```javascript
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 静态文件服务
app.use(express.static('../frontend'));

// 启动服务器
server.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### 3.2 数据库操作 (database.js)

#### 3.2.1 数据库初始化
```javascript
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/poker.db');

// 创建表
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nickname TEXT,
    chips INTEGER DEFAULT 1000
  )
`);
```

#### 3.2.2 Promise 包装
```javascript
// 查询单条
function dbGet(sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// 查询多条
function dbAll(sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// 执行SQL
function dbRun(sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
```

### 3.3 Socket.io 事件处理

#### 3.3.1 连接管理
```javascript
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // 存储用户信息
  socket.userId = null;
  socket.roomId = null;
  
  // 断开连接
  socket.on('disconnect', () => {
    handleDisconnect(socket);
  });
});
```

#### 3.3.2 房间事件
```javascript
// 加入房间
socket.on('join_room', async (data) => {
  const { roomId, userId } = data;
  
  socket.join(roomId);
  socket.roomId = roomId;
  socket.userId = userId;
  
  // 通知房间其他玩家
  socket.to(roomId).emit('player_joined', { userId });
});

// 离开房间
socket.on('leave_room', () => {
  if (socket.roomId) {
    socket.leave(socket.roomId);
    socket.to(socket.roomId).emit('player_left', { userId: socket.userId });
  }
});
```

#### 3.3.3 游戏事件
```javascript
// 玩家行动
socket.on('player_action', (data) => {
  const { action, amount } = data;
  
  // 处理行动逻辑
  handlePlayerAction(socket.roomId, socket.userId, action, amount);
  
  // 广播给房间所有人
  io.to(socket.roomId).emit('action_made', {
    userId: socket.userId,
    action,
    amount
  });
});
```

### 3.4 JWT 认证

#### 3.4.1 生成 Token
```javascript
const jwt = require('jsonwebtoken');
const JWT_SECRET = 'your-secret-key';

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}
```

#### 3.4.2 验证 Token
```javascript
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.userId = decoded.userId;
    next();
  });
}
```

---

## 4. 前端开发指南

### 4.1 页面结构

#### 4.1.1 基础模板
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>贵州扑克</title>
  <style>
    /* CSS 样式 */
  </style>
</head>
<body>
  <!-- HTML 内容 -->
  
  <script src="/socket.io/socket.io.js"></script>
  <script>
    // JavaScript 代码
  </script>
</body>
</html>
```

### 4.2 API 调用

#### 4.2.1 封装请求
```javascript
const API_BASE = `${window.location.protocol}//${window.location.host}/api`;

async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('poker_token');
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });
  
  return response.json();
}
```

#### 4.2.2 使用示例
```javascript
// 登录
async function login(username, password) {
  const data = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  
  if (data.token) {
    localStorage.setItem('poker_token', data.token);
    localStorage.setItem('poker_user', JSON.stringify(data.user));
  }
  
  return data;
}

// 获取房间列表
async function getRooms() {
  return apiRequest('/rooms/list');
}
```

### 4.3 Socket.io 客户端

#### 4.3.1 连接服务器
```javascript
const socket = io(window.location.origin);

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});
```

#### 4.3.2 事件监听
```javascript
// 监听游戏开始
socket.on('game_started', (data) => {
  console.log('Game started:', data);
  initGameTable(data);
});

// 监听玩家行动
socket.on('action_made', (data) => {
  console.log('Player action:', data);
  updateGameState(data);
});

// 监听错误
socket.on('error', (data) => {
  alert(data.message);
});
```

#### 4.3.3 发送事件
```javascript
// 加入房间
socket.emit('join_room', {
  roomId: 'room-123',
  userId: 1
});

// 玩家行动
socket.emit('player_action', {
  action: 'call',
  amount: 100
});
```

---

## 5. 游戏逻辑开发

### 5.1 扑克牌表示
```javascript
// 牌面定义
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// 创建牌组
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return shuffle(deck);
}

// 洗牌
function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
```

### 5.2 牌型判断
```javascript
// 判断牌型
function evaluateHand(cards) {
  // 实现牌型判断逻辑
  // 返回牌型等级和比较用的牌值
}

// 比较两手牌
function compareHands(hand1, hand2) {
  const eval1 = evaluateHand(hand1);
  const eval2 = evaluateHand(hand2);
  
  if (eval1.rank > eval2.rank) return 1;
  if (eval1.rank < eval2.rank) return -1;
  
  // 同牌型比较牌值
  return compareKickers(eval1.kickers, eval2.kickers);
}
```

### 5.3 游戏状态管理
```javascript
class GameState {
  constructor(roomId, players) {
    this.roomId = roomId;
    this.players = players;
    this.deck = createDeck();
    this.communityCards = [];
    this.pot = 0;
    this.currentPlayer = 0;
    this.round = 'preflop';
  }
  
  dealCards() {
    // 发底牌
    for (const player of this.players) {
      player.cards = [this.deck.pop(), this.deck.pop()];
    }
  }
  
  dealFlop() {
    // 发翻牌
    this.communityCards = [
      this.deck.pop(),
      this.deck.pop(),
      this.deck.pop()
    ];
    this.round = 'flop';
  }
  
  // ... 其他方法
}
```

---

## 6. 调试技巧

### 6.1 后端调试
```javascript
// 添加日志
console.log('[Game] Player action:', { userId, action, amount });

// 使用 debugger
debugger; // 在代码中设置断点

// 查看 Socket 连接
io.on('connection', (socket) => {
  console.log('[Socket] Connected:', socket.id);
  console.log('[Socket] Rooms:', socket.rooms);
});
```

### 6.2 前端调试
```javascript
// 网络请求调试
fetch('/api/rooms')
  .then(res => res.json())
  .then(data => console.log('[API] Rooms:', data))
  .catch(err => console.error('[API] Error:', err));

// Socket 调试
socket.onAny((eventName, ...args) => {
  console.log(`[Socket] ${eventName}:`, args);
});
```

### 6.3 数据库调试
```javascript
// 查看执行的SQL
db.on('trace', (sql) => {
  console.log('[SQL]', sql);
});

// 手动查询
db.all('SELECT * FROM users', [], (err, rows) => {
  console.log('[DB] Users:', rows);
});
```

---

## 7. 性能优化

### 7.1 后端优化
- 使用连接池（生产环境建议用MySQL）
- 减少不必要的Socket广播
- 使用Redis缓存房间状态（可选）

### 7.2 前端优化
- 图片懒加载
- 减少DOM操作
- 使用CSS动画代替JS动画

---

## 8. 安全注意事项

### 8.1 后端安全
- 所有API都需要JWT验证
- 密码必须使用bcrypt加密
- 防止SQL注入（使用参数化查询）
- 验证所有输入数据

### 8.2 前端安全
- 不要在前端存储敏感信息
- 所有敏感操作都需要后端验证
- 防止XSS攻击（转义用户输入）

---

## 9. 部署指南

### 9.1 生产环境部署
```bash
# 1. 设置环境变量
export NODE_ENV=production
export JWT_SECRET=your-production-secret

# 2. 安装依赖
npm install --production

# 3. 使用PM2启动
npm install -g pm2
pm2 start backend/server.js --name "poker-game"
```

### 9.2 服务器配置
- 开放3000端口（或配置反向代理）
- 配置Nginx反向代理（推荐）
- 设置防火墙规则

---

## 10. 贡献指南

### 10.1 代码规范
- 使用ES6+语法
- 函数使用驼峰命名
- 常量使用大写下划线
- 添加必要的注释

### 10.2 提交规范
```
feat: 添加新功能
fix: 修复bug
docs: 更新文档
style: 代码格式调整
refactor: 重构代码
test: 添加测试
```

---

*本文档最后更新于: 2026-03-21*
*版本: v1.5.0*
