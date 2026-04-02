/**
 * ShareX 地图分享 - 主逻辑
 */

let map = null;
let currentMarker = null;
let selectedPosition = null;
let uploadedFiles = [];
let currentMapStyle = 'dark'; // 当前地图风格：默认暗夜黑
let currentLayerType = 'vector'; // 当前图层类型：vector / satellite
let satelliteLayer = null; // 卫星图层
let trafficLayer = null; // 交通图层
let heatmapLayer = null; // 热力图图层
let isHeatmapVisible = false; // 热力图是否显示
let isHeatmapPluginLoaded = false; // 热力图插件是否已加载
let allInfoWindows = []; // 存储所有打开的信息窗体
let isShowAllPins = false; // 是否正在显示全部足迹

// 可用地图风格列表
const mapStyles = {
    graffiti: { name: '涂鸦游戏', style: 'amap://styles/graffiti' },
    dark: { name: '暗夜黑', style: 'amap://styles/dark' },
    blue: { name: '靛青蓝', style: 'amap://styles/blue' },
    whitesmoke: { name: '烟灰白', style: 'amap://styles/whitesmoke' },
    macaron: { name: '马卡龙', style: 'amap://styles/macaron' },
    fresh: { name: '草色青', style: 'amap://styles/fresh' }
};

// 限制标题长度（最多8个汉字，即16个字符）
function limitTitleLength(input) {
    const maxChars = 16; // 最大字符数（英文字符）
    let value = input.value;
    
    // 计算实际字符长度（中文算2个字符）
    let charCount = 0;
    let cutIndex = value.length;
    
    for (let i = 0; i < value.length; i++) {
        // 中文字符算2个，其他算1个
        charCount += (value.charCodeAt(i) > 127) ? 2 : 1;
        if (charCount > maxChars) {
            cutIndex = i;
            break;
        }
    }
    
    // 如果超出限制，截断并提示
    if (charCount > maxChars) {
        input.value = value.substring(0, cutIndex);
        showToast('标题最多8个汉字或16个英文字符');
    }
}

// 从完整地址中提取省市（简洁显示）
function extractProvinceCity(address) {
    if (!address) return '';
    
    // 匹配省/直辖市
    const provinceMatch = address.match(/^(.+?省|.+?自治区|.+?市)/);
    if (!provinceMatch) return address.substring(0, 8);
    
    const province = provinceMatch[1];
    const rest = address.substring(province.length);
    
    // 匹配市（如果后面还有内容）
    const cityMatch = rest.match(/^(.+?市|.+?自治州|.+?地区|.+?盟)/);
    if (cityMatch) {
        // 直辖市特殊处理：北京/上海/天津/重庆
        if (province === cityMatch[1]) {
            return province;
        }
        return province + cityMatch[1];
    }
    
    return province;
}

// 平滑动画移动到目标位置（自定义实现）
function animateToPosition(map, targetLng, targetLat, targetZoom, duration) {
    const startPosition = map.getCenter();
    const startZoom = map.getZoom();
    const startTime = Date.now();
    
    // easeOutCubic 缓动函数
    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    function animate() {
        const elapsedTime = Date.now() - startTime;
        const fraction = Math.min(elapsedTime / duration, 1);
        const easedFraction = easeOutCubic(fraction);

        if (fraction < 1) {
            const newZoom = startZoom + (targetZoom - startZoom) * easedFraction;
            const newLat = startPosition.lat + (targetLat - startPosition.lat) * easedFraction;
            const newLng = startPosition.lng + (targetLng - startPosition.lng) * easedFraction;
            map.setZoom(newZoom);
            map.setCenter([newLng, newLat]);
            requestAnimationFrame(animate);
        } else {
            map.setZoom(targetZoom);
            map.setCenter([targetLng, targetLat]);
        }
    }

    requestAnimationFrame(animate);
}

// 初始化地图
function initMap() {
    // 检查高德地图是否加载
    if (typeof AMap === 'undefined') {
        showToast('地图加载失败，请检查网络');
        return;
    }

    // 检测是否为移动设备
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // 创建地图实例，默认中心为中国
    map = new AMap.Map('mapContainer', {
        zoom: 5,
        center: [104.195397, 35.86166], // 中国中心
        viewMode: '2D',
        // 默认使用暗夜黑风格
        mapStyle: mapStyles[currentMapStyle].style,
    });

    // 添加地图点击事件
    map.on('click', async function(e) {
        selectedPosition = {
            lat: e.lnglat.getLat(),
            lng: e.lnglat.getLng()
        };
        
        // 更新选中位置标记
        updateSelectedMarker(selectedPosition);
        
        // 更新位置显示
        await updateLocationDisplay(selectedPosition);
    });

    // 加载已有标记
    loadPins();
}

