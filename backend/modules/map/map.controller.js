/**
 * ShareX 地图分享模块 - 控制器
 * 完全独立，与贵州扑克零耦合
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../../database/db');
const https = require('https');

// JWT 密钥（与 user.controller.js 保持一致）
const JWT_SECRET = process.env.JWT_SECRET || 'gameworld-secret-key-2024';

// 高德地图配置 - Web服务Key（用于逆地理编码）
// 注意：这里需要使用Web服务类型的Key，不是JS API Key
const AMAP_KEY = process.env.AMAP_WEB_KEY || 'ed38ea0bf4da571f65f4d7a51c25e036';
const AMAP_SECRET = process.env.AMAP_SECRET || ''; // Web服务不需要安全密钥

// 认证中间件（内嵌定义，避免外部依赖）
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: '未提供认证令牌' });
    }
    
    const jwt = require('jsonwebtoken');
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: '令牌无效或已过期' });
        }
        req.user = user;
        next();
    });
}

// 配置文件上传
const multer = require('multer');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../../uploads/map');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'map-' + uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB限制
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('只允许上传图片文件'));
        }
    }
});

/**
 * 获取地图标记列表
 * GET /api/map/pins
 * 查询参数: lat, lng, radius(公里), limit
 */
router.get('/pins', async (req, res) => {
    try {
        const { lat, lng, radius = 10, limit = 100 } = req.query;
        
        let query = `
            SELECT 
                p.id, p.user_id, p.lat, p.lng, p.title, p.content, 
                p.images, p.address, p.view_count, p.created_at,
                u.nickname, u.avatar
            FROM map_pins p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.is_public = 1
        `;
        const params = [];
        
        // 如果有坐标参数，按距离筛选
        if (lat && lng) {
            // 简化的距离计算（公里）
            // 实际项目中可以使用更精确的计算
            const latRange = radius / 111; // 1度纬度约111公里
            const lngRange = radius / (111 * Math.cos(parseFloat(lat) * Math.PI / 180));
            
            query += ` AND p.lat BETWEEN ? AND ? AND p.lng BETWEEN ? AND ?`;
            params.push(
                parseFloat(lat) - latRange,
                parseFloat(lat) + latRange,
                parseFloat(lng) - lngRange,
                parseFloat(lng) + lngRange
            );
        }
        
        query += ` ORDER BY p.created_at DESC LIMIT ?`;
        params.push(parseInt(limit));
        
        const pins = await db.all(query, params);
        
        // 解析图片JSON
        const formattedPins = pins.map(pin => ({
            ...pin,
            images: pin.images ? JSON.parse(pin.images) : []
        }));
        
        res.json({
            success: true,
            pins: formattedPins
        });
    } catch (error) {
        console.error('[Map] 获取标记失败:', error);
        res.status(500).json({ error: '获取标记失败' });
    }
});

/**
 * 获取单个标记详情
 * GET /api/map/pins/:id
 */
router.get('/pins/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // 增加浏览次数
        await db.run('UPDATE map_pins SET view_count = view_count + 1 WHERE id = ?', [id]);
        
        const pin = await db.get(`
            SELECT 
                p.*, u.nickname, u.avatar
            FROM map_pins p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.id = ?
        `, [id]);
        
        if (!pin) {
            return res.status(404).json({ error: '标记不存在' });
        }
        
        pin.images = pin.images ? JSON.parse(pin.images) : [];
        
        res.json({
            success: true,
            pin
        });
    } catch (error) {
        console.error('[Map] 获取标记详情失败:', error);
        res.status(500).json({ error: '获取标记详情失败' });
    }
});

/**
 * 创建地图标记
 * POST /api/map/pins
 * 支持图片上传（最多5张）
 */
