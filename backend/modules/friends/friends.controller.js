const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../../database/db');
const { getUserStatus } = require('../online/online.controller');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'gameworld-secret-key-2024';

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

// 搜索用户（通过用户名或ID）
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { keyword } = req.query;
    
    if (!keyword || keyword.trim().length < 2) {
      return res.status(400).json({ error: '搜索关键词至少需要2个字符' });
    }
    
    const searchTerm = keyword.trim();
    
    // 支持通过用户名或ID搜索
    let users;
    if (/^\d+$/.test(searchTerm)) {
      // 如果是纯数字，按ID搜索
      users = await db.all(
        `SELECT id, username, nickname, avatar FROM users 
         WHERE id = ? AND id != ? AND is_guest = 0`,
        [parseInt(searchTerm), req.userId]
      );
    } else {
      // 按用户名搜索（模糊匹配）
      users = await db.all(
        `SELECT id, username, nickname, avatar FROM users 
         WHERE (username LIKE ? OR nickname LIKE ?) 
         AND id != ? AND is_guest = 0
         LIMIT 10`,
        [`%${searchTerm}%`, `%${searchTerm}%`, req.userId]
      );
    }
    
    res.json({ success: true, users });
  } catch (error) {
    console.error('[Friends] 搜索用户失败:', error);
    res.status(500).json({ error: '搜索失败' });
  }
});

// 发送好友申请
router.post('/request', authenticateToken, async (req, res) => {
  try {
    const { friendId } = req.body;
    
    if (!friendId) {
      return res.status(400).json({ error: '参数不完整' });
    }
    
    const userId = parseInt(req.userId);
    const targetId = parseInt(friendId);
    
    if (userId === targetId) {
      return res.status(400).json({ error: '不能添加自己为好友' });
    }
    
    // 检查目标用户是否存在
    const targetUser = await db.get('SELECT * FROM users WHERE id = ?', [targetId]);
    if (!targetUser) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    // 检查是否已经是好友
    const existing = await db.get(
      'SELECT * FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
      [userId, targetId, targetId, userId]
    );
    
    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ error: '你们已经是好友了' });
      } else if (existing.status === 'pending') {
        // 如果是我发的申请
        if (existing.user_id === userId) {
          return res.status(400).json({ error: '好友申请已发送，等待对方确认' });
        } else {
          // 如果对方已经给我发了申请，直接接受
          await db.run(
            'UPDATE friends SET status = ? WHERE id = ?',
            ['accepted', existing.id]
          );
          return res.json({ 
            success: true, 
            message: '你们已成为好友',
            autoAccepted: true 
          });
        }
      }
    }
    
    // 创建好友申请
    await db.run(
      'INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)',
      [userId, targetId, 'pending']
    );
    
    res.json({ 
      success: true, 
      message: '好友申请已发送',
      friend: {
        id: targetUser.id,
        username: targetUser.username,
        nickname: targetUser.nickname,
        avatar: targetUser.avatar
      }
    });
  } catch (error) {
    console.error('[Friends] 发送好友申请失败:', error);
    res.status(500).json({ error: '发送失败' });
  }
});

