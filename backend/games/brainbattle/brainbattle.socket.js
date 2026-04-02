/**
 * 脑力对决 - WebSocket 处理器
 * 好友对战、实时同步 - 重新设计版
 */

const db = require('../../database/db');
const { userOnline, userOffline, updateLocation } = require('../../modules/online/online.controller');

// 房间管理
const rooms = new Map();
const playerRooms = new Map();

// ========== 智能选题算法 ==========
/**
 * 根据玩家ID列表选择题目
 * 策略：
 * 1. 优先选择玩家没做过的题目
 * 2. 其次选择使用次数少的题目
 * 3. 使用加权随机：weight = 1 / (use_count + 1)
 * 
 * @param {number[]} playerIds - 玩家ID列表
 * @param {number} count - 需要的题目数量
 * @returns {Promise<Array>} 选中的题目列表
 */
async function selectSmartQuestions(playerIds, count = 5) {
  try {
    // 1. 获取所有激活的题目
    const allQuestions = await db.all(`
      SELECT id, type, difficulty, question, options, answer, explanation, use_count
      FROM brainbattle_questions 
      WHERE is_active = 1
    `);
    
    if (allQuestions.length < count) {
      console.log(`[BrainBattle] 警告: 题库中只有 ${allQuestions.length} 道题目，需要 ${count} 道`);
      return allQuestions.map(q => ({ ...q, options: JSON.parse(q.options) }));
    }
    
    // 2. 获取这些玩家最近做过的题目ID（过滤条件：最近30天内）
    let playedQuestionIds = new Set();
    if (playerIds && playerIds.length > 0) {
      const placeholders = playerIds.map(() => '?').join(',');
      const recentPlays = await db.all(`
        SELECT DISTINCT question_id 
        FROM brainbattle_user_question_history 
        WHERE user_id IN (${placeholders}) 
        AND played_at > datetime('now', '-30 days')
      `, playerIds);
      playedQuestionIds = new Set(recentPlays.map(p => p.question_id));
    }
    
    console.log(`[BrainBattle] 玩家 ${playerIds?.join(',') || '匹配模式'} 最近30天做过 ${playedQuestionIds.size} 道题`);
    
    // 3. 分类题目：未做过的 vs 做过的
    const unplayedQuestions = allQuestions.filter(q => !playedQuestionIds.has(q.id));
    const playedQuestions = allQuestions.filter(q => playedQuestionIds.has(q.id));
    
    console.log(`[BrainBattle] 未做过的题目: ${unplayedQuestions.length}, 做过的: ${playedQuestions.length}`);
    
    // 4. 加权随机选择函数
    function weightedRandomSelect(questions, n) {
      if (questions.length <= n) return questions;
      
      // 计算权重：使用次数越少，权重越高
      const weights = questions.map(q => {
        const useCount = q.use_count || 0;
        return 1 / (useCount + 1); // 权重 = 1 / (使用次数 + 1)
      });
      
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      const selected = [];
      const available = [...questions];
      const availableWeights = [...weights];
      
      while (selected.length < n && available.length > 0) {
        // 归一化权重
        const normalizedWeights = availableWeights.map(w => w / availableWeights.reduce((a, b) => a + b, 0));
        
        // 随机选择
        let random = Math.random();
        let index = 0;
        for (let i = 0; i < normalizedWeights.length; i++) {
          random -= normalizedWeights[i];
          if (random <= 0) {
            index = i;
            break;
          }
        }
        
        selected.push(available[index]);
        available.splice(index, 1);
        availableWeights.splice(index, 1);
      }
      
      return selected;
    }
    
    // 5. 选择题目：优先选未做过的
    let selected = [];
    
    if (unplayedQuestions.length >= count) {
      // 未做过的题目足够，从中加权随机选择
      selected = weightedRandomSelect(unplayedQuestions, count);
      console.log(`[BrainBattle] 从未做过的题目中选择 ${selected.length} 道`);
    } else {
      // 未做过的不够，先全选，再从做过的中补充
      selected = [...unplayedQuestions];
      const remaining = count - selected.length;
      const additional = weightedRandomSelect(playedQuestions, remaining);
      selected = selected.concat(additional);
      console.log(`[BrainBattle] 未做过的题目不足，补充 ${additional.length} 道做过的题目`);
    }
    
    // 6. 打乱顺序
    selected = selected.sort(() => Math.random() - 0.5);
    
    // 7. 解析options
    return selected.map(q => ({
      ...q,
      options: JSON.parse(q.options)
    }));
    
  } catch (err) {
    console.error('[BrainBattle] 智能选题失败:', err);
    // 回退到简单随机选择
    const questions = await db.all(`
      SELECT id, type, difficulty, question, options, answer, explanation 
      FROM brainbattle_questions WHERE is_active = 1 
      ORDER BY RANDOM() LIMIT ?
    `, [count]);
    return questions.map(q => ({ ...q, options: JSON.parse(q.options) }));
  }
}

