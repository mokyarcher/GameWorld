const { v4: uuidv4 } = require('uuid');
const db = require('../../database/db');
const { PokerGame, evaluateHand, compareHands } = require('./PokerGame');

const activeGames = new Map();
const socketMap = new Map();
const gameDecisionTimers = new Map();
const playerChoices = new Map();

// 人机名称库
const botNames = ['小白', '阿强', '大壮', '铁柱', '狗子', '二蛋', '胖虎', '阿明', '老王', '老李'];

// 人机头像库（放在 frontend/avatars/bots/ 目录下，支持1-20号头像）
const botAvatars = Array.from({length: 20}, (_, i) => `bots/bot_${i + 1}.png`);

// 记录已使用的头像（每个房间独立）
const roomUsedAvatars = new Map();

// 生成人机玩家
function createBotPlayer(seatNumber, roomId) {
  const randomName = botNames[Math.floor(Math.random() * botNames.length)];
  const randomId = 'bot_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  
  // 为当前房间获取已使用的头像
  const usedAvatars = roomUsedAvatars.get(roomId) || new Set();
  
  // 过滤出可用的头像
  const availableAvatars = botAvatars.filter(avatar => !usedAvatars.has(avatar));
  
  // 如果所有头像都已使用，则重置
  let selectedAvatar;
  if (availableAvatars.length === 0) {
    usedAvatars.clear();
    selectedAvatar = botAvatars[Math.floor(Math.random() * botAvatars.length)];
  } else {
    selectedAvatar = availableAvatars[Math.floor(Math.random() * availableAvatars.length)];
  }
  
  // 记录已使用的头像
  usedAvatars.add(selectedAvatar);
  roomUsedAvatars.set(roomId, usedAvatars);
  
  return {
    userId: randomId,
    username: randomName,
    nickname: randomName + '(人机)',
    avatar: selectedAvatar,
    chips: 100000,
    seatNumber: seatNumber,
    socketId: null,
    isReady: true, // 人机自动准备
    isBot: true,   // 标记为人机
    folded: false,
    allIn: false,
    currentBet: 0,
    disconnected: false
  };
}

async function startNewRound(roomId, game, io) {
  console.log('========== startNewRound ==========');
  
  game.status = 'playing';
  game.currentRound = 0;
  game.pot = 0;
  game.communityCards = [];
  game.deck = require('./PokerGame').createDeck();
  game.currentBet = 0;
  
  console.log('old dealer:', game.dealer);
  game.dealer = (game.dealer + 1) % game.players.length;
  console.log('new dealer:', game.dealer);
  console.log('players:', game.players.map((p, i) => ({index: i, userId: p.userId, nickname: p.nickname})));
  
  const sbPos = (game.dealer + 1) % game.players.length;
  const bbPos = (game.dealer + 2) % game.players.length;
  
  game.players.forEach((p, index) => {
    p.hand = [];
    p.folded = false;
    p.allIn = false;
    p.currentBet = 0;
    p.hasActed = false;
    p.isSB = (index === sbPos);
    p.isBB = (index === bbPos);
    p.isDealer = (index === game.dealer);
  });
  
  game.players[sbPos].chips -= game.smallBlind;
  game.players[sbPos].currentBet = game.smallBlind;
  game.pot += game.smallBlind;
  
  game.players[bbPos].chips -= game.bigBlind;
  game.players[bbPos].currentBet = game.bigBlind;
  game.pot += game.bigBlind;
  game.currentBet = game.bigBlind;
  
  console.log(`blinds - SB:${sbPos}, BB:${bbPos}, pot:${game.pot}`);
  
  game.players.forEach((p, index) => {
    p.hand = [game.dealCard(), game.dealCard()];
    console.log(`deal cards to player ${index}(${p.nickname})`);
  });
  
  if (game.players.length === 2) {
    game.currentPlayer = sbPos;
  } else {
    game.currentPlayer = (bbPos + 1) % game.players.length;
  }
  
  console.log('current player:', game.players[game.currentPlayer]?.nickname);
  
  io.in(roomId).emit('new-round-started', { 
    roomId,
    dealer: game.dealer,
    message: 'New round started!'
  });
  
  game.players.forEach(p => {
    const playerSocket = io.sockets.get(p.socketId);
    if (playerSocket) {
      playerSocket.emit('game-state', game.toPrivateJSON(p.userId));
    }
  });
  
  io.in(roomId).emit('public-state', game.toJSON());
  
  notifyCurrentPlayer(game, io);
  
  console.log('========== startNewRound done ==========');
}

function broadcastGameState(io, roomId, game) {
  game.players.forEach(p => {
    const playerSocket = io.sockets.get(p.socketId);
    if (playerSocket) {
      playerSocket.emit('game-state', game.toPrivateJSON(p.userId));
    }
  });
  
  io.in(roomId).emit('public-state', game.toJSON());
}

function clearPlayerActionTimer(player) {
  if (player.actionTimer) {
    clearTimeout(player.actionTimer);
    player.actionTimer = null;
  }
  if (player.actionCountdownInterval) {
    clearInterval(player.actionCountdownInterval);
    player.actionCountdownInterval = null;
  }
}

