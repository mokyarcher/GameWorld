#!/bin/bash
set -e

echo "=================================="
echo "Nginx 安装与配置脚本"
echo "域名: sharex.my"
echo "=================================="

# 1. 更新系统
echo "[1/6] 更新系统包..."
apt update -y && apt upgrade -y

# 2. 安装 Nginx
echo "[2/6] 安装 Nginx..."
apt install -y nginx

# 3. 启动并启用 Nginx
echo "[3/6] 启动 Nginx..."
systemctl start nginx
systemctl enable nginx

# 4. 配置防火墙
echo "[4/6] 配置防火墙..."
ufw allow 'Nginx Full'
ufw allow 'OpenSSH'
ufw --force enable

# 5. 创建网站配置文件
echo "[5/6] 创建网站配置..."

cat > /etc/nginx/sites-available/sharex.my << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name sharex.my www.sharex.my;
    
    root /var/www/sharex.my/html;
    index index.html index.htm;
    
    location / {
        try_files $uri $uri/ =404;
    }
    
    # 日志配置
    access_log /var/log/nginx/sharex.my.access.log;
    error_log /var/log/nginx/sharex.my.error.log;
}
EOF

# 6. 创建网站目录
echo "[6/6] 创建网站目录..."
mkdir -p /var/www/sharex.my/html
chown -R $USER:$USER /var/www/sharex.my/html
chmod -R 755 /var/www/sharex.my

# 启用站点
ln -sf /etc/nginx/sites-available/sharex.my /etc/nginx/sites-enabled/

# 删除默认站点（可选）
rm -f /etc/nginx/sites-enabled/default

# 创建测试页面
cat > /var/www/sharex.my/html/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Welcome to ShareX!</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        h1 { color: #333; }
        p { color: #666; }
    </style>
</head>
<body>
    <h1>Welcome to sharex.my!</h1>
    <p>Nginx is successfully installed and configured.</p>
    <p>Server is running!</p>
</body>
</html>
EOF

# 测试配置
nginx -t

# 重载 Nginx
systemctl reload nginx

echo ""
echo "=================================="
echo "✅ Nginx 安装完成！"
echo "=================================="
echo ""
echo "网站根目录: /var/www/sharex.my/html"
echo "配置文件: /etc/nginx/sites-available/sharex.my"
echo "访问地址: http://sharex.my 或 http://www.sharex.my"
echo ""
echo "请确保你的域名 DNS 记录指向此服务器 IP！"
echo ""