// 更新选中位置标记（发布位置 - 红色）
function updateSelectedMarker(position) {
    if (!map || !position) return;
    
    if (currentMarker) {
        currentMarker.setMap(null);
    }
    
    // 使用 SVG 创建霓虹红色标记（游戏风格）- 新建定位
    // viewBox扩大留出8px边距给发光效果
    const blackMarkerSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="54" viewBox="-8 -8 48 54">
            <defs>
                <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
                    <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                    <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
                <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#dc143c" flood-opacity="0.6"/>
                </filter>
            </defs>
            <path d="M16 0C7.16 0 0 6.5 0 14.5c0 10.5 16 23.5 16 23.5s16-13 16-23.5C32 6.5 24.84 0 16 0z" fill="#1a1a1a" stroke="#dc143c" stroke-width="2.5" filter="url(#shadow)"/>
            <circle cx="16" cy="14.5" r="7" fill="#dc143c" filter="url(#glow)"/>
            <circle cx="16" cy="14.5" r="3.5" fill="#1a1a1a"/>
        </svg>
    `;
    
    currentMarker = new AMap.Marker({
        position: [position.lng, position.lat],
        map: map,
        icon: new AMap.Icon({
            size: new AMap.Size(48, 54),
            image: 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(blackMarkerSvg))),
            imageSize: new AMap.Size(48, 54),
            anchor: 'center bottom'
        }),
        offset: new AMap.Pixel(-16, -38)
    });
}

// 更新位置显示
async function updateLocationDisplay(position) {
    const display = document.getElementById('selectedLocation');
    if (!display) {
        console.log('[Map] selectedLocation 元素未找到');
        return;
    }
    
    // 先显示坐标和提示
    display.textContent = `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}（正在获取地址...）`;
    display.style.color = '#888';
    
    console.log('[Map] 开始获取地址:', position.lat, position.lng);
    
    try {
        // 使用后端 API 进行逆地理编码
        const data = await MapAPI.reverseGeocode(position.lat, position.lng);
        console.log('[Map] 逆地理编码结果:', data);
        
        if (data.success && data.address) {
            display.textContent = data.address;
            display.style.color = 'rgba(255,255,255,0.9)';
            if (selectedPosition) {
                selectedPosition.address = data.address;
                console.log('[Map] 地址已保存:', data.address);
            }
        } else {
            throw new Error('逆地理编码失败');
        }
    } catch (error) {
        console.error('[Map] 获取地址失败:', error);
        // 保留坐标显示
        display.textContent = `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`;
        display.style.color = 'rgba(255,255,255,0.9)';
    }
}

// 加载标记列表
async function loadPins() {
    showLoading(true);
    
    try {
        const data = await MapAPI.getPins();
        
        if (data.success && data.pins) {
            data.pins.forEach(pin => {
                addPinToMap(pin);
            });
        }
    } catch (error) {
        console.error('加载标记失败:', error);
    } finally {
        showLoading(false);
    }
}

// 添加标记到地图（其他用户的足迹 - 霓虹红发光效果）
function addPinToMap(pin) {
    // 使用 SVG 创建霓虹发光足迹标记（游戏风格）
    // viewBox扩大留出6px边距给发光效果
    const redMarkerSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="46" viewBox="-6 -6 40 46">
            <defs>
                <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
                    <feGaussianBlur stdDeviation="3.5" result="coloredBlur"/>
                    <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
                <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#dc143c" flood-opacity="0.6"/>
                </filter>
            </defs>
            <path d="M14 0C6.27 0 0 5.8 0 13c0 9.5 14 21 14 21s14-11.5 14-21C28 5.8 21.73 0 14 0z" fill="#1a1a1a" stroke="#dc143c" stroke-width="2.5" filter="url(#shadow)"/>
            <circle cx="14" cy="13" r="6" fill="#dc143c" filter="url(#glow)"/>
            <circle cx="14" cy="13" r="3.5" fill="#1a1a1a"/>
        </svg>
    `;
    
    const marker = new AMap.Marker({
        position: [pin.lng, pin.lat],
        map: map,
        title: pin.title || '位置分享',
        icon: new AMap.Icon({
            size: new AMap.Size(40, 46),
            image: 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(redMarkerSvg))),
            imageSize: new AMap.Size(40, 46),
            anchor: 'center bottom'
        }),
        offset: new AMap.Pixel(-14, -34)
    });
    
    // 创建信息窗体（悬浮卡片）
    // 悬停信息卡片内容（与显示全部足迹样式一致）
    const infoWindowContent = `
        <div style="
            background: linear-gradient(145deg, rgba(26,26,26,0.95), rgba(42,42,42,0.95));
            border: 1px solid rgba(220, 20, 60, 0.4);
            border-radius: 10px;
            padding: 8px 10px;
            min-width: 140px;
            max-width: 160px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.6);
            font-size: 0.8rem;
            backdrop-filter: blur(4px);
        ">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                <img src="${pin.avatar ? '/avatars/' + pin.avatar : '../images/default-avatar.png'}" 
                     style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1.5px solid rgba(220, 20, 60, 0.4);"
                     alt="avatar">
                <div style="color: #fff; font-weight: 600; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(pin.nickname || '匿名')}</div>
            </div>
            ${pin.title ? `<div style="color: #dc143c; font-weight: 600; font-size: 0.75rem; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(pin.title)}</div>` : ''}
            <div style="color: #aaa; font-size: 0.65rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">📍 ${pin.address ? extractProvinceCity(pin.address) : `${pin.lat.toFixed(3)}, ${pin.lng.toFixed(3)}`}</div>
        </div>
    `;
    
    const infoWindow = new AMap.InfoWindow({
        content: infoWindowContent,
        offset: new AMap.Pixel(0, -45),
        closeWhenClickMap: false,
        isCustom: true
    });
    
    // 鼠标悬停显示信息窗体
    marker.on('mouseover', function() {
        infoWindow.open(map, [pin.lng, pin.lat]);
    });
    
    // 鼠标移出隐藏信息窗体
    marker.on('mouseout', function() {
        infoWindow.close();
    });
    
    // 点击标记显示详情
    marker.on('click', function() {
        infoWindow.close();
        showPinDetail(pin);
    });
}

// 打开发布弹窗
function openPostModal() {
    document.getElementById('postModal').classList.add('show');
}

// 关闭发布弹窗
function closePostModal() {
    document.getElementById('postModal').classList.remove('show');
    // 重置表单
    document.getElementById('postTitle').value = '';
    document.getElementById('postContent').value = '';
    uploadedFiles = [];
    updateImagePreview();
    // 重置位置显示
    const locationDisplay = document.getElementById('selectedLocation');
    if (locationDisplay) {
        locationDisplay.textContent = '点击地图选择位置或使用"使用当前位置"按钮';
    }
}

// 处理文件选择
function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    
    if (uploadedFiles.length + files.length > 5) {
        showToast('最多只能上传5张图片');
        return;
    }
    
    files.forEach(file => {
        if (file.size > 5 * 1024 * 1024) {
            showToast('单张图片不能超过5MB');
            return;
        }
        uploadedFiles.push(file);
    });
    
    updateImagePreview();
}

// 更新图片预览
function updateImagePreview() {
    const container = document.getElementById('imageUpload');
    
    // 保留上传按钮
    container.innerHTML = `
        <div class="upload-btn" onclick="document.getElementById('fileInput').click()">+</div>
    `;
    
    // 添加预览
    uploadedFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const div = document.createElement('div');
            div.className = 'upload-preview';
            div.innerHTML = `
                <img src="${e.target.result}" alt="preview">
                <div class="remove" onclick="removeImage(${index})">×</div>
            `;
            container.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

// 移除图片
function removeImage(index) {
    uploadedFiles.splice(index, 1);
    updateImagePreview();
}

// 提交发布
async function submitPost() {
    const token = getToken();
    if (!token) {
        showToast('请先登录');
        setTimeout(redirectToLogin, 1500);
        return;
    }
    
    // 检查是否选择了位置
    if (!selectedPosition) {
        showToast('请先选择位置（点击地图或使用"使用当前位置"按钮）');
        return;
    }
    
    const title = document.getElementById('postTitle').value;
    const content = document.getElementById('postContent').value;
    
    if (!content && uploadedFiles.length === 0) {
        showToast('请填写内容或上传图片');
        return;
    }
    
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = '发布中...';
    
    try {
        console.log('[Map] 提交发布:', selectedPosition);
        const formData = new FormData();
        formData.append('lat', selectedPosition.lat);
        formData.append('lng', selectedPosition.lng);
        formData.append('title', title);
        formData.append('content', content);
        if (selectedPosition.address) {
            formData.append('address', selectedPosition.address);
            console.log('[Map] 提交地址:', selectedPosition.address);
        } else {
            console.log('[Map] 无地址信息');
        }
        
        uploadedFiles.forEach(file => {
            formData.append('images', file);
        });
        
        const result = await MapAPI.createPin(formData);
        
        if (result.success) {
            showToast('发布成功！');
            closePostModal();
            // 刷新标记
            loadPins();
        } else {
            showToast(result.error || '发布失败');
        }
    } catch (error) {
        showToast('发布失败，请重试');
        console.error(error);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '发布分享';
    }
}

// 当前查看的足迹ID
let currentPinId = null;
let currentPinData = null;

// 显示足迹详情弹窗（包含点赞评论）
async function showPinDetail(pinData) {
    currentPinId = pinData.id;
    currentPinData = pinData;
    
    const detailHtml = `
        <div class="user-info">
            <img src="${pinData.avatar ? '/avatars/' + pinData.avatar : '../images/default-avatar.png'}" 
                 class="avatar" alt="avatar">
            <span class="nickname">${pinData.nickname || '匿名用户'}</span>
        </div>
        <div class="time">${formatDate(pinData.created_at)}</div>
        ${pinData.title ? `<h4 style="margin-bottom: 10px;">${pinData.title}</h4>` : ''}
        ${pinData.content ? `<div class="content">${escapeHtml(pinData.content)}</div>` : ''}
        ${pinData.images && pinData.images.length > 0 ? `
            <div class="images">
                ${pinData.images.map(img => `
                    <img src="/uploads/map/${img}" alt="分享图片" onclick="previewImage('/uploads/map/${img}')">
                `).join('')}
            </div>
        ` : ''}
        <div class="location">
            📍 ${pinData.address || `${pinData.lat.toFixed(4)}, ${pinData.lng.toFixed(4)}`}
        </div>
    `;
    
    document.getElementById('pinDetail').innerHTML = detailHtml;
    
    // 更新点赞数和评论数
    document.getElementById('likeCount').textContent = pinData.like_count || 0;
    document.getElementById('commentCount').textContent = pinData.comment_count || 0;
    
    // 检查当前用户是否已点赞
    await checkLikeStatus();
    
    // 加载评论列表
    await loadComments();
    
    document.getElementById('detailModal').classList.add('show');
}

// 点击卡片打开足迹详情（通过ID）
async function openPinDetail(pinId) {
    try {
        const data = await MapAPI.getPinDetail(pinId);
        
        if (data.success && data.pin) {
            await showPinDetail(data.pin);
        } else {
            showToast('足迹不存在');
        }
    } catch (error) {
        console.error('[Map] 加载足迹详情失败:', error);
        showToast('加载详情失败');
    }
}

// 关闭详情弹窗
function closeDetailModal() {
    document.getElementById('detailModal').classList.remove('show');
    currentPinId = null;
    currentPinData = null;
}

// 检查点赞状态
async function checkLikeStatus() {
    const token = getToken();
    if (!token || !currentPinId) return;
    
    try {
        const data = await MapAPI.checkLike(currentPinId);
        const likeBtn = document.getElementById('likeBtn');
        const likeIcon = likeBtn.querySelector('.icon');
        
        if (data.liked) {
            likeBtn.classList.add('active');
            likeIcon.textContent = '♥';
        } else {
            likeBtn.classList.remove('active');
            likeIcon.textContent = '♡';
        }
        document.getElementById('likeCount').textContent = data.likeCount;
    } catch (error) {
        console.error('[Map] 检查点赞状态失败:', error);
    }
}

// 切换点赞
async function toggleLike() {
    const token = getToken();
    if (!token) {
        showToast('请先登录');
        return;
    }
    
    if (!currentPinId) return;
    
    try {
        const data = await MapAPI.toggleLike(currentPinId);
        const likeBtn = document.getElementById('likeBtn');
        const likeIcon = likeBtn.querySelector('.icon');
        
        if (data.liked) {
            likeBtn.classList.add('active');
            likeIcon.textContent = '♥';
            showToast('❤️ 点赞成功');
        } else {
            likeBtn.classList.remove('active');
            likeIcon.textContent = '♡';
            showToast('取消点赞');
        }
        
        document.getElementById('likeCount').textContent = 
            parseInt(document.getElementById('likeCount').textContent) + (data.liked ? 1 : -1);
    } catch (error) {
        console.error('[Map] 点赞失败:', error);
        showToast('操作失败');
    }
}

// 加载评论列表
async function loadComments() {
    if (!currentPinId) return;
    
    try {
        const data = await MapAPI.getComments(currentPinId);
        const commentsList = document.getElementById('commentsList');
        const currentUserId = getUserId();
        
        if (data.comments && data.comments.length > 0) {
            commentsList.innerHTML = data.comments.map(comment => `
                <div class="comment-item" data-id="${comment.id}">
                    <img src="${comment.avatar ? '/avatars/' + comment.avatar : '../images/default-avatar.png'}" 
                         class="comment-avatar" alt="avatar">
                    <div class="comment-content">
                        <div class="comment-header">
                            <span class="comment-nickname">${escapeHtml(comment.nickname || '匿名')}</span>
                            <div>
                                <span class="comment-time">${formatDate(comment.created_at)}</span>
                                ${comment.user_id == currentUserId ? `
                                    <span class="comment-delete" onclick="deleteComment(${comment.id})">删除</span>
                                ` : ''}
                            </div>
                        </div>
                        <div class="comment-text">${escapeHtml(comment.content)}</div>
                    </div>
                </div>
            `).join('');
        } else {
            commentsList.innerHTML = '<div class="comments-empty">暂无评论，来说两句吧~</div>';
        }
        
        document.getElementById('commentCount').textContent = data.total || 0;
    } catch (error) {
        console.error('[Map] 加载评论失败:', error);
    }
}

// 聚焦评论输入框
function focusComment() {
    document.getElementById('commentInput').focus();
}

// 发表评论
async function submitComment() {
    const token = getToken();
    if (!token) {
        showToast('请先登录');
        return;
    }
    
    if (!currentPinId) return;
    
    const input = document.getElementById('commentInput');
    const content = input.value.trim();
    
    if (!content) {
        showToast('请输入评论内容');
        return;
    }
    
    try {
        const submitBtn = document.querySelector('.comment-submit');
        submitBtn.disabled = true;
        submitBtn.textContent = '发送中...';
        
        const data = await MapAPI.addComment(currentPinId, content);
        
        if (data.success) {
            input.value = '';
            showToast('评论成功');
            await loadComments();
        }
    } catch (error) {
        console.error('[Map] 评论失败:', error);
        showToast('评论失败');
    } finally {
        const submitBtn = document.querySelector('.comment-submit');
        submitBtn.disabled = false;
        submitBtn.textContent = '发送';
    }
}

// 删除评论
async function deleteComment(commentId) {
    if (!confirm('确定要删除这条评论吗？')) return;
    
    try {
        await MapAPI.deleteComment(commentId);
        showToast('删除成功');
        await loadComments();
    } catch (error) {
        console.error('[Map] 删除评论失败:', error);
        showToast('删除失败');
    }
}

// 图片预览（简易版）
function previewImage(src) {
    // 创建预览遮罩
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.9); z-index: 5000;
        display: flex; align-items: center; justify-content: center;
        cursor: zoom-out;
    `;
    
    const img = document.createElement('img');
    img.src = src;
    img.style.cssText = 'max-width: 90%; max-height: 90%; border-radius: 8px;';
    
    overlay.appendChild(img);
    document.body.appendChild(overlay);
    
    overlay.onclick = () => overlay.remove();
}

