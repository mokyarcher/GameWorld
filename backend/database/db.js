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
  } catch (err) {
    console.error('[DB] 地图数据库初始化失败:', err.message);
  }
}

module.exports = {
  init,
  run,
  get,
  all,
  getDB
};
