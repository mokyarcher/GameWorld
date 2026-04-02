/**
 * 脑力对决 - 游戏核心逻辑
 * 好友对战实时同步 - 重新设计版
 */

// ========== 游戏状态 ==========
const GameState = { WAITING: 'waiting', PLAYING: 'playing', ENDED: 'ended' };
let currentState = GameState.WAITING;
let currentRound = 1;
let timerInterval = null;
let currentQuestion = null;

// 玩家数据
let myScore = 0, opponentScore = 0;
let myStreak = 0, opponentStreak = 0;
let hasAnswered = false;
let opponentAnswered = false;

// 游戏配置
let gameMode = 'quick';
let socket = null;
let roomId = null;
let isPlayer1 = true;
let questions = [];
let myName = '我', opponentName = '对手';
let answerStartTime = 0;
let rematchCountdown = null;
let hasMadeRematchDecision = false;

// ========== 初始化 ==========
window.onload = () => {
    gameMode = new URLSearchParams(location.search).get('mode') || 'quick';
    roomId = new URLSearchParams(location.search).get('room');
    
    if (gameMode === 'friend' && roomId) {
        initFriendMode();
    } else {
        initQuickMode();
    }
};

// ========== 好友对战模式 ==========
function initFriendMode() {
    const gameData = JSON.parse(sessionStorage.getItem('brainbattle_game') || '{}');
    if (!gameData.questions) {
        alert('游戏数据丢失');
        location.href = './index.html';
        return;
    }
    
    questions = gameData.questions;
    isPlayer1 = gameData.isPlayer1;
    myName = isPlayer1 ? gameData.player1?.username : gameData.player2?.username;
    opponentName = isPlayer1 ? gameData.player2?.username : gameData.player1?.username;
    
    // 显示玩家名
    document.getElementById('player1Name').textContent = isPlayer1 ? myName : opponentName;
    document.getElementById('player2Name').textContent = isPlayer1 ? opponentName : myName;
    
    // 连接 WebSocket
    const token = localStorage.getItem('token');
    // 从 token 解析用户ID
    const tokenPayload = JSON.parse(atob(token.split('.')[1]));
    const userId = tokenPayload.userId;
    
    socket = io('/brainbattle', { auth: { token, userId } });
    
    socket.on('connect', () => {
        console.log('[Game] WebSocket 连接成功, socketId:', socket.id);
        
        // 重新连接时，通知服务器更新 socket ID
        if (roomId && socket) {
            socket.emit('reconnect-player', { roomId, isPlayer1 });
        }
        
        showCountdown();
    });
    
    socket.on('connect_error', (err) => {
        console.error('[Game] WebSocket 连接错误:', err.message);
    });
    
    socket.on('disconnect', (reason) => {
        console.log('[Game] WebSocket 断开:', reason);
    });
    
    // 答题结果（自己的）
    socket.on('answer-result', (data) => {
        console.log('[Game] ===== 收到 answer-result:', data);
        myScore = data.totalScore;
        myStreak = data.streak;
        updateScoreDisplay();
        showAnswerResult(data.isCorrect, data.correctAnswer);
        
        // 自己答完题，停止自己的卡片闪烁
        updatePlayerCardActive(false);
    });
    
    // 对手已答题
    socket.on('opponent-answered', (data) => {
        console.log('[Game] ===== 收到 opponent-answered:', data);
        opponentScore = data.opponentScore;
        opponentAnswered = true;
        updateScoreDisplay();
        
        // 对手答完题，停止对手的卡片闪烁
        updateOpponentCardActive(false);
    });
    
    // 对手超时
    socket.on('opponent-timeout', (data) => {
        console.log('[Game] ===== 收到 opponent-timeout:', data);
        opponentScore = data.opponentScore;
        opponentAnswered = true;
        updateScoreDisplay();
        
        // 对手超时也算答完题，停止对手的卡片闪烁
        updateOpponentCardActive(false);
    });
    
    // 本轮状态更新
    socket.on('round-status', (data) => {
        console.log('[Game] ===== 收到 round-status:', data);
        // 可以在这里显示"等待对手"或"对手已完成"等提示
    });
    
    // 本轮结束（双方都答完）
    socket.on('round-complete', (data) => {
        console.log('[Game] ===== 收到 round-complete:', data);
        // 显示双方本轮得分详情
    });
    
    // 下一轮
    socket.on('next-round', (data) => {
        console.log('[Game] ===== 收到 next-round:', data);
        setTimeout(() => {
            currentRound = data.round;
            myScore = isPlayer1 ? data.player1Score : data.player2Score;
            opponentScore = isPlayer1 ? data.player2Score : data.player1Score;
            hasAnswered = false;
            opponentAnswered = false;
            updateScoreDisplay();
            
            // 新一轮开始，双方都恢复闪烁
            updatePlayerCardActive(true);
            updateOpponentCardActive(true);
            
            loadQuestion();
        }, 1500);
    });
    
    // 游戏结束
    socket.on('game-end', (data) => {
        console.log('[Game] ===== 收到 game-end:', data);
        setTimeout(() => showGameResult(data), 1500);
        
        // 好友模式：启动再来一局倒计时
        if (gameMode === 'friend') {
            startRematchCountdown(data.rematchTimeout || 10);
        }
    });
    
    // 对手再来一局状态
    socket.on('opponent-rematch-status', (data) => {
        console.log('[Game] 对手再来一局状态:', data);
        const statusEl = document.getElementById('rematchStatus');
        if (data.status === 'accepted') {
            statusEl.textContent = `${data.opponentName} 已准备就绪`;
            statusEl.style.color = '#4CAF50';
        }
    });
    
    // 再来一局被取消
    socket.on('rematch-cancelled', (data) => {
        console.log('[Game] 再来一局被取消:', data);
        alert(data.reason);
        backToLobby();
    });
    
    // 再来一局开始
    socket.on('rematch-start', (data) => {
        console.log('[Game] ===== 收到 rematch-start:', data);
        
        // 更新房间号（如果生成了新房间）
        if (data.isRematch && data.roomId !== roomId) {
            console.log('[Game] 房间号更新:', roomId, '->', data.roomId);
            roomId = data.roomId;
        }
        
        // 清除倒计时
        if (rematchCountdown) {
            clearInterval(rematchCountdown);
            rematchCountdown = null;
        }
        
        // 重置游戏状态
        currentState = GameState.PLAYING;
        currentRound = 1;
        myScore = opponentScore = 0;
        myStreak = opponentStreak = 0;
        hasAnswered = opponentAnswered = false;
        hasMadeRematchDecision = false;
        
        // 更新题目
        questions = data.questions;
        
        // 隐藏结算界面
        document.getElementById('resultModal').classList.remove('show');
        document.getElementById('rematchStatus').style.display = 'none';
        document.getElementById('rematchStatus').textContent = '';
        document.getElementById('rematchTimer').textContent = '';
        
        // 重置按钮状态
        const btnRematch = document.getElementById('btnRematch');
        const btnBack = document.getElementById('btnBack');
        if (btnRematch) {
            btnRematch.disabled = false;
            btnRematch.textContent = '再来一局';
        }
        if (btnBack) btnBack.disabled = false;
        
        // 重置卡片闪烁状态
        updatePlayerCardActive(true);
        updateOpponentCardActive(true);
        
        updateScoreDisplay();
        showCountdown();
    });
    
    // 对手离开
    socket.on('opponent-left', (data) => {
        alert(data.message);
        location.href = './index.html';
    });
    
    // 对手主动退出游戏
    socket.on('opponent-quit', (data) => {
        console.log('[Game] 对手退出游戏:', data);
        
        // 停止计时器
        clearInterval(timerInterval);
        
        // 显示结算弹窗（对手退出，自己获胜）
        const modal = document.getElementById('resultModal');
        const icon = document.getElementById('resultIcon');
        const title = document.getElementById('resultTitle');
        
        icon.textContent = '🏆';
        title.textContent = '对手退出，你获胜!';
        title.className = 'result-title win';
        
        // 显示分数（对手得0分）
        const myFinalScore = isPlayer1 ? data.player1Score : data.player2Score;
        const opponentFinalScore = isPlayer1 ? data.player2Score : data.player1Score;
        document.getElementById('resultScore').textContent = `${myFinalScore} : ${opponentFinalScore}`;
        
        // 隐藏再来一局按钮（因为对手已退出）
        const btnRematch = document.getElementById('btnRematch');
        if (btnRematch) btnRematch.style.display = 'none';
        
        // 显示返回大厅按钮
        const btnBack = document.getElementById('btnBack');
        if (btnBack) {
            btnBack.textContent = '返回大厅';
            btnBack.onclick = () => location.href = './index.html';
        }
        
        modal.classList.add('show');
        
        // 标记游戏已结束
        currentState = GameState.ENDED;
    });
}