// 获取好友列表
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.userId);
    
    // 获取所有好友关系
    const friends = await db.all(
      `SELECT 
        f.id as friendship_id,
        f.user_id,
        f.friend_id,
        f.status,
        f.created_at,
        u.id,
        u.username,
        u.nickname,
        u.avatar,
        u.last_login
       FROM friends f
       JOIN users u ON (f.user_id = ? AND f.friend_id = u.id) OR (f.friend_id = ? AND f.user_id = u.id)
       WHERE f.status = 'accepted' AND u.id != ?`,
      [userId, userId, userId]
    );
    
    // 格式化数据（使用在线状态系统的实时数据）
    const formattedFriends = friends.map(f => {
      const onlineStatus = getUserStatus(f.id);
      return {
        friendshipId: f.friendship_id,
        id: f.id,
        username: f.username,
        nickname: f.nickname,
        avatar: f.avatar,
        lastLogin: f.last_login,
        isOnline: onlineStatus.isOnline,
        location: onlineStatus.location,
        locationName: onlineStatus.locationName
      };
    });
    
    res.json({ success: true, friends: formattedFriends });
  } catch (error) {
    console.error('[Friends] 获取好友列表失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 获取好友申请列表
router.get('/requests', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.userId);
    
    // 获取收到的申请
    const received = await db.all(
      `SELECT 
        f.id as request_id,
        f.user_id,
        f.created_at,
        u.username,
        u.nickname,
        u.avatar
       FROM friends f
       JOIN users u ON f.user_id = u.id
       WHERE f.friend_id = ? AND f.status = 'pending'`,
      [userId]
    );
    
    // 获取发送的申请
    const sent = await db.all(
      `SELECT 
        f.id as request_id,
        f.friend_id,
        f.created_at,
        u.username,
        u.nickname,
        u.avatar
       FROM friends f
       JOIN users u ON f.friend_id = u.id
       WHERE f.user_id = ? AND f.status = 'pending'`,
      [userId]
    );
    
    res.json({ 
      success: true, 
      received: received.map(r => ({
        requestId: r.request_id,
        userId: r.user_id,
        username: r.username,
        nickname: r.nickname,
        avatar: r.avatar,
        createdAt: r.created_at
      })),
      sent: sent.map(s => ({
        requestId: s.request_id,
        userId: s.friend_id,
        username: s.username,
        nickname: s.nickname,
        avatar: s.avatar,
        createdAt: s.created_at
      }))
    });
  } catch (error) {
    console.error('[Friends] 获取好友申请失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 接受好友申请
router.post('/accept', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.body;
    const userId = parseInt(req.userId);
    
    // 验证申请是否存在且是发给我的
    const request = await db.get(
      'SELECT * FROM friends WHERE id = ? AND friend_id = ? AND status = ?',
      [requestId, userId, 'pending']
    );
    
    if (!request) {
      return res.status(404).json({ error: '好友申请不存在或已处理' });
    }
    
    // 更新状态
    await db.run(
      'UPDATE friends SET status = ? WHERE id = ?',
      ['accepted', requestId]
    );
    
    // 获取好友信息
    const friend = await db.get(
      'SELECT id, username, nickname, avatar FROM users WHERE id = ?',
      [request.user_id]
    );
    
    res.json({ 
      success: true, 
      message: '已接受好友申请',
      friend
    });
  } catch (error) {
    console.error('[Friends] 接受好友申请失败:', error);
    res.status(500).json({ error: '操作失败' });
  }
});

// 拒绝好友申请
router.post('/reject', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.body;
    const userId = parseInt(req.userId);
    
    // 验证申请是否存在且是发给我的
    const request = await db.get(
      'SELECT * FROM friends WHERE id = ? AND friend_id = ? AND status = ?',
      [requestId, userId, 'pending']
    );
    
    if (!request) {
      return res.status(404).json({ error: '好友申请不存在或已处理' });
    }
    
    // 删除申请记录
    await db.run('DELETE FROM friends WHERE id = ?', [requestId]);
    
    res.json({ success: true, message: '已拒绝好友申请' });
  } catch (error) {
    console.error('[Friends] 拒绝好友申请失败:', error);
    res.status(500).json({ error: '操作失败' });
  }
});

// 删除好友
router.post('/remove', authenticateToken, async (req, res) => {
  try {
    const { friendId } = req.body;
    const userId = parseInt(req.userId);
    
    // 删除双向好友关系
    const result = await db.run(
      `DELETE FROM friends 
       WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
       AND status = 'accepted'`,
      [userId, friendId, friendId, userId]
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ error: '好友关系不存在' });
    }
    
    res.json({ success: true, message: '已删除好友' });
  } catch (error) {
    console.error('[Friends] 删除好友失败:', error);
    res.status(500).json({ error: '操作失败' });
  }
});

// 取消发送的好友申请
router.post('/cancel', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.body;
    const userId = parseInt(req.userId);
    
    // 验证申请是否存在且是我发的
    const request = await db.get(
      'SELECT * FROM friends WHERE id = ? AND user_id = ? AND status = ?',
      [requestId, userId, 'pending']
    );
    
    if (!request) {
      return res.status(404).json({ error: '申请不存在或已处理' });
    }
    
    await db.run('DELETE FROM friends WHERE id = ?', [requestId]);
    
    res.json({ success: true, message: '已取消申请' });
  } catch (error) {
    console.error('[Friends] 取消申请失败:', error);
    res.status(500).json({ error: '操作失败' });
  }
});

module.exports = router;
