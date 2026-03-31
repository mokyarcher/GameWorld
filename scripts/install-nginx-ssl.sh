#!/bin/bash
set -e

echo "=================================="
echo "Nginx + HTTPS(SSL) 安装配置脚本"
echo "域名: sharex.my"
echo "=================================="

# 1. 更新系统
echo "[1/7] 更新系统包..."
apt update -y && apt upgrade -y

# 2. 安装 Nginx
echo "[2/7] 安装 Nginx..."
apt install -y nginx

# 3. 启动并启用 Nginx
echo "[3/7] 启动 Nginx..."
systemctl start nginx
systemctl enable nginx

# 4. 配置防火墙
echo "[4/7] 配置防火墙..."
ufw allow 'Nginx Full'
ufw allow 'OpenSSH'
ufw --force enable

# 5. 创建网站配置（HTTP 版本，Certbot 会自动改为 HTTPS）
echo "[5/7] 创建网站配置..."

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

# 6. 创建网站目录和测试页面
echo "[6/7] 创建网站目录..."
mkdir -p /var/www/sharex.my/html
chown -R $USER:$USER /var/www/sharex.my/html
chmod -R 755 /var/www/sharex.my

# 启用站点
ln -sf /etc/nginx/sites-available/sharex.my /etc/nginx/sites-enabled/

# 删除默认站点
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
        .lock { font-size: 50px; }
    </style>
</head>
<body>
    <div class="lock">🔒</div>
    <h1>Welcome to sharex.my!</h1>
    <p>Nginx + HTTPS is successfully configured!</p>
    <p>Your connection is secure.</p>
</body>
</html>
EOF

# 测试配置
nginx -t

# 重载 Nginx
systemctl reload nginx

# 7. 安装 Certbot 并配置 SSL
echo "[7/7] 安装 SSL 证书..."

# 安装 Certbot
apt install -y certbot python3-certbot-nginx

# 获取证书并自动配置 Nginx
# --agree-tos: 同意服务条款
# --no-eff-email: 不分享邮箱
# --redirect: 自动将 HTTP 重定向到 HTTPS
echo "正在申请 SSL 证书，请确保域名已解析到本服务器 IP..."
certbot --nginx -d sharex.my -d www.sharex.my --agree-tos --no-eff-email --redirect

echo ""
echo "=================================="
echo "✅ Nginx + HTTPS 配置完成！"
echo "=================================="
echo ""
echo "📁 网站根目录: /var/www/sharex.my/html"
echo "⚙️  配置文件: /etc/nginx/sites-available/sharex.my"
echo ""
echo "🌐 访问地址:"
echo "   HTTPS: https://sharex.my"
echo "   HTTPS: https://www.sharex.my"
echo ""
echo "🔒 SSL 证书会自动续期（每 90 天）"
echo "   测试续期: sudo certbot renew --dry-run"
echo ""
