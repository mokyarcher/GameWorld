@echo off
chcp 65001 >nul
echo ==========================================
echo   卡片图片压缩工具
echo   竖版卡片 3573x5322 -> 600x900
echo ==========================================
echo.

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
echo [处理中] 压缩卡片图片...
echo.

python resize_cards.py ..\pic\cards ..\frontend\images\cards

echo.
echo ==========================================
echo 提示: 压缩后的图片在 frontend/images/cards/
echo 可手动复制到服务器替换
echo ==========================================
pause
