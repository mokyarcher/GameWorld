/**
 * ShareX 意见反馈模块
 * 接收用户反馈，管理员可查看和处理
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../../database/db');

// 确保上传目录存在
const uploadDir = path.join(__dirname, '../../../uploads/feedback');
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
        cb(null, 'feedback-' + uniqueSuffix + ext);
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

// 管理员权限检查
const requireAdmin = async (req, res, next) => {
    try {
        const user = await db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.userId]);
        if (!user || !user.is_admin) {
            return res.status(403).json({ error: '需要管理员权限' });
        }
        next();
    } catch (error) {
        console.error('[Feedback] 权限检查失败:', error);
        res.status(500).json({ error: '权限检查失败' });
    }
};

/**
 * 提交反馈
 * POST /api/feedback
 */
router.post('/', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        const { type, content } = req.body;
        const userId = req.user.userId;
        
        // 获取用户名
        const user = await db.get('SELECT username FROM users WHERE id = ?', [userId]);
        const username = user ? user.username : '未知用户';
        
        // 验证必填字段
        if (!type || !content) {
            // 删除已上传的文件
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(400).json({ error: '反馈类型和内容不能为空' });
        }
        
        // 验证类型
        const validTypes = ['game_poker', 'game_other', 'feature_map', 'feature_other', 'bug', 'other'];
        if (!validTypes.includes(type)) {
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(400).json({ error: '无效的反馈类型' });
        }
        
        // 保存到数据库
        const imageName = req.file ? req.file.filename : null;
        const result = await db.run(
            'INSERT INTO feedback (user_id, username, type, content, image) VALUES (?, ?, ?, ?, ?)',
            [userId, username, type, content, imageName]
        );
        
        console.log(`[Feedback] 用户 ${username} 提交了反馈 #${result.id}`);
        
        res.json({ 
            success: true, 
            message: '反馈提交成功',
            feedbackId: result.id
        });
        
    } catch (error) {
        console.error('[Feedback] 提交反馈失败:', error);
        // 删除已上传的文件
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: '提交失败，请稍后重试' });
    }
});

/**
 * 获取当前用户的反馈列表
 * GET /api/feedback/my
 */
router.get('/my', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        // 获取总数
        const countResult = await db.get(
            'SELECT COUNT(*) as total FROM feedback WHERE user_id = ?',
            [userId]
        );
        const total = countResult.total;
        
        // 获取列表
        const feedbacks = await db.all(
            `SELECT id, type, content, image, status, admin_reply, created_at, updated_at 
             FROM feedback 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT ? OFFSET ?`,
            [userId, parseInt(limit), parseInt(offset)]
        );
        
        // 处理图片URL
        const feedbacksWithImageUrl = feedbacks.map(f => ({
            ...f,
            imageUrl: f.image ? `/uploads/feedback/${f.image}` : null
        }));
        
        res.json({
            success: true,
            feedbacks: feedbacksWithImageUrl,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('[Feedback] 获取用户反馈列表失败:', error);
        res.status(500).json({ error: '获取反馈列表失败' });
    }
});

/**
 * 获取反馈列表（管理员）
 * GET /api/feedback
 */
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, type, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = '';
        const params = [];
        
        if (status) {
            whereClause += ' WHERE status = ?';
            params.push(status);
        }
        
        if (type) {
            whereClause += whereClause ? ' AND type = ?' : ' WHERE type = ?';
            params.push(type);
        }
        
        // 获取总数
        const countResult = await db.get(`SELECT COUNT(*) as total FROM feedback ${whereClause}`, params);
        const total = countResult.total;
        
        // 获取列表
        const feedbacks = await db.all(
            `SELECT * FROM feedback ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), parseInt(offset)]
        );
        
        // 处理图片URL
        const feedbacksWithImageUrl = feedbacks.map(f => ({
            ...f,
            imageUrl: f.image ? `/uploads/feedback/${f.image}` : null
        }));
        
        res.json({
            success: true,
            feedbacks: feedbacksWithImageUrl,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('[Feedback] 获取反馈列表失败:', error);
        res.status(500).json({ error: '获取反馈列表失败' });
    }
});

/**
 * 获取反馈详情（管理员）
 * GET /api/feedback/:id
 */
router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const feedbackId = parseInt(req.params.id, 10);
        
        console.log(`[Feedback] 获取反馈详情, ID: ${feedbackId}`);
        
        // 验证 ID
        if (isNaN(feedbackId)) {
            return res.status(400).json({ error: '无效的反馈ID' });
        }
        
        const feedback = await db.get('SELECT * FROM feedback WHERE id = ?', [feedbackId]);
        
        if (!feedback) {
            console.log(`[Feedback] 反馈 #${feedbackId} 不存在`);
            return res.status(404).json({ error: '反馈不存在' });
        }
        
        // 添加图片URL
        feedback.imageUrl = feedback.image ? `/uploads/feedback/${feedback.image}` : null;
        
        // 获取回复历史
        let replies = [];
        try {
            replies = await db.all(
                `SELECT * FROM feedback_replies 
                 WHERE feedback_id = ? 
                 ORDER BY created_at ASC`,
                [feedbackId]
            );
        } catch (replyErr) {
            console.error('[Feedback] 获取回复历史失败:', replyErr.message);
            // 不影响主查询，继续返回空数组
        }
        
        feedback.replies = replies || [];
        
        res.json({
            success: true,
            feedback
        });
        
    } catch (error) {
        console.error('[Feedback] 获取反馈详情失败:', error);
        res.status(500).json({ error: '获取反馈详情失败' });
    }
});