// 显示使用说明弹窗
function showHelpModal() {
    document.getElementById('helpModal').classList.add('show');
}

// 关闭使用说明弹窗
function closeHelpModal() {
    document.getElementById('helpModal').classList.remove('show');
}

// 显示我的足迹侧边栏
async function showMyPins() {
    const token = getToken();
    if (!token) {
        showToast('请先登录');
        setTimeout(redirectToLogin, 1500);
        return;
    }
    
    // 打开侧边栏
    document.getElementById('myPinsSidebar').classList.add('show');
    
    // 加载足迹列表
    await loadMyPinsList();
}

// 关闭我的足迹侧边栏
function closeMyPinsSidebar() {
    document.getElementById('myPinsSidebar').classList.remove('show');
}

// 加载我的足迹列表
async function loadMyPinsList() {
    const listContainer = document.getElementById('myPinsList');
    listContainer.innerHTML = '<div class="loading" style="display:block;position:static;margin:20px auto;"><div class="loading-spinner"></div></div>';
    
    try {
        const data = await MapAPI.getMyPins();
        
        if (data.success && data.pins) {
            if (data.pins.length === 0) {
                listContainer.innerHTML = '<div class="pin-item-empty">还没有足迹，快去分享你的位置吧！</div>';
                return;
            }
            
            listContainer.innerHTML = data.pins.map(pin => `
                <div class="pin-item" data-id="${pin.id}">
                    <div class="pin-item-header">
                        <div class="pin-item-title">${pin.title || '无标题'}</div>
                        <div class="pin-item-actions">
                            <button class="pin-item-edit" onclick="editMyPin(${pin.id}, event)">编辑</button>
                            <button class="pin-item-delete" onclick="deleteMyPin(${pin.id}, event)">删除</button>
                        </div>
                    </div>
                    ${pin.content ? `<div class="pin-item-content">${escapeHtml(pin.content)}</div>` : ''}
                    <div class="pin-item-address">📍 ${pin.address || `${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)}`}</div>
                    ${pin.images && pin.images.length > 0 ? `
                        <div class="pin-item-images">
                            ${pin.images.slice(0, 3).map(img => `<img src="/uploads/map/${img}" alt="">`).join('')}
                            ${pin.images.length > 3 ? `<span style="color:#888;font-size:0.8rem;">+${pin.images.length - 3}</span>` : ''}
                        </div>
                    ` : ''}
                    <div class="pin-item-footer">
                        <span>${formatDate(pin.created_at)}</span>
                        <span>👁 ${pin.view_count || 0}</span>
                    </div>
                </div>
            `).join('');
            
            // 添加点击事件（点击卡片查看详情）
            listContainer.querySelectorAll('.pin-item').forEach(item => {
                item.addEventListener('click', function(e) {
                    // 如果点击的是删除或编辑按钮，不触发查看详情
                    if (e.target.classList.contains('pin-item-delete') || e.target.classList.contains('pin-item-edit')) return;
                    
                    const pinId = this.dataset.id;
                    const pin = data.pins.find(p => p.id == pinId);
                    if (pin) {
                        // 平滑飞行到该位置
                        animateToPosition(map, pin.lng, pin.lat, 15, 2000);
                        // 显示详情
                        showPinDetail(pin);
                    }
                });
            });
        } else {
            listContainer.innerHTML = '<div class="pin-item-empty">加载失败</div>';
        }
    } catch (error) {
        console.error('[Map] 加载足迹列表失败:', error);
        listContainer.innerHTML = '<div class="pin-item-empty">加载失败</div>';
    }
}

