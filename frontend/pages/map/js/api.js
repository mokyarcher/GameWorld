/**
 * ShareX 地图分享 - API 封装
 */

const API_BASE = `${window.location.protocol}//${window.location.host}/api`;

// 获取 token
function getToken() {
    return localStorage.getItem('token');
}

// 获取用户ID
function getUserId() {
    return localStorage.getItem('userId');
}

// 通用请求封装
async function request(url, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
        const response = await fetch(`${API_BASE}${url}`, {
            ...options,
            headers
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || '请求失败');
        }
        
        return data;
    } catch (error) {
        console.error('API 请求失败:', error);
        throw error;
    }
}

// 地图相关 API
const MapAPI = {
    // 获取标记列表
    getPins(lat, lng, radius = 10) {
        let url = `/map/pins?radius=${radius}`;
        if (lat && lng) {
            url += `&lat=${lat}&lng=${lng}`;
        }
        return request(url);
    },
    
    // 获取单个标记详情
    getPin(id) {
        return request(`/map/pins/${id}`);
    },
    
    // 创建标记
    createPin(formData) {
        const token = getToken();
        return fetch(`${API_BASE}/map/pins`, {
            method: 'POST',
            headers: {
                'Authorization': token ? `Bearer ${token}` : ''
            },
            body: formData
        }).then(res => res.json());
    },
    
    // 删除标记
    deletePin(id) {
        return request(`/map/pins/${id}`, {
            method: 'DELETE'
        });
    },
    
    // 获取我的标记
    getMyPins() {
        return request('/map/my-pins');
    },
    
    // 更新标记
    updatePin(id, data) {
        return request(`/map/pins/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },
    
    // 逆地理编码（通过后端代理）
    reverseGeocode(lat, lng) {
        return request(`/map/geocode/reverse?lat=${lat}&lng=${lng}`);
    },
    
    // 获取足迹详情（包含点赞评论统计）
    getPinDetail(id) {
        return request(`/map/pins/${id}/detail`);
    },
    
    // 检查点赞状态
    checkLike(pinId) {
        return request(`/map/pins/${pinId}/like`);
    },
    
    // 切换点赞
    toggleLike(pinId) {
        return request(`/map/pins/${pinId}/like`, {
            method: 'POST'
        });
    },
    
    // 获取评论列表
    getComments(pinId, limit = 20, offset = 0) {
        return request(`/map/pins/${pinId}/comments?limit=${limit}&offset=${offset}`);
    },
    
    // 发表评论
    addComment(pinId, content) {
        return request(`/map/pins/${pinId}/comments`, {
            method: 'POST',
            body: JSON.stringify({ content })
        });
    },
    
    // 删除评论
    deleteComment(commentId) {
        return request(`/map/comments/${commentId}`, {
            method: 'DELETE'
        });
    },
    
    // 获取热力图数据
    getHeatmapData(lat, lng, radius = 50) {
        let url = `/map/heatmap?radius=${radius}`;
        if (lat && lng) {
            url += `&lat=${lat}&lng=${lng}`;
        }
        return request(url);
    },
    
    // 获取全局统计
    getStatsOverview() {
        return request('/map/stats/overview');
    },
    
    // 获取用户个人统计
    getUserStats() {
        return request('/map/stats/user');
    }
};

// 检查登录状态
function checkAuth() {
    const token = getToken();
    if (!token) {
        // 未登录也可以浏览，但发布时会提示
        return false;
    }
    return true;
}

// 跳转到登录页
function redirectToLogin() {
    window.location.href = '../login.html?redirect=' + encodeURIComponent(window.location.href);
}
