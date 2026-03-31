/**
 * ShareX 加入我们模块
 * 处理用户提交的开发计划
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../../database/db');

// 确保上传目录存在
const uploadDir = path.join(__dirname, '../../../uploads/join');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer 存储
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function(req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'join-' + uniqueSuffix + ext);
    }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('只允许上传图片文件'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// JWT 认证中间件
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: '未提供认证令牌' });
    }
    
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'gameworld-secret-key-2024';
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: '令牌无效或已过期' });
        }
        req.user = user;
        next();
    });
};

/**
 * 提交开发计划
 * POST /api/join
 */
router.post('/', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        const { projectName, projectType, projectFeatures, projectHighlights, projectPlan } = req.body;
        const userId = req.user.userId;
        
        // 获取用户信息
        const user = await db.get('SELECT username FROM users WHERE id = ?', [userId]);
        const username = user ? user.username : '未知用户';
        
        // 验证必填字段
        if (!projectName || !projectType || !projectFeatures) {
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(400).json({ error: '请填写必填字段' });
        }
        
        // 保存到数据库
        const imageName = req.file ? req.file.filename : null;
        const result = await db.run(
            `INSERT INTO join_applications (user_id, username, project_name, project_type, 
             project_features, project_highlights, project_plan, image) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, username, projectName, projectType, projectFeatures, 
             projectHighlights || '', projectPlan || '', imageName]
        );
        
        console.log(`[Join] 用户 ${username} 提交了开发计划 #${result.id}: ${projectName}`);
        
        res.json({ 
            success: true, 
            message: '提交成功，我们会尽快审核',
            applicationId: result.id
        });
        
    } catch (error) {
        console.error('[Join] 提交开发计划失败:', error);
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: '提交失败，请稍后重试' });
    }
});

/**
 * 获取所有申请（管理员）
 * GET /api/join
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        // 检查是否为管理员
        const user = await db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.userId]);
        if (!user || !user.is_admin) {
            return res.status(403).json({ error: '需要管理员权限' });
        }
        
        const { status } = req.query;
        let whereClause = '';
        const params = [];
        
        if (status) {
            whereClause = 'WHERE status = ?';
            params.push(status);
        }
        
        const applications = await db.all(
            `SELECT * FROM join_applications ${whereClause} ORDER BY created_at DESC`,
            params
        );
        
        // 处理图片URL
        const applicationsWithImageUrl = applications.map(app => ({
            ...app,
            imageUrl: app.image ? `/uploads/join/${app.image}` : null
        }));
        
        res.json({
            success: true,
            applications: applicationsWithImageUrl
        });
        
    } catch (error) {
        console.error('[Join] 获取申请列表失败:', error);
        res.status(500).json({ error: '获取失败' });
    }
});

/**
 * 更新申请状态（管理员）
 * PUT /api/join/:id
 */
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, admin_reply } = req.body;
        
        // 检查是否为管理员
        const user = await db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.userId]);
        if (!user || !user.is_admin) {
            return res.status(403).json({ error: '需要管理员权限' });
        }
        
        // 验证状态
        const validStatuses = ['pending', 'approved', 'rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: '无效的状态' });
        }
        
        await db.run(
            `UPDATE join_applications SET status = ?, admin_reply = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [status, admin_reply || '', id]
        );
        
        console.log(`[Join] 申请 #${id} 状态更新为: ${status}`);
        
        res.json({ success: true, message: '更新成功' });
        
    } catch (error) {
        console.error('[Join] 更新申请状态失败:', error);
        res.status(500).json({ error: '更新失败' });
    }
});

module.exports = router;
