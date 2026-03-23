const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const db = require('../database/db');
const userController = require('../modules/user/user.controller');
const gamehallController = require('../modules/gamehall/gamehall.controller');
const { router: adminController, initAdminAccount } = require('../modules/admin/admin.controller');
const friendsController = require('../modules/friends/friends.controller');
const { router: onlineController, userOnline, userOffline, updateLocation } = require('../modules/online/online.controller');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5555;
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

const frontendPath = path.join(__dirname, '../../frontend');
app.use(express.static(frontendPath));

// 处理 favicon.ico 请求，返回空响应避免404错误
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// 异步初始化并启动服务器
async function startServer() {
  // 初始化数据库
  await db.init();
  
  // API 路由
  app.use('/api/user', userController);
  app.use('/api/gamehall', gamehallController);
  app.use('/api/admin', adminController);
  app.use('/api/friends', friendsController);
  app.use('/api/online', onlineController);
  
  // 初始化管理员账户
  await initAdminAccount();
  
  // Socket.io 连接处理
  io.on('connection', (socket) => {
    console.log('用户已连接:', socket.id);
    
    // 用户认证并上线
    socket.on('user-online', (data) => {
      const { userId, location } = data;
      if (userId) {
        userOnline(userId, socket.id, location || 'unknown');
        socket.userId = userId;
      }
    });
    
    // 更新位置
    socket.on('update-location', (data) => {
      const { location } = data;
      if (socket.userId && location) {
        updateLocation(socket.userId, location);
      }
    });
    
    socket.on('disconnect', () => {
      console.log('用户已断开:', socket.id);
      if (socket.userId) {
        userOffline(socket.userId);
      }
    });
  });
  
  // 加载游戏 Socket 处理器
  const pokerSocket = require('../games/poker/poker.socket');
  pokerSocket(io);
  
  server.listen(PORT, HOST, () => {
    console.log(`GameWorld 服务器运行在 http://${HOST}:${PORT}`);
    console.log(`登录页面: http://localhost:${PORT}/pages/login.html`);
    console.log(`局域网访问: http://<你的IP地址>:${PORT}/pages/login.html`);
  });
}

startServer();

module.exports = { app, io };
