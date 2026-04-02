/**
 * 脑力对决 - 管理员控制器
 * 题目增删改查、批量导入
 */

const express = require('express');
const router = express.Router();
const db = require('../../database/db');

/**
 * 获取所有题目（管理员）
 * GET /api/brainbattle/admin/questions
 */
router.get('/questions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    
    const questions = await db.all(`
      SELECT * FROM brainbattle_questions
      ORDER BY id DESC
      LIMIT ?
    `, [limit]);
    
    res.json({
      success: true,
      data: questions
    });
  } catch (err) {
    console.error('[BrainBattle Admin] 获取题目失败:', err);
    res.status(500).json({
      success: false,
      message: '获取题目失败'
    });
  }
});

/**
 * 获取重复题目列表（仅管理员）- 必须放在 /:id 路由之前
 * GET /api/brainbattle/admin/questions/duplicates
 */
router.get('/questions/duplicates', async (req, res) => {
  try {
    const duplicates = await db.all(`
      SELECT question, type, COUNT(*) as count, GROUP_CONCAT(id) as ids
      FROM brainbattle_questions
      GROUP BY question, type
      HAVING count > 1
      ORDER BY count DESC
    `);
    
    res.json({
      success: true,
      data: duplicates,
      total: duplicates.length
    });
  } catch (err) {
    console.error('[BrainBattle Admin] 获取重复题目失败:', err);
    res.status(500).json({
      success: false,
      message: '获取失败'
    });
  }
});

/**
 * 获取单个题目
 * GET /api/brainbattle/admin/questions/:id
 */
router.get('/questions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const question = await db.get(`
      SELECT * FROM brainbattle_questions WHERE id = ?
    `, [id]);
    
    if (!question) {
      return res.status(404).json({
        success: false,
        message: '题目不存在'
      });
    }
    
    res.json({
      success: true,
      data: question
    });
  } catch (err) {
    console.error('[BrainBattle Admin] 获取题目失败:', err);
    res.status(500).json({
      success: false,
      message: '获取题目失败'
    });
  }
});

/**
 * 添加题目
 * POST /api/brainbattle/admin/questions
 */
router.post('/questions', async (req, res) => {
  try {
    const { type, difficulty, question, options, answer, explanation, tags } = req.body;
    
    if (!type || !question || !options || answer === undefined) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      });
    }
    
    // 检查是否存在完全相同的题目（去重）
    const existingQuestion = await db.get(
      'SELECT id FROM brainbattle_questions WHERE question = ? AND type = ?',
      [question, type]
    );
    
    if (existingQuestion) {
      return res.status(400).json({
        success: false,
        message: '该题目已存在（ID: ' + existingQuestion.id + '），请不要重复添加'
      });
    }
    
    const result = await db.run(`
      INSERT INTO brainbattle_questions 
      (type, difficulty, question, options, answer, explanation, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [type, difficulty || 1, question, options, answer, explanation || '', tags || '']);
    
    res.json({
      success: true,
      message: '添加成功',
      id: result.id
    });
  } catch (err) {
    console.error('[BrainBattle Admin] 添加题目失败:', err);
    res.status(500).json({
      success: false,
      message: '添加题目失败'
    });
  }
});

/**
 * 更新题目
 * PUT /api/brainbattle/admin/questions/:id
 */
router.put('/questions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, difficulty, question, options, answer, explanation, tags } = req.body;
    
    if (!type || !question || !options || answer === undefined) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      });
    }
    
    await db.run(`
      UPDATE brainbattle_questions
      SET type = ?, difficulty = ?, question = ?, options = ?, 
          answer = ?, explanation = ?, tags = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [type, difficulty || 1, question, options, answer, explanation || '', tags || '', id]);
    
    res.json({
      success: true,
      message: '更新成功'
    });
  } catch (err) {
    console.error('[BrainBattle Admin] 更新题目失败:', err);
    res.status(500).json({
      success: false,
      message: '更新题目失败'
    });
  }
});

/**
 * 删除题目
 * DELETE /api/brainbattle/admin/questions/:id
 */
router.delete('/questions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.run(`
      DELETE FROM brainbattle_questions WHERE id = ?
    `, [id]);
    
    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (err) {
    console.error('[BrainBattle Admin] 删除题目失败:', err);
    res.status(500).json({
      success: false,
      message: '删除题目失败'
    });
  }
});

/**
 * 批量导入题目
 * POST /api/brainbattle/admin/questions/batch
 */
router.post('/questions/batch', async (req, res) => {
  try {
    const { questions } = req.body;
    
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供题目数组'
      });
    }
    
    let successCount = 0;
    let duplicateCount = 0;
    
    for (const q of questions) {
      try {
        // 检查是否存在相同题目（去重）
        const existingQuestion = await db.get(
          'SELECT id FROM brainbattle_questions WHERE question = ? AND type = ?',
          [q.question, q.type || '知识题']
        );
        
        if (existingQuestion) {
          duplicateCount++;
          continue; // 跳过重复题目
        }
        
        await db.run(`
          INSERT INTO brainbattle_questions 
          (type, difficulty, question, options, answer, explanation, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          q.type || '知识题',
          q.difficulty || 1,
          q.question,
          JSON.stringify(q.options),
          q.answer,
          q.explanation || '',
          q.tags || ''
        ]);
        successCount++;
      } catch (e) {
        console.error('[BrainBattle Admin] 导入单题失败:', e);
      }
    }
    
    res.json({
      success: true,
      message: `成功导入 ${successCount} 道题${duplicateCount > 0 ? `，跳过 ${duplicateCount} 道重复题目` : ''}`,
      count: successCount,
      duplicateCount: duplicateCount
    });
  } catch (err) {
    console.error('[BrainBattle Admin] 批量导入失败:', err);
    res.status(500).json({
      success: false,
      message: '批量导入失败'
    });
  }
});

/**
 * 清理重复题目（仅管理员）
 * POST /api/brainbattle/admin/questions/deduplicate
 */
router.post('/questions/deduplicate', async (req, res) => {
  try {
    // 查找重复的题目（相同question和type）
    const duplicates = await db.all(`
      SELECT question, type, COUNT(*) as count, MIN(id) as keep_id
      FROM brainbattle_questions
      GROUP BY question, type
      HAVING count > 1
    `);
    
    let deletedCount = 0;
    
    for (const dup of duplicates) {
      // 保留ID最小的，删除其他的
      const result = await db.run(`
        DELETE FROM brainbattle_questions
        WHERE question = ? AND type = ? AND id != ?
      `, [dup.question, dup.type, dup.keep_id]);
      
      deletedCount += result.changes || 0;
    }
    
    res.json({
      success: true,
      message: `清理完成，删除了 ${deletedCount} 道重复题目`,
      deletedCount,
      duplicateGroups: duplicates.length
    });
  } catch (err) {
    console.error('[BrainBattle Admin] 清理重复题目失败:', err);
    res.status(500).json({
      success: false,
      message: '清理失败'
    });
  }
});

module.exports = router;
