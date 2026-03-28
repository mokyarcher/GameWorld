@echo off
chcp 65001 >nul
echo ==========================================
echo   Cyber 头像处理工具
echo   输出: avatar12.png ~ avatar31.png
echo ==========================================
echo.

cd /d "%~dp0"

REM 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python
    pause
    exit /b 1
)

REM 检查 Pillow
python -c "import PIL" >nul 2>&1
if errorlevel 1 (
    echo [安装] 安装 Pillow...
    pip install Pillow -i https://pypi.tuna.tsinghua.edu.cn/simple
)

echo.
echo [处理中] 处理 cyber-avatars...
echo.

python process_cyber_avatars.py

echo.
echo ==========================================
pause
