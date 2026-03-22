const { v4: uuidv4 } = require('uuid');
const db = require('../../database/db');

// 牌型定义
const HAND_RANKINGS = {
  HIGH_CARD: 1,
  ONE_PAIR: 2,
  TWO_PAIR: 3,
  THREE_OF_A_KIND: 4,
  STRAIGHT: 5,
  FLUSH: 6,
  FULL_HOUSE: 7,
  FOUR_OF_A_KIND: 8,
  STRAIGHT_FLUSH: 9,
  ROYAL_FLUSH: 10
};

// 创建一副牌
function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck = [];
  
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank, value: ranks.indexOf(rank) + 2 });
    }
  }
  
  // 洗牌
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  return deck;
}

// 评估手牌
function evaluateHand(hand, communityCards) {
  // 防御性检查：确保参数是数组
  if (!Array.isArray(hand)) {
    console.error('evaluateHand: hand is not an array', hand);
    hand = [];
  }
  if (!Array.isArray(communityCards)) {
    console.error('evaluateHand: communityCards is not an array', communityCards);
    communityCards = [];
  }
  const allCards = [...hand, ...communityCards];
  
  // 获取最佳5张牌
  const bestHand = getBestFiveCardHand(allCards);
  
  // 判断牌型
  if (isRoyalFlush(bestHand)) return { rank: HAND_RANKINGS.ROYAL_FLUSH, name: '皇家同花顺', cards: bestHand };
  if (isStraightFlush(bestHand)) return { rank: HAND_RANKINGS.STRAIGHT_FLUSH, name: '同花顺', cards: bestHand };
  if (isFourOfAKind(bestHand)) return { rank: HAND_RANKINGS.FOUR_OF_A_KIND, name: '四条', cards: bestHand };
  if (isFullHouse(bestHand)) return { rank: HAND_RANKINGS.FULL_HOUSE, name: '葫芦', cards: bestHand };
  if (isFlush(bestHand)) return { rank: HAND_RANKINGS.FLUSH, name: '同花', cards: bestHand };
  if (isStraight(bestHand)) return { rank: HAND_RANKINGS.STRAIGHT, name: '顺子', cards: bestHand };
  if (isThreeOfAKind(bestHand)) return { rank: HAND_RANKINGS.THREE_OF_A_KIND, name: '三条', cards: bestHand };
  if (isTwoPair(bestHand)) return { rank: HAND_RANKINGS.TWO_PAIR, name: '两对', cards: bestHand };
  if (isOnePair(bestHand)) return { rank: HAND_RANKINGS.ONE_PAIR, name: '一对', cards: bestHand };
  
  return { rank: HAND_RANKINGS.HIGH_CARD, name: '高牌', cards: bestHand };
}

// 获取最佳5张牌（简化版）
function getBestFiveCardHand(cards) {
  // 防御性检查
  if (!Array.isArray(cards) || cards.length === 0) {
    return [];
  }
  // 按牌值排序（从大到小）
  return cards.sort((a, b) => b.value - a.value).slice(0, 5);
}

// 判断牌型函数
function isRoyalFlush(cards) {
  const straightFlush = isStraightFlush(cards);
  return straightFlush && cards[0].value === 14;
}

function isStraightFlush(cards) {
  return isFlush(cards) && isStraight(cards);
}

function isFourOfAKind(cards) {
  const counts = getValueCounts(cards);
  return Object.values(counts).includes(4);
}

function isFullHouse(cards) {
  const counts = getValueCounts(cards);
  const values = Object.values(counts);
  return values.includes(3) && values.includes(2);
}

function isFlush(cards) {
  const suit = cards[0].suit;
  return cards.every(c => c.suit === suit);
}

function isStraight(cards) {
  const values = cards.map(c => c.value).sort((a, b) => b - a);
  for (let i = 0; i < values.length - 1; i++) {
    if (values[i] - values[i + 1] !== 1) return false;
  }
  return true;
}

function isThreeOfAKind(cards) {
  const counts = getValueCounts(cards);
  return Object.values(counts).includes(3);
}

