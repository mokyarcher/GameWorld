@echo off
chcp 65001 >nul
echo ==========================================
echo   头像图片处理工具（保留格式）
echo ==========================================
echo.

REM 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python
    pause
    exit /b 1
)

REM 检查 Pillow
python -c "import PIL" >nul 2>&1
if errorlevel 1 (
    echo [安装] 正在安装 Pillow...
    pip install Pillow -i https://pypi.tuna.tsinghua.edu.cn/simple
)

cd /d "%~dp0.."

echo.
echo [处理中] 处理 pic/avaters 目录图片...
echo.

python scripts\resize_avatars_keep_format.py pic\avaters frontend\avatars

echo.
echo ==========================================
pause
