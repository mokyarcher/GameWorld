const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'gameworld.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db = null;

function getDB() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH);
  }
  return db;
}

async function init() {
  const database = getDB();
  
  // 读取并执行 schema.sql
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  
  // 分割 SQL 语句并执行
  const statements = schema.split(';').filter(stmt => stmt.trim());
  
  for (const statement of statements) {
    try {
      await run(statement);
    } catch (err) {
      // 忽略表已存在的错误
      if (!err.message.includes('already exists')) {
        console.error('执行 SQL 失败:', err.message);
      }
    }
  }
  
  // 数据库迁移：添加 is_admin 列（如果不存在）
  await migrateAddAdminColumn();
  
  // 数据库迁移：添加 is_locked 列（如果不存在）
  await migrateAddLockedColumn();
  
  // 初始化地图模块数据库
  await initMapDatabase();
  
  // 初始化反馈模块数据库
  await initFeedbackDatabase();
  
  // 初始化加入我们模块数据库
  await initJoinDatabase();
  
  // 初始化脑力对决模块数据库
  await initBrainBattleDatabase();
  
  console.log('数据库初始化完成');
}

// 迁移：添加 is_admin 列
async function migrateAddAdminColumn() {
  try {
    // 检查列是否存在
    const tableInfo = await all("PRAGMA table_info(users)");
    const hasAdminColumn = tableInfo.some(col => col.name === 'is_admin');
    
    if (!hasAdminColumn) {
      await run('ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0');
      console.log('[DB] 已添加 is_admin 列');
    }
  } catch (err) {
    console.error('[DB] 迁移失败:', err.message);
  }
}

// 迁移：添加 is_locked 列（账号锁定）
async function migrateAddLockedColumn() {
  try {
    // 检查列是否存在
    const tableInfo = await all("PRAGMA table_info(users)");
    const hasLockedColumn = tableInfo.some(col => col.name === 'is_locked');
    
    if (!hasLockedColumn) {
      await run('ALTER TABLE users ADD COLUMN is_locked BOOLEAN DEFAULT 0');
      console.log('[DB] 已添加 is_locked 列');
    }
  } catch (err) {
    console.error('[DB] 迁移失败:', err.message);
  }
}

// 封装 Promise 风格的数据库操作
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    const database = getDB();
    database.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    const database = getDB();
    database.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    const database = getDB();
    database.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// 初始化地图模块数据库
async function initMapDatabase() {
  try {
    const mapSchemaPath = path.join(__dirname, 'map_schema.sql');
    if (fs.existsSync(mapSchemaPath)) {
      const mapSchema = fs.readFileSync(mapSchemaPath, 'utf8');
      const statements = mapSchema.split(';').filter(stmt => stmt.trim());
      
      for (const statement of statements) {
        try {
          await run(statement);
        } catch (err) {
          if (!err.message.includes('already exists')) {
            console.error('[DB] 地图表初始化失败:', err.message);
          }
        }
      }
      console.log('[DB] 地图模块数据库初始化完成');
    }
    
    // 迁移：添加 updated_at 列到 map_pins 表
    await migrateAddUpdatedAtColumn();
    
    // 迁移：添加点赞评论相关列到 map_pins 表
    await migrateAddLikeCommentColumns();
  } catch (err) {
    console.error('[DB] 地图数据库初始化失败:', err.message);
  }
}

// 迁移：添加 updated_at 列到 map_pins 表
async function migrateAddUpdatedAtColumn() {
  try {
    // 检查列是否存在
    const tableInfo = await all("PRAGMA table_info(map_pins)");
    const hasUpdatedAtColumn = tableInfo.some(col => col.name === 'updated_at');
    
    if (!hasUpdatedAtColumn) {
      await run('ALTER TABLE map_pins ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
      console.log('[DB] 已添加 updated_at 列到 map_pins 表');
    }
  } catch (err) {
    console.error('[DB] 迁移失败:', err.message);
  }
}

// 迁移：添加点赞评论相关列到 map_pins 表
async function migrateAddLikeCommentColumns() {
  try {
    const tableInfo = await all("PRAGMA table_info(map_pins)");
    
    // 添加 like_count 列
    const hasLikeCountColumn = tableInfo.some(col => col.name === 'like_count');
    if (!hasLikeCountColumn) {
      await run('ALTER TABLE map_pins ADD COLUMN like_count INTEGER DEFAULT 0');
      console.log('[DB] 已添加 like_count 列到 map_pins 表');
    }
    
    // 添加 comment_count 列
    const hasCommentCountColumn = tableInfo.some(col => col.name === 'comment_count');
    if (!hasCommentCountColumn) {
      await run('ALTER TABLE map_pins ADD COLUMN comment_count INTEGER DEFAULT 0');
      console.log('[DB] 已添加 comment_count 列到 map_pins 表');
    }
  } catch (err) {
    console.error('[DB] 迁移失败:', err.message);
  }
}

// 初始化反馈模块数据库
async function initFeedbackDatabase() {
  try {
    const feedbackSchemaPath = path.join(__dirname, 'feedback_schema.sql');
    if (fs.existsSync(feedbackSchemaPath)) {
      const feedbackSchema = fs.readFileSync(feedbackSchemaPath, 'utf8');
      const statements = feedbackSchema.split(';').filter(stmt => stmt.trim());
      
      for (const statement of statements) {
        try {
          await run(statement);
        } catch (err) {
          if (!err.message.includes('already exists')) {
            console.error('[DB] 反馈表初始化失败:', err.message);
          }
        }
      }
      console.log('[DB] 反馈模块数据库初始化完成');
    }
  } catch (err) {
    console.error('[DB] 反馈数据库初始化失败:', err.message);
  }
}

// 初始化加入我们模块数据库
async function initJoinDatabase() {
  try {
    const joinSchemaPath = path.join(__dirname, 'join_schema.sql');
    if (fs.existsSync(joinSchemaPath)) {
      const joinSchema = fs.readFileSync(joinSchemaPath, 'utf8');
      const statements = joinSchema.split(';').filter(stmt => stmt.trim());
      
      for (const statement of statements) {
        try {
          await run(statement);
        } catch (err) {
          if (!err.message.includes('already exists')) {
            console.error('[DB] 加入我们表初始化失败:', err.message);
          }
        }
      }
      console.log('[DB] 加入我们模块数据库初始化完成');
    }
  } catch (err) {
    console.error('[DB] 加入我们数据库初始化失败:', err.message);
  }
}

// 初始化脑力对决模块数据库
async function initBrainBattleDatabase() {
  try {
    const brainbattleSchemaPath = path.join(__dirname, 'brainbattle_schema.sql');
    if (fs.existsSync(brainbattleSchemaPath)) {
      const brainbattleSchema = fs.readFileSync(brainbattleSchemaPath, 'utf8');
      const statements = brainbattleSchema.split(';').filter(stmt => stmt.trim());
      
      for (const statement of statements) {
        try {
          await run(statement);
        } catch (err) {
          // 忽略表已存在和重复数据的错误
          if (!err.message.includes('already exists') && !err.message.includes('UNIQUE constraint failed')) {
            console.error('[DB] 脑力对决表初始化失败:', err.message);
          }
        }
      }
      console.log('[DB] 脑力对决模块数据库初始化完成');
    }
  } catch (err) {
    console.error('[DB] 脑力对决数据库初始化失败:', err.message);
  }
}

module.exports = {
  init,
  run,
  get,
  all,
  getDB
};
