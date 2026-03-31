const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../database/db');
const { getUserStatus } = require('../online/online.controller');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'gameworld-secret-key-2024';

// 管理员用户名（写死）
const ADMIN_USERNAME = 'mokyarcher';

// 初始化管理员账户
async function initAdminAccount() {
  try {
    // 检查管理员账户是否存在
    const admin = await db.get('SELECT * FROM users WHERE username = ?', [ADMIN_USERNAME]);
    
    if (!admin) {
      // 创建管理员账户，默认密码与用户名相同
      const hashedPassword = await bcrypt.hash(ADMIN_USERNAME, 10);
      await db.run(
        'INSERT INTO users (username, password, nickname, chips, is_admin) VALUES (?, ?, ?, ?, ?)',
        [ADMIN_USERNAME, hashedPassword, '管理员', 999999999, 1]
      );
      console.log(`[Admin] 管理员账户 ${ADMIN_USERNAME} 已创建`);
    } else if (!admin.is_admin) {
      // 如果存在但不是管理员，提升为管理员
      await db.run('UPDATE users SET is_admin = 1 WHERE username = ?', [ADMIN_USERNAME]);
      console.log(`[Admin] 用户 ${ADMIN_USERNAME} 已提升为管理员`);
    } else {
      console.log(`[Admin] 管理员账户 ${ADMIN_USERNAME} 已存在`);
    }
  } catch (error) {
    console.error('[Admin] 初始化管理员账户失败:', error);
  }
}

// 检查是否为管理员
function isAdmin(username) {
  return username === ADMIN_USERNAME;
}

// 管理员认证中间件
async function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // 验证是否为管理员
    if (!isAdmin(decoded.username)) {
      return res.status(403).json({ error: '无管理员权限' });
    }
    
    req.userId = decoded.userId;
    req.username = decoded.username;
    next();
  } catch (err) {
    return res.status(403).json({ error: '令牌无效或已过期' });
  }
}

// 获取所有用户列表（管理员）
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const users = await db.all(
      'SELECT id, username, nickname, avatar, chips, is_guest, is_admin, is_locked, created_at, last_login FROM users ORDER BY id DESC'
    );
    
    res.json({
      success: true,
      users: users.map(user => {
        const status = getUserStatus(user.id);
        return {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          avatar: user.avatar,
          chips: user.chips,
          isGuest: user.is_guest === 1,
          isAdmin: user.is_admin === 1,
          isLocked: user.is_locked === 1,
          isOnline: status.isOnline,
          location: status.locationName,
          createdAt: user.created_at,
          lastLogin: user.last_login
        };
      })
    });
  } catch (error) {
    console.error('[Admin] 获取用户列表失败:', error);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 修改用户积分（管理员）
router.post('/chips', authenticateAdmin, async (req, res) => {
  try {
    const { userId, amount, operation, reason } = req.body;
    
    if (!userId || amount === undefined || !operation) {
      return res.status(400).json({ error: '参数不完整' });
    }
    
    // 验证操作类型
    if (!['add', 'subtract', 'set'].includes(operation)) {
      return res.status(400).json({ error: '无效的操作类型' });
    }
    
    // 获取用户信息
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    // 不能修改其他管理员
    if (user.is_admin && user.username !== ADMIN_USERNAME) {
      return res.status(403).json({ error: '不能修改其他管理员账户' });
    }
    
    let newChips = user.chips;
    let changeAmount = 0;
    
    switch (operation) {
      case 'add':
        changeAmount = parseInt(amount);
        newChips = user.chips + changeAmount;
        break;
      case 'subtract':
        changeAmount = -parseInt(amount);
        newChips = Math.max(0, user.chips - parseInt(amount));
        changeAmount = newChips - user.chips; // 实际扣除的金额
        break;
      case 'set':
        newChips = parseInt(amount);
        changeAmount = newChips - user.chips;
        break;
    }
    
    // 更新用户积分
    await db.run('UPDATE users SET chips = ? WHERE id = ?', [newChips, userId]);
    
    // 记录积分流水
    const operationText = { add: '增加', subtract: '减少', set: '设置为' }[operation];
    await db.run(
      'INSERT INTO chips_transactions (user_id, amount, type, description) VALUES (?, ?, ?, ?)',
      [userId, changeAmount, 'admin_adjust', `管理员${operationText}积分: ${reason || '无备注'}`]
    );
    
    res.json({
      success: true,
      message: `已将 ${user.nickname || user.username} 的积分${operationText} ${Math.abs(changeAmount)}`,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        chips: newChips
      }
    });
  } catch (error) {
    console.error('[Admin] 修改积分失败:', error);
    res.status(500).json({ error: '修改筹码失败' });
  }
});

// 获取积分流水（管理员可查看任意用户）
router.get('/chips-history/:userId', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const transactions = await db.all(
      'SELECT * FROM chips_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
      [userId]
    );
    
    res.json({ success: true, transactions });
  } catch (error) {
    console.error('[Admin] 获取积分流水失败:', error);
    res.status(500).json({ error: '获取筹码流水失败' });
  }
});

// 锁定/解锁用户账号（管理员）
router.post('/lock', authenticateAdmin, async (req, res) => {
  try {
    const { userId, isLocked } = req.body;
    
    if (!userId || isLocked === undefined) {
      return res.status(400).json({ error: '参数不完整' });
    }
    
    // 获取用户信息
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    // 不能锁定其他管理员
    if (user.is_admin && user.username !== ADMIN_USERNAME) {
      return res.status(403).json({ error: '不能操作其他管理员账户' });
    }
    
    // 更新锁定状态
    await db.run('UPDATE users SET is_locked = ? WHERE id = ?', [isLocked ? 1 : 0, userId]);
    
    const actionText = isLocked ? '锁定' : '解锁';
    res.json({
      success: true,
      message: `已将 ${user.nickname || user.username} ${actionText}`
    });
  } catch (error) {
    console.error('[Admin] 锁定/解锁用户失败:', error);
    res.status(500).json({ error: '操作失败' });
  }
});

// 删除用户账号（管理员）
router.delete('/users/:userId', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: '参数不完整' });
    }
    
    // 获取用户信息
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    // 不能删除管理员账号
    if (user.is_admin) {
      return res.status(403).json({ error: '不能删除管理员账户' });
    }
    
    // 删除用户相关数据（使用事务）
    await db.run('BEGIN TRANSACTION');
    
    try {
      // 删除积分流水记录
      await db.run('DELETE FROM chips_transactions WHERE user_id = ?', [userId]);
      
      // 删除好友关系
      await db.run('DELETE FROM friends WHERE user_id = ? OR friend_id = ?', [userId, userId]);
      
      // 删除足迹地图数据
      await db.run('DELETE FROM map_pins WHERE user_id = ?', [userId]);
      
      // 删除用户账号
      await db.run('DELETE FROM users WHERE id = ?', [userId]);
      
      await db.run('COMMIT');
      
      res.json({
        success: true,
        message: `用户 ${user.nickname || user.username} 及其所有数据已删除`
      });
    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
    }
  } catch (error) {
    console.error('[Admin] 删除用户失败:', error);
    res.status(500).json({ error: '删除用户失败' });
  }
});

// 检查当前用户是否为管理员
router.get('/check', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.json({ isAdmin: false });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const isAdminUser = isAdmin(decoded.username);
    
    res.json({ isAdmin: isAdminUser });
  } catch (err) {
    res.json({ isAdmin: false });
  }
});

module.exports = { router, initAdminAccount };
