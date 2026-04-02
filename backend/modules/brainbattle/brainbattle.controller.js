/**
 * 脑力对决 - 控制器
 * 处理题库查询、对战匹配、答题记录等
 */

const express = require('express');
const router = express.Router();
const db = require('../../database/db');

/**
 * 获取随机题目
 * GET /api/brainbattle/questions?count=5&difficulty=1
 */
router.get('/questions', async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 5;
    const difficulty = req.query.difficulty;
    
    let sql = `
      SELECT id, type, difficulty, question, options, answer, explanation, tags
      FROM brainbattle_questions
      WHERE is_active = 1
    `;
    const params = [];
    
    if (difficulty) {
      sql += ' AND difficulty = ?';
      params.push(difficulty);
    }
    
    sql += ' ORDER BY RANDOM() LIMIT ?';
    params.push(count);
    
    const questions = await db.all(sql, params);
    
    // 解析 options JSON
    const parsedQuestions = questions.map(q => ({
      ...q,
      options: JSON.parse(q.options)
    }));
    
    res.json({
      success: true,
      data: parsedQuestions
    });
  } catch (err) {
    console.error('[BrainBattle] 获取题目失败:', err);
    res.status(500).json({
      success: false,
      message: '获取题目失败'
    });
  }
});

/**
 * 获取题目类型列表
 * GET /api/brainbattle/types
 */
router.get('/types', async (req, res) => {
  try {
    const types = await db.all(`
      SELECT DISTINCT type, COUNT(*) as count
      FROM brainbattle_questions
      WHERE is_active = 1
      GROUP BY type
    `);
    
    res.json({
      success: true,
      data: types
    });
  } catch (err) {
    console.error('[BrainBattle] 获取题型失败:', err);
    res.status(500).json({
      success: false,
      message: '获取题型失败'
    });
  }
});

/**
 * 创建对战房间
 * POST /api/brainbattle/room
 * Body: { player_id, mode: 'quick'|'friend'|'ranked' }
 */
router.post('/room', async (req, res) => {
  try {
    const { player_id, mode = 'quick' } = req.body;
    
    if (!player_id) {
      return res.status(400).json({
        success: false,
        message: '缺少玩家ID'
      });
    }
    
    // 生成房间ID
    const roomId = `bb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    // 获取随机题目
    const questions = await db.all(`
      SELECT id FROM brainbattle_questions
      WHERE is_active = 1
      ORDER BY RANDOM() LIMIT 5
    `);
    
    const questionIds = JSON.stringify(questions.map(q => q.id));
    
    // 创建房间记录
    await db.run(`
      INSERT INTO brainbattle_games (room_id, player1_id, questions, status)
      VALUES (?, ?, ?, 'waiting')
    `, [roomId, player_id, questionIds]);
    
    res.json({
      success: true,
      data: {
        room_id: roomId,
        mode,
        status: 'waiting'
      }
    });
  } catch (err) {
    console.error('[BrainBattle] 创建房间失败:', err);
    res.status(500).json({
      success: false,
      message: '创建房间失败'
    });
  }
});

/**
 * 获取房间信息
 * GET /api/brainbattle/room/:roomId
 */
router.get('/room/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    
    const game = await db.get(`
      SELECT g.*, 
        u1.username as player1_name,
        u2.username as player2_name
      FROM brainbattle_games g
      LEFT JOIN users u1 ON g.player1_id = u1.id
      LEFT JOIN users u2 ON g.player2_id = u2.id
      WHERE g.room_id = ?
    `, [roomId]);
    
    if (!game) {
      return res.status(404).json({
        success: false,
        message: '房间不存在'
      });
    }
    
    // 获取题目详情
    const questionIds = JSON.parse(game.questions || '[]');
    let questions = [];
    
    if (questionIds.length > 0) {
      const placeholders = questionIds.map(() => '?').join(',');
      questions = await db.all(`
        SELECT id, type, question, options, answer, explanation
        FROM brainbattle_questions
        WHERE id IN (${placeholders})
      `, questionIds);
      
      // 按原始顺序排序并解析options
      const questionMap = new Map(questions.map(q => [q.id, q]));
      questions = questionIds
        .map(id => questionMap.get(id))
        .filter(Boolean)
        .map(q => ({
          ...q,
          options: JSON.parse(q.options)
        }));
    }
    
    res.json({
      success: true,
      data: {
        ...game,
        questions
      }
    });
  } catch (err) {
    console.error('[BrainBattle] 获取房间信息失败:', err);
    res.status(500).json({
      success: false,
      message: '获取房间信息失败'
    });
  }
});

/**
 * 加入房间
 * POST /api/brainbattle/room/:roomId/join
 * Body: { player_id }
 */
router.post('/room/:roomId/join', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { player_id } = req.body;
    
    if (!player_id) {
      return res.status(400).json({
        success: false,
        message: '缺少玩家ID'
      });
    }
    
    const game = await db.get(`
      SELECT * FROM brainbattle_games WHERE room_id = ?
    `, [roomId]);
    
    if (!game) {
      return res.status(404).json({
        success: false,
        message: '房间不存在'
      });
    }
    
    if (game.status !== 'waiting') {
      return res.status(400).json({
        success: false,
        message: '房间已满或游戏已开始'
      });
    }
    
    if (game.player1_id === player_id) {
      return res.status(400).json({
        success: false,
        message: '不能加入自己创建的房间'
      });
    }
    
    // 更新房间状态
    await db.run(`
      UPDATE brainbattle_games
      SET player2_id = ?, status = 'playing'
      WHERE room_id = ?
    `, [player_id, roomId]);
    
    res.json({
      success: true,
      message: '加入成功'
    });
  } catch (err) {
    console.error('[BrainBattle] 加入房间失败:', err);
    res.status(500).json({
      success: false,
      message: '加入房间失败'
    });
  }
});

/**
 * 提交答案
 * POST /api/brainbattle/answer
 * Body: { room_id, user_id, question_id, round, answer, answer_time }
 */
router.post('/answer', async (req, res) => {
  try {
    const { room_id, user_id, question_id, round, answer, answer_time } = req.body;
    
    if (!room_id || !user_id || !question_id || round === undefined) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      });
    }
    
    // 获取正确答案
    const question = await db.get(`
      SELECT answer as correct_answer FROM brainbattle_questions WHERE id = ?
    `, [question_id]);
    
    if (!question) {
      return res.status(404).json({
        success: false,
        message: '题目不存在'
      });
    }
    
    const isCorrect = answer === question.correct_answer;
    
    // 计算得分（基础分 + 速度奖励）
    let score = 0;
    if (isCorrect) {
      score = 15;
      if (answer_time < 3000) score += 5; // 3秒内答对加5分
    }
    
    // 检查房间是否存在，不存在则创建
    let game = await db.get('SELECT id FROM brainbattle_games WHERE room_id = ?', [room_id]);
    
    if (!game) {
      // 创建临时房间
      const result = await db.run(`
        INSERT INTO brainbattle_games (room_id, player1_id, status)
        VALUES (?, ?, 'playing')
      `, [room_id, user_id]);
      game = { id: result.id };
    }
    
    // 保存答题记录
    await db.run(`
      INSERT INTO brainbattle_answers 
      (game_id, user_id, question_id, round, answer, is_correct, answer_time, score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [game.id, user_id, question_id, round, answer, isCorrect, answer_time, score]);
    
    res.json({
      success: true,
      data: {
        is_correct: isCorrect,
        correct_answer: question.correct_answer,
        score
      }
    });
  } catch (err) {
    console.error('[BrainBattle] 提交答案失败:', err);
    res.status(500).json({
      success: false,
      message: '提交答案失败'
    });
  }
});

