/**
 * 函数棋 竞速结算协议黑盒测试
 * ------------------------------------------------------------------
 * 目的：模拟"作弊玩家"向服务端发送消息，动态验证已知漏洞 + 挖边界 bug。
 *       这是《大重构计划.md》方法论「第三层 · 动态验证」的第一块落地。
 *
 * 覆盖的服务端代码：server/index.js
 *   issueNonce / verifySig / handleRaceScore / raceDelta / raceTier
 *
 * 前置（依赖未装时需先安装 + 启动服务端）：
 *   cd server && npm install
 *   node index.js            # 默认 ws://localhost:9000/lobby
 *
 * 运行：
 *   node protocol_test.cjs [wsUrl]
 *   node protocol_test.cjs ws://localhost:9000/lobby
 *
 * 依赖：仅 Node 内置（crypto + 全局 WebSocket，Node >= 21）。
 * 注意：测试用 __TEST 前缀的 playerId，会写入 server/leaderboard.json，
 *       如需清理可手动删除该文件中前缀为 __TEST 的记录。
 * ------------------------------------------------------------------
 */
'use strict';

const WS_URL = process.argv[2] || 'ws://localhost:9000/lobby';

// 前端硬编码的签名密钥（前端要生成合法 sig 就必须携带它 → 等于公开，任何客户端可伪造）
const LB_SECRET = 'fnchess-lb-secret-2026-08-05';

const crypto = require('crypto');
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const hmac = (secret, s) => crypto.createHmac('sha256', secret).update(s, 'utf8').digest('hex');

let pass = 0, fail = 0;
const results = [];
function check(name, cond, detail = '') {
    if (cond) { pass++; results.push(`[PASS] ${name}`); }
    else { fail++; results.push(`[FAIL] ${name}${detail ? '  <- ' + detail : ''}`); }
}

/**
 * 一次性上报：连上 -> 收 challenge nonce -> 发 submit_score(rsc) -> 收 submit_result -> 断开。
 * 返回响应对象；timeout（如去重后静默无响应）时 reject。
 */
function raceOnce({ playerId, roomCode, place, totalPlayers, difficulty, stamina, abandoned = false, timeoutMs = 3000 }) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(WS_URL);
        const timer = setTimeout(() => { try { ws.close(); } catch (e) {} reject(new Error('timeout(无响应)')); }, timeoutMs);
        let nonce = null;
        ws.onopen = () => { /* 等 challenge */ };
        ws.onmessage = (ev) => {
            let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
            if (m.type === 'challenge') {
                nonce = m.nonce;
                const payload = { roomCode, place, totalPlayers, difficulty, stamina, abandoned: !!abandoned };
                const levelsHash = sha256(JSON.stringify(payload));
                const boardType = 'rsc';
                const value = '';
                const sig = hmac(LB_SECRET, `${nonce}|${playerId}|${boardType}|${value}|${levelsHash}`);
                ws.send(JSON.stringify({
                    type: 'submit_score', boardType, playerId, nickname: playerId,
                    nonce, value, sig, payload,
                }));
            } else if (m.type === 'submit_result') {
                clearTimeout(timer);
                try { ws.close(); } catch (e) {}
                resolve(m);
            }
        };
        ws.onerror = () => { clearTimeout(timer); reject(new Error('ws error')); };
    });
}