router.post('/pins', authenticateToken, upload.array('images', 5), async (req, res) => {
    try {
        const { lat, lng, title, content, address } = req.body;
        const userId = req.user?.userId || null;
        
        // 验证必填字段
        if (!lat || !lng) {
            return res.status(400).json({ error: '经纬度不能为空' });
        }
        
        // 处理上传的图片
        const images = req.files ? req.files.map(file => file.filename) : [];
        
        const result = await db.run(`
            INSERT INTO map_pins (user_id, lat, lng, title, content, images, address)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            userId,
            parseFloat(lat),
            parseFloat(lng),
            title || null,
            content || null,
            JSON.stringify(images),
            address || null
        ]);
        
        res.json({
            success: true,
            message: '发布成功',
            pinId: result.lastID
        });
    } catch (error) {
        console.error('[Map] 创建标记失败:', error);
        res.status(500).json({ error: '发布失败' });
    }
});

/**
 * 删除地图标记
 * DELETE /api/map/pins/:id
 */
router.delete('/pins/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        
        // 检查权限（只能删除自己的，管理员可以删除所有）
        const pin = await db.get('SELECT user_id FROM map_pins WHERE id = ?', [id]);
        if (!pin) {
            return res.status(404).json({ error: '标记不存在' });
        }
        
        const user = await db.get('SELECT is_admin FROM users WHERE id = ?', [userId]);
        if (pin.user_id !== userId && !user?.is_admin) {
            return res.status(403).json({ error: '无权删除此标记' });
        }
        
        // 删除关联的图片文件
        const images = pin.images ? JSON.parse(pin.images) : [];
        images.forEach(filename => {
            const filePath = path.join(__dirname, '../../../uploads/map', filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        });
        
        await db.run('DELETE FROM map_pins WHERE id = ?', [id]);
        
        res.json({
            success: true,
            message: '删除成功'
        });
    } catch (error) {
        console.error('[Map] 删除标记失败:', error);
        res.status(500).json({ error: '删除失败' });
    }
});

/**
 * 更新地图标记
 * PUT /api/map/pins/:id
 */
router.put('/pins/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content } = req.body;
        const userId = req.user.userId;
        
        // 检查权限（只能修改自己的）
        const pin = await db.get('SELECT user_id FROM map_pins WHERE id = ?', [id]);
        if (!pin) {
            return res.status(404).json({ error: '标记不存在' });
        }
        
        if (pin.user_id !== userId) {
            return res.status(403).json({ error: '无权修改此标记' });
        }
        
        await db.run(`
            UPDATE map_pins 
            SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [title || null, content || null, id]);
        
        res.json({
            success: true,
            message: '更新成功'
        });
    } catch (error) {
        console.error('[Map] 更新标记失败:', error);
        res.status(500).json({ error: '更新失败' });
    }
});

/**
 * 获取我的标记
 * GET /api/map/my-pins
 */
router.get('/my-pins', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const pins = await db.all(`
            SELECT id, lat, lng, title, content, images, address, view_count, created_at
            FROM map_pins
            WHERE user_id = ?
            ORDER BY created_at DESC
        `, [userId]);
        
        const formattedPins = pins.map(pin => ({
            ...pin,
            images: pin.images ? JSON.parse(pin.images) : []
        }));
        
        res.json({
            success: true,
            pins: formattedPins
        });
    } catch (error) {
        console.error('[Map] 获取我的标记失败:', error);
        res.status(500).json({ error: '获取失败' });
    }
});

/**
 * 逆地理编码 - 通过后端代理调用高德地图 API
 * GET /api/map/geocode/reverse?lat=xxx&lng=xxx
 */
router.get('/geocode/reverse', async (req, res) => {
    try {
        const { lat, lng } = req.query;
        
        if (!lat || !lng) {
            return res.status(400).json({ error: '经纬度不能为空' });
        }
        
        // 构建高德地图 Web 服务 API URL
        const url = `https://restapi.amap.com/v3/geocode/regeo?key=${AMAP_KEY}&location=${lng},${lat}&extensions=all&output=JSON`;
        
        console.log('[Map] 逆地理编码请求:', url);
        
        // 发送请求到高德地图 API
        const request = https.get(url, (apiRes) => {
            let data = '';
            
            apiRes.on('data', (chunk) => {
                data += chunk;
            });
            
            apiRes.on('end', () => {
                console.log('[Map] 高德地图响应:', data);
                try {
                    const result = JSON.parse(data);
                    if (result.status === '1' && result.regeocode) {
                        res.json({
                            success: true,
                            address: result.regeocode.formatted_address,
                            regeocode: result.regeocode
                        });
                    } else {
                        console.error('[Map] 逆地理编码失败:', result);
                        res.status(500).json({ 
                            error: '逆地理编码失败',
                            info: result.info,
                            result: result
                        });
                    }
                } catch (e) {
                    console.error('[Map] 解析响应失败:', e);
                    res.status(500).json({ error: '解析响应失败', raw: data });
                }
            });
        });
        
        request.on('error', (error) => {
            console.error('[Map] 逆地理编码请求失败:', error);
            res.status(500).json({ error: '请求失败', details: error.message });
        });
        
        request.setTimeout(10000, () => {
            console.error('[Map] 逆地理编码请求超时');
            request.destroy();
            res.status(500).json({ error: '请求超时' });
        });
        
    } catch (error) {
        console.error('[Map] 逆地理编码失败:', error);
        res.status(500).json({ error: '逆地理编码失败' });
    }
});

