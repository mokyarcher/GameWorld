@echo off
chcp 65001 >nul
echo ========================================
echo   GameWorld Git 提交脚本
echo ========================================
echo.

REM 检查是否在 git 仓库中
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo 错误：当前目录不是 Git 仓库！
    pause
    exit /b 1
)

echo [1/5] 检查 Git 状态...
git status --short
echo.

REM 检查是否有更改要提交
git diff --quiet
git diff --cached --quiet
if %errorlevel% == 0 (
    echo 没有要提交的更改。
    pause
    exit /b 0
)

echo [2/5] 添加所有更改到暂存区...
git add .
if errorlevel 1 (
    echo 错误：添加文件失败！
    pause
    exit /b 1
)
echo 完成
echo.

echo [3/5] 创建提交...
git commit -m "修复德州扑克游戏逻辑

- 修复5秒开局倒计时显示NaN问题
- 修复翻牌后当前玩家undefined问题
- 修复游戏状态未设置为playing问题
- 修复结算后未选择玩家自动继续逻辑
- 修复只剩一人时房间解散逻辑
- 修复事件名称不匹配问题
- 添加PokerGame缺失方法(showdown, dealFlop, dealTurnOrRiver)
- 修复结算数据格式问题"
if errorlevel 1 (
    echo 错误：创建提交失败！
    pause
    exit /b 1
)
echo 完成
echo.

echo [4/5] 推送到远程仓库...
git push origin master
if errorlevel 1 (
    echo.
    echo 推送到 origin master 失败，尝试 main 分支...
    git push origin main
    if errorlevel 1 (
        echo 错误：推送失败！请检查网络连接或远程仓库权限。
        pause
        exit /b 1
    )
)
echo 完成
echo.

echo [5/5] 推送完成！
git log -1 --oneline
echo.
echo ========================================
echo   提交成功！
echo ========================================
pause
