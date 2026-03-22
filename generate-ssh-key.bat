@echo off
echo 生成新的 SSH Key for GameWorld...
echo.

REM 生成新密钥，自动覆盖
ssh-keygen -t ed25519 -C "mokyarcher@GameWorld" -f "%USERPROFILE%\.ssh\id_ed25519_gameworld" -N ""

if errorlevel 1 (
    echo 生成失败！
    pause
    exit /b 1
)

echo.
echo ========================================
echo 新的 SSH Key 已生成！
echo ========================================
echo.
echo 公钥内容（请复制到 GitHub）：
echo.
type "%USERPROFILE%\.ssh\id_ed25519_gameworld.pub"
echo.
echo ========================================
echo.
echo 请复制上面的公钥到：
echo https://github.com/settings/keys
echo.
echo 添加后，按任意键配置 Git...
pause >nul

REM 配置 Git 使用新密钥
echo.
echo 配置 Git 使用新密钥...
git remote set-url origin git@github.com:mokyarcher/GameWorld.git

REM 创建 SSH config
echo Host github.com-gameworld > "%USERPROFILE%\.ssh\config"
echo     HostName github.com >> "%USERPROFILE%\.ssh\config"
echo     User git >> "%USERPROFILE%\.ssh\config"
echo     IdentityFile ~/.ssh/id_ed25519_gameworld >> "%USERPROFILE%\.ssh\config"

echo.
echo 配置完成！
echo.
echo 测试连接...
ssh -T git@github.com-gameworld

echo.
echo 按任意键退出...
pause >nul