// 人机自动决策
async function botAction(game, io, player) {
  const roomId = game.roomId;
  const playerIndex = game.players.indexOf(player);
  
  // 延迟1-3秒后决策，模拟思考时间
  const thinkTime = 1000 + Math.floor(Math.random() * 2000);
  await new Promise(resolve => setTimeout(resolve, thinkTime));
  
  // 如果已经不是当前玩家了（比如超时了），则不做任何操作
  if (game.currentPlayer !== playerIndex || player.folded || player.allIn) {
    return;
  }
  
  const toCall = game.currentBet - player.currentBet;
  const handStrength = Math.random(); // 随机模拟手牌强度
  
  let action, amount = 0;
  
  if (toCall === 0) {
    // 不需要跟注
    if (handStrength > 0.7 && player.chips >= game.bigBlind * 2) {
      // 手牌好，加注
      action = 'raise';
      const minRaise = game.currentBet + game.lastRaise;
      const maxRaise = player.chips;
      amount = Math.min(minRaise + Math.floor(Math.random() * minRaise), maxRaise);
      if (amount >= player.chips) {
        action = 'allin';
        amount = player.chips;
      }
    } else {
      // 手牌一般，看牌
      action = 'check';
    }
  } else {
    // 需要跟注
    const callRatio = toCall / player.chips;
    
    if (callRatio > 0.5 && handStrength < 0.6) {
      // 下注太大且手牌不好，弃牌
      action = 'fold';
    } else if (handStrength > 0.8 && player.chips > toCall * 3) {
      // 手牌很好，加注
      action = 'raise';
      amount = Math.min(toCall * 2 + game.lastRaise, player.chips);
      if (amount >= player.chips) {
        action = 'allin';
        amount = player.chips;
      }
    } else if (player.chips >= toCall) {
      // 跟注
      action = 'call';
      amount = toCall;
    } else {
      // 筹码不够，全下
      action = 'allin';
      amount = player.chips;
    }
  }
  
  console.log('Bot action:', player.nickname, action, amount);
  
  // 执行操作
  if (action === 'fold') {
    player.folded = true;
    player.hasActed = true;
    
    io.in(roomId).emit('action-broadcast', {
      userId: player.userId,
      username: player.nickname,
      action: 'fold',
      amount: 0,
      pot: game.pot,
      message: `${player.nickname} 弃牌`
    });
  } else if (action === 'check') {
    player.hasActed = true;
    
    io.in(roomId).emit('action-broadcast', {
      userId: player.userId,
      username: player.nickname,
      action: 'check',
      amount: 0,
      pot: game.pot,
      message: `${player.nickname} 看牌`
    });
  } else if (action === 'call') {
    player.chips -= amount;
    player.currentBet += amount;
    game.pot += amount;
    player.hasActed = true;
    
    io.in(roomId).emit('action-broadcast', {
      userId: player.userId,
      username: player.nickname,
      action: 'call',
      amount: amount,
      pot: game.pot,
      message: `${player.nickname} 跟注 ${amount}`
    });
  } else if (action === 'raise') {
    player.chips -= amount;
    player.currentBet += amount;
    game.pot += amount;
    game.currentBet = player.currentBet;
    game.lastRaise = amount - toCall;
    player.hasActed = true;
    
    // 重置其他玩家的行动状态
    game.players.forEach(p => {
      if (p.userId !== player.userId && !p.folded && !p.allIn) {
        p.hasActed = false;
      }
    });
    
    io.in(roomId).emit('action-broadcast', {
      userId: player.userId,
      username: player.nickname,
      action: 'raise',
      amount: amount,
      pot: game.pot,
      message: `${player.nickname} 加注 ${amount}`
    });
  } else if (action === 'allin') {
    player.chips -= amount;
    player.currentBet += amount;
    game.pot += amount;
    player.allIn = true;
    
    if (player.currentBet > game.currentBet) {
      game.currentBet = player.currentBet;
      game.lastRaise = amount - toCall;
      // 重置其他玩家的行动状态
      game.players.forEach(p => {
        if (p.userId !== player.userId && !p.folded && !p.allIn) {
          p.hasActed = false;
        }
      });
    }
    
    io.in(roomId).emit('action-broadcast', {
      userId: player.userId,
      username: player.nickname,
      action: 'allin',
      amount: amount,
      pot: game.pot,
      message: `${player.nickname} 全下 ${amount}`
    });
  }
  
  // 检查是否只剩一个未弃牌玩家
  const notFoldedPlayers = game.getNotFoldedPlayers();
  if (notFoldedPlayers.length === 1) {
    console.log('Only one player left after bot action, end game');
    setTimeout(() => {
      endGame(io, roomId, game, notFoldedPlayers[0]);
    }, 1000);
    return;
  }
  
  // 进入下一轮或通知下一个玩家
  if (game.shouldAdvanceRound()) {
    setTimeout(() => {
      advanceRound(io, roomId, game);
    }, 1000);
  } else {
    const nextPlayer = game.findNextActivePlayer(game.currentPlayer);
    if (nextPlayer >= 0) {
      game.currentPlayer = nextPlayer;
      broadcastGameState(io, roomId, game);
      notifyCurrentPlayer(game, io);
    }
  }
}

function notifyCurrentPlayer(game, io) {
  const player = game.players[game.currentPlayer];
  console.log('notifyCurrentPlayer - current player:', player?.nickname, 'position:', game.currentPlayer);
  
  if (!player) {
    console.log('error: player not found');
    return;
  }
  
  // 检查玩家是否已经弃牌或全下，如果是则跳过
  if (player.folded || player.allIn) {
    console.log('player folded or all-in, skip:', player.nickname, 'folded:', player.folded, 'allIn:', player.allIn);
    const nextPlayer = game.findNextActivePlayer(game.currentPlayer);
    if (nextPlayer >= 0) {
      game.currentPlayer = nextPlayer;
      broadcastGameState(io, game.roomId, game);
      notifyCurrentPlayer(game, io);
    }
    return;
  }
  
  clearPlayerActionTimer(player);
  
  if (player.disconnected) {
    console.log('player disconnected, pause action countdown:', player.nickname);
    return;
  }
  
  // 如果是人机，自动决策
  if (player.isBot) {
    console.log('bot turn:', player.nickname);
    botAction(game, io, player);
    return;
  }
  
  const playerSocket = io.sockets.get(player.socketId);
  
  console.log('player socketId:', player.socketId, 'socket exists:', !!playerSocket);
  
  if (playerSocket) {
    const toCall = game.currentBet - player.currentBet;
    const turnData = {
      canFold: true,
      canCheck: toCall === 0,
      canCall: toCall > 0 && player.chips >= toCall,
      canRaise: player.chips > toCall,
      callAmount: toCall,
      minRaise: game.currentBet + game.lastRaise,
      maxRaise: player.chips + player.currentBet
    };
    console.log('send your-turn to', player.nickname, ':', turnData);
    playerSocket.emit('your-turn', turnData);
    
    startActionCountdown(game, io, player);
  } else {
    console.log('error: player socket not found');
    startActionCountdown(game, io, player);
  }
}

function startActionCountdown(game, io, player) {
  const roomId = game.roomId;
  const playerIndex = game.players.indexOf(player);
  
  player.actionCountdown = 60;
  
  player.actionCountdownInterval = setInterval(() => {
    player.actionCountdown--;
    
    io.in(roomId).emit('player-action-countdown', {
      userId: player.userId,
      secondsLeft: player.actionCountdown
    });
    
    if (player.actionCountdown <= 10 && player.actionCountdown > 0) {
      io.in(roomId).emit('action-timeout-warning', {
        userId: player.userId,
        username: player.nickname || player.username,
        secondsLeft: player.actionCountdown
      });
    }
    
    if (player.actionCountdown <= 0) {
      clearInterval(player.actionCountdownInterval);
      player.actionCountdownInterval = null;
    }
  }, 1000);
  
  player.actionTimer = setTimeout(() => {
    if (game.currentPlayer === playerIndex && !player.folded && !player.allIn) {
      console.log('action timeout, auto fold:', player.nickname);
      
      player.folded = true;
      player.hasActed = true;
      
      io.in(roomId).emit('action-broadcast', {
        userId: player.userId,
        username: player.nickname || player.username,
        action: 'fold',
        amount: 0,
        pot: game.pot,
        message: `${player.nickname || player.username} timeout auto fold`
      });
      
      // 检查是否只剩一个未弃牌玩家，如果是则直接结束游戏
      const notFoldedPlayers = game.getNotFoldedPlayers();
      if (notFoldedPlayers.length === 1) {
        console.log('Only one player left after timeout fold, end game');
        setTimeout(() => {
          endGame(io, roomId, game, notFoldedPlayers[0]);
        }, 1000);
        return;
      }
      
      if (game.shouldAdvanceRound()) {
        setTimeout(() => {
          advanceRound(io, roomId, game);
        }, 1000);
      } else {
        const nextPlayer = game.findNextActivePlayer(game.currentPlayer);
        if (nextPlayer >= 0) {
          game.currentPlayer = nextPlayer;
          broadcastGameState(io, roomId, game);
          notifyCurrentPlayer(game, io);
        }
      }
    }
  }, 60000);
}