function isTwoPair(cards) {
  const counts = getValueCounts(cards);
  const pairs = Object.values(counts).filter(c => c === 2);
  return pairs.length === 2;
}

function isOnePair(cards) {
  const counts = getValueCounts(cards);
  return Object.values(counts).includes(2);
}

function getValueCounts(cards) {
  const counts = {};
  cards.forEach(c => {
    counts[c.value] = (counts[c.value] || 0) + 1;
  });
  return counts;
}

// 比较两手牌
function compareHands(hand1, hand2, communityCards) {
  // 防御性检查
  if (!Array.isArray(hand1)) {
    console.error('compareHands: hand1 is not an array', hand1);
    hand1 = [];
  }
  if (!Array.isArray(hand2)) {
    console.error('compareHands: hand2 is not an array', hand2);
    hand2 = [];
  }
  if (!Array.isArray(communityCards)) {
    console.error('compareHands: communityCards is not an array', communityCards);
    communityCards = [];
  }
  const eval1 = evaluateHand(hand1, communityCards);
  const eval2 = evaluateHand(hand2, communityCards);
  
  if (eval1.rank !== eval2.rank) {
    return eval1.rank > eval2.rank ? 1 : -1;
  }
  
  // 相同牌型，比较牌值
  for (let i = 0; i < eval1.cards.length; i++) {
    if (eval1.cards[i].value !== eval2.cards[i].value) {
      return eval1.cards[i].value > eval2.cards[i].value ? 1 : -1;
    }
  }
  
  return 0; // 平局
}

class PokerGame {
  constructor(roomId, players, config) {
    this.roomId = roomId;
    this.players = players.map((p, index) => ({
      userId: String(p.userId || p.user_id),
      username: p.username || p.nickname,
      nickname: p.nickname,
      avatar: p.avatar || 'default.png',
      seatNumber: p.seatNumber || p.seat_number || index,
      hand: [],
      folded: p.folded || false,
      allIn: p.allIn || false,
      currentBet: p.currentBet || 0,
      chips: p.chips || 1000,
      socketId: null,
      disconnected: false,
      disconnectedAt: null,
      disconnectTimer: null,
      countdownInterval: null,
      hasActed: false,
      isReady: p.isReady || false,
      // 操作倒计时相关
      actionTimer: null,
      actionCountdownInterval: null,
      actionCountdown: 60
    }));
    
    this.communityCards = [];
    this.pot = 0;
    this.currentRound = 0; // 0: Pre-flop, 1: Flop, 2: Turn, 3: River, 4: Showdown
    this.currentPlayer = 0;
    this.dealer = 0;
    this.smallBlind = config.smallBlind || 10;
    this.bigBlind = config.bigBlind || 20;
    this.maxPlayers = config.maxPlayers || 9;
    this.currentBet = 0;
    this.lastRaise = this.bigBlind;
    this.roundBets = 0;
    this.deck = createDeck();
    this.status = 'waiting'; // waiting, playing, finished
    
    this.players.sort((a, b) => a.seatNumber - b.seatNumber);
  }
  
  dealCard() {
    return this.deck.pop();
  }
  
  getActivePlayers() {
    return this.players.filter(p => !p.folded && !p.allIn);
  }
  
  getNotFoldedPlayers() {
    return this.players.filter(p => !p.folded);
  }
  
  findPlayerByUserId(userId) {
    return this.players.findIndex(p => String(p.userId) === String(userId));
  }
  
  addPlayer(playerData) {
    const newPlayer = {
      userId: String(playerData.userId || playerData.user_id),
      username: playerData.username || playerData.nickname,
      nickname: playerData.nickname,
      avatar: playerData.avatar || 'default.png',
      seatNumber: playerData.seatNumber !== undefined ? playerData.seatNumber : this.players.length,
      hand: [],
      folded: false,
      allIn: false,
      currentBet: 0,
      chips: playerData.chips || 1000,
      socketId: playerData.socketId || null,
      disconnected: false,
      disconnectedAt: null,
      disconnectTimer: null,
      countdownInterval: null,
      hasActed: false,
      isReady: playerData.isReady || false,
      // 操作倒计时相关
      actionTimer: null,
      actionCountdownInterval: null,
      actionCountdown: 60
    };
    this.players.push(newPlayer);
    this.players.sort((a, b) => a.seatNumber - b.seatNumber);
    return newPlayer;
  }
  
