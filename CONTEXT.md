# GameWorld 项目上下文记录

> 本文档用于记录项目关键信息，供后续会话快速查阅
> 最后更新: 2026-03-23

---

## 1. 项目概述

**GameWorld (游戏世界)** 是一个多人在线游戏平台，采用模块化架构设计，支持多种游戏类型扩展。目前核心游戏为德州扑克，未来计划集成更多类型的游戏。

- **项目名称**: GameWorld / 游戏世界
- **当前版本**: v1.5.0
- **定位**: 多游戏在线娱乐平台，纯娱乐性质，不涉及真实货币交易
- **架构**: 可扩展的多游戏平台架构

---

## 2. 技术栈

### 后端
- Node.js + Express (Web框架)
- Socket.io (实时通信)
- SQLite3 (数据库)
- JWT (用户认证)
- bcryptjs (密码加密)

### 前端
- 原生 HTML/CSS/JavaScript (无框架依赖)
- Socket.io Client

---

## 3. 项目结构

```
GameWorld/
├── backend/
│   ├── core/
│   │   └── server.js              # 服务器入口
│   ├── database/
│   │   ├── db.js                  # 数据库连接
│   │   ├── schema.sql             # 表结构
│   │   └── gameworld.db           # SQLite数据库
│   ├── modules/
│   │   ├── user/
│   │   │   └── user.controller.js # 用户模块
│   │   └── gamehall/
│   │       └── gamehall.controller.js # 大厅模块
│   └── games/
│       └── poker/
│           ├── poker.socket.js    # Socket事件处理
│           └── PokerGame.js       # 游戏核心逻辑
├── frontend/
│   ├── pages/
│   │   ├── login.html             # 登录/注册
│   │   └── gamehall.html          # 游戏大厅
│   ├── games/
│   │   └── poker/
│   │       ├── lobby.html         # 房间列表
│   │       ├── room.html          # 等待房间
│   │       └── game.html          # 游戏界面
│   └── assets/                    # 静态资源
├── docs/
│   ├── CHANGELOG.md               # 变更日志
│   ├── DESIGN_LANGUAGE.md         # 设计语言
│   ├── DEVELOPMENT_GUIDE.md       # 开发指南
│   └── PRODUCT_MANUAL.md          # 产品说明书
└── README.md                      # 技术文档
```

---

## 4. 数据库表结构

| 表名 | 用途 |
|------|------|
| `users` | 用户信息 (id, username, password, nickname, avatar, chips, is_guest) |
| `chips_transactions` | 筹码流水记录 |
| `games` | 游戏列表 |
| `poker_rooms` | 扑克房间信息 |
| `poker_room_players` | 房间玩家关联 |

---

## 5. 核心功能模块

### 5.1 用户系统 (`/api/user/*`)
- 注册/登录/游客登录
- 用户信息获取/更新
- 筹码流水查询
- 初始筹码: 200000

### 5.2 游戏大厅 (`/api/gamehall/*`)
- 游戏列表
- 在线人数统计
- 排行榜
- 系统公告

### 5.3 游戏模块架构

项目采用模块化游戏架构，每个游戏独立目录：
```
backend/games/
├── poker/           # 德州扑克 (已上线)
│   ├── poker.socket.js
│   └── PokerGame.js
└── [future-game]/   # 未来新游戏模块
```

**添加新游戏步骤:**
1. 在 `backend/games/` 下创建新游戏目录
2. 创建游戏逻辑文件（参考 PokerGame.js）
3. 创建 Socket 处理文件（参考 poker.socket.js）
4. 在 `server.js` 中注册 Socket 处理器
5. 在 `frontend/games/` 下创建前端页面

### 5.4 德州扑克 Socket 命名空间: `/poker`

**客户端发送事件:**
- `get-rooms`, `create-room`, `join-room`, `leave-room`
- `player-ready`, `start-game`, `join-game`
- `player-action` (fold/check/call/raise/allin)
- `player-choice` (继续/离开)
- `add-bot`, `kick-bot`, `room-chat`

**服务端发送事件:**
- `rooms-list`, `room-created`, `joined-room`
- `game-started`, `game-state`, `public-state`
- `your-turn`, `action-broadcast`
- `game-end`, `game-decision-start`
- `player-disconnected`, `disconnect-countdown`

---

## 6. 游戏流程

```
1. 创建/加入房间 → 等待玩家准备
2. 房主点击开始 → 游戏开始
3. Pre-flop → 发2张手牌，下盲注
4. Flop → 发3张公共牌
5. Turn → 发第4张公共牌
6. River → 发第5张公共牌
7. Showdown → 比牌决胜负
8. 结算 → 10秒决策时间（继续/离开）
9. 5秒倒计时 → 开始新一局
```

---

## 7. 关键数据结构

### PokerGame 类核心字段
```javascript
{
  roomId, roomName, ownerId, ownerName,
  players: [Player],
  communityCards: [Card],
  pot, currentRound, currentPlayer, dealer,
  smallBlind, bigBlind, currentBet, status
}
```

