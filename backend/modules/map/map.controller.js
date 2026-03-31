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

module.exports = router;
