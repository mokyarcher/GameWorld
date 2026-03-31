# GameWorld 数据库备份指南

## 概述

本文档介绍 GameWorld 项目的数据库备份策略、操作方法和恢复流程。

- **数据库类型**: SQLite3
- **数据库位置**: `/opt/gameworld/backend/database/gameworld.db`
- **备份方式**: 热备份（不锁定数据库）
- **备份频率**: 每天凌晨 3 点自动执行
- **保留策略**: 保留最近 30 天的备份

---

## 备份脚本位置

```
/opt/gameworld/deploy/backup-database.sh
```

---

## 自动备份配置

### 设置定时任务

```bash
# 执行自动配置脚本
sudo bash /opt/gameworld/deploy/setup-backup-cron.sh
```

### 查看定时任务

```bash
crontab -l | grep gameworld
```

### 手动执行备份

```bash
sudo bash /opt/gameworld/deploy/backup-database.sh
```

---

## 备份文件

### 存储位置

```
/opt/gameworld/backups/
```

### 文件命名格式

```
gameworld_backup_YYYYMMDD_HHMMSS.db.gz
```

例如:
- `gameworld_backup_20260331_030001.db.gz`
- `gameworld_backup_20260330_030002.db.gz`

### 查看备份列表

```bash
ls -lh /opt/gameworld/backups/
```

---

## 日志查看

### 备份日志

```bash
# 查看最新日志
tail -f /var/log/gameworld-backup.log

# 查看所有日志
cat /var/log/gameworld-backup.log
```

### 日志内容示例

```
[Mon Mar 31 03:00:01 CST 2026] 开始备份数据库...
[Mon Mar 31 03:00:02 CST 2026] 备份成功: gameworld_backup_20260331_030001.db
[Mon Mar 31 03:00:03 CST 2026] 压缩完成: gameworld_backup_20260331_030001.db.gz
[Mon Mar 31 03:00:03 CST 2026] 备份文件大小: 2.5M
[Mon Mar 31 03:00:03 CST 2026] 清理 30 天前的旧备份...
[Mon Mar 31 03:00:03 CST 2026] 当前备份文件:
-rw-r--r-- 1 root root 2.5M Mar 31 03:00 gameworld_backup_20260331_030001.db.gz
-rw-r--r-- 1 root root 2.4M Mar 30 03:00 gameworld_backup_20260330_030002.db.gz
[Mon Mar 31 03:00:03 CST 2026] 备份任务完成!
```

---

## 数据恢复

### 恢复步骤

```bash
# 1. 停止后端服务
pm2 stop gameworld-backend

# 2. 备份当前数据库（以防万一）
cp /opt/gameworld/backend/database/gameworld.db \
   /opt/gameworld/backend/database/gameworld.db.bak.$(date +%Y%m%d_%H%M%S)

# 3. 解压备份文件
cd /opt/gameworld/backups
gunzip gameworld_backup_20260331_030001.db.gz

# 4. 恢复数据库
cp gameworld_backup_20260331_030001.db \
   /opt/gameworld/backend/database/gameworld.db

# 5. 设置正确的权限
chown www-data:www-data /opt/gameworld/backend/database/gameworld.db
chmod 644 /opt/gameworld/backend/database/gameworld.db

# 6. 重新压缩备份文件（可选）
gzip gameworld_backup_20260331_030001.db

# 7. 启动后端服务
pm2 start gameworld-backend

# 8. 检查服务状态
pm2 status
```

### 一键恢复脚本

```bash
#!/bin/bash
# 恢复指定备份文件
# 用法: sudo bash restore.sh gameworld_backup_20260331_030001.db.gz

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
    echo "用法: $0 <备份文件名>"
    echo "示例: $0 gameworld_backup_20260331_030001.db.gz"
    exit 1
fi

BACKUP_DIR="/opt/gameworld/backups"
DB_PATH="/opt/gameworld/backend/database/gameworld.db"

# 检查备份文件是否存在
if [ ! -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
    echo "错误: 备份文件不存在: $BACKUP_DIR/$BACKUP_FILE"
    exit 1
fi

echo "准备恢复数据库..."
echo "备份文件: $BACKUP_FILE"

# 停止服务
pm2 stop gameworld-backend

# 备份当前数据库
if [ -f "$DB_PATH" ]; then
    cp "$DB_PATH" "$DB_PATH.bak.$(date +%Y%m%d_%H%M%S)"
    echo "已备份当前数据库"
fi

# 解压并恢复
cd "$BACKUP_DIR"
gunzip -c "$BACKUP_FILE" > "$DB_PATH"

# 设置权限
chown www-data:www-data "$DB_PATH"
chmod 644 "$DB_PATH"

# 启动服务
pm2 start gameworld-backend

echo "数据库恢复完成!"
pm2 status
```

---

## 常见问题

### Q: 备份失败怎么办？

**检查步骤:**

```bash
# 1. 检查数据库文件是否存在
ls -la /opt/gameworld/backend/database/gameworld.db

# 2. 检查备份目录权限
ls -ld /opt/gameworld/backups/

# 3. 查看详细错误日志
cat /var/log/gameworld-backup.log

# 4. 手动测试备份
sudo sqlite3 /opt/gameworld/backend/database/gameworld.db \
    ".backup '/tmp/test_backup.db'"
```

### Q: 如何修改备份频率？

```bash
# 编辑定时任务
crontab -e

# 修改为每小时备份一次
0 * * * * /opt/gameworld/deploy/backup-database.sh >> /var/log/gameworld-backup.log 2>&1

# 或修改为每周备份一次
0 3 * * 0 /opt/gameworld/deploy/backup-database.sh >> /var/log/gameworld-backup.log 2>&1
```

### Q: 如何修改保留天数？

编辑备份脚本:

```bash
sudo nano /opt/gameworld/deploy/backup-database.sh

# 修改这一行
RETENTION_DAYS=30
# 改为需要的值，例如 7 天或 90 天
```

### Q: 备份文件太大怎么办？

SQLite 数据库可以使用 VACUUM 命令压缩:

```bash
# 进入数据库目录
cd /opt/gameworld/backend/database

# 备份当前数据库
cp gameworld.db gameworld.db.backup

# 压缩数据库
sqlite3 gameworld.db "VACUUM;"

# 查看压缩效果
ls -lh gameworld.db*
```

---

## 备份策略建议

| 场景 | 建议 |
|------|------|
| **日常运营** | 每天自动备份，保留 30 天 |
| **重要更新前** | 手动执行备份，命名标记版本 |
| **数据量较大** | 每周执行 VACUUM 压缩 |
| **多地备份** | 将备份同步到云存储（可选） |

---

## 相关文件

| 文件 | 路径 |
|------|------|
| 数据库文件 | `/opt/gameworld/backend/database/gameworld.db` |
| 备份脚本 | `/opt/gameworld/deploy/backup-database.sh` |
| 定时配置 | `/opt/gameworld/deploy/setup-backup-cron.sh` |
| 备份目录 | `/opt/gameworld/backups/` |
| 日志文件 | `/var/log/gameworld-backup.log` |

---

## 联系支持

如有问题，请检查:
1. 服务状态: `pm2 status`
2. Nginx 状态: `systemctl status nginx`
3. 磁盘空间: `df -h`
4. 备份日志: `tail /var/log/gameworld-backup.log`
