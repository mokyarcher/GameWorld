const express = require('express');
const db = require('../../database/db');

const router = express.Router();

// 获取游戏列表
router.get('/games', async (req, res) => {
  try {
    const games = await db.all(
      'SELECT * FROM games WHERE is_active = 1 ORDER BY sort_order'
    );
    
    res.json({ success: true, games });
  } catch (error) {
    console.error('获取游戏列表失败:', error);
    res.status(500).json({ error: '获取游戏列表失败' });
  }
});

// 获取在线人数（模拟数据）
router.get('/online-count', async (req, res) => {
  try {
    // 这里可以接入真实的在线统计
    // 暂时返回模拟数据
    const onlineCount = {
      total: Math.floor(Math.random() * 500) + 100,
      poker: Math.floor(Math.random() * 200) + 50
    };
    
    res.json({ success: true, onlineCount });
  } catch (error) {
    console.error('获取在线人数失败:', error);
    res.status(500).json({ error: '获取在线人数失败' });
  }
});

// 获取排行榜
router.get('/leaderboard', async (req, res) => {
  try {
    const { type = 'chips', limit = 10 } = req.query;
    
    let users;
    if (type === 'chips') {
      users = await db.all(
        'SELECT id, username, nickname, avatar, chips FROM users WHERE is_guest = 0 ORDER BY chips DESC LIMIT ?',
        [parseInt(limit)]
      );
    } else {
      users = await db.all(
        'SELECT id, username, nickname, avatar, chips FROM users WHERE is_guest = 0 ORDER BY created_at ASC LIMIT ?',
        [parseInt(limit)]
      );
    }
    
    res.json({ success: true, leaderboard: users });
  } catch (error) {
    console.error('获取排行榜失败:', error);
    res.status(500).json({ error: '获取排行榜失败' });
  }
});

// 获取系统公告
router.get('/announcements', async (req, res) => {
  try {
    // 暂时返回静态公告，后续可以接入数据库
    const announcements = [
      {
        id: 1,
        title: '欢迎来到 ShareX！   分享无限',
        content: 'ShareX 是一个分享平台，支持游戏、工具和其他有趣的内容。更多功能即将上线！',
        created_at: new Date().toISOString()
      },  
      {
        id: 2,
        title: '新手福利',
        content: '新注册用户可获得 1000 筹码初始资金！',
        created_at: new Date().toISOString()
      }
    ];
    
    res.json({ success: true, announcements });
  } catch (error) {
    console.error('获取公告失败:', error);
    res.status(500).json({ error: '获取公告失败' });
  }
});

module.exports = router;
