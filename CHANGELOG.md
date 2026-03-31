# ShareX 项目更新日志

## 2026-03-29

### 新增功能

#### 1. 意见反馈系统
- **用户反馈提交**：用户可提交反馈（类型+文字+图片），存储到数据库
- **我的反馈**：用户可查看自己的反馈列表及管理员回复
- **管理员反馈管理**：后台可查看、回复、更新状态、删除反馈
- **多次回复支持**：管理员可多次回复同一反馈，显示回复历史记录

#### 2. 反馈回复历史
- 新增 `feedback_replies` 表存储回复历史
- 管理员每次回复都会记录到历史表
- 详情弹窗显示完整回复历史列表

#### 3. 用户修改密码功能
- 在资料修改页面（profile.html）添加密码修改区域
- 需要验证当前密码，新密码至少6位
- 后端 API：`PUT /api/user/password`

#### 4. "加入我们"功能
- 当用户转动到"正在开发"的卡牌时，按钮变为"加入项目"
- 点击跳转到 join.html 页面，可提交开发计划
- 开发计划包括：项目名称、类型、功能、特点、规划、图片
- 页面附带 GitHub 项目链接按钮
- 后端 API：`POST /api/join` 提交申请
- 管理员可在后台查看申请列表

### 优化

#### 1. 管理员反馈界面优化
- 列表视图改为紧凑的行显示（ID、类型、用户、内容预览、时间、状态）
- 点击行打开详情弹窗查看完整内容和图片
- 解决图文混排占用空间过大的问题

#### 2. 用户界面优化
- 去掉"我的反馈"右上角的红点通知

### 修复

#### 1. JWT 密钥统一
- feedback 模块与其他模块统一使用 `gameworld-secret-key-2024`

#### 2. 修复反馈回复功能
- 修复 `currentFeedbackId` 在关闭弹窗后被重置为 null 的问题
- 后端 API 将 `req.params.id` 转换为整数，避免类型不匹配
- 添加错误处理和日志输出

### 数据库变更

```sql
-- 新增反馈回复历史表
CREATE TABLE IF NOT EXISTS feedback_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id INTEGER NOT NULL,
    admin_id INTEGER,
    admin_username TEXT,
    reply_content TEXT NOT NULL,
    status_changed_to TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE
);

-- 新增开发计划申请表
CREATE TABLE IF NOT EXISTS join_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    project_name TEXT NOT NULL,
    project_type TEXT NOT NULL,
    project_features TEXT NOT NULL,
    project_highlights TEXT,
    project_plan TEXT,
    image TEXT,
    status TEXT DEFAULT 'pending',
    admin_reply TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

### API 变更

- `GET /api/feedback/:id` - 现在返回 `replies` 数组（回复历史）
- `PUT /api/feedback/:id` - 支持追加回复，自动记录到历史表
- `PUT /api/user/password` - 用户修改密码
- `POST /api/join` - 提交开发计划申请
- `GET /api/join` - 获取开发计划申请列表（管理员）
- `PUT /api/join/:id` - 更新申请状态（管理员）