/**
 * 结束游戏
 * POST /api/brainbattle/room/:roomId/finish
 * Body: { user_id }
 */
router.post('/room/:roomId/finish', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { user_id } = req.body;
    
    // 获取游戏信息
    const game = await db.get(`
      SELECT * FROM brainbattle_games WHERE room_id = ?
    `, [roomId]);
    
    if (!game) {
      return res.status(404).json({
        success: false,
        message: '房间不存在'
      });
    }
    
    // 计算双方总分
    const scores = await db.all(`
      SELECT user_id, SUM(score) as total_score
      FROM brainbattle_answers
      WHERE game_id = ?
      GROUP BY user_id
    `, [game.id]);
    
    const scoreMap = new Map(scores.map(s => [s.user_id, s.total_score]));
    const p1Score = scoreMap.get(game.player1_id) || 0;
    const p2Score = scoreMap.get(game.player2_id) || 0;
    
    // 判断胜者
    let winnerId = null;
    if (p1Score > p2Score) winnerId = game.player1_id;
    else if (p2Score > p1Score) winnerId = game.player2_id;
    
    // 更新游戏状态
    await db.run(`
      UPDATE brainbattle_games
      SET status = 'finished',
          winner_id = ?,
          player1_score = ?,
          player2_score = ?,
          finished_at = datetime('now')
      WHERE room_id = ?
    `, [winnerId, p1Score, p2Score, roomId]);
    
    res.json({
      success: true,
      data: {
        player1_score: p1Score,
        player2_score: p2Score,
        winner_id: winnerId,
        is_draw: winnerId === null
      }
    });
  } catch (err) {
    console.error('[BrainBattle] 结束游戏失败:', err);
    res.status(500).json({
      success: false,
      message: '结束游戏失败'
    });
  }
});

/**
 * 获取用户对战历史
 * GET /api/brainbattle/history/:userId
 */
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    
    const history = await db.all(`
      SELECT g.*,
        u1.username as player1_name,
        u2.username as player2_name,
        uw.username as winner_name
      FROM brainbattle_games g
      LEFT JOIN users u1 ON g.player1_id = u1.id
      LEFT JOIN users u2 ON g.player2_id = u2.id
      LEFT JOIN users uw ON g.winner_id = uw.id
      WHERE (g.player1_id = ? OR g.player2_id = ?) AND g.status = 'finished'
      ORDER BY g.finished_at DESC
      LIMIT ?
    `, [userId, userId, limit]);
    
    res.json({
      success: true,
      data: history
    });
  } catch (err) {
    console.error('[BrainBattle] 获取历史记录失败:', err);
    res.status(500).json({
      success: false,
      message: '获取历史记录失败'
    });
  }
});

module.exports = router;