// 删除我的足迹
async function deleteMyPin(pinId, event) {
    event.stopPropagation(); // 阻止冒泡，避免触发查看详情
    
    if (!confirm('确定要删除这条足迹吗？')) {
        return;
    }
    
    try {
        const result = await MapAPI.deletePin(pinId);
        if (result.success) {
            showToast('删除成功');
            // 刷新列表
            await loadMyPinsList();
            // 刷新地图标记
            loadPins();
        } else {
            showToast(result.error || '删除失败');
        }
    } catch (error) {
        console.error('[Map] 删除足迹失败:', error);
        showToast('删除失败');
    }
}

// 编辑我的足迹
let editingPinId = null;

async function editMyPin(pinId, event) {
    event.stopPropagation(); // 阻止冒泡
    
    try {
        const data = await MapAPI.getPin(pinId);
        if (!data.success || !data.pin) {
            showToast('足迹不存在');
            return;
        }
        
        const pin = data.pin;
        editingPinId = pinId;
        
        // 填充编辑表单
        document.getElementById('editPinTitle').value = pin.title || '';
        document.getElementById('editPinContent').value = pin.content || '';
        
        // 显示编辑弹窗
        document.getElementById('editPinModal').classList.add('show');
    } catch (error) {
        console.error('[Map] 加载足迹失败:', error);
        showToast('加载失败');
    }
}

