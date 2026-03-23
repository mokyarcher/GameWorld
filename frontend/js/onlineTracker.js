/**
 * 在线状态追踪器
 * 用于上报用户位置和在线状态
 */

const OnlineTracker = {
    socket: null,
    currentLocation: 'unknown',
    heartbeatInterval: null,
    
    // 位置映射
    LOCATIONS: {
        'gamehall': '游戏大厅',
        'profile': '个人资料',
        'friends': '好友页面',
        'admin': '管理后台',
        'poker_lobby': '德州扑克-大厅',
        'poker_room': '德州扑克-等待房间',
        'poker_game': '德州扑克-游戏中'
    },
    
    // 初始化
    init(userId, location) {
        if (!userId) {
            console.warn('[OnlineTracker] 未提供用户ID');
            return;
        }
        
        this.currentLocation = location || this.detectLocation();
        
        // 连接 Socket.io
        const serverUrl = window.location.origin;
        this.socket = io(serverUrl);
        
        this.socket.on('connect', () => {
            console.log('[OnlineTracker] 已连接服务器');
            
            // 上报上线
            this.socket.emit('user-online', {
                userId: String(userId),
                location: this.currentLocation
            });
        });
        
        // 启动心跳
        this.startHeartbeat(userId);
        
        // 页面关闭时下线
        window.addEventListener('beforeunload', () => {
            this.destroy();
        });
    },
    
    // 检测当前页面位置
    detectLocation() {
        const path = window.location.pathname;
        
        if (path.includes('/pages/gamehall')) return 'gamehall';
        if (path.includes('/pages/profile')) return 'profile';
        if (path.includes('/pages/friends')) return 'friends';
        if (path.includes('/pages/admin')) return 'admin';
        if (path.includes('/games/poker/lobby')) return 'poker_lobby';
        if (path.includes('/games/poker/room')) return 'poker_room';
        if (path.includes('/games/poker/game')) return 'poker_game';
        
        return 'unknown';
    },
    
    // 更新位置
    updateLocation(location) {
        if (!this.socket || !this.socket.connected) return;
        
        this.currentLocation = location;
        this.socket.emit('update-location', { location });
    },
    
    // 启动心跳
    startHeartbeat(userId) {
        // 每30秒发送一次心跳
        this.heartbeatInterval = setInterval(() => {
            if (this.socket && this.socket.connected) {
                this.socket.emit('heartbeat', {
                    userId: String(userId),
                    location: this.currentLocation
                });
            }
        }, 30000);
    },
    
    // 获取位置显示名称
    getLocationName(location) {
        return this.LOCATIONS[location] || location;
    },
    
    // 销毁
    destroy() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        if (this.socket) {
            this.socket.disconnect();
        }
    }
};

// 自动初始化（如果页面有 user 数据）
document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.id) {
        OnlineTracker.init(user.id);
    }
});