  findNextActivePlayer(startPos) {
    const total = this.players.length;
    let pos = (startPos + 1) % total;
    let loopCount = 0;
    
    while (loopCount < total) {
      const player = this.players[pos];
      if (!player.folded && !player.allIn) {
        return pos;
      }
      pos = (pos + 1) % total;
      loopCount++;
    }
    
    return -1;
  }
  
  findFirstActivePlayer() {
    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i];
      if (!player.folded && !player.allIn) {
        return i;
      }
    }
    return 0;
  }
  
  shouldAdvanceRound() {
    const activePlayers = this.getActivePlayers();
    
    if (activePlayers.length <= 1) return true;
    
    const allBetMatched = activePlayers.every(p => 
      p.currentBet === this.currentBet || p.allIn
    );
    
    const allHaveActed = activePlayers.every(p => p.hasActed);
    
    return allBetMatched && allHaveActed;
  }
  
  toJSON() {
    return {
      roomId: this.roomId,
      roomName: this.roomName,
      ownerId: String(this.ownerId),
      ownerName: this.ownerName,
      players: this.players.map(p => ({
        userId: String(p.userId),
        username: p.username,
        nickname: p.nickname,
        avatar: p.avatar || 'default.png',
        seatNumber: p.seatNumber,
        chips: p.chips,
        currentBet: p.currentBet,
        folded: p.folded,
        allIn: p.allIn,
        disconnected: p.disconnected,
        isReady: p.isReady || false,
        hand: [] // 公开状态不显示手牌
      })),
      communityCards: this.communityCards,
      pot: this.pot,
      currentRound: this.currentRound,
      currentPlayer: this.currentPlayer,
      dealer: this.dealer,
      currentBet: this.currentBet,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      maxPlayers: this.maxPlayers,
      status: this.status
    };
  }
  
  toPrivateJSON(userId) {
    const playerIndex = this.findPlayerByUserId(userId);
    const player = playerIndex >= 0 ? this.players[playerIndex] : null;
    
    // 获取公开状态
    const publicState = this.toJSON();
    
    // 在私有状态中，给当前玩家显示他的手牌
    if (playerIndex >= 0) {
      publicState.players[playerIndex].hand = player.hand || [];
    }
    
    return {
      ...publicState,
      yourSeat: playerIndex,
      yourHand: player ? player.hand : []
    };
  }
  
  // 发三张公共牌（翻牌）
  dealFlop() {
    this.communityCards = [this.dealCard(), this.dealCard(), this.dealCard()];
    return this.communityCards;
  }
  
  // 发一张公共牌（转牌或河牌）
  dealTurnOrRiver() {
    const card = this.dealCard();
    this.communityCards.push(card);
    return card;
  }
  
  // 比牌结算
  showdown() {
    const activePlayers = this.getNotFoldedPlayers();
    
    if (activePlayers.length === 0) return null;
    if (activePlayers.length === 1) return activePlayers[0];
    
    // 评估每个玩家的手牌
    const playerEvals = activePlayers.map(p => ({
      player: p,
      eval: evaluateHand(p.hand, this.communityCards)
    }));
    
    // 按牌型排序（从大到小）
    playerEvals.sort((a, b) => {
      if (b.eval.rank !== a.eval.rank) {
        return b.eval.rank - a.eval.rank;
      }
      // 相同牌型比较牌值
      for (let i = 0; i < a.eval.cards.length; i++) {
        if (b.eval.cards[i].value !== a.eval.cards[i].value) {
          return b.eval.cards[i].value - a.eval.cards[i].value;
        }
      }
      return 0;
    });
    
    return playerEvals[0].player;
  }
}

module.exports = {
  PokerGame,
  evaluateHand,
  compareHands,
  HAND_RANKINGS,
  createDeck
};
