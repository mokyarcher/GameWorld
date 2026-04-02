/**
 * 脑力对决 - 大厅逻辑
 * 支持好友对战、WebSocket 房间管理
 */

const API_BASE = `${window.location.protocol}//${window.location.host}/api`;

// 用户数据
let currentUser = null;
let socket = null;
let currentRoomId = null;

// 初始化
window.onload = async function() {
    initParticles();
    await loadUserData();
    initSocket();
    
    // 检查 URL 参数，是否有需要加入的房间（从游戏大厅邀请跳转过来）
    checkUrlParams();
};

// 检查 URL 参数
function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const joinRoomId = urlParams.get('join');
    
    if (joinRoomId) {
        console.log('[Lobby] 从 URL 获取到房间号:', joinRoomId);
        // 显示好友对战弹窗并填入房间号
        startFriendMatch();
        document.getElementById('joinRoomInput').value = joinRoomId;
        // 自动加入房间
        setTimeout(() => {
            joinRoom();
        }, 500);
    }
}

// 初始化 WebSocket
function initSocket() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    // 从 token 解析用户ID
    const tokenPayload = JSON.parse(atob(token.split('.')[1]));
    const userId = tokenPayload.userId;
    
    socket = io('/brainbattle', {
        auth: { token, userId }
    });
    
    socket.on('connect', () => {
        console.log('[BrainBattle] WebSocket 已连接');
    });
    
    socket.on('room-created', (data) => {
        if (data.success) {
            currentRoomId = data.roomId;
            showRoomModal(data.roomId, true);
        } else {
            alert('创建房间失败: ' + data.message);
        }
    });
    
    socket.on('join-result', (data) => {
        if (!data.success) {
            alert('加入房间失败: ' + data.message);
        }
    });
    
    socket.on('game-start', (data) => {
        // 保存游戏数据到 sessionStorage
        sessionStorage.setItem('brainbattle_game', JSON.stringify({
            roomId: data.roomId,
            player1: data.player1,
            player2: data.player2,
            questions: data.questions,
            isPlayer1: data.player1.id === currentUser.id
        }));
        
        // 跳转到游戏页面
        window.location.href = `./game.html?mode=friend&room=${data.roomId}`;
    });
    
    // 玩家加入房间，等待准备
    socket.on('player-joined', (data) => {
        console.log('[Lobby] 玩家加入:', data);
        showReadyUI(data);
    });
    
    // 对方已准备
    socket.on('opponent-ready', (data) => {
        console.log('[Lobby] 对方已准备:', data);
        updateOpponentReadyStatus(data.username);
    });
    
    // 监听取消结果
    socket.on('cancel-result', (data) => {
        console.log('[Lobby] 取消结果:', data);
        if (data.success) {
            closeFriendModal();
            currentRoomId = null;
            // 如果是离开房间，显示提示
            if (data.isLeave && data.message) {
                showToast(data.message);
            }
        } else {
            alert(data.message);
        }
    });
    
    // 监听房间被取消（房主取消了房间）
    socket.on('room-cancelled', (data) => {
        console.log('[Lobby] 房间被取消:', data);
        alert(data.message || '房主已取消房间');
        closeFriendModal();
        currentRoomId = null;
    });
    
    // 监听邀请结果
    socket.on('invite-result', (data) => {
        console.log('[Lobby] 邀请结果:', data);
        if (!data.success) {
            alert(data.message);
        }
    });
    
    // 监听好友邀请（需要知道当前用户ID）
    if (currentUser && currentUser.id) {
        const inviteEvent = `invite-${currentUser.id}`;
        console.log('[Lobby] 监听邀请事件:', inviteEvent);
        
        socket.on(inviteEvent, (data) => {
            console.log('[Lobby] 收到邀请:', data);
            showInviteNotification(data);
        });
    }
}

// 初始化粒子背景
function initParticles() {
    const container = document.getElementById('particles');
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 15 + 's';
        particle.style.animationDuration = (10 + Math.random() * 10) + 's';
        container.appendChild(particle);
    }
}