// 关闭编辑弹窗
function closeEditPinModal() {
    document.getElementById('editPinModal').classList.remove('show');
    editingPinId = null;
}

// 提交编辑
async function submitEditPin() {
    if (!editingPinId) return;
    
    const title = document.getElementById('editPinTitle').value;
    const content = document.getElementById('editPinContent').value;
    
    try {
        const result = await MapAPI.updatePin(editingPinId, { title, content });
        if (result.success) {
            showToast('修改成功');
            closeEditPinModal();
            // 刷新列表
            await loadMyPinsList();
            // 刷新地图标记
            loadPins();
        } else {
            showToast(result.error || '修改失败');
        }
    } catch (error) {
        console.error('[Map] 修改足迹失败:', error);
        showToast('修改失败');
    }
}

// 获取当前位置（只切换视角，不创建发布标记）
async function locateMe() {
    const btn = document.querySelector('.fab-location');
    
    // 检查浏览器是否支持地理定位
    if (!navigator.geolocation) {
        showToast('您的设备不支持地理定位');
        return;
    }
    
    btn.disabled = true;
    showToast('正在定位...');
    
    navigator.geolocation.getCurrentPosition(
        // 成功回调
        async function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            // 平滑动画移动到当前位置
            animateToPosition(map, lng, lat, 15, 3000);
            
            // 添加一个临时标记（不作为发布位置）- 霓虹绿发光效果
            // viewBox扩大留出6px边距给发光效果
            const greenMarkerSvg = `
                <svg xmlns="http://www.w3.org/2000/svg" width="42" height="48" viewBox="-6 -6 42 48">
                    <defs>
                        <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
                            <feGaussianBlur stdDeviation="3.5" result="coloredBlur"/>
                            <feMerge>
                                <feMergeNode in="coloredBlur"/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#27ae60" flood-opacity="0.6"/>
                        </filter>
                    </defs>
                    <path d="M15 0C6.7 0 0 6.2 0 14c0 10.5 15 22 15 22s15-11.5 15-22C30 6.2 23.3 0 15 0z" fill="#1a1a1a" stroke="#27ae60" stroke-width="2.5" filter="url(#shadow)"/>
                    <circle cx="15" cy="14" r="6.5" fill="#27ae60" filter="url(#glow)"/>
                    <circle cx="15" cy="14" r="3.5" fill="#1a1a1a"/>
                </svg>
            `;
            
            const currentLocationMarker = new AMap.Marker({
                position: [lng, lat],
                map: map,
                title: '您的位置',
                icon: new AMap.Icon({
                    size: new AMap.Size(42, 48),
                    image: 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(greenMarkerSvg))),
                    imageSize: new AMap.Size(42, 48),
                    anchor: 'center bottom'
                }),
                offset: new AMap.Pixel(-15, -36)
            });
            
            // 获取地址信息
            try {
                const data = await MapAPI.reverseGeocode(lat, lng);
                if (data.success && data.address) {
                    showToast('📍 ' + data.address);
                } else {
                    showToast('已定位到您的位置');
                }
            } catch (error) {
                console.error('[Map] 获取地址失败:', error);
                showToast('已定位到您的位置');
            }
            
            btn.disabled = false;
        },
        // 错误回调
        function(error) {
            btn.disabled = false;
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    showToast('您拒绝了位置请求');
                    break;
                case error.POSITION_UNAVAILABLE:
                    showToast('无法获取位置信息');
                    break;
                case error.TIMEOUT:
                    showToast('获取位置超时');
                    break;
                default:
                    showToast('获取位置失败');
            }
        },
        // 选项
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// 获取当前位置并设置为发布位置
async function getCurrentLocation() {
    const btn = document.querySelector('.btn-use-location') || document.querySelector('.fab-post');
    
    // 检查浏览器是否支持地理定位
    if (!navigator.geolocation) {
        showToast('您的设备不支持地理定位');
        return;
    }
    
    if (btn) btn.disabled = true;
    showToast('正在获取位置...');
    
    navigator.geolocation.getCurrentPosition(
        // 成功回调
        async function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            // 更新选中位置
            selectedPosition = {
                lat: lat,
                lng: lng
            };
            
            // 平滑飞行到当前位置
            animateToPosition(map, lng, lat, 15, 2000);
            
            // 添加标记
            updateSelectedMarker(selectedPosition);
            
            // 更新位置显示（包括弹窗中的显示）
            await updateLocationDisplay(selectedPosition);
            
            // 获取地址并在提示中显示
            console.log('[Map] 开始获取地址...');
            try {
                const data = await MapAPI.reverseGeocode(lat, lng);
                console.log('[Map] 逆地理编码结果:', data);
                if (data.success && data.address) {
                    selectedPosition.address = data.address;
                    showToast('📍 ' + data.address);
                    console.log('[Map] 地址已保存到 selectedPosition:', data.address);
                } else {
                    showToast('定位成功！可以发布了');
                    console.log('[Map] 逆地理编码失败');
                }
            } catch (error) {
                console.error('[Map] 获取地址失败:', error);
                showToast('定位成功！可以发布了');
            }
            if (btn) btn.disabled = false;
        },
        // 错误回调
        function(error) {
            if (btn) btn.disabled = false;
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    showToast('您拒绝了位置请求');
                    break;
                case error.POSITION_UNAVAILABLE:
                    showToast('无法获取位置信息');
                    break;
                case error.TIMEOUT:
                    showToast('获取位置超时');
                    break;
                default:
                    showToast('获取位置失败');
            }
        },
        // 选项
        {
            enableHighAccuracy: true,  // 高精度
            timeout: 10000,            // 10秒超时
            maximumAge: 0              // 不使用缓存
        }
    );
}

// 返回大厅
function backToHall() {
    window.location.href = '../gamehall.html';
}

// 退出登录
function logout() {
    if (confirm('确定要退出登录吗？')) {
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        localStorage.removeItem('username');
        window.location.href = '../index.html';
    }
}

// 显示提示
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// 显示/隐藏加载
function showLoading(show) {
    const loading = document.getElementById('loading');
    if (show) {
        loading.classList.add('show');
    } else {
        loading.classList.remove('show');
    }
}

