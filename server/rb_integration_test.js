/* 竞速对战联调测试（临时脚本，测试后删除）
 * 覆盖：多访客房间（Test A）、竞速积分结算与防重复上报（Test B）、断线通知（Test C） */
const WebSocket = require('ws');
const crypto = require('crypto');
const URL = 'ws://127.0.0.1:9000/lobby';
const LB_SECRET = 'fnchess-lb-secret-2026-08-05';

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label); }
}

class Client {
  constructor(name) { this.name = name; this.nonce = null; this.msgs = []; this.waiters = []; }
  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(URL);
      this.ws.on('message', (raw) => {
        let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
        if (m.type === 'challenge') this.nonce = m.nonce; // 挑战消息也进入队列，供 waitFor 使用
        const idx = this.waiters.findIndex((w) => w.pred(m));
        if (idx !== -1) { const w = this.waiters.splice(idx, 1)[0]; clearTimeout(w.t); w.resolve(m); }
        else this.msgs.push(m);
      });
      this.ws.on('open', () => resolve());
      this.ws.on('error', reject);
    });
  }
  send(obj) { this.ws.send(JSON.stringify(obj)); }
  // 重新申请 nonce 并等待它真正变化（挑战消息异步到达，避免旧挑战竞争）
  async refreshChallenge() {
    const old = this.nonce;
    this.send({ type: 'request_challenge' });
    const start = Date.now();
    while (this.nonce === old) {
      if (Date.now() - start > 2000) throw new Error(this.name + ' 刷新 nonce 超时');
      await sleep(30);
    }
    this.msgs = this.msgs.filter((m) => m.type !== 'challenge');
    await sleep(30);
  }
  waitFor(pred, timeout = 3000) {
    const i = this.msgs.findIndex(pred);
    if (i !== -1) return Promise.resolve(this.msgs.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { reject(new Error(this.name + ' 等待消息超时: ' + pred.toString().slice(0, 60))); }, timeout);
      this.waiters.push({ pred, resolve, t });
    });
  }
  close() { try { this.ws.close(); } catch (e) {} }
}