/**
 * ==================== 点赞功能 ====================
 */

/**
 * 点赞/取消点赞
 * POST /api/map/pins/:id/like
 */
router.post('/pins/:id/like', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        
        // 检查足迹是否存在
        const pin = await db.get('SELECT id FROM map_pins WHERE id = ?', [id]);
        if (!pin) {
            return res.status(404).json({ error: '足迹不存在' });
        }
        
        // 检查是否已点赞
        const existingLike = await db.get(
            'SELECT id FROM map_pin_likes WHERE pin_id = ? AND user_id = ?',
            [id, userId]
        );
        
        if (existingLike) {
            // 取消点赞
            await db.run('DELETE FROM map_pin_likes WHERE id = ?', [existingLike.id]);
            await db.run('UPDATE map_pins SET like_count = like_count - 1 WHERE id = ?', [id]);
            res.json({ success: true, liked: false, message: '取消点赞' });
        } else {
            // 添加点赞
            await db.run(
                'INSERT INTO map_pin_likes (pin_id, user_id) VALUES (?, ?)',
                [id, userId]
            );
            await db.run('UPDATE map_pins SET like_count = like_count + 1 WHERE id = ?', [id]);
            res.json({ success: true, liked: true, message: '点赞成功' });
        }
    } catch (error) {
        console.error('[Map] 点赞失败:', error);
        res.status(500).json({ error: '操作失败' });
    }
});

/**
 * 检查是否已点赞
 * GET /api/map/pins/:id/like
 */
router.get('/pins/:id/like', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        
        const like = await db.get(
            'SELECT id FROM map_pin_likes WHERE pin_id = ? AND user_id = ?',
            [id, userId]
        );
        
        const pin = await db.get('SELECT like_count FROM map_pins WHERE id = ?', [id]);
        
        res.json({
            success: true,
            liked: !!like,
            likeCount: pin?.like_count || 0
        });
    } catch (error) {
        console.error('[Map] 检查点赞状态失败:', error);
        res.status(500).json({ error: '查询失败' });
    }
});

/**
 * 获取点赞用户列表
 * GET /api/map/pins/:id/likes
 */
router.get('/pins/:id/likes', async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 10 } = req.query;
        
        const likes = await db.all(`
            SELECT u.id, u.nickname, u.avatar, l.created_at
            FROM map_pin_likes l
            JOIN users u ON l.user_id = u.id
            WHERE l.pin_id = ?
            ORDER BY l.created_at DESC
            LIMIT ?
        `, [id, parseInt(limit)]);
        
        res.json({ success: true, likes });
    } catch (error) {
        console.error('[Map] 获取点赞列表失败:', error);
        res.status(500).json({ error: '查询失败' });
    }
});

/**
 * ==================== 评论功能 ====================
 */

/**
 * 发表评论
 * POST /api/map/pins/:id/comments
 */
router.post('/pins/:id/comments', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        const userId = req.user.userId;
        
        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: '评论内容不能为空' });
        }
        
        if (content.length > 500) {
            return res.status(400).json({ error: '评论内容不能超过500字' });
        }
        
        // 检查足迹是否存在
        const pin = await db.get('SELECT id FROM map_pins WHERE id = ?', [id]);
        if (!pin) {
            return res.status(404).json({ error: '足迹不存在' });
        }
        
        const result = await db.run(
            'INSERT INTO map_pin_comments (pin_id, user_id, content) VALUES (?, ?, ?)',
            [id, userId, content.trim()]
        );
        
        await db.run('UPDATE map_pins SET comment_count = comment_count + 1 WHERE id = ?', [id]);
        
        // 获取新评论
        const comment = await db.get(`
            SELECT c.*, u.nickname, u.avatar
            FROM map_pin_comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.id = ?
        `, [result.lastID]);
        
        res.json({ success: true, comment });
    } catch (error) {
        console.error('[Map] 发表评论失败:', error);
        res.status(500).json({ error: '评论失败' });
    }
});

/**
 * 获取评论列表
 * GET /api/map/pins/:id/comments
 */