// 格式化日期
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 页面加载完成后初始化
window.onload = function() {
    initMap();
    // 延迟自动显示全部足迹，等待地图加载完成
    setTimeout(() => {
        showAllPinsInfo();
    }, 1500);
};

// 点击弹窗外部关闭
document.getElementById('postModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closePostModal();
    }
});

document.getElementById('detailModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeDetailModal();
    }
});

// 点击使用说明弹窗外部关闭
document.getElementById('helpModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeHelpModal();
    }
});

// 点击编辑弹窗外部关闭
document.getElementById('editPinModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeEditPinModal();
    }
});

// 点击侧边栏外部关闭
document.getElementById('myPinsSidebar').addEventListener('click', function(e) {
    if (e.target === this) {
        closeMyPinsSidebar();
    }
});

// 点击地图其他区域关闭图层菜单
document.addEventListener('click', function(e) {
    const layerMenu = document.getElementById('layerMenu');
    const layerBtn = document.querySelector('.fab-layer');
    if (layerMenu && !layerMenu.contains(e.target) && !layerBtn.contains(e.target)) {
        layerMenu.classList.remove('show');
    }
});

// 切换图层菜单显示
function toggleLayerMenu() {
    const menu = document.getElementById('layerMenu');
    menu.classList.toggle('show');
}

// 检查是否处于全屏状态（包括 F11 触发的全屏）
function isFullscreen() {
    // 1. 检查 API 全屏
    const isApiFullscreen = !!(document.fullscreenElement || 
                               document.webkitFullscreenElement || 
                               document.mozFullScreenElement || 
                               document.msFullscreenElement);
    
    if (isApiFullscreen) return true;
    
    // 2. 检查 F11 全屏 - 使用更宽松的条件
    // 只要窗口高度接近屏幕高度，就认为是全屏
    const winHeight = window.innerHeight;
    const screenHeight = screen.height;
    const heightRatio = winHeight / screenHeight;
    
    // 高度比例大于 0.95 认为是全屏（允许浏览器保留少量 UI）
    const isF11Fullscreen = heightRatio > 0.95;
    
    console.log('[Fullscreen] height:', winHeight, 'screen:', screenHeight, 'ratio:', heightRatio, 'isF11:', isF11Fullscreen);
    
    return isF11Fullscreen;
}

// 更新全屏按钮状态
function updateFullscreenButton() {
    const btn = document.getElementById('fullscreenBtn');
    if (!btn) return;
    
    if (isFullscreen()) {
        btn.innerHTML = '⛶';
        btn.title = '退出全屏';
    } else {
        btn.innerHTML = '⛶';
        btn.title = '全屏';
    }
}

// 刷新地图
function refreshMap() {
    const btn = document.getElementById('refreshBtn');
    if (btn.classList.contains('spinning')) return;
    
    btn.classList.add('spinning');
    showToast('正在刷新...');
    
    // 记录刷新前是否正在显示全部足迹
    const wasShowingAll = isShowAllPins;
    
    // 重新加载足迹
    loadPins().then(() => {
        // 如果之前正在显示全部足迹，刷新后也重新显示
        if (wasShowingAll) {
            isShowAllPins = false; // 重置状态，让showAllPinsInfo能正确执行
            showAllPinsInfo();
        }
        
        setTimeout(() => {
            btn.classList.remove('spinning');
            showToast('刷新完成');
        }, 500);
    }).catch(() => {
        btn.classList.remove('spinning');
        showToast('刷新失败');
    });
}

// 切换全屏模式
function toggleFullscreen() {
    if (!isFullscreen()) {
        // 进入全屏
        const docEl = document.documentElement;
        const requestFullScreen = docEl.requestFullscreen || 
                                  docEl.webkitRequestFullscreen || 
                                  docEl.mozRequestFullScreen || 
                                  docEl.msRequestFullscreen;
        
        if (requestFullScreen) {
            requestFullScreen.call(docEl).then(() => {
                updateFullscreenButton();
                showToast('已进入全屏模式');
            }).catch(err => {
                showToast('无法进入全屏模式');
            });
        }
    } else {
        // 退出全屏 - 区分 API 全屏和 F11 全屏
        const isApiFullscreen = !!(document.fullscreenElement || 
                                   document.webkitFullscreenElement || 
                                   document.mozFullScreenElement || 
                                   document.msFullscreenElement);
        
        if (isApiFullscreen) {
            // API 全屏，使用 API 退出
            const exitFullScreen = document.exitFullscreen || 
                                   document.webkitExitFullscreen || 
                                   document.mozCancelFullScreen || 
                                   document.msExitFullscreen;
            
            if (exitFullScreen) {
                exitFullScreen.call(document).then(() => {
                    updateFullscreenButton();
                    showToast('已退出全屏模式');
                });
            }
        } else {
            // F11 全屏，提示用户按 ESC
            showToast('若退出全屏请轻按 F11 或长按 Esc');
        }
    }
}

// 监听全屏变化事件（API 触发）
document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
document.addEventListener('mozfullscreenchange', updateFullscreenButton);
document.addEventListener('MSFullscreenChange', updateFullscreenButton);

// 监听窗口大小变化（捕获 F11 全屏）
window.addEventListener('resize', () => {
    // 使用防抖，F11 动画需要一定时间
    clearTimeout(window.resizeTimer);
    window.resizeTimer = setTimeout(updateFullscreenButton, 300);
});

// 监听 F11 按键，强制更新状态
document.addEventListener('keydown', (e) => {
    if (e.key === 'F11') {
        // F11 按键后延迟检测（浏览器全屏动画需要时间）
        setTimeout(updateFullscreenButton, 500);
        setTimeout(updateFullscreenButton, 1000);
    }
});

// 页面加载时初始化按钮状态
window.addEventListener('load', updateFullscreenButton);

// 定时检测（备用方案）
setInterval(updateFullscreenButton, 1000);

