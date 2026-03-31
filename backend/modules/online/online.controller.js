const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../../database/db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'gameworld-secret-key-2024';

// 在线用户存储: userId -> { socketId, location, lastActive }
const onlineUsers = new Map();

// 位置定义
const LOCATION_NAMES = {
  'gamehall': '游戏大厅',
  'profile': '个人资料',
  'friends': '好友页面',
  'admin': '管理后台',
  'poker_lobby': '贵州扑克-大厅',
  'poker_room': '贵州扑克-等待房间',
  'poker_game': '贵州扑克-游戏中',
  'unknown': '未知位置'
};

// 用户上线
function userOnline(userId, socketId, location = 'unknown') {
  const userIdStr = String(userId);
  onlineUsers.set(userIdStr, {
    socketId,
    location,
    lastActive: Date.now()
  });
  console.log(`[Online] 用户 ${userIdStr} 上线，位置: ${LOCATION_NAMES[location] || location}`);
}

// 用户更新位置
function updateLocation(userId, location) {
  const userIdStr = String(userId);
  const user = onlineUsers.get(userIdStr);
  if (user) {
    user.location = location;
    user.lastActive = Date.now();
    console.log(`[Online] 用户 ${userIdStr} 位置更新: ${LOCATION_NAMES[location] || location}`);
  }
}

// 用户下线
function userOffline(userId) {
  const userIdStr = String(userId);
  onlineUsers.delete(userIdStr);
  console.log(`[Online] 用户 ${userIdStr} 下线`);
}

// 获取用户在线状态
function getUserStatus(userId) {
  const userIdStr = String(userId);
  const user = onlineUsers.get(userIdStr);
  
  if (!user) {
    return { isOnline: false, location: null, locationName: '离线' };
  }
  
  // 检查是否超时（5分钟无活动视为离线）
  const inactiveTime = Date.now() - user.lastActive;
  if (inactiveTime > 5 * 60 * 1000) {
    onlineUsers.delete(userIdStr);
    return { isOnline: false, location: null, locationName: '离线' };
  }
  
  return {
    isOnline: true,
    location: user.location,
    locationName: LOCATION_NAMES[user.location] || user.location
  };
}

// 获取所有在线用户
function getAllOnlineUsers() {
  const result = [];
  const now = Date.now();
  
  for (const [userId, data] of onlineUsers.entries()) {
    // 清理超时用户
    if (now - data.lastActive > 5 * 60 * 1000) {
      onlineUsers.delete(userId);
      continue;
    }
    
    result.push({
      userId,
      location: data.location,
      locationName: LOCATION_NAMES[data.location] || data.location
    });
  }
  
  return result;
}

// JWT 认证中间件
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '令牌无效或已过期' });
    }
    req.userId = user.userId;
    req.username = user.username;
    next();
  });
}

// 更新用户位置（心跳接口）- HTTP 方式上报在线状态
router.post('/heartbeat', authenticateToken, async (req, res) => {
  try {
    const { location } = req.body;
    const userId = String(req.userId);
    
    // 如果用户不在线列表中，添加进去（HTTP 方式上线）
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, {
        socketId: 'http-' + Date.now(), // HTTP 连接用特殊前缀
        location: location || 'unknown',
        lastActive: Date.now()
      });
      console.log(`[Online] 用户 ${userId} 通过 HTTP 上线，位置: ${location || 'unknown'}`);
    } else if (location) {
      // 已在线，更新位置
      updateLocation(userId, location);
    } else {
      // 已在线，只更新活跃时间
      const user = onlineUsers.get(userId);
      user.lastActive = Date.now();
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Online] 心跳更新失败:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

// 获取指定用户状态
router.get('/status/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const status = getUserStatus(userId);
    
    res.json({ success: true, status });
  } catch (error) {
    console.error('[Online] 获取状态失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 批量获取用户状态
router.post('/status/batch', authenticateToken, async (req, res) => {
  try {
    const { userIds } = req.body;
    
    if (!Array.isArray(userIds)) {
      return res.status(400).json({ error: '参数错误' });
    }
    
    const statuses = {};
    userIds.forEach(id => {
      statuses[id] = getUserStatus(id);
    });
    
    res.json({ success: true, statuses });
  } catch (error) {
    console.error('[Online] 批量获取状态失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 获取所有在线用户（管理员）
router.get('/all', authenticateToken, async (req, res) => {
  try {
    // 检查是否为管理员
    const user = await db.get('SELECT is_admin FROM users WHERE id = ?', [req.userId]);
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: '无权限' });
    }
    
    const onlineList = getAllOnlineUsers();
    
    // 获取用户信息
    const userIds = onlineList.map(u => u.userId);
    if (userIds.length === 0) {
      return res.json({ success: true, users: [] });
    }
    
    const placeholders = userIds.map(() => '?').join(',');
    const users = await db.all(
      `SELECT id, username, nickname, avatar FROM users WHERE id IN (${placeholders})`,
      userIds
    );
    
    // 合并数据
    const result = onlineList.map(online => {
      const userInfo = users.find(u => String(u.id) === online.userId) || {};
      return {
        ...online,
        username: userInfo.username,
        nickname: userInfo.nickname,
        avatar: userInfo.avatar
      };
    });
    
    res.json({ success: true, users: result });
  } catch (error) {
    console.error('[Online] 获取在线用户失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

module.exports = {
  router,
  userOnline,
  userOffline,
  updateLocation,
  getUserStatus,
  getAllOnlineUsers,
  LOCATION_NAMES
};