router.get('/pins/:id/comments', async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 20, offset = 0 } = req.query;
        
        const comments = await db.all(`
            SELECT c.id, c.content, c.created_at, u.id as user_id, u.nickname, u.avatar
            FROM map_pin_comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.pin_id = ?
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        `, [id, parseInt(limit), parseInt(offset)]);
        
        const total = await db.get(
            'SELECT COUNT(*) as count FROM map_pin_comments WHERE pin_id = ?',
            [id]
        );
        
        res.json({
            success: true,
            comments,
            total: total.count,
            hasMore: total.count > parseInt(offset) + parseInt(limit)
        });
    } catch (error) {
        console.error('[Map] 获取评论失败:', error);
        res.status(500).json({ error: '查询失败' });
    }
});

/**
 * 删除评论
 * DELETE /api/map/comments/:id
 */
router.delete('/comments/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        
        const comment = await db.get('SELECT user_id, pin_id FROM map_pin_comments WHERE id = ?', [id]);
        if (!comment) {
            return res.status(404).json({ error: '评论不存在' });
        }
        
        // 检查权限（只能删除自己的，管理员可以删除所有）
        const user = await db.get('SELECT is_admin FROM users WHERE id = ?', [userId]);
        if (comment.user_id !== userId && !user?.is_admin) {
            return res.status(403).json({ error: '无权删除此评论' });
        }
        
        await db.run('DELETE FROM map_pin_comments WHERE id = ?', [id]);
        await db.run('UPDATE map_pins SET comment_count = comment_count - 1 WHERE id = ?', [comment.pin_id]);
        
        res.json({ success: true, message: '删除成功' });
    } catch (error) {
        console.error('[Map] 删除评论失败:', error);
        res.status(500).json({ error: '删除失败' });
    }
});

/**
 * 获取足迹详情（包含点赞评论统计）
 * GET /api/map/pins/:id/detail
 */
router.get('/pins/:id/detail', async (req, res) => {
    try {
        const { id } = req.params;
        
        // 增加浏览次数
        await db.run('UPDATE map_pins SET view_count = view_count + 1 WHERE id = ?', [id]);
        
        const pin = await db.get(`
            SELECT 
                p.id, p.user_id, p.lat, p.lng, p.title, p.content, 
                p.images, p.address, p.view_count, p.like_count, p.comment_count,
                p.created_at, u.nickname, u.avatar
            FROM map_pins p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.id = ?
        `, [id]);
        
        if (!pin) {
            return res.status(404).json({ error: '足迹不存在' });
        }
        
        pin.images = pin.images ? JSON.parse(pin.images) : [];
        
        res.json({ success: true, pin });
    } catch (error) {
        console.error('[Map] 获取足迹详情失败:', error);
        res.status(500).json({ error: '获取失败' });
    }
});

/**
 * ==================== 热力图数据 API ====================
 */

/**
 * 获取热力图数据
 * GET /api/map/heatmap
 * 查询参数: lat, lng, radius(公里), limit
 */
router.get('/heatmap', async (req, res) => {
    try {
        const { lat, lng, radius = 50, limit = 5000 } = req.query;
        
        let query = `
            SELECT lat, lng, COUNT(*) as count
            FROM map_pins
            WHERE is_public = 1
        `;
        const params = [];
        
        // 如果有坐标参数，按距离筛选
        if (lat && lng) {
            const latRange = radius / 111;
            const lngRange = radius / (111 * Math.cos(parseFloat(lat) * Math.PI / 180));
            
            query += ` AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`;
            params.push(
                parseFloat(lat) - latRange,
                parseFloat(lat) + latRange,
                parseFloat(lng) - lngRange,
                parseFloat(lng) + lngRange
            );
        }
        
        query += ` GROUP BY lat, lng LIMIT ?`;
        params.push(parseInt(limit));
        
        const heatmapData = await db.all(query, params);
        
        // 转换为高德热力图需要的格式
        const points = heatmapData.map(item => ({
            lng: parseFloat(item.lng),
            lat: parseFloat(item.lat),
            count: parseInt(item.count)
        }));
        
        res.json({
            success: true,
            count: points.length,
            points
        });
    } catch (error) {
        console.error('[Map] 获取热力图数据失败:', error);
        res.status(500).json({ error: '获取热力图数据失败' });
    }
});

/**
 * ==================== 统计数据 API ====================
 */

/**
 * 获取足迹统计信息
 * GET /api/map/stats/overview
 */
