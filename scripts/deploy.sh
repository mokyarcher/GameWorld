#!/bin/bash

# GameWorld 部署脚本
# 用法: ./deploy.sh 你的服务器IP

SERVER_IP=${1:-"你的服务器IP"}
PROJECT_DIR="/opt/game/GameWorld"
LOCAL_PROJECT="/c/Users/Moky/myproject/GameWorld"

echo "=== GameWorld 部署 ==="
echo "目标服务器: $SERVER_IP"
echo ""

# 1. 进入项目目录
cd "$LOCAL_PROJECT" || exit 1

# 2. 确保代码已提交
echo "[1/5] 检查代码状态..."
if [ -n "$(git status --porcelain)" ]; then
    echo "警告: 有未提交的更改，请先提交"
    git status
    exit 1
fi

# 3. 打包项目
echo "[2/5] 打包项目..."
git archive --format=tar.gz -o /tmp/gameworld-deploy.tar.gz HEAD
if [ $? -ne 0 ]; then
    echo "打包失败"
    exit 1
fi
echo "打包完成: /tmp/gameworld-deploy.tar.gz"

# 4. 上传到服务器
echo "[3/5] 上传到服务器..."
scp /tmp/gameworld-deploy.tar.gz root@$SERVER_IP:/tmp/
if [ $? -ne 0 ]; then
    echo "上传失败，请检查服务器IP和SSH连接"
    exit 1
fi
echo "上传完成"

# 5. 服务器端部署
echo "[4/5] 服务器端部署..."
ssh root@$SERVER_IP << REMOTE
    set -e
    
    echo "  -> 创建目录..."
    mkdir -p $PROJECT_DIR
    rm -rf $PROJECT_DIR/*
    
    echo "  -> 解压项目..."
    tar -xzf /tmp/gameworld-deploy.tar.gz -C $PROJECT_DIR
    
    echo "  -> 安装依赖..."
    cd $PROJECT_DIR/backend
    npm install --production
    
    echo "  -> 初始化数据库..."
    mkdir -p database logs
    sqlite3 database/gameworld.db < database/schema.sql
    
    echo "  -> 创建 PM2 配置..."
    cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'gameworld',
    script: './core/server.js',
    cwd: '$PROJECT_DIR/backend',
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
    
    echo "  -> 启动服务..."
    pm2 restart gameworld 2>/dev/null || pm2 start ecosystem.config.js
    pm2 save
    
    echo "  -> 清理临时文件..."
    rm -f /tmp/gameworld-deploy.tar.gz
    
    echo "  -> 部署完成!"
REMOTE

if [ $? -ne 0 ]; then
    echo "服务器部署失败"
    exit 1
fi

# 6. 完成
echo ""
echo "[5/5] 部署成功!"
echo "访问地址: http://$SERVER_IP:5555"
echo ""
echo "常用命令:"
echo "  查看日志: ssh root@$SERVER_IP 'pm2 logs gameworld'"
echo "  重启服务: ssh root@$SERVER_IP 'pm2 restart gameworld'"
echo "  查看状态: ssh root@$SERVER_IP 'pm2 status'"
