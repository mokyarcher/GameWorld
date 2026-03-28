#!/bin/bash
# 服务器端修复脚本 - 在服务器上执行

PROJECT_DIR="/opt/game/GameWorld"

echo "=== 修复 GameWorld 部署 ==="

cd $PROJECT_DIR/backend

# 1. 创建日志目录
mkdir -p logs

# 2. 创建 PM2 配置文件
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'gameworld',
    script: './core/server.js',
    cwd: '/opt/game/GameWorld/backend',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 5555
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
EOF

# 3. 初始化数据库
echo "初始化数据库..."
sqlite3 database/gameworld.db < database/schema.sql

# 4. 启动服务
echo "启动服务..."
pm2 start ecosystem.config.js

# 5. 保存配置
pm2 save

echo ""
echo "=== 完成 ==="
pm2 status