/**
 * 更新题目使用记录
 * @param {number} gameId - 游戏ID
 * @param {Array} questions - 使用的题目列表
 * @param {number} player1Id - 玩家1 ID
 * @param {number} player2Id - 玩家2 ID
 */
async function updateQuestionUsage(gameId, questions, player1Id, player2Id) {
  try {
    // 1. 更新题目使用次数
    for (const question of questions) {
      await db.run(`
        UPDATE brainbattle_questions 
        SET use_count = use_count + 1, updated_at = datetime('now')
        WHERE id = ?
      `, [question.id]);
    }
    
    // 2. 记录玩家题目历史
    const playerIds = [player1Id, player2Id].filter(Boolean);
    for (const playerId of playerIds) {
      for (const question of questions) {
        await db.run(`
          INSERT OR IGNORE INTO brainbattle_user_question_history 
          (user_id, question_id, game_id, played_at)
          VALUES (?, ?, ?, datetime('now'))
        `, [playerId, question.id, gameId]);
      }
    }
    
    console.log(`[BrainBattle] 题目使用记录已更新: 游戏 ${gameId}, ${questions.length} 道题`);
  } catch (err) {
    console.error('[BrainBattle] 更新题目使用记录失败:', err);
  }
}

module.exports = function(io) {
  const ns = io.of('/brainbattle');
  
  ns.on('connection', (socket) => {
    console.log('[BrainBattle] 玩家连接:', socket.id);
    
    // 从 auth 中获取用户ID并上报在线状态
    const userId = socket.handshake.auth?.userId;
    if (userId) {
      userOnline(userId, socket.id, 'brainbattle_lobby');
    }
    
    // ========== 创建房间 ==========
    socket.on('create-room', async (data) => {
      console.log('[BrainBattle] 收到 create-room 事件:', data);
      try {
        const { userId, username } = data;
        console.log('[BrainBattle] 创建房间参数:', { userId, username, socketId: socket.id });
        const roomId = generateRoomId();
        
        // 使用智能选题算法（创建时还不知道对手，只根据房主历史记录选题）
        const questions = await selectSmartQuestions([userId], 5);
        
        rooms.set(roomId, {
          id: roomId,
          player1: { id: userId, username, socketId: socket.id, score: 0, streak: 0, answered: false },
          player2: null,
          questions: questions,
          currentRound: 1,
          status: 'waiting',
          answers: new Map() // 每轮答题记录
        });
        
        playerRooms.set(socket.id, roomId);
        socket.join(roomId);
        
        socket.emit('room-created', { success: true, roomId, questions: questions });
        console.log(`[BrainBattle] 房间创建成功: ${roomId}, 当前房间数: ${rooms.size}`);
        
      } catch (err) {
        console.error('[BrainBattle] 创建房间失败:', err);
        socket.emit('room-created', { success: false, message: '创建失败' });
      }
    });
    
    // ========== 取消房间 ==========
    socket.on('cancel-room', (data) => {
      try {
        const { roomId } = data;
        const room = rooms.get(roomId);
        
        // 房间不存在，可能是房主已经退出，直接允许离开
        if (!room) {
          socket.emit('cancel-result', { success: true, message: '房间已解散', isLeave: true });
          playerRooms.delete(socket.id);
          return;
        }
        
        // 只能取消自己创建的房间，非房主调用视为离开房间
        if (room.player1.socketId !== socket.id) {
          // 非房主离开房间
          playerRooms.delete(socket.id);
          socket.leave(roomId);
          
          // 通知房主对方已离开
          if (room.player1) {
            ns.sockets.get(room.player1.socketId)?.emit('opponent-left', {
              message: '对方已离开房间'
            });
          }
          
          socket.emit('cancel-result', { success: true, message: '已离开房间', isLeave: true });
          console.log(`[BrainBattle] 玩家离开房间: ${roomId}`);
          return;
        }
        
        // 房主取消房间，通知对方
        if (room.player2) {
          ns.sockets.get(room.player2.socketId)?.emit('room-cancelled', {
            message: '房主已取消房间'
          });
        }
        
        // 删除房间
        rooms.delete(roomId);
        playerRooms.delete(socket.id);
        socket.leave(roomId);
        
        socket.emit('cancel-result', { success: true });
        console.log(`[BrainBattle] 房间已取消: ${roomId}`);
        
      } catch (err) {
        console.error('[BrainBattle] 取消房间失败:', err);
        socket.emit('cancel-result', { success: false, message: '取消失败' });
      }
    });
    
    // ========== 邀请好友 ==========
    socket.on('invite-friend', async (data) => {
      try {
        const { roomId, friendId, inviterName } = data;
        
        console.log(`[BrainBattle] ${inviterName} 邀请好友 ${friendId} 加入房间 ${roomId}`);
        
        const room = rooms.get(roomId);
        if (!room) {
          socket.emit('invite-result', { success: false, message: '房间不存在' });
          return;
        }
        
        // 检查房间状态
        if (room.status !== 'waiting') {
          socket.emit('invite-result', { success: false, message: '房间已满或已开始' });
          return;
        }
        
        // 检查好友是否已在房间
        if (room.player2 && (room.player2.id == friendId || room.player1.id == friendId)) {
          socket.emit('invite-result', { success: false, message: '好友已在房间中' });
          return;
        }
        
        // 获取好友信息
        const friend = await db.get('SELECT id, nickname FROM users WHERE id = ?', [friendId]);
        if (!friend) {
          socket.emit('invite-result', { success: false, message: '好友不存在' });
          return;
        }
        
        // 向好友发送邀请通知
        const targetFriendId = String(friendId);
        const inviteData = {
          roomId: roomId,
          inviterName: inviterName,
          gameName: '脑力对决',
          gameType: 'brainbattle',
          timestamp: Date.now()
        };
        
        // 1. 发送到 brainbattle namespace（如果好友在脑力对决大厅）
        ns.emit(`invite-${targetFriendId}`, inviteData);
        
        // 2. 发送到主 namespace（如果好友在游戏大厅或其他页面）
        io.emit(`invite-${targetFriendId}`, inviteData);
        
        console.log(`[BrainBattle] 邀请已发送给: ${friend.nickname} (ID: ${targetFriendId})`);
        
        socket.emit('invite-result', { 
          success: true, 
          message: `已邀请 ${friend.nickname} 加入房间`
        });
        
        console.log(`[BrainBattle] 邀请已发送给: ${friend.nickname}`);
        
      } catch (err) {
        console.error('[BrainBattle] 邀请好友失败:', err);
        socket.emit('invite-result', { success: false, message: '邀请发送失败' });
      }
    });
    
    // ========== 加入房间 ==========
    socket.on('join-room', async (data) => {
      try {
        const { roomId, userId, username } = data;
        const room = rooms.get(roomId);
        
        console.log(`[BrainBattle] 加入房间: roomId=${roomId}, 房间存在=${!!room}, 当前房间列表=${Array.from(rooms.keys()).join(', ')}`);
        
        if (!room) {
          socket.emit('join-result', { success: false, message: '房间不存在' });
          return;
        }
        if (room.status !== 'waiting') {
          socket.emit('join-result', { success: false, message: '房间已满' });
          return;
        }
        if (room.player1.id === userId) {
          socket.emit('join-result', { success: false, message: '不能加入自己房间' });
          return;
        }
        
        room.player2 = { id: userId, username, socketId: socket.id, score: 0, streak: 0, answered: false, ready: false };
        room.player1.ready = false; // 重置房主准备状态
        room.status = 'ready'; // 等待准备状态
        
        playerRooms.set(socket.id, roomId);
        socket.join(roomId);
        
        // 通知双方玩家已加入，等待准备
        ns.to(roomId).emit('player-joined', {
          roomId,
          player1: { id: room.player1.id, username: room.player1.username, ready: false },
          player2: { id: room.player2.id, username: room.player2.username, ready: false }
        });
        
        console.log(`[BrainBattle] 玩家2加入房间: ${roomId}, 等待双方准备`);
        
      } catch (err) {
        console.error('[BrainBattle] 加入失败:', err);
        socket.emit('join-result', { success: false, message: '加入失败' });
      }
    });
    
    // ========== 玩家准备 ==========
    socket.on('player-ready', (data) => {
      try {
        const { roomId } = data;
        const room = rooms.get(roomId);
        
        if (!room || room.status !== 'ready') return;
        
        const isPlayer1 = room.player1.socketId === socket.id;
        const player = isPlayer1 ? room.player1 : room.player2;
        const opponent = isPlayer1 ? room.player2 : room.player1;
        
        player.ready = true;
        console.log(`[BrainBattle] ${player.username} 已准备`);
        
        // 通知对方我准备好了
        if (opponent) {
          ns.sockets.get(opponent.socketId)?.emit('opponent-ready', {
            playerId: player.id,
            username: player.username
          });
        }
        
        // 检查是否双方都准备好了
        if (room.player1.ready && room.player2.ready) {
          console.log(`[BrainBattle] 双方都准备好，游戏开始: ${roomId}`);
          room.status = 'playing';
          
          // 延迟1秒后发送游戏开始
          setTimeout(() => {
            ns.to(roomId).emit('game-start', {
              roomId,
              player1: { id: room.player1.id, username: room.player1.username },
              player2: { id: room.player2.id, username: room.player2.username },
              questions: room.questions,
              currentRound: 1
            });
          }, 1000);
        }
        
      } catch (err) {
        console.error('[BrainBattle] 准备处理失败:', err);
      }
    });
    
    // ========== 玩家重新连接（从大厅跳转到游戏页面）==========
    socket.on('reconnect-player', (data) => {
      try {
        const { roomId, isPlayer1 } = data;
        console.log(`[BrainBattle] 玩家重新连接: roomId=${roomId}, isPlayer1=${isPlayer1}, socket=${socket.id}`);
        
        const room = rooms.get(roomId);
        if (!room) {
          console.log(`[BrainBattle] 重新连接失败: 房间不存在`);
          return;
        }
        
        // 更新玩家的 socket ID 和在线状态
        const player = isPlayer1 ? room.player1 : room.player2;
        
        // 取消之前的断开通知定时器
        if (player.disconnectTimer) {
          clearTimeout(player.disconnectTimer);
          player.disconnectTimer = null;
          console.log(`[BrainBattle] 取消断开通知定时器: ${player.username}`);
        }
        
        player.socketId = socket.id;
        player.isOnline = true;
        
        playerRooms.set(socket.id, roomId);
        socket.join(roomId);
        
        console.log(`[BrainBattle] 玩家重新连接成功: ${isPlayer1 ? 'player1' : 'player2'}`);
        
      } catch (err) {
        console.error('[BrainBattle] 重新连接处理失败:', err);
      }
    });
    
    // ========== 提交答案 ==========
    socket.on('submit-answer', (data) => {
      try {
        const { roomId, round, answer, answerTime } = data;
        console.log(`[BrainBattle] 收到答案: room=${roomId}, round=${round}, socket=${socket.id}`);
        console.log(`[BrainBattle] 当前所有房间: ${Array.from(rooms.keys()).join(', ')}`);
        console.log(`[BrainBattle] 当前playerRooms: ${Array.from(playerRooms.entries()).map(([k,v]) => `${k}:${v}`).join(', ')}`);
        
        const room = rooms.get(roomId);
        
        if (!room) {
          console.log(`[BrainBattle] 答案拒绝: room不存在，房间列表=${Array.from(rooms.keys()).join(', ')}`);
          return;
        }
        if (room.status !== 'playing') {
          console.log(`[BrainBattle] 答案拒绝: 房间状态=${room.status}`);
          return;
        }
        if (round !== room.currentRound) {
          console.log(`[BrainBattle] 答案拒绝: round不匹配, 收到=${round}, 当前=${room.currentRound}`);
          return;
        }
        
        const isPlayer1 = room.player1.socketId === socket.id;
        const player = isPlayer1 ? room.player1 : room.player2;
        const opponent = isPlayer1 ? room.player2 : room.player1;
        
        console.log(`[BrainBattle] 玩家身份: isPlayer1=${isPlayer1}, player=${player.username}, opponent=${opponent?.username}`);
        
        if (player.answered) {
          console.log(`[BrainBattle] 答案拒绝: 玩家已答题`);
          return;
        }
        
        // 计算得分
        const question = room.questions[round - 1];
        const isCorrect = answer === question.answer;
        let score = 0;
        
        if (isCorrect) {
          player.streak++;
          score = 15;
          if (answerTime < 3000) score += 5;
          score += (player.streak - 1) * 5;
          player.score += score;
        } else {
          player.streak = 0;
        }
        
        player.answered = true;
        
        // 记录答案
        const roundKey = `round-${round}`;
        if (!room.answers.has(roundKey)) {
          room.answers.set(roundKey, { player1: null, player2: null });
        }
        const record = room.answers.get(roundKey);
        const answerRecord = { 
          userId: player.id, 
          answer, 
          isCorrect, 
          score, 
          totalScore: player.score,
          streak: player.streak,
          answerTime 
        };
        
        if (isPlayer1) record.player1 = answerRecord;
        else record.player2 = answerRecord;
        
        // 1. 告诉答题者结果
        socket.emit('answer-result', {
          round,
          isCorrect,
          correctAnswer: question.answer,
          score,
          totalScore: player.score,
          streak: player.streak
        });
        console.log(`[BrainBattle] 发送answer-result给${player.username}`);
        
        // 2. 告诉对手我答完了
        if (opponent) {
          ns.sockets.get(opponent.socketId)?.emit('opponent-answered', {
            round,
            opponentScore: player.score
          });
          console.log(`[BrainBattle] 发送opponent-answered给${opponent.username} (socketId: ${opponent.socketId})`);
        }
        
        // 3. 检查是否双方都完成
        console.log(`[BrainBattle] 检查本轮完成: p1.answered=${room.player1.answered}, p2.answered=${room.player2?.answered}`);
        checkRoundComplete(room, round);
        
      } catch (err) {
        console.error('[BrainBattle] 提交答案失败:', err);
      }
    });
    
    // ========== 超时 ==========
    socket.on('timeout', (data) => {
      try {
        const { roomId, round } = data;
        console.log(`[BrainBattle] 收到超时: room=${roomId}, round=${round}, socket=${socket.id}`);
        
        const room = rooms.get(roomId);
        
        if (!room || room.status !== 'playing') {
          console.log(`[BrainBattle] 超时拒绝: room不存在或状态=${room?.status}`);
          return;
        }
        if (round !== room.currentRound) {
          console.log(`[BrainBattle] 超时拒绝: round不匹配, 收到=${round}, 当前=${room.currentRound}`);
          return;
        }
        
        const isPlayer1 = room.player1.socketId === socket.id;
        const player = isPlayer1 ? room.player1 : room.player2;
        const opponent = isPlayer1 ? room.player2 : room.player1;
        
        if (player.answered) return;
        
        player.streak = 0;
        player.answered = true;
        
        // 记录超时
        const roundKey = `round-${round}`;
        if (!room.answers.has(roundKey)) {
          room.answers.set(roundKey, { player1: null, player2: null });
        }
        const record = room.answers.get(roundKey);
        const answerRecord = { 
          userId: player.id, 
          answer: -1, 
          isCorrect: false, 
          score: 0, 
          totalScore: player.score,
          streak: 0,
          answerTime: 10000 
        };
        
        if (isPlayer1) record.player1 = answerRecord;
        else record.player2 = answerRecord;
        
        // 告诉对手我超时了
        if (opponent) {
          ns.sockets.get(opponent.socketId)?.emit('opponent-timeout', {
            round,
            opponentScore: player.score
          });
          console.log(`[BrainBattle] 发送opponent-timeout给${opponent.username} (socketId: ${opponent.socketId})`);
        }
        
        console.log(`[BrainBattle] 超时后检查本轮完成: p1.answered=${room.player1.answered}, p2.answered=${room.player2?.answered}`);
        checkRoundComplete(room, round);
        
      } catch (err) {
        console.error('[BrainBattle] 超时处理失败:', err);
      }
    });
    
    // ========== 检查本轮是否完成 ==========
    function checkRoundComplete(room, round) {
      const p1 = room.player1;
      const p2 = room.player2;
      
      console.log(`[BrainBattle] checkRoundComplete: round=${round}, p1.answered=${p1?.answered}, p2.answered=${p2?.answered}`);
      
      if (!p1 || !p2) {
        console.log(`[BrainBattle] 检查失败: p1或p2不存在`);
        return;
      }
      
      // 广播双方状态
      ns.to(room.id).emit('round-status', {
        round,
        player1Answered: p1.answered,
        player2Answered: p2.answered,
        player1Score: p1.score,
        player2Score: p2.score
      });
      
      // 双方都完成了
      if (p1.answered && p2.answered) {
        console.log(`[BrainBattle] ===== 第${round}轮完成 =====`);
        
        // 广播本轮结束
        const roundKey = `round-${round}`;
        const record = room.answers.get(roundKey);
        
        ns.to(room.id).emit('round-complete', {
          round,
          player1: { score: p1.score, ...record.player1 },
          player2: { score: p2.score, ...record.player2 }
        });
        console.log(`[BrainBattle] 发送round-complete`);
        
        // 延迟后进入下一轮或结束
        setTimeout(() => {
          if (round >= 5) {
            console.log(`[BrainBattle] 游戏结束，发送game-end`);
            endGame(room);
          } else {
            // 重置答题状态
            p1.answered = false;
            p2.answered = false;
            room.currentRound = round + 1;
            
            console.log(`[BrainBattle] ===== 发送next-round: ${room.currentRound} =====`);
            ns.to(room.id).emit('next-round', {
              round: room.currentRound,
              player1Score: p1.score,
              player2Score: p2.score
            });
          }
        }, 2000);
      } else {
        console.log(`[BrainBattle] 等待双方完成...`);
      }
    }
    
    // ========== 结束游戏 ==========
    async function endGame(room) {
      try {
        room.status = 'finished';
        
        const p1 = room.player1;
        const p2 = room.player2;
        
        let winner = null;
        if (p1.score > p2.score) winner = p1;
        else if (p2.score > p1.score) winner = p2;
        
        // 保存到数据库
        const result = await db.run(`
          INSERT INTO brainbattle_games 
          (room_id, player1_id, player2_id, winner_id, player1_score, player2_score, questions, status, finished_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'finished', datetime('now'))
        `, [
          room.id, p1.id, p2.id, winner ? winner.id : null,
          p1.score, p2.score,
          JSON.stringify(room.questions.map(q => q.id))
        ]);
        
        // 更新题目使用记录
        await updateQuestionUsage(result.lastID, room.questions, p1.id, p2.id);
        
        // 初始化再来一局状态
        room.rematchStatus = { player1: false, player2: false };
        room.rematchTimeout = null;
        
        ns.to(room.id).emit('game-end', {
          player1Score: p1.score,
          player2Score: p2.score,
          winner: winner ? { id: winner.id, username: winner.username } : null,
          isDraw: !winner,
          rematchTimeout: 10 // 10秒倒计时
        });
        
        console.log(`[BrainBattle] 游戏结束: ${room.id}, 等待再来一局决策...`);
        
        // 10秒倒计时，超时删除房间
        room.rematchTimeout = setTimeout(() => {
          if (rooms.has(room.id)) {
            rooms.delete(room.id);
            console.log(`[BrainBattle] 房间已删除（再来一局超时）: ${room.id}`);
          }
        }, 10000);
        
      } catch (err) {
        console.error('[BrainBattle] 结束游戏失败:', err);
      }
    }
    
    // ========== 主动退出游戏 ==========
    socket.on('quit-game', async (data) => {
      try {
        const { roomId } = data;
        const room = rooms.get(roomId);
        
        if (!room || room.status !== 'playing') return;
        
        const isPlayer1 = room.player1.socketId === socket.id;
        const player = isPlayer1 ? room.player1 : room.player2;
        const opponent = isPlayer1 ? room.player2 : room.player1;
        
        console.log(`[BrainBattle] 玩家主动退出游戏: ${player.username}, room=${roomId}`);
        
        // 退出者得0分，对手获胜
        player.score = 0;
        
        // 通知对手：对方已退出，你获胜
        if (opponent) {
          ns.sockets.get(opponent.socketId)?.emit('opponent-quit', {
            player1Score: isPlayer1 ? 0 : opponent.score,
            player2Score: isPlayer1 ? opponent.score : 0,
            quitterName: player.username
          });
        }
        
        // 保存游戏结果到数据库（退出者失败）
        try {
          const result = await db.run(`
            INSERT INTO brainbattle_games 
            (room_id, player1_id, player2_id, winner_id, player1_score, player2_score, questions, status, finished_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'finished', datetime('now'))
          `, [
            room.id, 
            room.player1.id, 
            room.player2.id, 
            opponent.id,  // 对手获胜
            isPlayer1 ? 0 : opponent.score, 
            isPlayer1 ? opponent.score : 0,
            JSON.stringify(room.questions.map(q => q.id))
          ]);
          
          // 更新题目使用记录
          await updateQuestionUsage(result.lastID, room.questions, room.player1.id, room.player2.id);
          
          console.log(`[BrainBattle] 退出游戏结果已保存: ${roomId}`);
        } catch (dbErr) {
          console.error('[BrainBattle] 保存退出游戏结果失败:', dbErr);
        }
        
        // 删除房间
        rooms.delete(roomId);
        playerRooms.delete(socket.id);
        if (opponent) {
          playerRooms.delete(opponent.socketId);
        }
        
        console.log(`[BrainBattle] 房间已删除（玩家退出）: ${roomId}`);
        
      } catch (err) {
        console.error('[BrainBattle] 退出游戏处理失败:', err);
      }
    });
    
    // ========== 再来一局决策 ==========
    socket.on('rematch-decision', (data) => {
      try {
        const { roomId, decision } = data; // decision: 'accept' 或 'leave'
        const room = rooms.get(roomId);
        
        if (!room || room.status !== 'finished') return;
        
        const isPlayer1 = room.player1.socketId === socket.id;
        const player = isPlayer1 ? room.player1 : room.player2;
        const opponent = isPlayer1 ? room.player2 : room.player1;
        
        console.log(`[BrainBattle] 再来一局决策: ${player.username} 选择 ${decision}`);
        
        if (decision === 'leave') {
          // 有人选择返回大厅，立即删除房间
          if (room.rematchTimeout) {
            clearTimeout(room.rematchTimeout);
          }
          rooms.delete(roomId);
          console.log(`[BrainBattle] 房间已删除（玩家返回大厅）: ${roomId}`);
          
          // 通知对手
          if (opponent) {
            ns.sockets.get(opponent.socketId)?.emit('rematch-cancelled', { reason: '对方已离开' });
          }
          return;
        }
        
        if (decision === 'accept') {
          // 记录该玩家同意再来一局
          if (isPlayer1) room.rematchStatus.player1 = true;
          else room.rematchStatus.player2 = true;
          
          // 通知对手
          if (opponent) {
            ns.sockets.get(opponent.socketId)?.emit('opponent-rematch-status', { 
              opponentName: player.username,
              status: 'accepted' 
            });
          }
          
          // 检查是否双方都同意
          if (room.rematchStatus.player1 && room.rematchStatus.player2) {
            console.log(`[BrainBattle] 双方同意再来一局，重新开始游戏: ${roomId}`);
            
            // 清除超时定时器
            if (room.rematchTimeout) {
              clearTimeout(room.rematchTimeout);
              room.rematchTimeout = null;
            }
            
            // 重置房间状态
            startRematch(room);
          }
        }
        
      } catch (err) {
        console.error('[BrainBattle] 再来一局决策处理失败:', err);
      }
    });
    
    // ========== 开始再来一局 ==========
    async function startRematch(room) {
      try {
        // 生成新的房间ID（保留原房间，但用新ID开始新游戏）
        const oldRoomId = room.id;
        const newRoomId = generateRoomId();
        
        // 使用智能选题算法（根据两个玩家的历史记录选题）
        const questions = await selectSmartQuestions([room.player1.id, room.player2.id], 5);
        
        // 创建新的房间数据（基于原房间玩家信息）
        const newRoom = {
          id: newRoomId,
          player1: { 
            ...room.player1, 
            score: 0, 
            streak: 0, 
            answered: false,
            socketId: room.player1.socketId
          },
          player2: { 
            ...room.player2, 
            score: 0, 
            streak: 0, 
            answered: false,
            socketId: room.player2.socketId
          },
          questions: parsedQuestions,
          currentRound: 1,
          status: 'playing',
          answers: new Map(),
          rematchStatus: { player1: false, player2: false }
        };
        
        // 删除旧房间，添加新房间
        rooms.delete(oldRoomId);
        rooms.set(newRoomId, newRoom);
        
        // 更新 playerRooms 映射
        playerRooms.set(room.player1.socketId, newRoomId);
        playerRooms.set(room.player2.socketId, newRoomId);
        
        // 让两个玩家加入新房间
        const p1Socket = ns.sockets.get(room.player1.socketId);
        const p2Socket = ns.sockets.get(room.player2.socketId);
        if (p1Socket) {
          p1Socket.leave(oldRoomId);
          p1Socket.join(newRoomId);
        }
        if (p2Socket) {
          p2Socket.leave(oldRoomId);
          p2Socket.join(newRoomId);
        }
        
        // 发送游戏开始事件（带新房间号）
        ns.to(newRoomId).emit('rematch-start', {
          roomId: newRoomId,
          player1: { id: newRoom.player1.id, username: newRoom.player1.username },
          player2: { id: newRoom.player2.id, username: newRoom.player2.username },
          questions: newRoom.questions,
          currentRound: 1,
          isRematch: true
        });
        
        console.log(`[BrainBattle] 再来一局开始: ${oldRoomId} -> ${newRoomId}`);
        
      } catch (err) {
        console.error('[BrainBattle] 再来一局开始失败:', err);
      }
    }
    
    // ========== 断开连接 ==========
    socket.on('disconnect', () => {
      try {
        const roomId = playerRooms.get(socket.id);
        if (roomId) {
          const room = rooms.get(roomId);
          if (room) {
            const isPlayer1 = room.player1.socketId === socket.id;
            const player = isPlayer1 ? room.player1 : room.player2;
            const opponent = isPlayer1 ? room.player2 : room.player1;
            
            // 游戏进行中：标记为离线，保留房间（允许页面跳转后重新连接）
            if (room.status === 'playing') {
              if (player) {
                player.isOnline = false;
                console.log(`[BrainBattle] 玩家游戏中离线: ${player.username}, room=${roomId}`);
              }
              
              // 延迟通知对手（给玩家5秒时间重新连接）
              if (opponent && opponent.isOnline !== false) {
                const disconnectTimer = setTimeout(() => {
                  // 5秒后检查该玩家是否重新连接
                  const currentRoom = rooms.get(roomId);
                  if (currentRoom) {
                    const currentPlayer = isPlayer1 ? currentRoom.player1 : currentRoom.player2;
                    if (currentPlayer && !currentPlayer.isOnline) {
                      // 确实断线了，通知对手
                      ns.sockets.get(opponent.socketId)?.emit('opponent-left', {
                        message: '对方已断开连接'
                      });
                    }
                  }
                }, 5000);
                
                // 把定时器存到玩家对象上，重新连接时可以取消
                player.disconnectTimer = disconnectTimer;
              }
            }
            // 游戏已结束：立即删除房间
            else if (room.status === 'finished') {
              rooms.delete(roomId);
              console.log(`[BrainBattle] 房间已删除（游戏结束）: ${roomId}`);
            }
          }
          playerRooms.delete(socket.id);
        }
        console.log('[BrainBattle] 玩家断开:', socket.id);
        
        // 用户下线
        if (userId) {
          userOffline(userId);
        }
        
      } catch (err) {
        console.error('[BrainBattle] 断开处理失败:', err);
      }
    });
  });
  
  function generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return rooms.has(result) ? generateRoomId() : result;
  }
};