function sign(nonce, playerId, boardType, value, payload) {
  const levelsHash = crypto.createHash('sha256').update(Buffer.from(JSON.stringify(payload), 'utf8')).digest('hex');
  const input = [nonce, playerId, boardType, String(value), levelsHash].join('|');
  return crypto.createHmac('sha256', LB_SECRET).update(Buffer.from(input, 'utf8')).digest('hex');
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log('== Test A: 多访客竞速房 ==');
  const host = new Client('房主'); await host.open();
  const g1 = new Client('访客1'); await g1.open();
  const g2 = new Client('访客2'); await g2.open();
  const g3 = new Client('访客3'); await g3.open();
  const g4 = new Client('访客4'); await g4.open();

  host.send({ type: 'host_register', playerId: 'rbHost01', nickname: '房主A', options: { mode: 'race', maxPlayers: 4 } });
  const reg = await host.waitFor((m) => m.type === 'host_registered');
  const code = reg.code;
  assert(!!code && code.length === 6, '房主登记成功 code=' + code);

  for (const [c, pid, nick] of [['g1','rbG1','访客一'],['g2','rbG2','访客二'],['g3','rbG3','访客三']]) {
    const client = { g1, g2, g3 }[c];
    client.send({ type: 'join_request', code, mode: 'race', playerId: pid, nickname: nick });
    await client.waitFor((m) => m.type === 'join_accepted');
    await host.waitFor((m) => m.type === 'guest_joining' && m.playerId === pid);
  }
  assert(true, '3 位访客全部加入，房主收到 guest_joining');

  g4.send({ type: 'join_request', code, mode: 'race', playerId: 'rbG4', nickname: '访客四' });
  const rej = await g4.waitFor((m) => m.type === 'join_rejected');
  assert(rej.reason === 'room_full', '第 4 位访客因满员被拒 reason=' + rej.reason);

  g1.send({ type: 'list_rooms', mode: 'race' });
  const list1 = await g1.waitFor((m) => m.type === 'rooms_list');
  const myRoom = (list1.rooms || []).find((r) => r.code === code);
  assert(!!myRoom && myRoom.currentPlayers === 4 && myRoom.maxPlayers === 4, '大厅显示 4/4 (current=' + (myRoom && myRoom.currentPlayers) + ' max=' + (myRoom && myRoom.maxPlayers) + ')');

  g3.close();
  const left = await host.waitFor((m) => m.type === 'guest_left' && m.playerId === 'rbG3');
  assert(!!left, '访客三断线，房主收到 guest_left');

  const g3b = new Client('访客三(重连)'); await g3b.open();
  g3b.send({ type: 'join_request', code, mode: 'race', playerId: 'rbG3', nickname: '访客三' });
  await g3b.waitFor((m) => m.type === 'join_accepted');
  await host.waitFor((m) => m.type === 'guest_joining' && m.playerId === 'rbG3');
  assert(true, '访客三重连后重新加入成功');

  const disP = g1.waitFor((m) => m.type === 'room_dissolved');
  host.close();
  const dis = await disP;
  assert(dis.reason === 'host_left', '房主断开，访客收到 room_dissolved reason=' + dis.reason);

  g1.close(); g2.close(); g3b.close(); g4.close();
  await sleep(300);

  console.log('== Test B: 竞速积分结算（rsc） ==');
  // 动态房间码：保证每次运行都是全新结算（不污染落盘数据、不被去重挡住）
  const rbRoomCode = 'RB' + String(Date.now()).slice(-6);
  // 每个提交用独立连接 + 连接时自动下发的挑战（避免同连接多次挑战的 nonce 竞态）
  async function submitRaceScore(playerId, nickname, roomCode, place, totalPlayers) {
    const c = new Client('结算-' + playerId); await c.open();
    await c.waitFor((m) => m.type === 'challenge', 2000);
    const payload = { roomCode, place, totalPlayers, nickname };
    c.send({ type: 'submit_score', boardType: 'rsc', value: 0, nickname, playerId, nonce: c.nonce, sig: sign(c.nonce, playerId, 'rsc', 0, payload), payload });
    return c;
  }

  const c1 = await submitRaceScore('rbP1', '玩家甲', rbRoomCode, 1, 4);
  const r1 = await c1.waitFor((m) => m.type === 'submit_result' && m.boardType === 'rsc');
  assert(r1.ok === true && r1.delta > 0 && r1.tier === '青铜', '第1名加分且段位=青铜 (delta=' + r1.delta + ' score=' + r1.score + ' tier=' + r1.tier + ')');
  c1.close();

  const c2 = await submitRaceScore('rbP1', '玩家甲', rbRoomCode, 1, 4);
  const dup = await c2.waitFor((m) => m.type === 'submit_result' && m.boardType === 'rsc', 1500).catch(() => null);
  assert(dup === null, '重复上报被去重（无第二次结算响应）');
  c2.close();

  const c3 = await submitRaceScore('rbP4', '玩家丁', rbRoomCode, 4, 4);
  const r3 = await c3.waitFor((m) => m.type === 'submit_result' && m.boardType === 'rsc');
  assert(r3.ok === true && r3.delta < 0, '第4名扣分 (delta=' + r3.delta + ')');
  c3.close();

  const cq = new Client('查询'); await cq.open();
  await cq.waitFor((m) => m.type === 'challenge', 2000);
  cq.send({ type: 'query_leaderboard', boardType: 'rsc', playerId: 'rbP1', id: 'q1' });
  const lb = await cq.waitFor((m) => m.type === 'leaderboard_result' && m.boardType === 'rsc');
  const me = (lb.list || []).find((x) => x.nickname === '玩家甲');
  const ding = (lb.list || []).find((x) => x.nickname === '玩家丁');
  assert(me && me.score > 0 && me.tier === '青铜' && lb.myRank > 0, 'rsc 榜单含玩家甲 score=' + (me && me.score) + ' tier=' + (me && me.tier) + ' myRank=' + lb.myRank);
  assert(!!ding && me.score > ding.score, '玩家甲积分高于第4名玩家丁（甲=' + (me && me.score) + ' 丁=' + (ding && ding.score) + '）');
  cq.close();

  console.log(`\n结果: PASS=${pass} FAIL=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('测试异常:', e); process.exit(2); });