// 加载用户数据
async function loadUserData() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.log('[BrainBattle] 未登录，以游客模式访问');
        return false;
    }

    try {
        const response = await fetch(`${API_BASE}/user/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            updateUserDisplay();
            return true;
        } else {
            console.log('[BrainBattle] 获取用户信息失败');
            return false;
        }
    } catch (error) {
        console.error('加载用户数据失败:', error);
        return false;
    }
}

// 更新用户显示
function updateUserDisplay() {
    if (!currentUser) return;
    
    // 更新显示名称（显示昵称或用户名）
    const displayName = currentUser.nickname || currentUser.username || 'Admin';
    const rankNameEl = document.getElementById('userRankName');
    if (rankNameEl) rankNameEl.textContent = displayName;
    
    // 更新积分显示
    const ratingEl = document.getElementById('userRating');
    if (ratingEl) {
        const rating = currentUser.brain_rating || 500;
        ratingEl.textContent = rating >= 1000 ? (rating / 1000).toFixed(1) + 'K' : rating;
    }
    
    // 更新统计数据
    const statTotalGamesEl = document.getElementById('statTotalGames');
    if (statTotalGamesEl) statTotalGamesEl.textContent = currentUser.brain_total || 0;
    
    const statWinRateEl = document.getElementById('statWinRate');
    if (statWinRateEl) statWinRateEl.textContent = calculateWinRate();
    
    const statWinStreakEl = document.getElementById('statWinStreak');
    if (statWinStreakEl) statWinStreakEl.textContent = currentUser.brain_streak || 0;
    
    const statMaxRatingEl = document.getElementById('statMaxRating');
    if (statMaxRatingEl) statMaxRatingEl.textContent = currentUser.brain_max_rating || 500;
}

// 根据积分获取段位
function getRankByRating(rating) {
    const ranks = [
        { name: '青铜脑瓜', min: 0, max: 500 },
        { name: '白银思维', min: 500, max: 1000 },
        { name: '黄金记忆', min: 1000, max: 2000 },
        { name: '铂金逻辑', min: 2000, max: 3500 },
        { name: '钻石智慧', min: 3500, max: 5500 },
        { name: '大师头脑', min: 5500, max: 8000 },
        { name: '最强王者', min: 8000, max: 99999 }
    ];
    
    return ranks.find(r => rating >= r.min && rating < r.max) || ranks[0];
}

// 计算胜率
function calculateWinRate() {
    const total = currentUser?.brain_total || 0;
    const wins = currentUser?.brain_wins || 0;
    if (total === 0) return '0%';
    return Math.round((wins / total) * 100) + '%';
}

// 快速匹配（人机对战）
function startQuickMatch() {
    // 直接跳转到游戏页面，使用人机模式
    window.location.href = './game.html?mode=quick';
}

// 好友对战 - 显示弹窗
function startFriendMatch() {
    // 显示弹窗
    const modal = document.getElementById('friendMatchModal');
    
    // 重置显示状态
    document.getElementById('roomCreatedSection').style.display = 'none';
    const createBtn = document.querySelector('#friendMatchModal button[onclick="createRoom()"]');
    if (createBtn) createBtn.parentElement.style.display = 'block';
    
    const joinInput = document.getElementById('joinRoomInput');
    if (joinInput) {
        joinInput.value = '';
        joinInput.parentElement.style.display = 'block';
    }
    
    modal.classList.add('show');
}

// 创建房间
function createRoom() {
    console.log('[Lobby] createRoom called, currentUser:', currentUser, 'socket:', !!socket);
    
    if (!currentUser) {
        alert('请先登录后再创建房间');
        return;
    }
    
    if (!socket) {
        alert('连接失败，请刷新页面');
        return;
    }
    
    console.log('[Lobby] 发送 create-room 事件:', {
        userId: currentUser.id,
        username: currentUser.nickname || currentUser.username
    });
    
    socket.emit('create-room', {
        userId: currentUser.id,
        username: currentUser.nickname || currentUser.username
    });
}

// 取消房间
function cancelRoom() {
    if (!currentRoomId || !socket) return;
    
    console.log('[Lobby] 取消房间:', currentRoomId);
    socket.emit('cancel-room', { roomId: currentRoomId });
}

// 显示房间弹窗（创建房间后）
function showRoomModal(roomId, isHost) {
    const modal = document.getElementById('friendMatchModal');
    
    // 隐藏创建按钮和加入区域
    const createBtn = document.querySelector('#friendMatchModal button[onclick="createRoom()"]');
    if (createBtn) createBtn.parentElement.style.display = 'none';
    
    const joinSection = document.querySelector('#joinRoomInput');
    if (joinSection) joinSection.parentElement.style.display = 'none';
    
    // 显示房间号区域
    document.getElementById('roomCreatedSection').style.display = 'block';
    document.getElementById('roomCode').textContent = roomId;
    
    if (isHost) {
        // 房主显示等待好友加入
        document.getElementById('friendMatchStatus').innerHTML = `
            <div style="margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-around; margin-bottom: 20px;">
                    <div id="player1ReadyStatus" style="text-align: center;">
                        <div style="font-weight: 600; margin-bottom: 5px;">${currentUser?.nickname || currentUser?.username || '我'}</div>
                        <div style="color: #ffa500; font-size: 0.9rem;">⏳ 等待好友加入</div>
                    </div>
                    <div style="font-size: 1.5rem; color: rgba(255,255,255,0.3);">VS</div>
                    <div id="player2ReadyStatus" style="text-align: center;">
                        <div style="font-weight: 600; margin-bottom: 5px; color: rgba(255,255,255,0.5);">等待中...</div>
                        <div style="color: #666; font-size: 0.9rem;">-</div>
                    </div>
                </div>
            </div>
        `;
    } else {
        document.getElementById('friendMatchStatus').textContent = '加入房间中...';
    }
    
    modal.classList.add('show');
    
    // 复制按钮
    document.getElementById('copyRoomCode').onclick = () => {
        navigator.clipboard.writeText(roomId).then(() => {
            showToast('房间号已复制');
        });
    };
}

// 关闭房间弹窗
function closeFriendModal() {
    document.getElementById('friendMatchModal').classList.remove('show');
    currentRoomId = null;
}

// 显示准备UI（双方加入后）
function showReadyUI(data) {
    const modal = document.getElementById('friendMatchModal');
    const statusEl = document.getElementById('friendMatchStatus');
    const roomSection = document.getElementById('roomCreatedSection');
    
    // 确保弹窗显示
    modal.classList.add('show');
    
    // 显示房间信息区域
    if (roomSection) roomSection.style.display = 'block';
    
    // 隐藏创建按钮和加入区域
    const createBtn = document.querySelector('#friendMatchModal button[onclick="createRoom()"]');
    if (createBtn) createBtn.parentElement.style.display = 'none';
    
    const joinSection = document.querySelector('#joinRoomInput');
    if (joinSection) joinSection.parentElement.style.display = 'none';
    
    // 设置房间号
    document.getElementById('roomCode').textContent = data.roomId;
    
    // 更新状态文本为准备UI
    statusEl.innerHTML = `
        <div style="margin-bottom: 15px;">
            <div style="display: flex; justify-content: space-around; margin-bottom: 20px;">
                <div id="player1ReadyStatus" style="text-align: center;">
                    <div style="font-weight: 600; margin-bottom: 5px;">${data.player1.username}</div>
                    <div style="color: #ffa500; font-size: 0.9rem;">⏳ 等待准备</div>
                </div>
                <div style="font-size: 1.5rem; color: rgba(255,255,255,0.3);">VS</div>
                <div id="player2ReadyStatus" style="text-align: center;">
                    <div style="font-weight: 600; margin-bottom: 5px;">${data.player2.username}</div>
                    <div style="color: #ffa500; font-size: 0.9rem;">⏳ 等待准备</div>
                </div>
            </div>
            <div style="display: flex; gap: 15px; justify-content: center;">
                <button id="readyBtn" onclick="setReady()" 
                    style="padding: 12px 40px; background: linear-gradient(135deg, #4CAF50, #2E7D32); border: none; border-radius: 25px; color: white; font-weight: 700; font-size: 1rem; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);"
                    onmouseover="this.style.transform='scale(1.05)'" 
                    onmouseout="this.style.transform='scale(1)'"
                >准备</button>
                <button onclick="cancelRoom()" 
                    style="padding: 12px 40px; background: transparent; border: 2px solid rgba(220, 20, 60, 0.5); border-radius: 25px; color: white; font-weight: 700; font-size: 1rem; cursor: pointer; transition: all 0.3s;"
                    onmouseover="this.style.background='rgba(220, 20, 60, 0.2)'; this.style.borderColor='#dc143c'" 
                    onmouseout="this.style.background='transparent'; this.style.borderColor='rgba(220, 20, 60, 0.5)'"
                >取消</button>
            </div>
        </div>
    `;
}

// 设置准备状态
function setReady() {
    if (!currentRoomId || !socket) return;
    
    socket.emit('player-ready', { roomId: currentRoomId });
    
    const btn = document.getElementById('readyBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '已准备 ✓';
        btn.style.background = 'linear-gradient(135deg, #666, #444)';
        btn.style.cursor = 'default';
    }
    
    // 更新自己的状态显示
    const isPlayer1 = currentUser.id === document.querySelector('#player1ReadyStatus > div:first-child')?.textContent ? 
        currentUser.nickname || currentUser.username : null;
    updateMyReadyStatus();
}

// 更新自己的准备状态显示
function updateMyReadyStatus() {
    if (!currentUser) return;
    
    const p1Status = document.getElementById('player1ReadyStatus');
    const p2Status = document.getElementById('player2ReadyStatus');
    const myName = currentUser.nickname || currentUser.username;
    
    // 根据用户名找到对应的状态元素
    let myStatusEl = null;
    if (p1Status && p1Status.querySelector('div:first-child')?.textContent === myName) {
        myStatusEl = p1Status;
    } else if (p2Status && p2Status.querySelector('div:first-child')?.textContent === myName) {
        myStatusEl = p2Status;
    }
    
    if (myStatusEl) {
        const statusDiv = myStatusEl.querySelector('div:last-child');
        if (statusDiv) {
            statusDiv.innerHTML = '<span style="color: #4CAF50;">✓ 已准备</span>';
        }
    }
}

// 更新对方准备状态
function updateOpponentReadyStatus(username) {
    const p1Status = document.getElementById('player1ReadyStatus');
    const p2Status = document.getElementById('player2ReadyStatus');
    
    if (!p1Status || !p2Status) return;
    
    // 找到对方的元素（不是当前用户的那个）
    const myName = currentUser?.nickname || currentUser?.username;
    let opponentStatusEl = null;
    
    const p1Name = p1Status.querySelector('div:first-child')?.textContent;
    const p2Name = p2Status.querySelector('div:first-child')?.textContent;
    
    if (p1Name === username && p1Name !== myName) {
        opponentStatusEl = p1Status;
    } else if (p2Name === username && p2Name !== myName) {
        opponentStatusEl = p2Status;
    }
    
    if (opponentStatusEl) {
        const statusDiv = opponentStatusEl.querySelector('div:last-child');
        if (statusDiv) statusDiv.innerHTML = '<span style="color: #4CAF50;">✓ 已准备</span>';
    }
}

// 加入房间
function joinRoom() {
    const roomId = document.getElementById('joinRoomInput').value.trim().toUpperCase();
    if (!roomId || roomId.length !== 6) {
        alert('请输入6位房间号');
        return;
    }
    
    if (!socket || !currentUser) {
        alert('请先登录');
        return;
    }
    
    socket.emit('join-room', {
        roomId,
        userId: currentUser.id,
        username: currentUser.nickname || currentUser.username
    });
    
    currentRoomId = roomId;
    // 显示房间弹窗（等待 player-joined 事件更新为准备UI）
    showRoomModal(roomId, false);
}

// 显示 Toast
function showToast(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; top: 20px; right: 20px; 
        background: linear-gradient(135deg, #dc143c, #8b0000);
        color: white; padding: 15px 25px; border-radius: 8px;
        z-index: 10000; font-weight: 600;
        transform: translateX(150%); transition: transform 0.3s;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.style.transform = 'translateX(0)', 10);
    setTimeout(() => {
        toast.style.transform = 'translateX(150%)';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// 排位赛
function goToRank() {
    alert('排位赛功能开发中...');
}

// ========== 积分榜功能 ==========

// 显示积分榜弹窗
async function showLeaderboard() {
    const modal = document.getElementById('leaderboardModal');
    modal.classList.add('show');
    await loadLeaderboard();
}

// 关闭积分榜弹窗
function closeLeaderboard() {
    const modal = document.getElementById('leaderboardModal');
    modal.classList.remove('show');
}

// 加载积分榜数据
async function loadLeaderboard() {
    const container = document.getElementById('leaderboardList');
    container.innerHTML = '<div class="leaderboard-loading">加载中...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/brainbattle/leaderboard?limit=50`);
        const data = await response.json();
        
        if (!data.success || !data.data || data.data.length === 0) {
            container.innerHTML = '<div class="leaderboard-empty">暂无数据<br>快来成为第一个上榜的玩家吧！</div>';
            return;
        }
        
        renderLeaderboard(data.data);
    } catch (error) {
        console.error('加载积分榜失败:', error);
        container.innerHTML = '<div class="leaderboard-empty">加载失败<br>请稍后重试</div>';
    }
}