### Player 对象
```javascript
{
  userId, username, nickname, avatar, chips,
  seatNumber, hand: [Card],
  folded, allIn, currentBet, isReady,
  disconnected, socketId, isBot
}
```

### Card 对象
```javascript
{ suit: '♠♥♦♣', rank: '2-10JQKA', value: 2-14 }
```

---

## 8. 设计规范

### 色彩系统
- **主背景**: `#1a1a2e` → `#16213e`
- **牌桌绿**: `#2d5a3d` → `#1a3d2a`
- **金色强调**: `#ffd700`
- **庄家蓝**: `#3498db`
- **小盲橙**: `#f39c12`
- **大盲红**: `#e74c3c`

### 座位布局 (6人桌)
```
        [上中 - seat-3]
[左上-2]              [右上-4]
[左下-1]              [右下-5]
        [中下 - seat-0/自己]
```

---

## 9. 重要注意事项

1. **Socket.io 命名空间**: 德州扑克使用 `/poker`
2. **用户ID处理**: 统一转为字符串 `String(rawUserId)`
3. **断线重连**: 60秒倒计时，超时自动弃牌
4. **筹码检查**: 
   - 开局前检查 >= 大盲注
   - 决策阶段 < 1000 强制离开
5. **状态同步**: 
   - 私有状态: 包含自己手牌
   - 公开状态: 不包含任何玩家手牌

---

## 10. 启动命令

### 手动启动（推荐）
在 VS Code 终端中执行：
```bash
cd backend
npm run dev
```

**说明：**
- 使用 VS Code 终端启动可以实时查看控制台输出
- 便于调试和监控服务器状态
- 使用 `Ctrl+C` 停止服务器

### 生产模式
```bash
cd backend
npm start
```

### 首次安装依赖
```bash
cd backend
npm install
```

### 访问地址
- 登录页: http://localhost:5555/pages/login.html
- 游戏大厅: http://localhost:5555/pages/gamehall.html
- 个人资料: http://localhost:5555/pages/profile.html
- 好友系统: http://localhost:5555/pages/friends.html
- 扑克房间: http://localhost:5555/games/poker/lobby.html
- 扑克游戏: http://localhost:5555/games/poker/game.html
- 管理后台: http://localhost:5555/pages/admin.html （仅管理员可见）

---

## 11. 版本历史 (关键更新)

| 版本 | 日期 | 主要更新 |
|------|------|----------|
| v1.5.0 | 2026-03-21 | 版本号显示优化 |
| v1.4.0 | 2026-03-20 | 游戏结束机制修复 |
| v1.3.0 | 2026-03-19 | AI机器人智能决策 |
| v1.2.0 | 2026-03-18 | 筹码图标、排行榜优化 |
| v1.1.0 | 2026-03-17 | 头像系统、好友系统框架 |
| v1.0.0 | 2026-03-15 | 初始版本发布，德州扑克上线 |

**未来规划:**
- 接入更多游戏类型（棋牌、休闲、竞技等）
- 统一游戏接入标准和接口规范
- 游戏大厅支持多游戏展示和切换

---

## 12. 待办事项 (TODO)

- [x] 支持更多玩家人数（2-9人桌）
- [x] 聊天功能
- [ ] 观战模式
- [ ] 战绩统计
- [ ] 好友系统完整实现
- [ ] 人机难度等级
- [ ] 自定义牌桌皮肤

---

## 13. 相关文档索引

| 文档 | 路径 | 用途 |
|------|------|------|
| 技术文档 | `README.md` | API、架构、开发指南 |
| 产品说明书 | `docs/PRODUCT_MANUAL.md` | 功能特性、使用指南 |
| 开发指南 | `docs/DEVELOPMENT_GUIDE.md` | 开发规范、调试技巧 |
| 设计语言 | `docs/DESIGN_LANGUAGE.md` | UI/UX规范、CSS样式 |
| 变更日志 | `docs/CHANGELOG.md` | 版本更新记录 |

---

## 14. 更新记录

| 时间 | 更新内容 |
|------|----------|
| 2026-03-23 | 新增管理员后台功能（用户管理、筹码管理） |
| 2026-03-23 | 修复 admin.html 下拉框背景色与文字颜色冲突问题，背景改为 `#1a1a2e` |
| 2026-03-23 | 新增用户个人资料页面（profile.html），支持修改昵称和头像 |
| 2026-03-23 | 游戏大厅添加「资料」按钮和头像/昵称点击入口 |
| 2026-03-23 | 新增好友系统（friends.html + friends.controller.js），支持通过用户名/ID添加好友 |
| 2026-03-23 | 新增玩家在线状态追踪系统，支持查看好友实时位置和在线状态 |
| 2026-03-23 | 新增位置显示：游戏大厅、德州扑克大厅/等待房间/游戏中、个人资料、好友页面 |
| 2026-03-23 | 新增德州扑克房间邀请好友功能，房主可点击空座位邀请在线好友加入 |
| 2026-03-23 | 修复邀请好友功能的代码重复问题，确保事件监听器正确注册 |

---

*本文档由 AI 助手生成，用于会话上下文记录*