router.get('/stats/overview', async (req, res) => {
    try {
        // 总足迹数
        const totalPins = await db.get('SELECT COUNT(*) as count FROM map_pins WHERE is_public = 1');
        
        // 总用户数
        const totalUsers = await db.get('SELECT COUNT(*) as count FROM users');
        
        // 本月新增足迹
        const thisMonthPins = await db.get(`
            SELECT COUNT(*) as count FROM map_pins 
            WHERE is_public = 1 AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
        `);
        
        // 总浏览量
        const totalViews = await db.get('SELECT SUM(view_count) as count FROM map_pins');
        
        // 总点赞数
        const totalLikes = await db.get('SELECT SUM(like_count) as count FROM map_pins');
        
        // 足迹分布（按省份）
        const byProvince = await db.all(`
            SELECT 
                CASE 
                    WHEN address LIKE '%北京%' THEN '北京'
                    WHEN address LIKE '%上海%' THEN '上海'
                    WHEN address LIKE '%广东%' THEN '广东'
                    WHEN address LIKE '%江苏%' THEN '江苏'
                    WHEN address LIKE '%浙江%' THEN '浙江'
                    WHEN address LIKE '%山东%' THEN '山东'
                    WHEN address LIKE '%四川%' THEN '四川'
                    WHEN address LIKE '%湖北%' THEN '湖北'
                    WHEN address LIKE '%湖南%' THEN '湖南'
                    WHEN address LIKE '%福建%' THEN '福建'
                    ELSE '其他'
                END as province,
                COUNT(*) as count
            FROM map_pins
            WHERE is_public = 1 AND address IS NOT NULL
            GROUP BY province
            ORDER BY count DESC
            LIMIT 10
        `);
        
        // 足迹趋势（近12个月）
        const trend = await db.all(`
            SELECT 
                strftime('%Y-%m', created_at) as month,
                COUNT(*) as count
            FROM map_pins
            WHERE is_public = 1 AND created_at >= datetime('now', '-12 months')
            GROUP BY month
            ORDER BY month ASC
        `);
        
        res.json({
            success: true,
            stats: {
                totalPins: totalPins.count,
                totalUsers: totalUsers.count,
                thisMonthPins: thisMonthPins.count,
                totalViews: totalViews.count || 0,
                totalLikes: totalLikes.count || 0,
                byProvince,
                trend
            }
        });
    } catch (error) {
        console.error('[Map] 获取统计数据失败:', error);
        res.status(500).json({ error: '获取统计数据失败' });
    }
});

/**
 * 获取用户个人统计
 * GET /api/map/stats/user
 */
router.get('/stats/user', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        // 用户足迹总数
        const userPins = await db.get(
            'SELECT COUNT(*) as count FROM map_pins WHERE user_id = ?',
            [userId]
        );
        
        // 用户足迹总浏览量
        const userViews = await db.get(
            'SELECT SUM(view_count) as count FROM map_pins WHERE user_id = ?',
            [userId]
        );
        
        // 用户足迹总点赞数
        const userLikes = await db.get(
            'SELECT SUM(like_count) as count FROM map_pins WHERE user_id = ?',
            [userId]
        );
        
        // 用户足迹足迹分布（按省份）
        const byProvince = await db.all(`
            SELECT 
                CASE 
                    WHEN address LIKE '%北京%' THEN '北京'
                    WHEN address LIKE '%上海%' THEN '上海'
                    WHEN address LIKE '%广东%' THEN '广东'
                    WHEN address LIKE '%江苏%' THEN '江苏'
                    WHEN address LIKE '%浙江%' THEN '浙江'
                    WHEN address LIKE '%山东%' THEN '山东'
                    WHEN address LIKE '%四川%' THEN '四川'
                    WHEN address LIKE '%湖北%' THEN '湖北'
                    WHEN address LIKE '%湖南%' THEN '湖南'
                    WHEN address LIKE '%福建%' THEN '福建'
                    ELSE '其他'
                END as province,
                COUNT(*) as count
            FROM map_pins
            WHERE user_id = ? AND address IS NOT NULL
            GROUP BY province
            ORDER BY count DESC
        `, [userId]);
        
        // 用户足迹时间分布
        const byMonth = await db.all(`
            SELECT 
                strftime('%Y-%m', created_at) as month,
                COUNT(*) as count
            FROM map_pins
            WHERE user_id = ?
            GROUP BY month
            ORDER BY month ASC
        `, [userId]);
        
        res.json({
            success: true,
            stats: {
                totalPins: userPins.count,
                totalViews: userViews.count || 0,
                totalLikes: userLikes.count || 0,
                byProvince,
                byMonth
            }
        });
    } catch (error) {
        console.error('[Map] 获取用户统计失败:', error);
        res.status(500).json({ error: '获取用户统计失败' });
    }
});

module.exports = router;
