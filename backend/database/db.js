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
  
  console.log('数据库初始化完成');
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

module.exports = {
  init,
  run,
  get,
  all,
  getDB
};