// ========== 人机对战模式 ==========
async function initQuickMode() {
    try {
        const res = await fetch('/api/brainbattle/questions?count=5');
        const result = await res.json();
        if (result.success) {
            questions = result.data;
            showCountdown();
        }
    } catch (err) {
        alert('加载题目失败');
    }
}

// ========== 倒计时 ==========
function showCountdown() {
    const overlay = document.getElementById('countdownOverlay');
    const numEl = document.getElementById('countdownNumber');
    overlay.classList.add('show');
    
    let count = 3;
    numEl.textContent = count;
    
    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            numEl.textContent = count;
        } else {
            clearInterval(interval);
            overlay.classList.remove('show');
            startGame();
        }
    }, 1000);
}

// ========== 开始游戏 ==========
function startGame() {
    currentState = GameState.PLAYING;
    currentRound = 1;
    myScore = opponentScore = 0;
    myStreak = opponentStreak = 0;
    hasAnswered = opponentAnswered = false;
    updateScoreDisplay();
    
    // 好友模式：双方都显示闪烁（表示都未答题）
    if (gameMode === 'friend') {
        updatePlayerCardActive(true);
        updateOpponentCardActive(true);
    }
    
    loadQuestion();
}

// ========== 加载题目 ==========
function loadQuestion() {
    hasAnswered = opponentAnswered = false;
    
    if (currentRound > 5) return;
    
    currentQuestion = questions[currentRound - 1];
    answerStartTime = Date.now();
    
    document.getElementById('currentRound').textContent = currentRound;
    document.getElementById('questionType').textContent = currentQuestion.type;
    document.getElementById('questionText').textContent = currentQuestion.question;
    
    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach((btn, i) => {
        if (currentQuestion.options[i]) {
            btn.textContent = currentQuestion.options[i];
            btn.className = 'option-btn';
            btn.disabled = false;
            btn.style.display = 'block';
            btn.onclick = () => selectAnswer(i);
        } else {
            btn.style.display = 'none';
        }
    });
    
    startTimer();
}

