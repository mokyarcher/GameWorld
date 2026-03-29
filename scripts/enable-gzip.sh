#!/bin/bash
# 一键开启 Gzip 压缩

PROJECT_DIR="/opt/game/GameWorld"
BACKEND_DIR="$PROJECT_DIR/backend"

echo "=== 开启 Gzip 压缩 ==="

# 1. 进入后端目录
cd $BACKEND_DIR || exit 1

# 2. 安装 compression 包
echo "[1/4] 安装 compression 包..."
npm install compression --save

# 3. 备份 server.js
echo "[2/4] 备份 server.js..."
cp core/server.js core/server.js.backup.$(date +%Y%m%d)

# 4. 修改 server.js 添加 Gzip
echo "[3/4] 修改 server.js..."

# 检查是否已经添加过 compression
if grep -q "require('compression')" core/server.js; then
    echo "⚠️  compression 已经添加过了，跳过"
else
    # 在文件开头添加 require
    sed -i "1s/^/const compression = require('compression');\n/" core/server.js
    
    # 在 const app = express() 后面添加 app.use(compression())
    sed -i "/const app = express()/a\\app.use(compression());" core/server.js
    
    echo "✅ Gzip 中间件已添加"
fi

# 5. 重启服务
echo "[4/4] 重启服务..."
pm2 restart gameworld

echo ""
echo "=== 完成 ==="
echo "验证方法："
echo "1. 打开浏览器访问游戏大厅"
echo "2. F12 → Network → 点击任意请求"
echo "3. 查看 Response Headers 中是否有 content-encoding: gzip"
echo ""