function advanceRound(io, roomId, game) {
  console.log('advanceRound - current round:', game.currentRound);
  
  game.players.forEach(p => clearPlayerActionTimer(p));
  
  if (game.currentRound === 0) {
    game.dealFlop();
    console.log('deal flop:', game.communityCards);
  } else if (game.currentRound === 1 || game.currentRound === 2) {
    game.dealTurnOrRiver();
    console.log('deal turn/river:', game.communityCards);
  } else if (game.currentRound === 3) {
    console.log('showdown');
    const winner = game.showdown();
    endGame(io, roomId, game, winner);
    return;
  }
  
  game.currentRound++;
  game.currentBet = 0;
  game.lastRaise = game.bigBlind;
  game.players.forEach(p => {
    p.currentBet = 0;
    p.hasActed = false;
  });
  
  const sbPos = (game.dealer + 1) % game.players.length;
  const bbPos = (game.dealer + 2) % game.players.length;
  if (game.players.length === 2) {
    game.currentPlayer = sbPos; // 2人桌：小盲注先行动
  } else {
    game.currentPlayer = (bbPos + 1) % game.players.length; // 大盲注下家先行动
  }
  
  console.log('next round:', game.currentRound, 'current player:', game.players[game.currentPlayer]?.nickname);
  
  io.in(roomId).emit('round-advanced', {
    round: game.currentRound,
    communityCards: game.communityCards,
    message: `Round ${game.currentRound} started`
  });
  
  broadcastGameState(io, roomId, game);
  notifyCurrentPlayer(game, io);
}

async function endGame(io, roomId, game, winner) {
  console.log('endGame - winner:', winner?.nickname);
  
  game.players.forEach(p => clearPlayerActionTimer(p));
  
  game.status = 'finished';
  
  const winnerData = game.players.map(p => {
    const evaluated = evaluateHand(p.hand, game.communityCards);
    return {
      userId: p.userId,
      username: p.username,
      nickname: p.nickname,
      hand: p.hand,
      evaluated: evaluated,
      isWinner: p.userId === winner.userId
    };
  });
  
  const bestHand = winnerData.find(w => w.isWinner)?.evaluated;
  
  const result = {
    winner: {
      userId: winner.userId,
      username: winner.username,
      nickname: winner.nickname,
      hand: winner.hand,
      handName: bestHand?.name || '获胜',
      bestCards: bestHand?.cards || [],
      winAmount: game.pot
    },
    communityCards: game.communityCards,
    pot: game.pot,
    players: winnerData
  };
  
  console.log('game end, start decision phase');
  
  const roomChoices = new Map();
  playerChoices.set(roomId, roomChoices);
  
  io.in(roomId).emit('game-end', {
    ...result,
    countdown: 10,
    message: 'Choose to continue or leave (chips<1000 cannot continue)'
  });
  
  const decisionTimer = setTimeout(async () => {
    await processGameDecisions(io, roomId, game);
  }, 10000);
  
  gameDecisionTimers.set(roomId, decisionTimer);
}

async function processGameDecisions(io, roomId, game) {
  console.log('processGameDecisions');
  
  const roomChoices = playerChoices.get(roomId);
  if (!roomChoices) return;
  
  // 检查是否只剩人机（没有真人玩家）
  const realPlayers = game.players.filter(p => !p.isBot);
  const botPlayers = game.players.filter(p => p.isBot);
  
  // 如果只剩人机，直接解散房间
  if (realPlayers.length === 0 && botPlayers.length >= 1) {
    console.log(`Room ${roomId} has only bots (${botPlayers.length}), disbanding room`);
    
    io.in(roomId).emit('insufficient-players', {
      message: '所有玩家已离开，房间即将关闭',
      reason: 'only-bots-remain'
    });
    
    activeGames.delete(roomId);
    await db.run('DELETE FROM poker_rooms WHERE id = ?', [roomId]);
    await db.run('DELETE FROM poker_room_players WHERE room_id = ?', [roomId]);
    
    // 清理房间使用的头像记录
    roomUsedAvatars.delete(roomId);
    
    return;
  }
  
  const continuingPlayers = [];
  const leavingPlayers = [];
  
  game.players.forEach(p => {
    const choice = roomChoices.get(p.userId);
    
    // 人机自动继续（如果筹码足够且还有真人玩家）
    if (p.isBot) {
      if (p.chips >= 1000) {
        console.log(`bot ${p.nickname} auto continue with chips ${p.chips}`);
        continuingPlayers.push(p);
      } else {
        console.log(`bot ${p.nickname} chips ${p.chips} < 1000, leave`);
        leavingPlayers.push(p);
      }
      return;
    }
    
    // 明确选择继续且筹码足够
    if (choice === 'continue' && p.chips >= 1000) {
      continuingPlayers.push(p);
    } else if (choice === 'leave') {
      // 明确选择离开 - 从数据库删除该玩家
      console.log(`player ${p.nickname} chose to leave, removing from room`);
      leavingPlayers.push(p);
      // 立即从数据库删除，防止玩家重新进入房间
      db.run('DELETE FROM poker_room_players WHERE room_id = ? AND user_id = ?', [roomId, p.userId]);
    } else if (!choice && p.chips >= 1000) {
      // 未选择但筹码足够，自动继续
      console.log(`player ${p.nickname} did not choose, auto continue with chips ${p.chips}`);
      continuingPlayers.push(p);
    } else {
      // 选择继续但筹码不足，或未选择且筹码不足
      if (choice === 'continue' && p.chips < 1000) {
        console.log(`player ${p.nickname} chose continue but chips ${p.chips} < 1000, auto leave`);
      } else if (!choice && p.chips < 1000) {
        console.log(`player ${p.nickname} did not choose and chips ${p.chips} < 1000, auto leave`);
      }
      leavingPlayers.push(p);
      db.run('DELETE FROM poker_room_players WHERE room_id = ? AND user_id = ?', [roomId, p.userId]);
    }
  });
  
  console.log('continuing:', continuingPlayers.length, 'leaving:', leavingPlayers.length);
  
  // 处理完玩家选择后，再次检查是否只剩人机
  const remainingRealPlayers = continuingPlayers.filter(p => !p.isBot);
  const remainingBotPlayers = continuingPlayers.filter(p => p.isBot);
  
  // 如果继续游戏的玩家中没有真人，只有人机，则解散房间
  if (remainingRealPlayers.length === 0 && remainingBotPlayers.length >= 1) {
    console.log(`Room ${roomId} would only have bots after decisions, disbanding room`);
    
    // 通知所有还在房间的玩家（包括选择继续但被强制解散的）
    io.in(roomId).emit('insufficient-players', {
      message: '所有玩家已离开，房间即将关闭',
      reason: 'only-bots-remain'
    });
    
    activeGames.delete(roomId);
    await db.run('DELETE FROM poker_rooms WHERE id = ?', [roomId]);
    await db.run('DELETE FROM poker_room_players WHERE room_id = ?', [roomId]);
    
    // 清理房间使用的头像记录
    roomUsedAvatars.delete(roomId);
    
    return;
  }
  
  if (continuingPlayers.length < 2) {
    io.in(roomId).emit('insufficient-players', {
      message: 'Not enough players to continue'
    });
    
    activeGames.delete(roomId);
    await db.run('DELETE FROM poker_rooms WHERE id = ?', [roomId]);
    await db.run('DELETE FROM poker_room_players WHERE room_id = ?', [roomId]);
    
    // 清理房间使用的头像记录
    roomUsedAvatars.delete(roomId);
    
    return;
  }
  
  game.players = continuingPlayers;
  playerChoices.delete(roomId);
  gameDecisionTimers.delete(roomId);
  
  io.in(roomId).emit('new-round-countdown', {
    seconds: 3,
    message: 'New round starts in 3 seconds'
  });
  
  setTimeout(() => {
    startNewRound(roomId, game, io);
  }, 3000);
}