// ========== 倒计时 ==========
function startTimer() {
    let timeLeft = 10;
    updateTimerDisplay(timeLeft);
    
    timerInterval = setInterval(() => {
        timeLeft -= 0.1;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            if (!hasAnswered) handleTimeout();
        }
        updateTimerDisplay(timeLeft);
    }, 100);
}

function updateTimerDisplay(time) {
    const progress = (time / 10) * 100;
    document.getElementById('timerProgress').style.width = progress + '%';
    document.getElementById('timerText').textContent = Math.max(0, time).toFixed(1) + 's';
}

// ========== 选择答案 ==========
function selectAnswer(selectedIndex) {
    if (hasAnswered || !currentQuestion) return;
    
    hasAnswered = true;
    clearInterval(timerInterval);
    
    const answerTime = Date.now() - answerStartTime;
    const buttons = document.querySelectorAll('.option-btn');
    
    buttons.forEach(btn => {
        btn.disabled = true;
        btn.classList.add('disabled');
    });
    buttons[selectedIndex].classList.add('selected');
    
    const isCorrect = selectedIndex === currentQuestion.answer;
    showAnswerResult(isCorrect, currentQuestion.answer);
    
    // 好友模式：发送给服务器
    if (gameMode === 'friend' && socket) {
        console.log('[Game] ===== 发送 submit-answer:', {roomId, round: currentRound, answer: selectedIndex, answerTime});
        socket.emit('submit-answer', {
            roomId, round: currentRound, answer: selectedIndex, answerTime
        });
    } else {
        // 人机模式
        simulateOpponent();
        setTimeout(nextRound, 2000);
    }
}

// ========== 显示结果 ==========
function showAnswerResult(isCorrect, correctIndex) {
    const buttons = document.querySelectorAll('.option-btn');
    setTimeout(() => {
        buttons[correctIndex].classList.add('correct');
        buttons.forEach((btn, i) => {
            if (btn.classList.contains('selected') && i !== correctIndex) {
                btn.classList.add('wrong');
            }
        });
    }, 300);
}

// ========== 超时 ==========
function handleTimeout() {
    if (!currentQuestion) return;
    hasAnswered = true;
    
    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach(btn => btn.disabled = true);
    buttons[currentQuestion.answer].classList.add('correct');
    
    if (gameMode === 'friend' && socket) {
        console.log('[Game] ===== 发送 timeout:', {roomId, round: currentRound});
        socket.emit('timeout', { roomId, round: currentRound });
    } else {
        simulateOpponent();
        setTimeout(nextRound, 2000);
    }
}

// ========== 更新玩家卡片闪烁状态 ==========
function updatePlayerCardActive(active) {
    const card = document.getElementById(isPlayer1 ? 'player1Card' : 'player2Card');
    if (card) {
        if (active) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    }
}

function updateOpponentCardActive(active) {
    const card = document.getElementById(isPlayer1 ? 'player2Card' : 'player1Card');
    if (card) {
        if (active) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    }
}

// ========== 模拟对手（人机） ==========
function simulateOpponent() {
    setTimeout(() => {
        if (Math.random() < 0.7) {
            opponentStreak++;
            opponentScore += 15 + (opponentStreak >= 3 ? (opponentStreak - 1) * 5 : 0);
        } else {
            opponentStreak = 0;
        }
        updateScoreDisplay();
    }, 2000 + Math.random() * 2000);
}