// 显示全部足迹信息窗体
async function showAllPinsInfo() {
    const btn = document.querySelector('.fab-show-all');
    
    // 如果已经在显示状态，则关闭所有信息窗体
    if (isShowAllPins) {
        allInfoWindows.forEach(marker => {
            marker.setMap(null);
        });
        allInfoWindows = [];
        isShowAllPins = false;
        btn.classList.remove('active');
        showToast('已关闭全部足迹显示');
        return;
    }
    
    // 获取所有足迹
    try {
        btn.disabled = true;
        showToast('正在加载全部足迹...');
        
        const data = await MapAPI.getPins();
        
        if (data.success && data.pins && data.pins.length > 0) {
            // 关闭之前的所有信息窗体
            allInfoWindows.forEach(marker => {
                marker.setMap(null);
            });
            allInfoWindows = [];
            
            // 为每个足迹创建自定义覆盖物（同时显示多个）
            data.pins.forEach((pin, index) => {
                // 创建带缩放动画的卡片内容（可点击）
                const cardContent = `
                    <div class="pin-info-card" onclick="openPinDetail(${pin.id})" style="
                        background: linear-gradient(145deg, rgba(26,26,26,0.95), rgba(42,42,42,0.95));
                        border: 1px solid rgba(220, 20, 60, 0.4);
                        border-radius: 8px;
                        padding: 5px 8px;
                        min-width: 110px;
                        max-width: 130px;
                        box-shadow: 0 3px 10px rgba(0,0,0,0.5);
                        font-size: 0.7rem;
                        backdrop-filter: blur(4px);
                        cursor: pointer;
                        transform: scale(0);
                        opacity: 0;
                        transform-origin: center bottom;
                        animation: cardPopIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                        animation-delay: ${index * 0.05}s;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.borderColor='rgba(220, 20, 60, 0.8)'; this.style.transform='scale(1.02)';" 
                       onmouseout="this.style.borderColor='rgba(220, 20, 60, 0.4)'; this.style.transform='scale(1)';">
                        <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 3px;">
                            <img src="${pin.avatar ? '/avatars/' + pin.avatar : '../images/default-avatar.png'}" 
                                 style="width: 18px; height: 18px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(220, 20, 60, 0.4); pointer-events: none;"
                                 alt="avatar">
                            <div style="color: #fff; font-weight: 600; font-size: 0.7rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;">${escapeHtml(pin.nickname || '匿名')}</div>
                        </div>
                        ${pin.title ? `<div style="color: #dc143c; font-weight: 600; font-size: 0.65rem; margin-bottom: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;">${escapeHtml(pin.title)}</div>` : ''}
                        <div style="color: #aaa; font-size: 0.6rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;">📍 ${pin.address ? extractProvinceCity(pin.address) : `${pin.lat.toFixed(3)}, ${pin.lng.toFixed(3)}`}</div>
                    </div>
                `;
                
                // 使用 LabelMarker 或自定义覆盖物
                const labelMarker = new AMap.Marker({
                    position: [pin.lng, pin.lat],
                    map: map,
                    content: cardContent,
                    offset: new AMap.Pixel(-55, -70), // 偏移量，让卡片显示在标记上方
                    zIndex: 200
                });
                
                allInfoWindows.push(labelMarker);
            });
            
            // 添加动画样式（如果还没有添加）
            if (!document.getElementById('card-animation-style')) {
                const style = document.createElement('style');
                style.id = 'card-animation-style';
                style.textContent = `
                    @keyframes cardPopIn {
                        0% {
                            transform: scale(0);
                            opacity: 0;
                        }
                        50% {
                            transform: scale(1.1);
                            opacity: 0.8;
                        }
                        100% {
                            transform: scale(1);
                            opacity: 1;
                        }
                    }
                `;
                document.head.appendChild(style);
            }
            
            isShowAllPins = true;
            btn.classList.add('active');
            showToast(`发现了 ${data.pins.length} 个足迹`);
        } else {
            showToast('暂无足迹');
        }
        
        btn.disabled = false;
    } catch (error) {
        console.error('[Map] 加载足迹失败:', error);
        showToast('加载失败');
        btn.disabled = false;
    }
}

// 切换地图风格
function switchMapStyle(styleName) {
    if (!map || !mapStyles[styleName]) return;
    
    currentMapStyle = styleName;
    
    // 应用新风格
    map.setMapStyle(mapStyles[styleName].style);
    
    // 更新按钮状态
    document.querySelectorAll('.layer-option[data-style]').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.style === styleName) {
            btn.classList.add('active');
        }
    });
    
    showToast(`已切换到：${mapStyles[styleName].name}`);
}

// 切换图层类型（矢量/卫星）
function switchLayerType(layerType) {
    if (!map) return;
    
    currentLayerType = layerType;
    
    // 更新按钮状态
    document.querySelectorAll('.layer-option[data-layer]').forEach(btn => {
        if (btn.dataset.layer === 'vector' || btn.dataset.layer === 'satellite') {
            btn.classList.remove('active');
            if (btn.dataset.layer === layerType) {
                btn.classList.add('active');
            }
        }
    });
    
    switch(layerType) {
        case 'vector':
            // 矢量图层 - 显示当前风格的矢量地图
            if (satelliteLayer) {
                satelliteLayer.hide();
            }
            showToast('已切换到矢量图层');
            break;
            
        case 'satellite':
            // 卫星图层
            if (!satelliteLayer) {
                satelliteLayer = new AMap.TileLayer.Satellite();
                satelliteLayer.setMap(map);
            } else {
                satelliteLayer.show();
            }
            showToast('已切换到卫星影像');
            break;
    }
}

// 切换交通路况图层
function toggleTrafficLayer() {
    if (!map) return;
    
    const statusSpan = document.getElementById('trafficStatus');
    const trafficBtn = document.getElementById('trafficBtn');
    
    if (!trafficLayer) {
        // 开启交通图层
        trafficLayer = new AMap.TileLayer.Traffic();
        trafficLayer.setMap(map);
        statusSpan.textContent = '开';
        statusSpan.style.color = '#27ae60';
        trafficBtn.classList.add('active');
        showToast('交通路况：已开启');
    } else {
        if (trafficLayer.getMap()) {
            // 关闭交通图层
            trafficLayer.setMap(null);
            statusSpan.textContent = '关';
            statusSpan.style.color = '#666';
            trafficBtn.classList.remove('active');
            showToast('交通路况：已关闭');
        } else {
            // 开启交通图层
            trafficLayer.setMap(map);
            statusSpan.textContent = '开';
            statusSpan.style.color = '#27ae60';
            trafficBtn.classList.add('active');
            showToast('交通路况：已开启');
        }
    }
}

// 兼容旧版函数（保留但不再使用）
function switchMapLayer(layerType) {
    console.log('[Map] switchMapLayer 已弃用，请使用 switchMapStyle 或 switchLayerType');
}

/**
 * ==================== 热力图功能 ====================
 */