async function handleDisconnectTimeout(io, roomId, game, playerIndex) {
  const player = game.players[playerIndex];
  if (!player || !player.disconnected) return;
  
  console.log('player disconnect timeout, remove from game:', player.nickname);
  
  if (player.countdownInterval) {
    clearInterval(player.countdownInterval);
    player.countdownInterval = null;
  }
  
  const removedPlayerName = player.nickname || player.username;
  const removedUserId = player.userId;
  game.players.splice(playerIndex, 1);
  
  await db.run('DELETE FROM poker_room_players WHERE room_id = ? AND user_id = ?', [roomId, removedUserId]);
  
  io.in(roomId).emit('player-removed', {
    userId: removedUserId,
    message: `${removedPlayerName} left the game`
  });
  
  const remainingPlayers = game.players.filter(p => !p.disconnected);
  console.log('remaining online players:', remainingPlayers.length);
  
  if (remainingPlayers.length < 2) {
    console.log('not enough players, game will end');
    
    io.in(roomId).emit('game-ending-soon', {
      reason: 'insufficient players',
      countdown: 3,
      message: 'Not enough players, returning to lobby in 3 seconds'
    });
    
    setTimeout(async () => {
      if (activeGames.has(roomId)) {
        console.log('cleanup room:', roomId);
        
        io.in(roomId).emit('game-force-ended', {
          reason: 'insufficient players',
          message: 'Game ended, not enough players'
        });
        
        activeGames.delete(roomId);
        await db.run('DELETE FROM poker_rooms WHERE id = ?', [roomId]);
        await db.run('DELETE FROM poker_room_players WHERE room_id = ?', [roomId]);
      }
    }, 3000);
    
    return;
  }
  
  const activePlayers = game.getActivePlayers();
  
  if (activePlayers.length <= 1) {
    if (activePlayers.length === 1) {
      endGame(io, roomId, game, activePlayers[0]);
    } else {
      const notFolded = game.getNotFoldedPlayers();
      if (notFolded.length > 0) {
        endGame(io, roomId, game, notFolded[0]);
      }
    }
  } else {
    if (game.currentPlayer > playerIndex) {
      game.currentPlayer--;
    }
    
    const nextPlayer = game.findNextActivePlayer(game.currentPlayer);
    if (nextPlayer >= 0) {
      game.currentPlayer = nextPlayer;
      broadcastGameState(io, roomId, game);
      notifyCurrentPlayer(game, io);
    }
  }
}