// ========== 更新分数 ==========
function updateScoreDisplay() {
    document.getElementById('player1Score').textContent = isPlayer1 ? myScore : opponentScore;
    document.getElementById('player2Score').textContent = isPlayer1 ? opponentScore : myScore;
}

// ========== 下一轮 ==========
function nextRound() {
    currentRound++;
    if (currentRound > 5) {
        endGame();
    } else {
        loadQuestion();
    }
}

// ========== 结束游戏 ==========
function endGame() {
    const isWin = myScore > opponentScore;
    const isDraw = myScore === opponentScore;
    showGameResult({
        player1Score: isPlayer1 ? myScore : opponentScore,
        player2Score: isPlayer1 ? opponentScore : myScore,
        winner: isDraw ? null : { username: isWin ? myName : opponentName },
        isDraw
    });
}

function showGameResult(data) {
    const modal = document.getElementById('resultModal');
    const icon = document.getElementById('resultIcon');
    const title = document.getElementById('resultTitle');
    
    if (data.isDraw) {
        icon.textContent = '🤝';
        title.textContent = '平局';
        title.className = 'result-title draw';
    } else if ((isPlayer1 && data.winner?.username === myName) || 
               (!isPlayer1 && data.winner?.username !== myName)) {
        icon.textContent = '🏆';
        title.textContent = '胜利!';
        title.className = 'result-title win';
    } else {
        icon.textContent = '💔';
        title.textContent = '失败...';
        title.className = 'result-title lose';
    }
    
    document.getElementById('resultScore').textContent = `${data.player1Score} : ${data.player2Score}`;
    modal.classList.add('show');
}

// ========== 再来一局倒计时 ==========
function startRematchCountdown(seconds) {
    const timerEl = document.getElementById('rematchTimer');
    const statusEl = document.getElementById('rematchStatus');
    
    statusEl.style.display = 'block';
    statusEl.textContent = '等待双方确认...';
    statusEl.style.color = '#aaa';
    
    let timeLeft = seconds;
    timerEl.textContent = timeLeft + 's';
    
    hasMadeRematchDecision = false;
    
    rematchCountdown = setInterval(() => {
        timeLeft--;
        timerEl.textContent = timeLeft + 's';
        
        if (timeLeft <= 0) {
            clearInterval(rematchCountdown);
            rematchCountdown = null;
            // 超时自动返回大厅
            if (!hasMadeRematchDecision) {
                backToLobby();
            }
        }
    }, 1000);
}

// ========== 退出游戏 ==========
function quitGame() {
    if (currentState === GameState.ENDED) {
        // 游戏已结束，直接返回大厅
        backToLobby();
        return;
    }
    
    if (!confirm('确定要退出游戏吗？退出将视为失败，对手获胜！')) {
        return;
    }
    
    // 发送退出消息给服务器
    if (gameMode === 'friend' && socket) {
        socket.emit('quit-game', { roomId });
    }
    
    // 返回大厅
    location.href = './index.html';
}

// ========== 按钮事件 ==========
function playAgain() {
    if (gameMode === 'friend' && socket) {
        // 好友模式：发送再来一局决策
        if (hasMadeRematchDecision) return; // 防止重复点击
        
        hasMadeRematchDecision = true;
        socket.emit('rematch-decision', { roomId, decision: 'accept' });
        
        // 更新按钮状态
        const btn = document.getElementById('btnRematch');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '已准备';
        }
        
        // 更新状态显示
        const statusEl = document.getElementById('rematchStatus');
        statusEl.textContent = '等待对手确认...';
        statusEl.style.color = '#ffd700';
        
        console.log('[Game] 发送再来一局决策: accept');
    } else {
        // 人机模式：直接重新开始
        document.getElementById('resultModal').classList.remove('show');
        showCountdown();
    }
}

function backToLobby() {
    // 好友模式：通知服务器离开
    if (gameMode === 'friend' && socket && !hasMadeRematchDecision) {
        hasMadeRematchDecision = true;
        socket.emit('rematch-decision', { roomId, decision: 'leave' });
    }
    
    // 清除倒计时
    if (rematchCountdown) {
        clearInterval(rematchCountdown);
        rematchCountdown = null;
    }
    
    location.href = './index.html';
}

// ========== 键盘快捷键 ==========
document.addEventListener('keydown', (e) => {
    if (currentState !== GameState.PLAYING || hasAnswered) return;
    if (e.key >= '1' && e.key <= '4') {
        const buttons = document.querySelectorAll('.option-btn');
        const index = parseInt(e.key) - 1;
        if (buttons[index] && !buttons[index].disabled) {
            buttons[index].click();
        }
    }
});
