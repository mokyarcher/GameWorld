@echo off
chcp 65001 >nul
echo ========================================
echo   Git 认证配置助手
echo ========================================
echo.
echo 请选择认证方式：
echo.
echo [1] SSH Key (推荐 - 最安全方便)
echo [2] Personal Access Token (PAT)
echo [3] 查看当前配置
echo [4] 退出
echo.
set /p choice="请输入选项 (1-4): "

if "%choice%"=="1" goto ssh_setup
if "%choice%"=="2" goto pat_setup
if "%choice%"=="3" goto show_config
if "%choice%"=="4" goto end

echo 无效选项！
pause
exit /b 1

:ssh_setup
echo.
echo ========================================
echo   SSH Key 配置
echo ========================================
echo.
echo 检查现有 SSH Key...
if exist "%USERPROFILE%\.ssh\id_rsa.pub" (
    echo 发现现有 SSH Key: id_rsa
    type "%USERPROFILE%\.ssh\id_rsa.pub"
    echo.
    echo 请将上面的公钥复制到 GitHub：
    echo https://github.com/settings/keys
    echo.
    echo 添加后，按任意键测试连接...
    pause >nul
    goto test_ssh
)

if exist "%USERPROFILE%\.ssh\id_ed25519.pub" (
    echo 发现现有 SSH Key: id_ed25519
    type "%USERPROFILE%\.ssh\id_ed25519.pub"
    echo.
    echo 请将上面的公钥复制到 GitHub：
    echo https://github.com/settings/keys
    echo.
    echo 添加后，按任意键测试连接...
    pause >nul
    goto test_ssh
)

echo 未找到 SSH Key，生成新的...
echo.
echo 推荐使用 Ed25519 算法（更安全）
set /p key_type="选择算法 (1=Ed25519推荐, 2=RSA): "

if "%key_type%"=="2" (
    ssh-keygen -t rsa -b 4096 -C "mokyarcher@github.com" -f "%USERPROFILE%\.ssh\id_rsa"
) else (
    ssh-keygen -t ed25519 -C "mokyarcher@github.com" -f "%USERPROFILE%\.ssh\id_ed25519"
)

if errorlevel 1 (
    echo 生成 SSH Key 失败！
    pause
    exit /b 1
)

echo.
echo SSH Key 已生成！公钥内容：
echo ========================================
if "%key_type%"=="2" (
    type "%USERPROFILE%\.ssh\id_rsa.pub"
) else (
    type "%USERPROFILE%\.ssh\id_ed25519.pub"
)
echo ========================================
echo.
echo 请复制上面的公钥到 GitHub：
echo https://github.com/settings/keys
echo.
echo 添加后，按任意键测试连接...
pause >nul

:test_ssh
echo.
echo 测试 SSH 连接...
ssh -T git@github.com
echo.
if errorlevel 1 (
    echo SSH 连接测试失败，请检查：
    echo 1. 公钥是否已添加到 GitHub
    echo 2. SSH 服务是否正常运行
) else (
    echo SSH 连接成功！
    echo.
    echo 设置远程仓库使用 SSH...
    git remote set-url origin git@github.com:mokyarcher/GameWorld.git
    echo 完成！现在可以使用 git push 了
)
pause
goto end

:pat_setup
echo.
echo ========================================
echo   Personal Access Token (PAT) 配置
echo ========================================
echo.
echo 1. 访问 GitHub 创建 Token：
echo    https://github.com/settings/tokens/new
echo.
echo 2. 勾选以下权限：
echo    - repo (完整仓库访问)
echo.
echo 3. 生成后复制 Token
echo.
pause

echo.
set /p pat="请输入你的 Personal Access Token: "
if "%pat%"=="" (
    echo Token 不能为空！
    pause
    exit /b 1
)

echo.
echo 设置远程仓库使用 HTTPS + Token...
git remote set-url origin https://%pat%@github.com/mokyarcher/GameWorld.git
echo.
echo 完成！Token 已嵌入远程 URL
echo 注意：这种方式 Token 会保存在配置中
echo.
pause
goto end

:show_config
echo.
echo ========================================
echo   当前 Git 配置
echo ========================================
echo.
echo [远程仓库]
git remote -v
echo.
echo [用户信息]
git config user.name
git config user.email
echo.
echo [当前分支]
git branch
echo.
pause
goto end

:end
echo.
echo 按任意键退出...
pause >nul