// 切换热力图图层
async function toggleHeatmapLayer() {
    if (!map) return;
    
    const heatmapBtn = document.getElementById('heatmapBtn');
    
    if (!isHeatmapVisible) {
        // 显示热力图
        showLoading(true);
        try {
            // 加载热力图插件（如果还没加载）
            if (!isHeatmapPluginLoaded) {
                await new Promise((resolve, reject) => {
                    AMap.plugin(['AMap.HeatMap'], function() {
                        isHeatmapPluginLoaded = true;
                        resolve();
                    });
                });
            }
            
            // 获取当前地图视野中心
            const center = map.getCenter();
            const zoom = map.getZoom();
            
            // 根据缩放级别调整半径
            let radius = 500; // 默认半径（公里）
            if (zoom >= 10) radius = 20;
            else if (zoom >= 8) radius = 50;
            else if (zoom >= 6) radius = 100;
            else if (zoom >= 4) radius = 300;
            
            const data = await MapAPI.getHeatmapData(center.lat, center.lng, radius);
            
            if (data.success && data.points && data.points.length > 0) {
                // 高德热力图需要的数据格式: {lng, lat, count}
                const heatmapData = data.points.map(p => ({
                    lng: p.lng,
                    lat: p.lat,
                    count: p.count
                }));
                
                // 创建或更新热力图
                if (!heatmapLayer) {
                    console.log('[Heatmap] Creating new HeatMap instance');
                    heatmapLayer = new AMap.HeatMap(map, {
                        radius: 30, // 适中的半径
                        opacity: [0.4, 0.85], // 透明度
                        // 纯正红色渐变：透明 -> 浅红 -> 红 -> 深红
                        gradient: {
                            0.0: 'rgba(220, 20, 60, 0)',
                            0.3: 'rgba(220, 20, 60, 0.3)',
                            0.5: 'rgba(220, 20, 60, 0.6)',
                            0.7: 'rgba(220, 20, 60, 0.8)',
                            0.9: 'rgba(139, 0, 0, 0.9)',
                            1.0: 'rgba(100, 0, 0, 1)'
                        }
                    });
                    console.log('[Heatmap] Instance created:', heatmapLayer);
                }
                
                // 高德 2.0 热力图使用 setData 或 setDataSet
                if (typeof heatmapLayer.setData === 'function') {
                    console.log('[Heatmap] Using setData');
                    heatmapLayer.setData(heatmapData, {
                        max: Math.max(...heatmapData.map(p => p.count), 10)
                    });
                } else if (typeof heatmapLayer.setDataSet === 'function') {
                    console.log('[Heatmap] Using setDataSet');
                    heatmapLayer.setDataSet({
                        data: heatmapData,
                        max: Math.max(...heatmapData.map(p => p.count), 10)
                    });
                } else {
                    console.error('[Heatmap] No data method found!');
                    throw new Error('热力图方法未找到');
                }
                
                // 显示热力图
                heatmapLayer.show();
                
                isHeatmapVisible = true;
                heatmapBtn.classList.add('active');
                showToast(`🔥 热力图已开启 (${data.count} 个点位)`);
            } else {
                // 当前视野无数据，尝试获取全局数据
                showToast('当前视野无足迹，正在获取全局数据...');
                const globalData = await MapAPI.getHeatmapData(null, null, 5000);
                
                if (globalData.success && globalData.points && globalData.points.length > 0) {
                    const heatmapData = globalData.points.map(p => ({
                        lng: p.lng,
                        lat: p.lat,
                        count: p.count
                    }));
                    
                    if (!heatmapLayer) {
                        heatmapLayer = new AMap.HeatMap(map, {
                            radius: 30,
                            opacity: [0.4, 0.85],
                            gradient: {
                                0.0: 'rgba(220, 20, 60, 0)',
                                0.3: 'rgba(220, 20, 60, 0.3)',
                                0.5: 'rgba(220, 20, 60, 0.6)',
                                0.7: 'rgba(220, 20, 60, 0.8)',
                                0.9: 'rgba(139, 0, 0, 0.9)',
                                1.0: 'rgba(100, 0, 0, 1)'
                            }
                        });
                    }
                    
                    // 高德 2.0 热力图使用 setData 或 setDataSet
                    if (typeof heatmapLayer.setData === 'function') {
                        heatmapLayer.setData(heatmapData, {
                            max: Math.max(...heatmapData.map(p => p.count), 10)
                        });
                    } else if (typeof heatmapLayer.setDataSet === 'function') {
                        heatmapLayer.setDataSet({
                            data: heatmapData,
                            max: Math.max(...heatmapData.map(p => p.count), 10)
                        });
                    } else {
                        console.error('[Heatmap] No data method found!');
                        throw new Error('热力图方法未找到');
                    }
                    
                    heatmapLayer.show();
                    
                    isHeatmapVisible = true;
                    heatmapBtn.classList.add('active');
                    showToast(`🔥 热力图已开启 (${globalData.count} 个点位)`);
                } else {
                    showToast('暂无足迹数据，无法显示热力图');
                }
            }
        } catch (error) {
            console.error('[Map] 加载热力图失败:', error);
            showToast('热力图加载失败');
        } finally {
            showLoading(false);
        }
    } else {
        // 隐藏热力图
        if (heatmapLayer) {
            heatmapLayer.hide();
        }
        isHeatmapVisible = false;
        heatmapBtn.classList.remove('active');
        showToast('热力图已关闭');
    }
}

// 刷新热力图数据（当地图移动时）
async function refreshHeatmap() {
    if (!isHeatmapVisible || !heatmapLayer) return;
    
    try {
        const center = map.getCenter();
        const zoom = map.getZoom();
        
        let radius = 500;
        if (zoom >= 10) radius = 20;
        else if (zoom >= 8) radius = 50;
        else if (zoom >= 6) radius = 100;
        else if (zoom >= 4) radius = 300;
        
        const data = await MapAPI.getHeatmapData(center.lat, center.lng, radius);
        
        if (data.success && data.points && data.points.length > 0) {
            const heatmapData = data.points.map(p => ({
                lng: p.lng,
                lat: p.lat,
                count: p.count
            }));
            
            heatmapLayer.setData(heatmapData, {
                max: Math.max(...heatmapData.map(p => p.count), 10)
            });
        }
    } catch (error) {
        console.error('[Map] 刷新热力图失败:', error);
    }
}

// 监听地图移动事件，自动刷新热力图
//（可选：如果需要实时跟随地图视野更新热力图，取消下面的注释）
// map?.on('moveend', refreshHeatmap);
