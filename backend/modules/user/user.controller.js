const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../../database/db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'gameworld-secret-key-2024';

// 注册
router.post('/register', async (req, res) => {
  try {
    const { username, password, nickname } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    
    // 检查用户名是否已存在
    const existingUser = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (existingUser) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    
    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 创建用户
    const result = await db.run(
      'INSERT INTO users (username, password, nickname, chips) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, nickname || username, 200000]
    );
    
    // 记录初始筹码
    await db.run(
      'INSERT INTO chips_transactions (user_id, amount, type, description) VALUES (?, ?, ?, ?)',
      [result.id, 200000, 'initial', '注册赠送积分']
    );
    
    res.json({ 
      success: true, 
      message: '注册成功',
      userId: result.id
    });
  } catch (error) {
    console.error('注册失败:', error);
    res.status(500).json({ error: '注册失败' });
  }
});

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    
    // 查找用户
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(400).json({ error: '用户名或密码错误' });
    }
    
    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: '用户名或密码错误' });
    }
    
    // 检查账号是否被锁定
    if (user.is_locked === 1) {
      return res.status(403).json({ error: '账号已被冻结，请联系管理员' });
    }
    
    // 更新最后登录时间
    await db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    
    // 生成 JWT
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        chips: user.chips
      }
    });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ error: '登录失败' });
  }
});

// 游客登录
router.post('/guest', async (req, res) => {
  try {
    const guestId = uuidv4().substring(0, 8);
    const username = `游客${guestId}`;
    
    // 创建游客用户
    const result = await db.run(
      'INSERT INTO users (username, password, nickname, chips, is_guest) VALUES (?, ?, ?, ?, ?)',
      [username, null, username, 200000, 1]
    );
    
    // 记录初始筹码
    await db.run(
      'INSERT INTO chips_transactions (user_id, amount, type, description) VALUES (?, ?, ?, ?)',
      [result.id, 200000, 'initial', '游客初始积分']
    );
    
    // 生成 JWT
    const token = jwt.sign(
      { userId: result.id, username: username },
      JWT_SECRET,
      { expiresIn: '1d' }
    );
    
    res.json({
      success: true,
      token,
      user: {
        id: result.id,
        username: username,
        nickname: username,
        avatar: 'default.png',
        chips: 200000,
        isGuest: true
      }
    });
  } catch (error) {
    console.error('游客登录失败:', error);
    res.status(500).json({ error: '游客登录失败' });
  }
});

// 获取用户信息
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await db.get(
      'SELECT id, username, nickname, avatar, chips, is_guest, created_at FROM users WHERE id = ?',
      [req.userId]
    );
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        chips: user.chips,
        isGuest: user.is_guest === 1
      }
    });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 更新用户信息
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { nickname, avatar } = req.body;
    
    await db.run(
      'UPDATE users SET nickname = COALESCE(?, nickname), avatar = COALESCE(?, avatar) WHERE id = ?',
      [nickname, avatar, req.userId]
    );
    
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    console.error('更新用户信息失败:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

// 获取积分流水
router.get('/chips-history', authenticateToken, async (req, res) => {
  try {
    const transactions = await db.all(
      'SELECT * FROM chips_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.userId]
    );
    
    res.json({ success: true, transactions });
  } catch (error) {
    console.error('获取积分流水失败:', error);
    res.status(500).json({ error: '获取筹码流水失败' });
  }
});

// 修改密码
router.put('/password', authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    
    // 验证参数
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '请提供当前密码和新密码' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少需要6位' });
    }
    
    // 获取用户当前密码
    const user = await db.get('SELECT password FROM users WHERE id = ?', [req.userId]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    // 验证当前密码
    const isValidPassword = await bcrypt.compare(oldPassword, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: '当前密码错误' });
    }
    
    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // 更新密码
    await db.run(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, req.userId]
    );
    
    console.log(`[用户] ${req.username} 修改了密码`);
    res.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    console.error('修改密码失败:', error);
    res.status(500).json({ error: '修改密码失败' });
  }
});

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

module.exports = router;