(async () => {
    const stamp = Date.now().toString(36);
    console.log(`目标: ${WS_URL}\n`);

    // T0：连接握手，收到 challenge 并能完成一次结算
    console.log('=== T0 连接握手 / 签名链路 ===');
    await (async () => {
        const r = await raceOnce({ playerId: `__TEST0_${stamp}`, roomCode: '900001', place: 1, totalPlayers: 2, difficulty: 1, stamina: 1 });
        check('T0 收到 submit_result 且 ok=true', r.type === 'submit_result' && r.ok === true, JSON.stringify(r));
    })().catch((e) => check('T0 连接握手', false, String(e.message)));

    // T1：成绩全自报 —— 伪造"4人房第1名 / 难度7 / 耐力4"，服务端给满额 +68
    console.log('\n=== T1 成绩全自报（伪造 4 人房第 1 名 / 难度7 / 耐力4）===');
    await (async () => {
        const r = await raceOnce({ playerId: `__TEST1_${stamp}`, roomCode: '910001', place: 1, totalPlayers: 4, difficulty: 7, stamina: 4 });
        const expectDelta = 68; // round(30 × 1.0(scale) × 1.5(难度) × 1.5(耐力))
        check('T1 ok=true', r.ok === true, JSON.stringify(r));
        check(`T1 delta=${expectDelta}（服务端真的给了满额分）`, r.delta === expectDelta, `实际 delta=${r.delta}`);
        check('T1 score=68', r.score === 68, `实际 score=${r.score}`);
    })().catch((e) => check('T1 成绩全自报', false, String(e.message)));

    // T2：roomKey 换房绕过去重 —— 同一 playerId 换 roomCode 连刷，无限刷分 + 无限速
    console.log('\n=== T2 roomKey 换房绕过去重（刷分）+ 无 SIGN_GATE 限速 ===');
    await (async () => {
        let last = -1; let allUp = true; let anyRateLimited = false;
        for (let i = 0; i < 5; i++) {
            const r = await raceOnce({ playerId: `__TEST2_${stamp}`, roomCode: `92${1000 + i}`, place: 1, totalPlayers: 4, difficulty: 7, stamina: 4 });
            if (r.code === 'rate_limited') anyRateLimited = true;
            if (r.ok !== true || r.score <= last) allUp = false;
            last = r.score;
        }
        check('T2 换 roomCode 连续 5 次均成功加分（去重被绕过）', allUp, `lastScore=${last}`);
        check('T2 无 SIGN_GATE 限速（未出现 rate_limited）', !anyRateLimited, '出现了 rate_limited');
        check('T2 5 局后分数 >300（已脱离低段保护）', last > 300, `lastScore=${last}`);
    })().catch((e) => check('T2 roomKey 换房刷分', false, String(e.message)));

    // T3：同房去重生效（重复上报静默无响应）
    console.log('\n=== T3 同房去重（重复上报应无响应）===');
    await (async () => {
        await raceOnce({ playerId: `__TEST3_${stamp}`, roomCode: '930001', place: 1, totalPlayers: 2, difficulty: 1, stamina: 1 });
        try {
            await raceOnce({ playerId: `__TEST3_${stamp}`, roomCode: '930001', place: 1, totalPlayers: 2, difficulty: 1, stamina: 1, timeoutMs: 1200 });
            check('T3 同房重复上报被去重（无第二次响应）', false, '第二次居然有响应');
        } catch (e) {
            check('T3 同房重复上报被去重（无第二次响应）', true);
        }
    })().catch((e) => check('T3 同房去重', false, String(e.message)));

    // T4：低段位保护 —— 新号垫底不扣分
    console.log('\n=== T4 低段位保护（score<300 垫底不扣分）===');
    await (async () => {
        const r = await raceOnce({ playerId: `__TEST4_${stamp}`, roomCode: '940001', place: 4, totalPlayers: 4, difficulty: 7, stamina: 4 });
        check('T4 垫底 delta=0 且 score=0（保护生效）', r.ok === true && r.delta === 0 && r.score === 0, JSON.stringify(r));
    })().catch((e) => check('T4 低段位保护', false, String(e.message)));

    // T5：弃权固定扣分（新号扣到 0 无感）
    console.log('\n=== T5 弃权扣分（abandoned=-30，下限 0）===');
    await (async () => {
        const r = await raceOnce({ playerId: `__TEST5_${stamp}`, roomCode: '950001', place: 1, totalPlayers: 2, difficulty: 1, stamina: 1, abandoned: true });
        check('T5 弃权 delta=-30 且 score=0（下限保护）', r.ok === true && r.delta === -30 && r.score === 0, JSON.stringify(r));
    })().catch((e) => check('T5 弃权扣分', false, String(e.message)));

    // T6：刷到最高段位「宇宙」(1600) —— 证明可无上限刷满
    console.log('\n=== T6 刷到最高段位「宇宙」(1600) ===');
    await (async () => {
        let r, score = 0, rounds = 0;
        for (let i = 0; i < 60 && score < 1600; i++, rounds++) {
            r = await raceOnce({ playerId: `__TEST6_${stamp}`, roomCode: `96${1000 + i}`, place: 1, totalPlayers: 4, difficulty: 7, stamina: 4 });
            if (r.ok !== true) break;
            score = r.score;
        }
        check('T6 刷满到「宇宙」段位（无任何上限/频率拦截）', score >= 1600, `最终 score=${score}, 用了 ${rounds} 局, tier=${r && r.tier}`);
    })().catch((e) => check('T6 刷到宇宙', false, String(e.message)));

    console.log(`\n========== 结果：${pass} PASS / ${fail} FAIL ==========`);
    results.forEach((x) => console.log(x));
    if (fail > 0) process.exitCode = 1;
})();