function pokerSocket(io) {
  const pokerNamespace = io.of('/poker');
  
  pokerNamespace.on('connection', (socket) => {
    console.log('poker player connected:', socket.id);
    
    socket.on('get-rooms', () => {
      console.log('get-rooms request, current rooms:', activeGames.size);
      const roomList = Array.from(activeGames.values()).map(game => ({
        id: game.roomId,
        name: game.roomName,
        owner: game.ownerName,
        smallBlind: game.smallBlind,
        bigBlind: game.bigBlind,
        maxPlayers: game.maxPlayers,
        playerCount: game.players.length,
        status: game.status
      }));
      console.log('return room list:', roomList);
      socket.emit('rooms-list', roomList);
    });
    
    socket.on('check-active-game', (data) => {
      const { userId } = data;
      const userIdStr = String(userId);
      console.log('check active game for:', userIdStr);
      console.log('current active games:', activeGames.size);
      
      for (const game of activeGames.values()) {
        console.log('check game:', game.roomId, 'status:', game.status);
        console.log('players:', game.players.map(p => ({ id: p.userId, name: p.nickname, disconnected: p.disconnected })));
        
        const playerIndex = game.findPlayerByUserId(userIdStr);
        if (playerIndex >= 0) {
          const player = game.players[playerIndex];
          console.log('found player:', player.nickname, 'status:', game.status, 'disconnected:', player.disconnected);
          if (game.status === 'playing') {
            console.log('found active game:', game.roomId);
            socket.emit('active-game-found', {
              roomId: game.roomId,
              roomName: game.roomName,
              isDisconnected: player.disconnected
            });
            return;
          }
        }
      }
      
      console.log('no active game found');
      socket.emit('active-game-not-found');
    });
    
    socket.on('create-room', async (data) => {
      try {
        const { roomName, smallBlind, bigBlind, maxPlayers, userId: rawUserId } = data;
        const userId = String(rawUserId);
        
        console.log('create-room:', { roomName, smallBlind, bigBlind, maxPlayers, userId });
        
        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
          socket.emit('error', { message: 'User not found' });
          return;
        }
        
        const roomId = uuidv4();
        
        await db.run(
          'INSERT INTO poker_rooms (id, name, owner_id, small_blind, big_blind, max_players, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [roomId, roomName, userId, smallBlind, bigBlind, maxPlayers, 'waiting']
        );
        
        await db.run(
          'INSERT INTO poker_room_players (room_id, user_id, seat_number, is_host) VALUES (?, ?, ?, ?)',
          [roomId, userId, 0, 1]
        );
        
        const game = new PokerGame(roomId, [{
          userId: String(userId),
          username: user.username,
          nickname: user.nickname,
          avatar: user.avatar,
          chips: user.chips,
          seatNumber: 0,
          socketId: socket.id,
          isReady: false
        }], {
          smallBlind,
          bigBlind
        });
        
        game.roomName = roomName;
        game.ownerId = userId;
        game.ownerName = user.nickname || user.username;
        game.maxPlayers = maxPlayers;
        game.status = 'waiting';
        
        activeGames.set(roomId, game);
        
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userId = userId;
        socketMap.set(socket.id, { roomId, userId });
        
        socket.emit('room-created', { roomId, room: game.toJSON() });
        pokerNamespace.emit('rooms-updated');
        console.log('room created:', roomId);
      } catch (error) {
        console.error('create room failed:', error);
        socket.emit('error', { message: 'Create room failed' });
      }
    });
    
    socket.on('join-room', async (data) => {
      try {
        const { roomId, userId: rawUserId } = data;
        const userId = String(rawUserId);
        
        let game = activeGames.get(roomId);
        
        if (!game) {
          const room = await db.get('SELECT * FROM poker_rooms WHERE id = ?', [roomId]);
          if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
          }
          
          const dbPlayers = await db.all('SELECT * FROM poker_room_players WHERE room_id = ?', [roomId]);
          const players = [];
          
          for (const p of dbPlayers) {
            const user = await db.get('SELECT id, username, nickname, avatar, chips FROM users WHERE id = ?', [p.user_id]);
            if (user) {
              players.push({
                userId: String(user.id),
                username: user.username,
                nickname: user.nickname,
                avatar: user.avatar,
                chips: user.chips,
                seatNumber: p.seat_number,
                isReady: false,
                folded: false,
                allIn: false,
                currentBet: 0
              });
            }
          }
          
          game = new PokerGame(roomId, players, {
            smallBlind: room.small_blind,
            bigBlind: room.big_blind
          });
          
          game.roomName = room.name;
          game.ownerId = String(room.owner_id);
          game.ownerName = players.find(p => String(p.userId) === String(room.owner_id))?.nickname || 'Owner';
          game.maxPlayers = room.max_players;
          game.status = room.status;
          
          activeGames.set(roomId, game);
        }
        
        const existingPlayerIndex = game.findPlayerByUserId(userId);
        if (existingPlayerIndex >= 0) {
          const player = game.players[existingPlayerIndex];
          player.socketId = socket.id;
          player.disconnected = false;
          player.disconnectedAt = null;
          
          if (player.disconnectTimer) {
            clearTimeout(player.disconnectTimer);
            player.disconnectTimer = null;
          }
          if (player.countdownInterval) {
            clearInterval(player.countdownInterval);
            player.countdownInterval = null;
          }
          if (player.disconnectBroadcastTimer) {
            clearTimeout(player.disconnectBroadcastTimer);
            player.disconnectBroadcastTimer = null;
          }
          
          socket.join(roomId);
          socket.roomId = roomId;
          socket.userId = userId;
          socketMap.set(socket.id, { roomId, userId });
          
          if (game.status === 'playing') {
            socket.emit('joined-room', { roomId, room: game.toJSON(), player, isReconnected: true });
            socket.emit('game-state', game.toPrivateJSON(userId));
            socket.emit('joined-game', { roomId, isReconnected: true });
            
            if (game.currentPlayer === existingPlayerIndex) {
              const toCall = game.currentBet - player.currentBet;
              socket.emit('your-turn', {
                canFold: true,
                canCheck: toCall === 0,
                canCall: toCall > 0 && player.chips >= toCall,
                canRaise: player.chips > toCall,
                callAmount: toCall,
                minRaise: game.currentBet + game.lastRaise,
                maxRaise: player.chips + player.currentBet
              });
            }
            
            socket.to(roomId).emit('player-reconnected', { 
              userId, 
              playerCount: game.players.length,
              message: `${player.nickname || player.username} reconnected`
            });
          } else {
            socket.emit('joined-room', { roomId, room: game.toJSON(), player, isReconnected: true });
            socket.to(roomId).emit('player-reconnected', { userId, playerCount: game.players.length });
          }
          return;
        }
        
        if (game.players.length >= game.maxPlayers) {
          socket.emit('error', { message: 'Room is full' });
          return;
        }
        
        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
          socket.emit('error', { message: 'User not found' });
          return;
        }
        
        const seatNumber = game.players.length;
        
        const player = {
          userId: String(userId),
          username: user.username,
          nickname: user.nickname,
          avatar: user.avatar || 'default.png',
          chips: user.chips,
          seatNumber: seatNumber,
          socketId: socket.id,
          isReady: false
        };
        
        game.addPlayer(player);
        console.log('player joined room:', player.nickname, 'userId:', userId, 'current players:', game.players.length);
        console.log('room players:', game.players.map(p => ({ id: p.userId, name: p.nickname })));
        
        await db.run(
          'INSERT INTO poker_room_players (room_id, user_id, seat_number, is_host) VALUES (?, ?, ?, ?)',
          [roomId, userId, seatNumber, 0]
        );
        
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userId = userId;
        socketMap.set(socket.id, { roomId, userId });
        
        socket.emit('joined-room', { roomId, room: game.toJSON(), player });
        socket.to(roomId).emit('player-joined', { player, playerCount: game.players.length });
        
        // 发送系统消息
        pokerNamespace.in(roomId).emit('chat-message', {
          nickname: '系统',
          message: `${player.nickname} 加入了房间`,
          isSystem: true,
          timestamp: Date.now()
        });
        
        pokerNamespace.emit('rooms-updated');
        console.log('join-room done, socketMap size:', socketMap.size);
      } catch (error) {
        console.error('join room failed:', error);
        socket.emit('error', { message: 'Join room failed' });
      }
    });
    
    socket.on('leave-room', async (data) => {
      try {
        const { roomId, userId: rawUserId } = data;
        const userId = String(rawUserId);
        const game = activeGames.get(roomId);
        
        if (game) {
          const playerIndex = game.findPlayerByUserId(userId);
          
          if (playerIndex >= 0) {
            const player = game.players[playerIndex];
            
            if (game.status === 'playing') {
              console.log('player left during game, mark as disconnected:', player.nickname);
              
              player.disconnected = true;
              player.disconnectedAt = Date.now();
              player.socketId = null;
              
              if (player.disconnectTimer) {
                clearTimeout(player.disconnectTimer);
                player.disconnectTimer = null;
              }
              if (player.countdownInterval) {
                clearInterval(player.countdownInterval);
                player.countdownInterval = null;
              }
              if (player.disconnectBroadcastTimer) {
                clearTimeout(player.disconnectBroadcastTimer);
                player.disconnectBroadcastTimer = null;
              }
              
              pokerNamespace.in(roomId).emit('player-disconnected', {
                userId,
                message: `${player.nickname || player.username} left game, can reconnect in 60s`
              });
              
              broadcastGameState(pokerNamespace, roomId, game);
              
              player.disconnectTimer = setTimeout(async () => {
                await handleDisconnectTimeout(pokerNamespace, roomId, game, playerIndex);
              }, 60000);
              
              let countdown = 60;
              player.countdownInterval = setInterval(() => {
                countdown--;
                if (player.disconnected) {
                  pokerNamespace.in(roomId).emit('disconnect-countdown', {
                    userId,
                    secondsLeft: countdown
                  });
                }
                if (countdown <= 0) {
                  clearInterval(player.countdownInterval);
                  player.countdownInterval = null;
                }
              }, 1000);
              
            } else {
              console.log('player left room (game not started), remove player:', player.nickname);
              game.players.splice(playerIndex, 1);
              
              // 检查剩余玩家是否都是人机
              const humanPlayers = game.players.filter(p => !p.userId.toString().startsWith('bot_'));
              const onlyBotsLeft = game.players.length > 0 && humanPlayers.length === 0;
              
              if (game.players.length === 0) {
                activeGames.delete(roomId);
                await db.run('DELETE FROM poker_rooms WHERE id = ?', [roomId]);
              } else if (onlyBotsLeft) {
                // 只剩人机，立即解散房间
                console.log('[AutoDisband] 玩家离开，房间只剩人机，立即解散:', roomId);
                
                // 清理房间资源
                roomUsedAvatars.delete(roomId);
                activeGames.delete(roomId);
                
                // 删除数据库记录
                await db.run('DELETE FROM poker_room_players WHERE room_id = ?', [roomId]);
                await db.run('DELETE FROM poker_rooms WHERE id = ?', [roomId]);
                
                // 通知大厅更新房间列表
                pokerNamespace.emit('rooms-updated');
                
              } else if (game.players.length === 1) {
                // 只剩一个人，解散房间
                console.log('only one player left, disbanding room');
                await db.run('DELETE FROM poker_room_players WHERE room_id = ? AND user_id = ?', [roomId, userId]);
                pokerNamespace.in(roomId).emit('insufficient-players', {
                  message: '人数不足，房间已解散'
                });
                setTimeout(async () => {
                  activeGames.delete(roomId);
                  await db.run('DELETE FROM poker_rooms WHERE id = ?', [roomId]);
                  await db.run('DELETE FROM poker_room_players WHERE room_id = ?', [roomId]);
                }, 3000);
              } else {
                await db.run('DELETE FROM poker_room_players WHERE room_id = ? AND user_id = ?', [roomId, userId]);
                socket.to(roomId).emit('player-left', { userId, playerCount: game.players.length });
                
                // 发送系统消息
                pokerNamespace.in(roomId).emit('chat-message', {
                  nickname: '系统',
                  message: `${player.nickname} 离开了房间`,
                  isSystem: true,
                  timestamp: Date.now()
                });
                
                pokerNamespace.emit('rooms-updated');
              }
            }
          }
        }
        
        socket.leave(roomId);
        socketMap.delete(socket.id);
      } catch (error) {
        console.error('leave room failed:', error);
      }
    });
    
    socket.on('player-ready', async (data) => {
      try {
        const { roomId, userId, isReady } = data;
        const game = activeGames.get(roomId);
        
        if (!game) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }
        
        const playerIndex = game.findPlayerByUserId(userId);
        if (playerIndex < 0) {
          socket.emit('error', { message: 'Player not in room' });
          return;
        }
        
        game.players[playerIndex].isReady = isReady;
        
        pokerNamespace.in(roomId).emit('player-ready-update', {
          userId,
          isReady,
          player: game.players[playerIndex]
        });
      } catch (error) {
        console.error('ready failed:', error);
        socket.emit('error', { message: 'Ready failed' });
      }
    });
    
    // 添加人机
    socket.on('add-bot', async (data) => {
      try {
        const { roomId } = data;
        const game = activeGames.get(roomId);
        
        if (!game) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }
        
        // 只有房主可以添加人机
        if (socket.userId !== game.ownerId) {
          socket.emit('error', { message: 'Only owner can add bot' });
          return;
        }
        
        // 检查房间是否已满
        if (game.players.length >= game.maxPlayers) {
          socket.emit('error', { message: 'Room is full' });
          return;
        }
        
        // 检查游戏是否已开始
        if (game.status !== 'waiting') {
          socket.emit('error', { message: 'Game already started' });
          return;
        }
        
        // 创建人机玩家
        const botPlayer = createBotPlayer(game.players.length, roomId);
        game.addPlayer(botPlayer);
        
        console.log('Bot added:', botPlayer.nickname, 'room:', roomId);
        
        // 广播人机加入
        pokerNamespace.in(roomId).emit('bot-joined', { 
          player: botPlayer, 
          playerCount: game.players.length 
        });
        
        // 发送系统消息
        pokerNamespace.in(roomId).emit('chat-message', {
          nickname: '系统',
          message: `${botPlayer.nickname} 加入了房间`,
          isSystem: true,
          timestamp: Date.now()
        });
        
        // 更新房间列表
        pokerNamespace.emit('rooms-updated');
        
        socket.emit('add-bot-success', { player: botPlayer });
      } catch (error) {
        console.error('add bot failed:', error);
        socket.emit('error', { message: 'Add bot failed' });
      }
    });
    
    // 房间聊天
    socket.on('room-chat', (data) => {
      try {
        const { roomId, userId: rawUserId, nickname, message } = data;
        const userId = String(rawUserId);
        const game = activeGames.get(roomId);
        
        if (!game) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }
        
        // 验证玩家在房间内
        const player = game.players.find(p => p.userId === userId);
        if (!player) {
          socket.emit('error', { message: 'Not in room' });
          return;
        }
        
        // 广播聊天消息给房间内所有人
        pokerNamespace.in(roomId).emit('chat-message', {
          userId: userId,
          nickname: nickname,
          message: message,
          isSystem: false,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('room chat failed:', error);
        socket.emit('error', { message: 'Send message failed' });
      }
    });
    
    // 踢出人机
    socket.on('kick-bot', async (data) => {
      try {
        const { roomId, botUserId } = data;
        const game = activeGames.get(roomId);
        
        if (!game) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }
        
        // 只有房主可以踢出人机
        if (socket.userId !== game.ownerId) {
          socket.emit('error', { message: 'Only owner can kick bot' });
          return;
        }
        
        // 检查游戏是否已开始
        if (game.status !== 'waiting') {
          socket.emit('error', { message: 'Game already started' });
          return;
        }
        
        // 查找人机
        const botIndex = game.players.findIndex(p => p.userId === botUserId && p.isBot);
        if (botIndex < 0) {
          socket.emit('error', { message: 'Bot not found' });
          return;
        }
        
        const botPlayer = game.players[botIndex];
        console.log('Kicking bot:', botPlayer.nickname, 'room:', roomId);
        
        // 移除人机
        game.players.splice(botIndex, 1);
        
        // 释放头像
        const usedAvatars = roomUsedAvatars.get(roomId);
        if (usedAvatars) {
          usedAvatars.delete(botPlayer.avatar);
        }
        
        // 重新分配座位号
        game.players.forEach((p, index) => {
          p.seatNumber = index;
        });
        
        // 广播人机被踢出
        pokerNamespace.in(roomId).emit('bot-kicked', { 
          botUserId: botUserId,
          botName: botPlayer.nickname,
          playerCount: game.players.length 
        });
        
        // 发送系统消息
        pokerNamespace.in(roomId).emit('chat-message', {
          nickname: '系统',
          message: `${botPlayer.nickname} 被踢出房间`,
          isSystem: true,
          timestamp: Date.now()
        });
        
        // 更新房间列表
        pokerNamespace.emit('rooms-updated');
        
        socket.emit('kick-bot-success', { botName: botPlayer.nickname });
      } catch (error) {
        console.error('kick bot failed:', error);
        socket.emit('error', { message: 'Kick bot failed' });
      }
    });
    
    socket.on('start-game', async (data) => {
      try {
        const { roomId } = data;
        const game = activeGames.get(roomId);
        
        if (!game) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }
        
        const playerIndex = game.findPlayerByUserId(socket.userId);
        if (playerIndex < 0 || game.players[playerIndex].userId !== game.ownerId) {
          socket.emit('error', { message: 'Only owner can start game' });
          return;
        }
        
        if (game.players.length < 2) {
          socket.emit('error', { message: 'Need at least 2 players' });
          return;
        }
        
        const otherPlayers = game.players.filter(p => p.userId !== game.ownerId);
        const allOthersReady = otherPlayers.length > 0 && otherPlayers.every(p => p.isReady);
        
        if (!allOthersReady) {
          socket.emit('error', { message: 'Some players not ready' });
          return;
        }
        
        // 发送3秒开局倒计时
        pokerNamespace.in(roomId).emit('game-start-countdown', {
          seconds: 3,
          message: '游戏即将开始'
        });
        
        // 3秒后开始游戏
        setTimeout(async () => {
          game.dealer = -1;
          
          const sbPos = (game.dealer + 1) % game.players.length;
          const bbPos = (game.dealer + 2) % game.players.length;
          
          game.players.forEach((p, index) => {
            p.hand = [];
            p.folded = false;
            p.allIn = false;
            p.currentBet = 0;
            p.hasActed = false;
            p.isSB = (index === sbPos);
            p.isBB = (index === bbPos);
            p.isDealer = (index === game.dealer);
          });
          
          game.players[sbPos].chips -= game.smallBlind;
          game.players[sbPos].currentBet = game.smallBlind;
          game.pot += game.smallBlind;
          
          game.players[bbPos].chips -= game.bigBlind;
          game.players[bbPos].currentBet = game.bigBlind;
          game.pot += game.bigBlind;
          game.currentBet = game.bigBlind;
          game.lastRaise = game.bigBlind;
          
          game.players.forEach(p => {
            p.hand = [game.dealCard(), game.dealCard()];
          });
          
          if (game.players.length === 2) {
            game.currentPlayer = sbPos;
          } else {
            game.currentPlayer = (bbPos + 1) % game.players.length;
          }
          
          game.status = 'playing';
          await db.run('UPDATE poker_rooms SET status = ? WHERE id = ?', ['playing', roomId]);
          
          pokerNamespace.in(roomId).emit('game-started', { roomId });
          
          game.players.forEach(p => {
            const playerSocket = pokerNamespace.sockets.get(p.socketId);
            if (playerSocket) {
              playerSocket.emit('game-state', game.toPrivateJSON(p.userId));
            }
          });
          
          pokerNamespace.in(roomId).emit('public-state', game.toJSON());
          
          notifyCurrentPlayer(game, pokerNamespace);
        }, 3000);
      } catch (error) {
        console.error('start game failed:', error);
        socket.emit('error', { message: 'Start game failed' });
      }
    });
    
    socket.on('join-game', async (data) => {
      console.log('========== player join game ==========');
      console.log('join-game data:', data);
      const { roomId, userId: rawUserId } = data;
      const userId = String(rawUserId);
      let game = activeGames.get(roomId);
      
      if (!game) {
        console.log('game not in activeGames, try load from db, roomId:', roomId);
        // Try to load game from database (server may have restarted)
        const room = await db.get('SELECT * FROM poker_rooms WHERE id = ?', [roomId]);
        if (!room) {
          console.log('error: room not found in db, roomId:', roomId);
          socket.emit('error', { message: 'Game not found' });
          return;
        }
        
        const dbPlayers = await db.all('SELECT * FROM poker_room_players WHERE room_id = ?', [roomId]);
        const players = [];
        
        for (const p of dbPlayers) {
          const user = await db.get('SELECT id, username, nickname, avatar, chips FROM users WHERE id = ?', [p.user_id]);
          if (user) {
            players.push({
              userId: String(user.id),
              username: user.username,
              nickname: user.nickname,
              avatar: user.avatar,
              chips: user.chips,
              seatNumber: p.seat_number,
              isReady: false,
              folded: false,
              allIn: false,
              currentBet: 0
            });
          }
        }
        
        game = new PokerGame(roomId, players, {
          smallBlind: room.small_blind,
          bigBlind: room.big_blind
        });
        
        game.roomName = room.name;
        game.ownerId = String(room.owner_id);
        game.ownerName = players.find(p => String(p.userId) === String(room.owner_id))?.nickname || 'Owner';
        game.maxPlayers = room.max_players;
        game.status = room.status;
        
        activeGames.set(roomId, game);
        console.log('game loaded from db, players:', players.length);
      }
      
      console.log('game exists, players:', game.players.length);
      console.log('game status:', game.status);
      
      socket.join(roomId);
      socket.roomId = roomId;
      socket.userId = userId;
      socketMap.set(socket.id, { roomId, userId });
      
      const playerIndex = game.findPlayerByUserId(userId);
      console.log('player index:', playerIndex, 'userId:', userId);
      
      if (playerIndex >= 0) {
        const player = game.players[playerIndex];
        const wasDisconnected = player.disconnected;
        
        player.socketId = socket.id;
        player.disconnected = false;
        player.disconnectedAt = null;
        
        if (player.disconnectBroadcastTimer) {
          clearTimeout(player.disconnectBroadcastTimer);
          player.disconnectBroadcastTimer = null;
        }
        
        console.log('player joined:', player.nickname, 'socketId:', socket.id, 'reconnect:', wasDisconnected);
        
        const privateState = game.toPrivateJSON(userId);
        console.log('send private state:', JSON.stringify(privateState, null, 2));
        socket.emit('game-state', privateState);
        socket.emit('joined-game', { roomId, isReconnected: wasDisconnected });
        
        if (wasDisconnected) {
          socket.to(roomId).emit('player-reconnected', { 
            userId, 
            playerCount: game.players.length,
            message: `${player.nickname || player.username} reconnected`
          });
        }
        
        if (game.status === 'playing' && game.currentPlayer === playerIndex) {
          console.log('is player turn, restart action countdown');
          notifyCurrentPlayer(game, pokerNamespace);
        }
      } else {
        console.log('error: player not found, userId:', userId);
      }
      console.log('========== join game done ==========');
    });
    
    socket.on('player-choice', async (data) => {
      const { roomId, userId: rawUserId, choice } = data;
      const userId = String(rawUserId);
      const game = activeGames.get(roomId);
      
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      
      const player = game.players.find(p => String(p.userId) === userId);
      if (!player) {
        socket.emit('error', { message: 'Player not in game' });
        return;
      }
      
      if (choice === 'continue' && player.chips < 1000) {
        socket.emit('error', { message: 'Chips < 1000, cannot continue' });
        return;
      }
      
      let roomChoices = playerChoices.get(roomId);
      if (!roomChoices) {
        roomChoices = new Map();
        playerChoices.set(roomId, roomChoices);
      }
      
      roomChoices.set(userId, choice);
      
      console.log('current choices:', Array.from(roomChoices.entries()));
      
      const allChosen = game.players.every(p => roomChoices.has(p.userId));
      
      if (allChosen) {
        console.log('all players chose, end decision phase early');
        
        const timer = gameDecisionTimers.get(roomId);
        if (timer) {
          clearTimeout(timer);
          gameDecisionTimers.delete(roomId);
        }
        
        await processGameDecisions(pokerNamespace, roomId, game);
      }
      
      socket.emit('choice-accepted', { choice });
    });
    
    socket.on('player-action', (data) => {
      try {
        const { roomId, userId: rawUserId, action, amount } = data;
        const userId = String(rawUserId);
        const game = activeGames.get(roomId);
        
        if (!game) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }
        
        if (game.status !== 'playing') {
          socket.emit('error', { message: 'Game not in progress' });
          return;
        }
        
        const playerIndex = game.findPlayerByUserId(userId);
        if (playerIndex < 0) {
          socket.emit('error', { message: 'Not a participant' });
          return;
        }
        
        const player = game.players[playerIndex];
        clearPlayerActionTimer(player);
        
        const toCall = game.currentBet - player.currentBet;
        
        switch (action) {
          case 'fold':
            // 验证是否是当前玩家的回合
            if (game.currentPlayer !== playerIndex) {
              socket.emit('error', { message: 'Not your turn' });
              return;
            }
            player.folded = true;
            break;
            
          case 'check':
            if (toCall > 0) {
              socket.emit('error', { message: 'Cannot check, need to call' });
              return;
            }
            break;
            
          case 'call':
            if (toCall === 0) {
              socket.emit('error', { message: 'No need to call' });
              return;
            }
            const callAmount = Math.min(toCall, player.chips);
            player.chips -= callAmount;
            player.currentBet += callAmount;
            game.pot += callAmount;
            if (player.chips === 0) player.allIn = true;
            break;
            
          case 'raise':
            const raiseAmount = amount - player.currentBet;
            if (raiseAmount <= toCall) {
              socket.emit('error', { message: 'Raise amount too small' });
              return;
            }
            if (raiseAmount > player.chips) {
              socket.emit('error', { message: 'Not enough chips' });
              return;
            }
            player.chips -= raiseAmount;
            player.currentBet += raiseAmount;
            game.pot += raiseAmount;
            game.currentBet = player.currentBet;
            game.lastRaise = raiseAmount - toCall;
            if (player.chips === 0) player.allIn = true;
            break;
            
          case 'allin':
            const allInAmount = player.chips;
            player.chips = 0;
            player.currentBet += allInAmount;
            game.pot += allInAmount;
            if (player.currentBet > game.currentBet) {
              game.lastRaise = player.currentBet - game.currentBet;
              game.currentBet = player.currentBet;
            }
            player.allIn = true;
            break;
            
          default:
            socket.emit('error', { message: 'Invalid action' });
            return;
        }
        
        player.hasActed = true;
        
        pokerNamespace.in(roomId).emit('action-broadcast', {
          userId,
          username: player.nickname || player.username,
          action,
          amount: player.currentBet,
          pot: game.pot,
          message: `${player.nickname || player.username} ${action}`
        });
        
        broadcastGameState(pokerNamespace, roomId, game);
        
        // 检查是否只剩一个未弃牌玩家，如果是则直接结束游戏
        const notFoldedPlayers = game.getNotFoldedPlayers();
        if (notFoldedPlayers.length === 1) {
          console.log('Only one player left, end game');
          setTimeout(() => {
            endGame(pokerNamespace, roomId, game, notFoldedPlayers[0]);
          }, 1000);
          return;
        }
        
        if (game.shouldAdvanceRound()) {
          setTimeout(() => {
            advanceRound(pokerNamespace, roomId, game);
          }, 1000);
        } else {
          const nextPlayer = game.findNextActivePlayer(game.currentPlayer);
          if (nextPlayer >= 0) {
            game.currentPlayer = nextPlayer;
            broadcastGameState(pokerNamespace, roomId, game);
            notifyCurrentPlayer(game, pokerNamespace);
          }
        }
      } catch (error) {
        console.error('action failed:', error);
        socket.emit('error', { message: 'Action failed' });
      }
    });
    
    socket.on('disconnect', async () => {
      console.log('player disconnected:', socket.id);
      
      const socketInfo = socketMap.get(socket.id);
      if (!socketInfo) {
        console.log('socket info not found:', socket.id);
        return;
      }
      
      const { roomId, userId } = socketInfo;
      console.log('disconnect info - roomId:', roomId, 'userId:', userId, 'type:', typeof userId);
      
      const game = activeGames.get(roomId);
      
      if (game) {
        console.log('game exists, players:', game.players.map(p => ({ id: p.userId, name: p.nickname })));
        const playerIndex = game.findPlayerByUserId(userId);
        console.log('find player result:', playerIndex);
        
        if (playerIndex >= 0) {
          const player = game.players[playerIndex];
          console.log('set player disconnected:', player.nickname);
          player.disconnected = true;
          player.disconnectedAt = Date.now();
          
          const broadcastDelay = 3000;
          
          player.disconnectBroadcastTimer = setTimeout(() => {
            if (player.disconnected) {
              console.log('broadcast player disconnected:', player.nickname);
              pokerNamespace.in(roomId).emit('player-disconnected', {
                userId,
                message: `${player.nickname || player.username} disconnected, auto fold in 60s`
              });
              broadcastGameState(pokerNamespace, roomId, game);
            }
          }, broadcastDelay);
          
          let countdown = 60;
          player.countdownInterval = setInterval(() => {
            countdown--;
            if (player.disconnected) {
              pokerNamespace.in(roomId).emit('disconnect-countdown', {
                userId,
                secondsLeft: countdown
              });
            }
            
            if (countdown <= 0) {
              clearInterval(player.countdownInterval);
              player.countdownInterval = null;
            }
          }, 1000);
          
          player.disconnectTimer = setTimeout(async () => {
            await handleDisconnectTimeout(pokerNamespace, roomId, game, playerIndex);
          }, 60000);
        }
      }
      
      socketMap.delete(socket.id);
    });
    
    // 邀请好友加入房间
    socket.on('invite-friend', async (data) => {
      try {
        const { roomId, friendId, seatIndex, inviterName } = data;
        
        console.log(`[Invite] ${inviterName} 邀请好友 ${friendId} 加入房间 ${roomId}, 座位 ${seatIndex}`);
        
        const game = activeGames.get(roomId);
        if (!game) {
          socket.emit('invite-result', { success: false, message: '房间不存在' });
          return;
        }
        
        // 检查房间状态
        if (game.status !== 'waiting') {
          socket.emit('invite-result', { success: false, message: '房间已开始游戏，无法邀请' });
          return;
        }
        
        // 检查座位是否已被占用
        const existingPlayer = game.players.find(p => p.seatNumber === seatIndex);
        if (existingPlayer) {
          socket.emit('invite-result', { success: false, message: '该座位已被占用' });
          return;
        }
        
        // 检查好友是否已在房间
        const friendInRoom = game.players.find(p => String(p.userId) === String(friendId));
        if (friendInRoom) {
          socket.emit('invite-result', { success: false, message: '好友已在房间中' });
          return;
        }
        
        // 获取好友信息
        const friend = await db.get('SELECT * FROM users WHERE id = ?', [friendId]);
        if (!friend) {
          socket.emit('invite-result', { success: false, message: '好友不存在' });
          return;
        }
        
        // 向好友发送邀请通知（确保 friendId 是字符串类型以匹配前端监听）
        const targetFriendId = String(friendId);
        console.log(`[Invite] 发送邀请通知到事件: invite-${targetFriendId}`);
        pokerNamespace.emit(`invite-${targetFriendId}`, {
          roomId: roomId,
          roomName: game.roomName,
          inviterName: inviterName,
          seatIndex: seatIndex,
          smallBlind: game.smallBlind,
          bigBlind: game.bigBlind,
          timestamp: Date.now()
        });
        
        socket.emit('invite-result', { 
          success: true, 
          message: `已邀请 ${friend.nickname} 加入房间`
        });
        
      } catch (error) {
        console.error('[Invite] 邀请好友失败:', error);
        socket.emit('invite-result', { success: false, message: '邀请发送失败' });
      }
    });
  });
}

module.exports = pokerSocket;