// 渲染积分榜
function renderLeaderboard(players) {
    const container = document.getElementById('leaderboardList');
    
    container.innerHTML = players.map((player, index) => {
        const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : 'other';
        const top3Class = index < 3 ? 'top3' : '';
        const rankDisplay = index < 3 ? ['🥇', '🥈', '🥉'][index] : (index + 1);
        
        return `
            <div class="leaderboard-item ${top3Class}">
                <div class="leaderboard-rank ${rankClass}">${rankDisplay}</div>
                <img src="/avatars/${player.avatar || 'default.png'}" 
                     class="leaderboard-avatar" 
                     onerror="this.src='/avatars/default.png'">
                <div class="leaderboard-info">
                    <div class="leaderboard-name">${escapeHtml(player.nickname || player.username)}</div>
                    <span class="leaderboard-rank-name" style="background: ${player.rank_color}20; color: ${player.rank_color}; border: 1px solid ${player.rank_color}40;">
                        ${player.rank_name}
                    </span>
                </div>
                <div class="leaderboard-score">
                    <div class="leaderboard-rating">${player.rating}</div>
                    <div class="leaderboard-stats">${player.wins}胜 / ${player.total_games}场</div>
                </div>
            </div>
        `;
    }).join('');
}

// 点击弹窗外部关闭
document.addEventListener('click', (e) => {
    const modal = document.getElementById('leaderboardModal');
    if (e.target === modal) {
        closeLeaderboard();
    }
});