/**
 * 更新反馈状态（管理员）
 * PUT /api/feedback/:id
 */
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const feedbackId = parseInt(req.params.id, 10);
        const { status, admin_reply } = req.body;
        const adminId = req.user.userId;
        
        console.log(`[Feedback] 更新反馈 #${feedbackId}, 状态: ${status}, 有回复: ${!!admin_reply}`);
        
        // 验证 ID
        if (isNaN(feedbackId)) {
            return res.status(400).json({ error: '无效的反馈ID' });
        }
        
        // 验证状态
        const validStatuses = ['pending', 'processing', 'resolved', 'rejected'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ error: '无效的状态' });
        }
        
        // 检查反馈是否存在
        const feedback = await db.get('SELECT id FROM feedback WHERE id = ?', [feedbackId]);
        if (!feedback) {
            return res.status(404).json({ error: '反馈不存在' });
        }
        
        // 获取管理员信息
        const admin = await db.get('SELECT username FROM users WHERE id = ?', [adminId]);
        const adminUsername = admin ? admin.username : '管理员';
        
        // 如果有新的回复内容，添加到回复历史
        if (admin_reply && admin_reply.trim()) {
            await db.run(
                `INSERT INTO feedback_replies (feedback_id, admin_id, admin_username, reply_content, status_changed_to) 
                 VALUES (?, ?, ?, ?, ?)`,
                [feedbackId, adminId, adminUsername, admin_reply.trim(), status || null]
            );
        }
        
        // 构建更新语句
        const updates = [];
        const params = [];
        
        if (status) {
            updates.push('status = ?');
            params.push(status);
        }
        
        // 更新最新的回复内容到主表（冗余存储，方便列表展示）
        if (admin_reply && admin_reply.trim()) {
            updates.push('admin_reply = ?');
            params.push(admin_reply.trim());
        }
        
        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(feedbackId);
        
        await db.run(
            `UPDATE feedback SET ${updates.join(', ')} WHERE id = ?`,
            params
        );
        
        console.log(`[Feedback] 反馈 #${feedbackId} 已更新，状态: ${status || '未变更'}, 新回复: ${admin_reply ? '是' : '否'}`);
        
        res.json({
            success: true,
            message: '更新成功'
        });
        
    } catch (error) {
        console.error('[Feedback] 更新反馈失败:', error);
        res.status(500).json({ error: '更新失败' });
    }
});

/**
 * 删除反馈（管理员）
 * DELETE /api/feedback/:id
 */
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        // 获取反馈信息（用于删除图片）
        const feedback = await db.get('SELECT image FROM feedback WHERE id = ?', [id]);
        
        if (!feedback) {
            return res.status(404).json({ error: '反馈不存在' });
        }
        
        // 删除图片文件
        if (feedback.image) {
            const imagePath = path.join(uploadDir, feedback.image);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }
        
        // 删除数据库记录
        await db.run('DELETE FROM feedback WHERE id = ?', [id]);
        
        console.log(`[Feedback] 反馈 #${id} 已删除`);
        
        res.json({
            success: true,
            message: '删除成功'
        });
        
    } catch (error) {
        console.error('[Feedback] 删除反馈失败:', error);
        res.status(500).json({ error: '删除失败' });
    }
});

module.exports = router;
