/**
 * 数据库迁移脚本：添加脑力对决统计字段到 users 表
 * 运行：node migrate_brainbattle_stats.js
 */

const db = require('./db');

async function migrate() {
  console.log('[Migrate] 开始添加脑力对决统计字段...');
  
  try {
    // 检查并添加 brain_total 字段
    try {
      await db.run(`ALTER TABLE users ADD COLUMN brain_total INTEGER DEFAULT 0`);
      console.log('[Migrate] ✓ 添加字段: brain_total');
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        console.log('[Migrate] ⚠ 字段已存在: brain_total');
      } else {
        throw e;
      }
    }
    
    // 检查并添加 brain_wins 字段
    try {
      await db.run(`ALTER TABLE users ADD COLUMN brain_wins INTEGER DEFAULT 0`);
      console.log('[Migrate] ✓ 添加字段: brain_wins');
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        console.log('[Migrate] ⚠ 字段已存在: brain_wins');
      } else {
        throw e;
      }
    }
    
    // 检查并添加 brain_streak 字段
    try {
      await db.run(`ALTER TABLE users ADD COLUMN brain_streak INTEGER DEFAULT 0`);
      console.log('[Migrate] ✓ 添加字段: brain_streak');
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        console.log('[Migrate] ⚠ 字段已存在: brain_streak');
      } else {
        throw e;
      }
    }
    
    // 检查并添加 brain_rating 字段
    try {
      await db.run(`ALTER TABLE users ADD COLUMN brain_rating INTEGER DEFAULT 500`);
      console.log('[Migrate] ✓ 添加字段: brain_rating');
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        console.log('[Migrate] ⚠ 字段已存在: brain_rating');
      } else {
        throw e;
      }
    }
    
    // 检查并添加 brain_max_rating 字段
    try {
      await db.run(`ALTER TABLE users ADD COLUMN brain_max_rating INTEGER DEFAULT 500`);
      console.log('[Migrate] ✓ 添加字段: brain_max_rating');
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        console.log('[Migrate] ⚠ 字段已存在: brain_max_rating');
      } else {
        throw e;
      }
    }
    
    console.log('[Migrate] ✓ 迁移完成！');
    process.exit(0);
  } catch (err) {
    console.error('[Migrate] ✗ 迁移失败:', err);
    process.exit(1);
  }
}

migrate();