// 返回游戏大厅
function goToGameHall() {
    window.location.href = '../gamehall.html';
}

// 退出登录
function logout() {
    if (confirm('确定要退出登录吗？')) {
        localStorage.removeItem('token');
        window.location.href = '../login.html';
    }
}

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('friendMatchModal');
        if (modal.classList.contains('show')) {
            closeFriendModal();
        }
    }
});

// ========== 邀请好友功能 ==========

// 显示邀请弹窗
function showInviteModal() {
    console.log('[Lobby] showInviteModal called');
    const modal = document.getElementById('inviteModal');
    console.log('[Lobby] inviteModal element:', modal);
    if (!modal) {
        console.error('[Lobby] inviteModal not found!');
        return;
    }
    modal.style.display = 'flex';
    modal.classList.add('show');
    console.log('[Lobby] inviteModal shown');
    loadFriendsForInvite();
}

// 关闭邀请弹窗
function closeInviteModal() {
    const modal = document.getElementById('inviteModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}

// 加载好友列表
async function loadFriendsForInvite() {
    const container = document.getElementById('inviteFriendsList');
    container.innerHTML = '<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.5);">加载中...</div>';
    
    const token = localStorage.getItem('token');
    if (!token) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.5);">请先登录</div>';
        return;
    }
    
    try {
        // 获取好友列表
        const friendsRes = await fetch(`${API_BASE}/friends/list`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const friendsData = await friendsRes.json();
        
        if (!friendsData.success || !friendsData.friends || friendsData.friends.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.5);">暂无好友<br>先去添加一些好友吧</div>';
            return;
        }
        
        // 过滤在线好友
        const onlineFriends = friendsData.friends.filter(f => f.isOnline);
        
        if (onlineFriends.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.5);">暂无在线好友<br>好友可能离线或在其他游戏中</div>';
            return;
        }
        
        // 渲染好友列表
        container.innerHTML = onlineFriends.map(friend => `
            <div class="friend-invite-item" 
                 data-friend-id="${friend.id}"
                 style="display: flex; align-items: center; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 10px; cursor: pointer; transition: all 0.3s;"
                 onmouseover="this.style.background='rgba(220,20,60,0.1)'" 
                 onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                <img src="/avatars/${friend.avatar || 'default.png'}" 
                     style="width: 45px; height: 45px; border-radius: 50%; margin-right: 15px; border: 2px solid #4CAF50;"
                     onerror="this.src='/avatars/default.png'">
                <div style="flex: 1;">
                    <div style="font-weight: 600; margin-bottom: 3px;">${escapeHtml(friend.nickname)}</div>
                    <div style="font-size: 0.85rem; color: rgba(255,255,255,0.6);">
                        <span style="color: #4CAF50;">●</span> ${friend.locationName || '在线'}
                    </div>
                </div>
                <button class="invite-btn" onclick="sendInvite(${friend.id}, '${escapeHtml(friend.nickname)}')"
                        style="padding: 8px 20px; background: linear-gradient(135deg, #4CAF50, #2E7D32); border: none; border-radius: 6px; color: white; font-weight: 600; cursor: pointer;"
                        onmouseover="this.style.transform='scale(1.05)" 
                        onmouseout="this.style.transform='scale(1)'">
                    邀请
                </button>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('加载好友列表失败:', error);
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.5);">加载失败，请重试</div>';
    }
}

// 发送邀请
function sendInvite(friendId, friendName) {
    if (!currentRoomId || !socket) {
        alert('房间信息错误');
        return;
    }
    
    console.log('[Lobby] 邀请好友:', friendId, friendName, '到房间:', currentRoomId);
    
    socket.emit('invite-friend', {
        roomId: currentRoomId,
        friendId: friendId,
        inviterName: currentUser?.nickname || currentUser?.username || '玩家'
    });
    
    // 禁用该好友的邀请按钮
    const btn = document.querySelector(`[data-friend-id="${friendId}"] .invite-btn`);
    if (btn) {
        btn.disabled = true;
        btn.textContent = '已邀请';
        btn.style.background = '#666';
    }
    
    showToast(`已邀请 ${friendName}`);
}

// HTML转义
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 显示邀请通知
function showInviteNotification(data) {
    const { roomId, inviterName, gameName } = data;
    
    // 创建通知弹窗
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(145deg, #1a1a2e, #16213e);
        border: 2px solid #4CAF50;
        border-radius: 12px;
        padding: 20px;
        min-width: 280px;
        z-index: 10000;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        animation: slideIn 0.3s ease;
    `;
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; margin-bottom: 15px;">
            <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #4CAF50, #2E7D32); 
                        border-radius: 50%; display: flex; align-items: center; justify-content: center; 
                        margin-right: 12px; font-size: 1.2rem;">🎮</div>
            <div>
                <div style="font-weight: 600; color: #fff;">${escapeHtml(inviterName)}</div>
                <div style="font-size: 0.85rem; color: rgba(255,255,255,0.6);">邀请你加入${gameName}</div>
            </div>
        </div>
        <div style="display: flex; gap: 10px;">
            <button onclick="acceptInvite('${roomId}')" 
                    style="flex: 1; padding: 10px; background: linear-gradient(135deg, #4CAF50, #2E7D32); 
                           border: none; border-radius: 6px; color: white; font-weight: 600; cursor: pointer;">接受</button>
            <button onclick="this.parentElement.parentElement.remove()" 
                    style="flex: 1; padding: 10px; background: rgba(255,255,255,0.1); 
                           border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; color: white; 
                           font-weight: 600; cursor: pointer;">忽略</button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // 10秒后自动消失
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }
    }, 10000);
}

// 接受邀请
function acceptInvite(roomId) {
    console.log('[Lobby] 接受邀请，加入房间:', roomId);
    
    // 关闭邀请通知
    document.querySelectorAll('[style*="position: fixed"]').forEach(el => {
        if (el.innerHTML.includes('邀请你加入')) {
            el.remove();
        }
    });
    
    // 填充房间号并加入
    document.getElementById('joinRoomInput').value = roomId;
    joinRoom();
}

// 添加动画样式
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(120%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(120%); opacity: 0; }
    }
`;
document.head.appendChild(style);
