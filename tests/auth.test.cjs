const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const esbuild = require('esbuild');
const express = require('express');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const toolsSource = fs.readFileSync(path.join(root, 'public/tools.js'), 'utf8');
const backupClientSource = fs.readFileSync(path.join(root, 'public/backup.js'), 'utf8');

// Run the actual routes with an in-memory database and mocked upstream service.
// Tests never change data/db.json or contact the order provider.
async function startTestServer(t, upstreamFetch = async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }), options = {}) {
  const data = {
    settings: { hoanNguyen: { token: 'test-upstream-token', email: 'source@example.test', password: 'source-test-password' } },
    users: [
      { id: 'owner', username: 'owner', password: 'owner-test-password', role: 'admin', name: 'Owner' },
      { id: 'seller', username: 'seller', password: 'seller-test-password', role: 'ctv', name: 'Seller', balance: 50000 },
    ],
    sessions: {
      legacyAdmin: { userId: 'owner', createdAt: Date.now() },
      legacyString: 'owner',
    },
    localOrders: [], transactions: [],
  };
  if (options.seed) options.seed(data);
  let writeFailure = false;
  let writeCount = 0;
  const publicDir = path.join(root, 'public');
  const fakeFs = {
    existsSync: filePath => filePath.startsWith(publicDir) ? fs.existsSync(filePath) : !(options.fresh && filePath.endsWith('db.json')),
    mkdirSync() { },
    readFileSync: (filePath, enc) => filePath.startsWith(publicDir) ? fs.readFileSync(filePath, enc) : (options.corrupt ? '{broken json' : JSON.stringify(data)),
    writeFileSync() { if (writeFailure) throw new Error('Disk full'); writeCount += 1; }, renameSync() { }, unlinkSync() { },
  };
  const context = vm.createContext({
    ...await import('../backup-source.js'),
    express: () => {
      const app = express();
      app.listen = () => { }; // Avoid the production listener and startup login.
      return app;
    },
    fs: fakeFs, path, crypto, zlib, esbuild, Date: options.clock || Date,
    fileURLToPath: () => path.join(root, 'server.js'),
    process: { env: options.env || {}, on() { } }, console: { ...console, error() { } }, structuredClone, URL, URLSearchParams, Buffer, AbortSignal,
    fetch: upstreamFetch, WebSocket: options.WebSocket, setTimeout, clearTimeout,
  });
  context.express.json = express.json;
  context.express.static = express.static;
  await vm.runInContext('(async () => {\n' + serverSource.replace(/^import .*;\r?\n/gm, '')
    .replace('import.meta.url', '"file:///test/server.js"')
    + '\nglobalThis.testApp = app; globalThis.testDb = db;\n})()', context);
  const server = http.createServer(context.testApp);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (url, method = 'GET', token = '', body) => {
    const response = await fetch(base + url, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      ...(body && method !== 'GET' ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const login = async (identifier, password) => request('/api/auth/login', 'POST', '', { identifier, password });
  return {
    base, request, login, db: context.testDb, setUpstreamFetch: value => { context.fetch = value; },
    setWriteFailure: value => { writeFailure = value; },
    getWriteCount: () => writeCount,
    mockSearch: handler => { context.searchInGameByWebSocket = handler; },
  };
}

test('backup orders use live quotes, per-service markup, wallet-only dispatch and scoped history', async t => {
  let posts = 0, active = true, currentCost = 4000;
  const source = async (url, opts) => {
    assert.equal(new URL(url).origin, 'https://ptg.qzeen.dev');
    assert.equal(opts.headers.Authorization, 'Bearer mock-key');
    const args = opts.body && JSON.parse(opts.body);
    if (url.endsWith('/services')) return Response.json({ services: { guide: { enabled: active, minMinutes: 10, maxHours: 24, maxBots: 30 }, seeds: { enabled: false } } });
    if (url.endsWith('/quote')) {
      assert.deepEqual(args, { service: 'guide', minutes: 60, bots: 2 });
      return Response.json({ quote: { amount: currentCost } });
    }
    assert.ok(url.endsWith('/orders'));
    assert.deepEqual(args, { service: 'guide', minutes: 60, bots: 2, charName: 'Test Player', payWith: 'wallet' });
    const id = ++posts;
    return Response.json({ paid: true, balance: 99001, job: { id, status: 'queued', amount: currentCost } });
  };
  const s = await startTestServer(t, source, { env: { QZEEN_API_KEY: 'mock-key' } });
  const admin = (await s.login('owner', 'owner-test-password')).body.token;
  const ctv = (await s.login('seller', 'seller-test-password')).body.token;
  const input = { category: 'backup_guide', minutes: 60, bots: 2, charName: 'Test Player' };
  assert.equal((await s.request('/api/backup/services')).status, 401);
  const catalog = await s.request('/api/backup/services', 'GET', ctv);
  assert.equal(catalog.body.services.length, 5);
  assert.equal(catalog.body.services.find(row => row.key === 'seeds').enabled, false);
  const settings = { categoryMarkupModes: { backup_guide: 'percent' }, categoryMarkupPercents: { backup_guide: 25 } };
  assert.equal((await s.request('/api/admin/settings', 'PUT', ctv, settings)).status, 403);
  assert.equal((await s.request('/api/admin/settings', 'PUT', admin, settings)).status, 200);
  const quote = await s.request('/api/backup/quote', 'POST', ctv, input);
  assert.equal(quote.body.sellPrice, 5000);
  assert.equal(quote.body.costPrice, undefined);
  const adminQuote = await s.request('/api/backup/quote', 'POST', admin, input);
  assert.equal(adminQuote.body.sellPrice, 5000);
  assert.equal(adminQuote.body.costPrice, undefined);
  const payload = { ...input, payWith: 'qr', idempotency_key: crypto.randomUUID(), expected_price: 5000 };
  // CTV with 50,000đ in normal wallet but 0đ in Ví Nguồn DP MUST be blocked from placing backup orders
  const noDpRes = await s.request('/api/orders/place', 'POST', ctv, payload);
  assert.equal(noDpRes.status, 400);
  assert.equal(noDpRes.body.code, 'INSUFFICIENT_BALANCE');
  assert.equal(posts, 0);
  assert.equal(s.db.users.find(u => u.id === 'seller').balance, 50000);
  // Admin tops up Ví Nguồn DP separately (20,000đ) without touching normal Ví CTV (50,000đ)
  const dpTopup = await s.request('/api/admin/ctv/seller/balance', 'POST', admin, {
    wallet: 'backup', amount: 20000, note: 'Nạp Ví Nguồn DP test', idempotency_key: crypto.randomUUID(),
  });
  assert.equal(dpTopup.status, 200);
  assert.equal(dpTopup.body.ctv.balance, 50000);
  assert.equal(dpTopup.body.ctv.backupBalance, 20000);
  currentCost = 5000;
  assert.equal((await s.request('/api/orders/place', 'POST', ctv, payload)).body.code, 'PRICE_CHANGED');
  currentCost = 4000;
  const results = await Promise.all([1, 2].map(() => s.request('/api/orders/place', 'POST', ctv, payload)));
  assert.ok(results.some(r => r.body.success));
  assert.equal(posts, 1);
  // Backup order deducts ONLY Ví Nguồn DP (20k -> 15k), leaving normal Ví CTV untouched (50k)
  assert.equal(s.db.users.find(u => u.id === 'seller').balance, 50000);
  assert.equal(s.db.users.find(u => u.id === 'seller').backupBalance, 15000);
  const replay = await s.request('/api/orders/place', 'POST', ctv, payload);
  assert.equal(replay.body.success, true);
  assert.equal(replay.body.userBalance, 50000);
  assert.equal(replay.body.userBackupBalance, 15000);
  const adminOrder = await s.request('/api/orders/place', 'POST', admin, { ...payload, idempotency_key: crypto.randomUUID() });
  assert.equal(adminOrder.status, 200);
  const list = await s.request('/api/backup/orders', 'GET', ctv);
  assert.equal(list.body.orders.length, 1);
  assert.doesNotMatch(JSON.stringify(list.body), /mock-key|costPrice|99001|markupAmount|placedBy/);
  const adminList = await s.request('/api/backup/orders', 'GET', admin);
  assert.equal(adminList.body.orders.length, 2);
  assert.doesNotMatch(JSON.stringify(adminList.body), /mock-key|costPrice|99001|markupAmount/);
  assert.equal(adminList.body.orders[0].sellPrice, 5000);
  assert.ok(adminList.body.orders[0].placedBy?.name);
  assert.doesNotMatch(backupClientSource, /costPrice|Giá nguồn|giá gốc/i);
  const overview = await s.request('/api/admin/overview', 'GET', admin);
  assert.equal(overview.body.stats.totalCost, 8000);
  assert.equal(overview.body.stats.totalRevenue, 10000);
  assert.equal(overview.body.stats.totalProfit, 2000);
  assert.equal((await s.request('/api/backup/orders/' + adminOrder.body.order.id + '/resume', 'POST', ctv, {})).status, 404);
  active = false;
  const refreshedCatalog = await s.request('/api/backup/services?refresh=1', 'GET', admin);
  assert.equal(refreshedCatalog.body.services.find(row => row.key === 'guide').enabled, false);
  assert.equal((await s.request('/api/orders/place', 'POST', ctv, { ...payload, idempotency_key: crypto.randomUUID() })).status, 400);
  assert.equal(posts, 2);
});

test('backup resume survives transient post-resume refresh failure and failed backup orders stay out of running filter', async t => {
  let orderCalls = 0, resumed = false;
  const s = await startTestServer(t, async (url) => {
    if (url.endsWith('/services')) return Response.json({ services: { emptymap: { enabled: true, free: 1 } } });
    if (url.endsWith('/quote')) return Response.json({ quote: { amount: 2000 } });
    if (url.endsWith('/orders')) return Response.json({ paid: true, job: { id: 77, service: 'emptymap', status: 'ready', amount: 2000 } });
    if (url.endsWith('/order/resume')) { resumed = true; return Response.json({ ok: true }); }
    if (url.includes('/order?id=77')) {
      orderCalls++;
      if (orderCalls === 1) return Response.json({ job: { id: 77, service: 'emptymap', status: 'ready', amount: 2000 } });
      throw new Error('transient timeout');
    }
    return Response.json({ data: { data: [] } });
  }, { env: { QZEEN_API_KEY: 'mock-key' } });
  const admin = (await s.login('owner', 'owner-test-password')).body.token;
  const placed = await s.request('/api/orders/place', 'POST', admin, {
    category: 'backup_emptymap', charName: 'Hero', expected_price: 7000, idempotency_key: crypto.randomUUID(),
  });
  assert.equal(placed.status, 200);
  const res = await s.request('/api/backup/orders/' + placed.body.order.id + '/resume', 'POST', admin, {});
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(resumed, true);
  assert.match(res.body.message, /Đã gửi lệnh chạy/);
  const lo = s.db.localOrders.find(o => o.id === placed.body.order.id);
  lo.status = 'failed';
  lo.backupStatus = 'failed';
  lo.isActive = false;
  const running = await s.request('/api/orders?category=all&limit=20&progress=running', 'GET', admin);
  assert.equal(running.body.orders.some(o => o.id === lo.id), false);
  const searched = await s.request('/api/orders?category=all&limit=20&q=' + encodeURIComponent('map trống'), 'GET', admin);
  assert.equal(searched.body.orders.some(o => o.id === lo.id), true);
  const rawBackupJs = await fetch(s.base + '/backup.js');
  assert.equal(rawBackupJs.status, 404);
});

test('admin monitor separates backup wallet from Server Zn wallet with strict isolation and accurate accounting', async t => {
  let mode = 'ok', nextId = 500;
  const s = await startTestServer(t, async (url) => {
    if (url.includes('/api/seller-settlements')) return Response.json({ success: true, data: { weekly_limit: { spent: 35000, limit: 1000000 } } });
    if (url.endsWith('/services')) return Response.json({ services: { emptymap: { enabled: true, free: 3 } } });
    if (url.endsWith('/quote')) return Response.json({ quote: { amount: 25000 } });
    if (url.endsWith('/orders')) {
      if (mode === 'timeout') throw new Error('network timeout');
      return Response.json({ paid: true, job: { id: ++nextId, service: 'emptymap', status: 'ready', amount: 25000 } });
    }
    return Response.json({ success: true, data: [] });
  }, {
    env: { QZEEN_API_KEY: 'mock-key' },
    seed(data) {
      const seller = data.users.find(u => u.id === 'seller');
      seller.balance = 60000;
      seller.backupBalance = 0;
      data.transactions = [
        { id: 'tx_topup', userId: 'seller', userName: 'Seller', wallet: 'main', type: 'admin_topup', amount: 100000, balanceAfter: 100000, note: 'Nạp ví', createdAt: '2026-11-26T01:00:00.000Z' },
        { id: 'tx_zn_order', userId: 'seller', userName: 'Seller', wallet: 'main', type: 'order_debit', amount: -40000, balanceAfter: 60000, note: 'Tạo đơn Buff Tim: 1000 Tim', createdAt: '2026-11-26T02:00:00.000Z' },
      ];
    },
  });
  const admin = (await s.login('owner', 'owner-test-password')).body.token;
  const ctv = (await s.login('seller', 'seller-test-password')).body.token;

  // Reject invalid wallet type on admin balance endpoint
  assert.equal((await s.request('/api/admin/ctv/seller/balance', 'POST', admin, {
    wallet: 'invalid', amount: 10000, idempotency_key: crypto.randomUUID(),
  })).status, 400);

  // Before DP topup: CTV has 60k in Ví CTV, 0đ in Ví Nguồn DP -> blocked from ordering on Nguồn dự phòng
  const blocked = await s.request('/api/orders/place', 'POST', ctv, {
    category: 'backup_emptymap', charName: 'BlockedHero', expected_price: 30000, idempotency_key: crypto.randomUUID(),
  });
  assert.equal(blocked.status, 400);
  assert.equal(blocked.body.code, 'INSUFFICIENT_BALANCE');

  // Admin tops up 80,000đ into Ví Nguồn DP -> Ví CTV totals & adminPayable remain completely unaffected!
  const topupDp = await s.request('/api/admin/ctv/seller/balance', 'POST', admin, {
    wallet: 'backup', amount: 80000, note: 'Nạp Ví Nguồn DP', idempotency_key: crypto.randomUUID(),
  });
  assert.equal(topupDp.status, 200);
  assert.equal(topupDp.body.ctv.balance, 60000);
  assert.equal(topupDp.body.ctv.backupBalance, 80000);

  const afterTopup = (await s.request('/api/admin/monitor', 'GET', admin)).body;
  assert.deepEqual(afterTopup.walletTotals, { totalTopup: 100000, totalSpent: 40000, balance: 60000 });
  assert.equal(afterTopup.adminPayable, 95000);
  assert.equal(afterTopup.backupTopup, 80000);
  assert.equal(afterTopup.backupSpent, 0);
  assert.equal(afterTopup.backupBalance, 80000);

  // CTV places a 30k backup order; Admin also places one (must not affect CTV totals)
  const ctvBackup = await s.request('/api/orders/place', 'POST', ctv, {
    category: 'backup_emptymap', charName: 'CtvHero', expected_price: 30000, idempotency_key: crypto.randomUUID(),
  });
  assert.equal(ctvBackup.status, 200);
  assert.equal(ctvBackup.body.userBalance, 60000);
  assert.equal(ctvBackup.body.userBackupBalance, 50000);
  const adminBackup = await s.request('/api/orders/place', 'POST', admin, {
    category: 'backup_emptymap', charName: 'AdminHero', expected_price: 30000, idempotency_key: crypto.randomUUID(),
  });
  assert.equal(adminBackup.status, 200);

  // After CTV backup order:
  // - Server Zn wallet totals stay 100k / 40k / 60k, adminPayable stays 95k (100% isolated!)
  // - Ví Nguồn DP updates cleanly: backupTopup 80k, backupSpent 30k, backupBalance 50k!
  const after = (await s.request('/api/admin/monitor', 'GET', admin)).body;
  assert.deepEqual(after.walletTotals, { totalTopup: 100000, totalSpent: 40000, balance: 60000 });
  assert.equal(after.adminPayable, 95000);
  assert.equal(after.backupTopup, 80000);
  assert.equal(after.backupSpent, 30000);
  assert.equal(after.backupHeld, 0);
  assert.equal(after.backupBalance, 50000);
  assert.equal(after.ctvs[0].balance, 60000);
  assert.equal(after.ctvs[0].backupBalance, 50000);
  assert.equal(after.ctvs[0].backupTopup, 80000);
  assert.equal(after.ctvs[0].backupSpent, 30000);
  assert.doesNotMatch(JSON.stringify(after), /hoannguyen|hoannguyenplaytogether/i);

  // Per-CTV detail reconciles with 0 unaccounted balance across both wallets
  const detail = (await s.request('/api/admin/monitor/ctv/seller', 'GET', admin)).body;
  assert.equal(detail.summary.totalTopup, 100000);
  assert.equal(detail.summary.totalSpent, 40000);
  assert.equal(detail.summary.balance, 60000);
  assert.equal(detail.summary.backupTopup, 80000);
  assert.equal(detail.summary.backupSpent, 30000);
  assert.equal(detail.summary.backupBalance, 50000);
  assert.equal(detail.summary.unaccountedBalance, 0);

  // CTV settlement summary reports both wallets accurately
  const ctvSettlement = (await s.request('/api/settlements', 'GET', ctv)).body;
  assert.equal(ctvSettlement.summary.totalSpent, 70000);
  assert.equal(ctvSettlement.summary.mainSpent, 40000);
  assert.equal(ctvSettlement.summary.backupSpent, 30000);
  assert.equal(ctvSettlement.summary.currentBalance, 60000);
  assert.equal(ctvSettlement.summary.backupBalance, 50000);

  // Uncertain backup order holds 30k strictly from backupBalance (50k -> 20k), never touching main balance (60k)
  mode = 'timeout';
  const heldRes = await s.request('/api/orders/place', 'POST', ctv, {
    category: 'backup_emptymap', charName: 'HeldHero', expected_price: 30000, idempotency_key: crypto.randomUUID(),
  });
  assert.equal(heldRes.body.code, 'ORDER_REVIEW_REQUIRED');
  const duringHold = (await s.request('/api/admin/monitor', 'GET', admin)).body;
  assert.equal(duringHold.walletTotals.balance, 60000);
  assert.equal(duringHold.backupBalance, 20000);
  assert.equal(duringHold.backupHeld, 30000);
  assert.equal((await s.request('/api/admin/monitor/ctv/seller', 'GET', admin)).body.summary.unaccountedBalance, 0);

  const uncertainIntent = s.db.orderIntents.find(i => i.status === 'uncertain');
  assert.equal((await s.request('/api/admin/intents/' + uncertainIntent.id + '/reconcile', 'POST', admin, {
    confirmed: true, resolution: 'not_created', note: 'Checked backup source, order was not created',
  })).status, 200);
  const afterRelease = (await s.request('/api/admin/monitor', 'GET', admin)).body;
  assert.equal(afterRelease.walletTotals.balance, 60000);
  assert.equal(afterRelease.backupBalance, 50000);
  assert.equal(afterRelease.backupHeld, 0);

  // Refund on cancelled backup order credits strictly back to Ví Nguồn DP (50k -> 60k), leaving Ví CTV at 60k
  const backupOrder = s.db.localOrders.find(o => o.id === ctvBackup.body.order.id);
  backupOrder.status = 'cancelled';
  assert.equal((await s.request('/api/admin/orders/' + backupOrder.id + '/refund', 'POST', admin, {
    amount: 10000, sourceRefund: 10000, confirmed: true, note: 'Hoàn một phần đơn dự phòng', idempotency_key: crypto.randomUUID(),
  })).status, 200);
  const afterRefund = (await s.request('/api/admin/monitor', 'GET', admin)).body;
  assert.equal(afterRefund.walletTotals.totalSpent, 40000);
  assert.equal(afterRefund.walletTotals.balance, 60000);
  assert.equal(afterRefund.backupSpent, 20000);
  assert.equal(afterRefund.backupBalance, 60000);
  assert.equal(afterRefund.adminPayable, 95000);
  assert.equal((await s.request('/api/admin/monitor/ctv/seller', 'GET', admin)).body.summary.unaccountedBalance, 0);

  // Admin creating a new CTV with separate initial balance + backupBalance works cleanly
  const newCtv = await s.request('/api/admin/ctv', 'POST', admin, {
    name: 'Dual CTV', username: 'dualctv', password: 'dual-ctv-password-123', balance: 15000, backupBalance: 25000,
  });
  assert.equal(newCtv.status, 200);
  assert.equal(newCtv.body.ctv.balance, 15000);
  assert.equal(newCtv.body.ctv.backupBalance, 25000);

  // Monitor HTML + Admin CTV HTML render both wallets accurately with 0 upstream leaks
  const client = createClient();
  client.state.user = { id: 'owner', role: 'admin', name: 'Admin' };
  client.state.adminMonitor = afterRefund;
  client.state.adminMonitorCtvId = 'seller';
  client.state.adminMonitorCtvDetail = (await s.request('/api/admin/monitor/ctv/seller', 'GET', admin)).body;
  const html = vm.runInContext('renderAdminMonitorHtml()', client.context);
  assert.match(html, /monitor-wallet-grid is-five/);
  assert.match(html, /monitor-wallet-grid is-four/);
  assert.match(html, /Nguồn dự phòng/);
  assert.match(html, /Ví Nguồn DP/);
  assert.ok(html.includes('80.000đ'));
  assert.ok(html.includes('20.000đ'));
  assert.ok(html.includes('95.000đ'));
  assert.doesNotMatch(html, /hoannguyen/i);
  client.state.adminOverview = (await s.request('/api/admin/overview', 'GET', admin)).body;
  const ctvMgmtHtml = vm.runInContext('renderAdminCtvPageHtml()', client.context);
  assert.match(ctvMgmtHtml, /Nạp \/ Trừ Ví CTV/);
  assert.match(ctvMgmtHtml, /Nạp \/ Trừ Ví Nguồn DP/);
  assert.match(ctvMgmtHtml, /VÍ NGUỒN DP/);
  assert.equal((await s.request('/api/admin/monitor', 'GET', ctv)).status, 403);
});

test('backup source rejection releases once to Ví Nguồn DP, ambiguous creation stays reserved for admin reconciliation', async t => {
  let mode = 'reject', creates = 0;
  const s = await startTestServer(t, async url => {
    if (url.endsWith('/services')) return Response.json({ services: { emptymap: { enabled: true, free: 0 } } });
    if (url.endsWith('/quote')) return Response.json({ quote: { amount: 2000 } });
    if (url.includes('/order?id=')) return Response.json({ job: { id: 42, service: 'emptymap', amount: 2000, paidAt: Date.now(), status: 'running' } });
    creates++;
    if (mode === 'reject') return Response.json({ error: 'insufficient funds' }, { status: 400 });
    throw new Error('network timeout');
  }, { env: { QZEEN_API_KEY: 'mock-key' } });
  const ctv = (await s.login('seller', 'seller-test-password')).body.token;
  const admin = (await s.login('owner', 'owner-test-password')).body.token;
  const seller = s.db.users.find(u => u.id === 'seller');
  const payload = { category: 'backup_emptymap', charName: 'One', expected_price: 7000, idempotency_key: crypto.randomUUID() };
  seller.balance = 50000;
  seller.backupBalance = 6999;
  assert.equal((await s.request('/api/orders/place', 'POST', ctv, payload)).body.code, 'INSUFFICIENT_BALANCE');
  assert.equal(creates, 0);
  seller.backupBalance = 50000;
  for (let i = 0; i < 2; i++) assert.equal((await s.request('/api/orders/place', 'POST', ctv, payload)).status, 400);
  assert.equal(seller.balance, 50000);
  assert.equal(seller.backupBalance, 50000);
  assert.equal(creates, 1);
  mode = 'timeout';
  const newPayload = { ...payload, idempotency_key: crypto.randomUUID() };
  assert.equal((await s.request('/api/orders/place', 'POST', ctv, newPayload)).body.code, 'ORDER_REVIEW_REQUIRED');
  assert.equal((await s.request('/api/orders/place', 'POST', ctv, newPayload)).body.code, 'ORDER_REVIEW_REQUIRED');
  assert.equal(seller.balance, 50000);
  assert.equal(seller.backupBalance, 43000);
  assert.equal(creates, 2);
  const intent = s.db.orderIntents[0];
  const resolve = { confirmed: true, resolution: 'created', remoteOrderId: 42, actualCost: 2000, note: 'Verified source order' };
  assert.equal((await s.request('/api/admin/intents/' + intent.id + '/reconcile', 'POST', admin, resolve)).status, 200);
  assert.equal(seller.balance, 50000);
  assert.equal(seller.backupBalance, 43000);
  assert.equal((await s.request('/api/backup/orders', 'GET', ctv)).body.orders[0].statusText, 'Đang chạy');
  assert.equal((await s.request('/api/admin/intents/' + intent.id + '/reconcile', 'POST', admin, resolve)).status, 409);
});

test('new deployment requires a private admin password and never creates demo CTV accounts', async t => {
  await assert.rejects(startTestServer(t, undefined, { fresh: true }), /ADMIN_PASSWORD/);
  const { db, login, request } = await startTestServer(t, undefined, {
    fresh: true, env: { ADMIN_PASSWORD: 'private-owner-test-password', ADMIN_USERNAME: 'myowner', ADMIN_EMAIL: 'owner@example.test' },
  });
  assert.equal(db.users.length, 1);
  assert.equal(db.users[0].role, 'admin');
  assert.match(db.users[0].password, /^scrypt\$/);
  assert.notEqual(db.users[0].password, 'private-owner-test-password');
  assert.equal((await login('myowner', 'private-owner-test-password')).status, 200);
  assert.equal((await request('/api/health')).status, 200);
  assert.equal(db.settings.hoanNguyen.password, '');
});

test('deployment environment preserves existing admin password and clears an outdated source token', async t => {
  const { db, login } = await startTestServer(t, undefined, {
    env: { ADMIN_PASSWORD: 'different-bootstrap-password', HOANNGUYEN_EMAIL: 'new-source@example.test', HOANNGUYEN_PASSWORD: 'new-source-test-password' },
  });
  assert.equal((await login('owner', 'owner-test-password')).status, 200);
  assert.equal((await login('owner', 'different-bootstrap-password')).status, 401);
  assert.equal(db.settings.hoanNguyen.token, '');
  assert.equal(db.settings.hoanNguyen.email, 'new-source@example.test');
});

test('corrupt existing database stops startup instead of resetting balances and accounts', async t => {
  await assert.rejects(startTestServer(t, undefined, { corrupt: true, env: { ADMIN_PASSWORD: 'private-owner-test-password' } }), /tránh ghi đè dữ liệu/);
});

test('cached token does not imply connectivity and a failed reconnect reports the network cause', async t => {
  const networkFailure = async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'EACCES' } }); };
  const { request, login, setUpstreamFetch } = await startTestServer(t, networkFailure);
  const admin = await login('owner', 'owner-test-password');
  const token = admin.body.token;
  const overview = await request('/api/admin/overview', 'GET', token);
  assert.equal(overview.body.settings.serverZn.connected, false);
  assert.match(overview.body.settings.serverZn.lastError, /bị chặn kết nối mạng/);
  assert.doesNotMatch(JSON.stringify(overview.body), /hoannguyen|hoannguyenplaytogether/i);
  const reconnect = await request('/api/admin/server-zn/reconnect', 'POST', token);
  assert.equal(reconnect.status, 502);
  assert.match(reconnect.body.message, /bị chặn kết nối mạng/);
  const catalog = await request('/api/catalog?refresh=1', 'GET', token);
  assert.equal(catalog.body.success, false);
  assert.equal(catalog.body.catalog, undefined);
  setUpstreamFetch(async url => ({
    ok: true, status: 200,
    json: async () => url.endsWith('/api/auth/login') ? { token: 'fresh-upstream-token' } : { success: true, data: [] },
  }));
  const recovered = await request('/api/admin/server-zn/reconnect', 'POST', token);
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.serverZn.connected, true);
  assert.equal(recovered.body.serverZn.lastError, '');
  assert.doesNotMatch(JSON.stringify(recovered.body), /hoannguyen|hoannguyenplaytogether/i);
});

test('a failed required catalog request cannot be hidden by later successful responses', async t => {
  const { request, login } = await startTestServer(t, async url => {
    if (url.includes('/api/fruit-items')) return { ok: false, status: 503, json: async () => ({ message: 'Catalog unavailable' }) };
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  });
  const admin = await login('owner', 'owner-test-password');
  const catalog = await request('/api/catalog?refresh=1', 'GET', admin.body.token);
  assert.equal(catalog.body.success, false);
  const overview = await request('/api/admin/overview', 'GET', admin.body.token);
  assert.equal(overview.body.settings.serverZn.connected, false);
  assert.equal(overview.body.settings.serverZn.lastError, 'Catalog unavailable');
});

test('only authenticated admins can access every admin operation', async t => {
  const { request, login, db } = await startTestServer(t);
  assert.equal((await request('/api/auth/me')).status, 401);
  for (const token of ['legacyAdmin', 'legacyString', 'forged-token']) {
    assert.equal((await request('/api/auth/me', 'GET', token)).status, 401);
    assert.equal((await request('/api/admin/overview', 'GET', token)).status, 403);
  }
  assert.equal((await login('owner', 'wrong-password')).status, 401);
  const seller = await login('seller', 'seller-test-password');
  assert.equal(seller.status, 200);
  assert.equal(seller.body.user.password, undefined);
  assert.equal((await request('/api/auth/me', 'GET', seller.body.token)).body.user.role, 'ctv');
  const before = JSON.stringify({ users: db.users, settings: db.settings });
  for (const [url, method] of [
    ['/api/admin/overview', 'GET'], ['/api/admin/settings', 'PUT'],
    ['/api/admin/ctv', 'POST'], ['/api/admin/ctv/seller', 'PUT'],
    ['/api/admin/ctv/seller', 'DELETE'], ['/api/admin/ctv/seller/balance', 'POST'],
    ['/api/admin/server-zn/reconnect', 'POST'], ['/api/admin/password', 'PUT'],
    ['/api/admin/app-versions', 'PUT'], ['/api/admin/future-route', 'GET'],
  ]) {
    assert.equal((await request(url, method, seller.body.token, { role: 'admin', balance: 999999 })).status, 403, url);
    assert.equal((await request(url, method)).status, 403, url);
  }
  assert.equal(JSON.stringify({ users: db.users, settings: db.settings }), before);
  const admin = await login('owner', 'owner-test-password');
  const overview = await request('/api/admin/overview', 'GET', admin.body.token);
  assert.equal(overview.status, 200);
  assert.equal(overview.headers.get('cache-control'), 'no-store');
  db.users.find(u => u.id === 'owner').isLocked = true;
  assert.equal((await request('/api/admin/overview', 'GET', admin.body.token)).status, 403);
});

test('changing owner password validates credentials and revokes all owner sessions', async t => {
  const { request, login } = await startTestServer(t);
  const first = await login('owner', 'owner-test-password');
  const second = await login('owner', 'owner-test-password');
  const seller = await login('seller', 'seller-test-password');
  const change = body => request('/api/admin/password', 'PUT', first.body.token, body);
  assert.equal((await change({ currentPassword: 'wrong', newPassword: 'new-owner-password' })).status, 400);
  assert.equal((await change({ currentPassword: 'owner-test-password', newPassword: 'short' })).status, 400);
  assert.equal((await change({ currentPassword: 'owner-test-password', newPassword: 'owner-test-password' })).status, 400);
  assert.equal((await change({ currentPassword: 'owner-test-password', newPassword: 'new-owner-password' })).status, 200);
  for (const session of [first, second]) {
    assert.equal((await request('/api/auth/me', 'GET', session.body.token)).status, 401);
  }
  assert.equal((await request('/api/auth/me', 'GET', seller.body.token)).status, 200);
  assert.equal((await login('owner', 'owner-test-password')).status, 401);
  const fresh = await login('owner', 'new-owner-password');
  assert.equal(fresh.status, 200);
  await request('/api/auth/logout', 'POST', fresh.body.token);
  assert.equal((await request('/api/auth/me', 'GET', fresh.body.token)).status, 401);
});

function createClient(fetchImpl = async () => { throw new Error('Unexpected request'); }, token = '') {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      style: {}, innerHTML: '', textContent: '', value: '',
      classList: { remove() { }, toggle() { } },
    });
    return elements.get(id);
  };
  const storage = new Map(token ? [['znplay_token', token]] : []);
  const context = vm.createContext({
    localStorage: { getItem: () => null, removeItem() { } },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    document: { getElementById: element, querySelectorAll: () => [] },
    fetch: fetchImpl, console: { ...console, error() { } }, setTimeout,
  });
  vm.runInContext(backupClientSource.replace(/^export /gm, '') + '\n' + toolsSource.replace(/^export /m, '') + '\n' + clientSource.replace(/^import .*;\r?\n/gm, '').replace(/bootstrap\(\);\s*$/, '') + '\nglobalThis.testState = state;', context);
  return { context, state: context.testState, element, storage };
}

test('first visit and invalid session show login without automatic admin login', async () => {
  const first = createClient();
  await first.context.initAuth();
  assert.equal(first.state.user, null);
  assert.equal(first.element('authGateScreen').style.display, 'flex');
  assert.equal(first.element('appShell').style.display, 'none');
  const urls = [];
  const expired = createClient(async url => {
    urls.push(url);
    return { status: 401, ok: false, json: async () => ({ message: 'Expired' }) };
  }, 'old-token');
  await expired.context.initAuth();
  assert.deepEqual(urls, ['/api/auth/me']);
  assert.equal(expired.storage.has('znplay_token'), false);
});

test('a temporary connection failure keeps the session for the next page load', async () => {
  const client = createClient(async () => { throw new Error('offline'); }, 'existing-session');
  await client.context.initAuth();
  assert.equal(client.storage.get('znplay_token'), 'existing-session');
  assert.equal(client.state.user, null);
  assert.equal(client.element('appShell').style.display, 'none');
});

test('empty CTV history skips source calls and concurrent admin reads share a partial result', async t => {
  let requests = 0;
  const server = await startTestServer(t, async url => {
    requests++;
    if (url.includes('guestbook-orders')) throw new Error('Temporarily offline');
    return { status: 200, ok: true, json: async () => ({ data: { data: [] } }) };
  });
  const seller = (await server.login('seller', 'seller-test-password')).body.token;
  assert.equal((await server.request('/api/orders', 'GET', seller)).body.partial, false);
  assert.equal(requests, 0);
  const admin = (await server.login('owner', 'owner-test-password')).body.token;
  const reads = await Promise.all([1, 2].map(() => server.request('/api/orders', 'GET', admin)));
  assert.ok(reads.every(r => r.status === 200 && r.body.partial === true));
  assert.equal(requests, 13);
});

test('CTV navigation cannot render admin pages or preserve prior admin data', () => {
  const { context, state, element } = createClient();
  state.user = { role: 'ctv', balance: 100 };
  context.renderOrderCategoryPageHtml = () => 'CTV order page';
  context.bindOrderCategoryPageEvents = () => { };
  for (const view of ['admin_pricing', 'admin_ctv', 'admin_system']) {
    context.switchView(view);
    assert.equal(state.currentView, 'fruit_coin');
    assert.equal(element('mainViewContainer').innerHTML, 'CTV order page');
  }
  state.catalogData = { secret: true };
  state.adminOverview = { secret: true };
  state.orders = [{ costPrice: 100 }];
  element('appModalBody').innerHTML = 'private information';
  context.clearAuthState();
  assert.equal(state.adminOverview, null);
  assert.equal(state.catalogData, null);
  assert.equal(state.orders.length, 0);
  assert.equal(element('mainViewContainer').innerHTML, '');
  assert.equal(element('appModalBody').innerHTML, '');
});

test('late admin responses cannot restore private data after logout', async () => {
  const pending = [];
  const { context, state } = createClient(() => new Promise(resolve => pending.push(resolve)), 'admin-token');
  state.user = { role: 'admin' };
  const loads = [context.loadCatalog(), context.loadOrders(), context.loadAdminOverview()];
  context.clearAuthState();
  for (const resolve of pending) resolve({ status: 200, ok: true, json: async () => ({ success: true, orders: [{ secret: true }], catalog: { secret: true } }) });
  await Promise.all(loads);
  assert.equal(state.catalogData, null);
  assert.equal(state.adminOverview, null);
  assert.equal(state.orders.length, 0);
});

test('public files contain no embedded credentials or quick-login controls', () => {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert.doesNotMatch(clientSource + html, /btnQuickSwitchRole|btnGateQuickAdmin|btnGateQuickCtv/);
  assert.doesNotMatch(clientSource, /loginWithCredentials\(\s*['"]/);
  assert.match(html, /id="appShell" style="display:none;"/);
});

function financeSource(onCreate = async () => ({ success: true, data: { id: 501, total_price: 10000, total_cnt: 100 } })) {
  return async (url, options = {}) => {
    const path = new URL(url).pathname;
    let data = { success: true, data: [] };
    if (path === '/api/auth/login') data = { token: 'test-source-token', user: { id: 10 } };
    else if (path === '/api/customers/resolve-by-role-id') data.data = { id: 101, nickname: 'Test customer', suid: 'test-suid', role_id: 'TEST-1234' };
    else if (path === '/api/settings') data.data = { is_send_task: true, is_send_bufftimorder: true, is_send_fruitorder_coin: true, is_send_fruitorder_fruit: true, is_send_buffsaoorder: true };
    else if (path === '/api/buff-tim-price-packages') data.data = [{ id: 7, is_active: true, quantity: 100, total_price: 10000 }];
    else if (path === '/api/fruit-coin-price-packages') data.data = [{ id: 8, is_active: true, coin_quantity: 1000, total_price: 10000 }];
    else if (path === '/api/fruit-items') data.data = [{ id: 1, is_active: true, base_price: 130, item: { name: 'Test fruit' }, mutation_prices: [{ mutation_key: 1, unit_price: 1000 }] }];
    else if (path === '/api/fruit-stock' && new URL(url).searchParams.has('fruit_item_id')) data.data = { fruit_item_id: 1, combos: [{ mutations: 0, quantity: 20 }] };
    else if (path === '/api/order-pricing/preview-fruit') data.data = { total_price: 1300 };
    else if (path === '/api/buff-tim-orders' && options.method === 'POST') data = await onCreate(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => data };
  };
}

async function prepareBuyer(server) {
  const seller = await server.login('seller', 'seller-test-password');
  assert.equal(seller.status, 200);
  const token = seller.body.token;
  const selected = await server.request('/api/customer/resolve-role-id', 'POST', token, { role_id: 'TEST-1234' });
  assert.equal(selected.status, 200);
  return {
    token, payload: {
      category: 'buff_tim', customer_id: 101, game_profile_id: null,
      price_package_id: 7, expected_price: 15000, idempotency_key: crypto.randomUUID()
    }
  };
}

test('fruit checkout follows live mode switches and the available stock for the selected combo or coin tier', async t => {
  const source = financeSource();
  const settings = { is_send_task: true, is_send_fruitorder: true, is_send_fruitorder_coin: false, is_send_fruitorder_fruit: true };
  const dispatches = [];
  const json = body => ({ ok: true, status: 200, json: async () => body });
  const s = await startTestServer(t, async (url, options) => {
    const { pathname, searchParams } = new URL(url);
    if (pathname === '/api/settings') {
      const keys = searchParams.get('keys').split(',');
      return json({ data: Object.fromEntries(Object.entries(settings).filter(([k]) => keys.includes(k))) });
    }
    if (pathname === '/api/fruit-stock' && !searchParams.has('fruit_item_id')) {
      return json({ data: [], meta: { coin_tiers: [{ min_coin: 400000, is_default: true, quantity: 1000 }, { min_coin: 500000, quantity: 999 }] } });
    }
    if (pathname === '/api/fruit-coin-orders' && options.method === 'POST') {
      const type = JSON.parse(options.body).type;
      dispatches.push(type);
      return json({ success: true, data: { id: 100 + dispatches.length, total_price: type === 'by_fruit' ? 1300 : 10000 } });
    }
    return source(url, options);
  });
  const { token } = await prepareBuyer(s);
  const admin = (await s.login('owner', 'owner-test-password')).body.token;
  const place = (who, body) => s.request('/api/orders/place', 'POST', who, {
    customer_id: 101, idempotency_key: crypto.randomUUID(), ...body,
  });
  const fruit = { category: 'fruit_by_fruit', fruit_item_id: 1, total_cnt: 10, mutation_list: [], expected_price: 1700 };
  const coin = { category: 'fruit_coin', coin_price_package_id: 8, min_coin_filter: 400000, expected_price: 15000 };
  const catalog = async () => (await s.request('/api/catalog?scope=fruit_all&refresh=1', 'GET', admin)).body.systemStatus;
  const st = await catalog();
  assert.equal(st.fruit_coin, false);
  assert.equal(st.fruit_by_fruit, true);
  for (const who of [token, admin]) assert.equal((await place(who, coin)).body.code, 'ORDER_TYPE_DISABLED');
  assert.match((await place(token, { ...fruit, total_cnt: 21 })).body.message, /Kho còn 20/);
  assert.match((await place(token, { ...fruit, mutation_list: [1] })).body.message, /Kho còn 0/);
  assert.equal(s.db.orderIntents.length, 0);
  assert.equal(s.db.transactions.length, 0);
  assert.equal((await place(token, fruit)).status, 200);
  settings.is_send_fruitorder_coin = '1';
  settings.is_send_fruitorder_fruit = '0';
  assert.equal((await place(token, fruit)).body.code, 'ORDER_TYPE_DISABLED');
  assert.match((await place(token, { ...coin, min_coin_filter: 500000 })).body.message, /không đủ/);
  assert.equal((await place(token, coin)).status, 200);
  delete settings.is_send_fruitorder_coin;
  assert.equal((await place(admin, coin)).body.code, 'ORDER_TYPE_DISABLED');
  settings.is_send_fruitorder_coin = settings.is_send_fruitorder_fruit = true;
  settings.is_send_task = false;
  assert.equal((await catalog()).fruit_by_fruit, false);
  assert.equal((await place(token, fruit)).body.code, 'ORDER_TYPE_DISABLED');
  assert.deepEqual(dispatches, ['by_fruit', 'by_coin']);
  assert.equal(s.db.users.find(u => u.id === 'seller').balance, 33300);
});

test('simultaneous purchases reserve funds before source calls and cannot overdraw the wallet', async t => {
  let creates = 0;
  const server = await startTestServer(t, financeSource(async () => {
    creates += 1;
    const id = creates;
    await new Promise(resolve => setTimeout(resolve, 30));
    return { success: true, data: { id, total_price: 10000 } };
  }));
  const { token, payload } = await prepareBuyer(server);
  const responses = await Promise.all(Array.from({ length: 4 }, () => server.request('/api/orders/place', 'POST', token, { ...payload, idempotency_key: crypto.randomUUID() })));
  assert.equal(responses.filter(r => r.body.success).length, 3);
  assert.equal(creates, 3);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 5000);
  assert.equal(server.db.transactions.filter(tx => tx.type === 'order_debit').length, 3);
  assert.equal(server.db.localOrders.length, 3);
  for (const response of responses.filter(r => r.body.success)) {
    assert.equal(response.body.order.costPrice, undefined);
    assert.equal(response.body.order.markupAmount, undefined);
    assert.equal(response.body.order.apiOrderPath, undefined);
  }
});

test('replaying a purchase returns the same order without another debit or source request', async t => {
  let creates = 0;
  const server = await startTestServer(t, financeSource(async () => {
    creates += 1;
    await new Promise(resolve => setTimeout(resolve, 20));
    return { success: true, data: { id: 501, total_price: 10000 } };
  }));
  const { token, payload } = await prepareBuyer(server);
  await Promise.all([server.request('/api/orders/place', 'POST', token, payload), server.request('/api/orders/place', 'POST', token, payload)]);
  const replay = await server.request('/api/orders/place', 'POST', token, payload);
  assert.equal(replay.body.success, true);
  assert.equal(creates, 1);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 35000);
  const changed = await server.request('/api/orders/place', 'POST', token, { ...payload, price_package_id: 99 });
  assert.equal(changed.status, 409);
  assert.equal(creates, 1);
});

test('wrong price, insufficient funds, bad customer and invalid fruit inputs never reach billable API', async t => {
  let creates = 0;
  const server = await startTestServer(t, financeSource(async () => { creates += 1; return { success: true }; }));
  const { token, payload } = await prepareBuyer(server);
  for (const patch of [
    { customer_id: 999 }, { game_profile_id: 999 }, { expected_price: 1 },
    { category: 'constructor' }, { category: 'fruit_by_fruit', fruit_item_id: 1, total_cnt: -2, mutation_list: [] },
    { category: 'fruit_by_fruit', fruit_item_id: 1, total_cnt: 1501, mutation_list: [] },
    { category: 'fruit_by_fruit', fruit_item_id: 1, total_cnt: 10, mutation_list: [1, 1] },
    { category: 'fruit_by_fruit', fruit_item_id: 1, total_cnt: 10, mutation_list: [999] },
  ]) {
    const response = await server.request('/api/orders/place', 'POST', token, { ...payload, ...patch, idempotency_key: crypto.randomUUID() });
    assert.equal(response.body.success, false);
  }
  server.db.users.find(u => u.id === 'seller').balance = 14000;
  assert.equal((await server.request('/api/orders/place', 'POST', token, payload)).body.code, 'INSUFFICIENT_BALANCE');
  assert.equal(creates, 0);
  assert.equal(server.db.orderIntents.length, 0);
});

test('unknown source outcome holds funds and blocks retries until admin reconciliation', async t => {
  let creates = 0;
  const server = await startTestServer(t, financeSource(async () => {
    creates += 1;
    throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } });
  }));
  const { token, payload } = await prepareBuyer(server);
  const response = await server.request('/api/orders/place', 'POST', token, payload);
  assert.equal(response.body.code, 'ORDER_REVIEW_REQUIRED');
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 35000);
  assert.equal(server.db.orderIntents[0].status, 'uncertain');
  await server.request('/api/orders/place', 'POST', token, { ...payload, idempotency_key: crypto.randomUUID() });
  assert.equal(creates, 1);
  const admin = await server.login('owner', 'owner-test-password');
  const path = `/api/admin/intents/${server.db.orderIntents[0].id}/reconcile`;
  const body = { resolution: 'not_created', confirmed: true, note: 'Checked source: no order was created.' };
  assert.equal((await server.request(path, 'POST', token, body)).status, 403);
  assert.equal((await server.request(path, 'POST', admin.body.token, body)).status, 200);
  assert.equal((await server.request(path, 'POST', admin.body.token, body)).status, 409);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 50000);
  assert.equal(server.db.transactions.filter(tx => tx.type === 'order_release').length, 1);
});

test('definitive source rejection and duplicate confirmation release exactly the reserved amount', async t => {
  for (const duplicate of [false, true]) {
    const upstream = financeSource(async () => duplicate
      ? { needs_confirmation: true, code: 'duplicate_customer', data: { existing_orders: [{ private_cost: 999 }], customer: { private_data: true } } }
      : { success: false, message: 'Source rejected the order' });
    const server = await startTestServer(t, upstream);
    const { token, payload } = await prepareBuyer(server);
    const response = await server.request('/api/orders/place', 'POST', token, payload);
    assert.equal(response.body.success, false);
    assert.equal(response.body.existing_orders, undefined);
    assert.equal(response.body.customer, undefined);
    assert.equal(server.db.users.find(u => u.id === 'seller').balance, 50000);
    assert.equal(server.db.transactions.filter(tx => tx.type === 'order_release').length, 1);
  }
});

test('disk failure prevents source dispatch and disables health and subsequent money operations', async t => {
  let creates = 0;
  const server = await startTestServer(t, financeSource(async () => { creates += 1; return { success: true }; }));
  const { token, payload } = await prepareBuyer(server);
  server.setWriteFailure(true);
  const response = await server.request('/api/orders/place', 'POST', token, payload);
  assert.equal(response.status, 503);
  assert.equal((await server.request('/api/health')).status, 503);
  assert.equal((await server.request('/api/orders/place', 'POST', token, payload)).status, 503);
  assert.equal(creates, 0);
});

test('order IDs are scoped by category; CTV cannot delete while Admin delete auto-refunds uncompleted portion and removes order', async t => {
  let deletes = 0;
  let failNextDelete = false;
  const source = financeSource();
  const server = await startTestServer(t, async (url, options) => {
    if (options.method === 'DELETE') {
      if (failNextDelete) return { ok: false, status: 400, json: async () => ({ success: false, message: 'Cannot delete' }) };
      deletes += 1;
    }
    return source(url, options);
  }, {
    seed: data => {
      data.localOrders.push(
        { id: 'my-order', category: 'buff_tim', remoteOrderId: 42, sellPrice: 15000, costPrice: 10000, totalCnt: 100, completedCnt: 0, status: 'pending', placedBy: { id: 'seller', role: 'ctv', name: 'Seller' }, customer: {} },
        { id: 'partial-order', category: 'buff_tim', remoteOrderId: 43, sellPrice: 15000, costPrice: 10000, totalCnt: 100, completedCnt: 40, status: 'assigned', placedBy: { id: 'seller', role: 'ctv', name: 'Seller' }, customer: {} },
        { id: 'done-order', category: 'buff_tim', remoteOrderId: 44, sellPrice: 15000, costPrice: 10000, totalCnt: 100, completedCnt: 100, status: 'completed', placedBy: { id: 'seller', role: 'ctv', name: 'Seller' }, customer: {} },
        { id: 'foreign-order', category: 'buff_sao', remoteOrderId: 42, status: 'pending', placedBy: { id: 'other', role: 'ctv' }, customer: {} }
      );
    }
  });
  const seller = await server.login('seller', 'seller-test-password');
  assert.equal((await server.request('/api/orders/buff_sao/42', 'DELETE', seller.body.token)).status, 403);
  assert.equal((await server.request('/api/orders/buff_sao/42/toggle-active', 'PUT', seller.body.token)).status, 403);
  assert.equal((await server.request('/api/orders/buff_tim/42', 'DELETE', seller.body.token)).status, 403);
  assert.equal(deletes, 0);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 50000);

  const admin = await server.login('owner', 'owner-test-password');
  // Upstream failure must NOT refund or remove order
  failNextDelete = true;
  assert.equal((await server.request('/api/orders/buff_tim/42', 'DELETE', admin.body.token)).status, 400);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 50000);
  assert.equal(server.db.localOrders.length, 4);

  // Admin deletes unstarted CTV order -> refunds 100% (15.000đ) and deletes order from localOrders
  failNextDelete = false;
  const delUnstarted = await server.request('/api/orders/buff_tim/42', 'DELETE', admin.body.token);
  assert.equal(delUnstarted.status, 200);
  assert.equal(delUnstarted.body.refundedAmount, 15000);
  assert.equal(deletes, 1);
  assert.equal(server.db.localOrders.some(o => o.id === 'my-order'), false);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 65000);

  // Admin deletes partially completed CTV order (40/100 done) -> refunds remaining 60% (9.000đ) and removes order
  const delPartial = await server.request('/api/orders/buff_tim/43', 'DELETE', admin.body.token);
  assert.equal(delPartial.status, 200);
  assert.equal(delPartial.body.refundedAmount, 9000);
  assert.equal(server.db.localOrders.some(o => o.id === 'partial-order'), false);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 74000);

  // Admin deletes completed CTV order -> 0đ refund, removes order cleanly
  const delDone = await server.request('/api/orders/buff_tim/44', 'DELETE', admin.body.token);
  assert.equal(delDone.status, 200);
  assert.equal(delDone.body.refundedAmount, 0);
  assert.equal(server.db.localOrders.some(o => o.id === 'done-order'), false);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 74000);
  assert.equal(server.db.localOrders.length, 1);
});

test('manual partial refund uses cumulative source credit and cannot over-refund or repeat', async t => {
  const server = await startTestServer(t, financeSource(), {
    seed: data => {
      data.localOrders.push({ id: 'refund-order', category: 'buff_tim', remoteOrderId: 42, sellPrice: 15000, costPrice: 10000, status: 'cancelled', placedBy: { id: 'seller', role: 'ctv' } });
    }
  });
  const admin = await server.login('owner', 'owner-test-password');
  const payload = { confirmed: true, note: 'Verified cumulative source refund of 4000.', sourceRefund: 4000, amount: 7000, idempotency_key: crypto.randomUUID() };
  const path = '/api/admin/orders/refund-order/refund';
  assert.equal((await server.request(path, 'POST', admin.body.token, payload)).status, 400);
  payload.amount = 6000;
  assert.equal((await server.request(path, 'POST', admin.body.token, payload)).status, 200);
  assert.equal((await server.request(path, 'POST', admin.body.token, payload)).status, 409);
  assert.equal((await server.request(path, 'POST', admin.body.token, { ...payload, idempotency_key: crypto.randomUUID() })).status, 400);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 56000);
});

test('wallet adjustments are bounded, idempotent and protected by admin authorization', async t => {
  const server = await startTestServer(t);
  const admin = await server.login('owner', 'owner-test-password');
  const payload = { amount: 1000, note: 'Test topup', idempotency_key: crypto.randomUUID() };
  const path = '/api/admin/ctv/seller/balance';
  assert.equal((await server.request(path, 'POST', admin.body.token, payload)).status, 200);
  assert.equal((await server.request(path, 'POST', admin.body.token, payload)).status, 409);
  for (const amount of [-100000, 1.5, 1e15, '1000', null]) {
    assert.equal((await server.request(path, 'POST', admin.body.token, { ...payload, amount, idempotency_key: crypto.randomUUID() })).status, 400);
  }
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 51000);
});

test('price tables reject nonfinite and polluted keys, and never sell a package below source cost', async t => {
  const server = await startTestServer(t, financeSource());
  const admin = await server.login('owner', 'owner-test-password');
  for (const body of [{ defaultMarkup: -1 }, { defaultMarkup: 'NaN' }, { fruitUnitPrices: [] }, { categoryMarkups: { constructor: 100 } }, { fruitMutationPrices: { '1:99': 100 } }]) {
    assert.equal((await server.request('/api/admin/settings', 'PUT', admin.body.token, body)).status, 400);
  }
  assert.equal((await server.request('/api/admin/settings', 'PUT', admin.body.token, { packagePriceOverrides: { 'buff_tim:7': 1 } })).status, 200);
  const seller = await server.login('seller', 'seller-test-password');
  const catalog = await server.request('/api/catalog', 'GET', seller.body.token);
  assert.equal(catalog.body.catalog.buff_tim[0].total_price, 10000);
  assert.equal(catalog.body.catalog.buff_tim[0]._admin, undefined);
});

test('locking or resetting a CTV password revokes sessions, including after the account is unlocked', async t => {
  const server = await startTestServer(t);
  const seller = await server.login('seller', 'seller-test-password');
  const admin = await server.login('owner', 'owner-test-password');
  const path = '/api/admin/ctv/seller';
  await server.request(path, 'PUT', admin.body.token, { isLocked: true });
  await server.request(path, 'PUT', admin.body.token, { isLocked: false });
  assert.equal((await server.request('/api/auth/me', 'GET', seller.body.token)).status, 401);
  const fresh = await server.login('seller', 'seller-test-password');
  await server.request(path, 'PUT', admin.body.token, { password: 'new-ctv-test-password' });
  assert.equal((await server.request('/api/auth/me', 'GET', fresh.body.token)).status, 401);
  assert.equal((await server.login('seller', 'seller-test-password')).status, 401);
  assert.equal((await server.login('seller', 'new-ctv-test-password')).status, 200);
  const relogged = await server.login('seller', 'new-ctv-test-password');
  const delRes = await server.request(path, 'DELETE', admin.body.token);
  assert.equal(delRes.status, 200);
  assert.equal(server.db.users.find(u => u.id === 'seller'), undefined);
  assert.equal((await server.request('/api/auth/me', 'GET', relogged.body.token)).status, 401);
  assert.equal((await server.login('seller', 'new-ctv-test-password')).status, 401);
  assert.equal((await server.request(path, 'DELETE', admin.body.token)).status, 404);
});

test('CTV cannot enumerate saved source customers, read stock internals, monitor logs or other orders', async t => {
  const server = await startTestServer(t, financeSource(), {
    seed: data => {
      data.localOrders.push({ id: 'foreign', category: 'buff_tim', remoteOrderId: 10, placedBy: { id: 'someone-else' }, customer: {}, sellPrice: 99999 });
    }
  });
  const seller = await server.login('seller', 'seller-test-password');
  for (const path of ['/api/customer/saved', '/api/customer/saved/101', '/api/catalog/fruit-stock/1', '/api/admin/monitor']) {
    assert.equal((await server.request(path, 'GET', seller.body.token)).status, 403);
  }
  assert.equal((await server.request('/api/orders', 'GET', seller.body.token)).body.orders.length, 0);
  assert.equal((await server.request('/api/settlements', 'GET', seller.body.token)).body.orders.length, 0);
});

test('identity lookup round-trips exact IDs via the game client without an order or wallet debit', async t => {
  const id = '773738358679819896';
  const gameCode = 'H3D5-A6RJ-VUYC';
  const nickname = 'Nhân vật thử';
  let sent = [];
  let mismatch = false;
  class GameSocket {
    constructor() { queueMicrotask(() => this.onopen()); }
    close() { }
    send(raw) {
      const req = JSON.parse(raw);
      sent.push(req);
      const frame = req.type === 'profile_search'
        ? { type: 'profile_search_result', profiles: req.search_nickname === nickname ? [{ Nickname: nickname, suid: id }] : [] }
        : { type: 'request_profile_result', profile: { UserSuid: mismatch ? '123' : id, Profile: { Nickname: nickname, suid: id } } };
      // Exercise upstream clients that send the SUID as a JSON number.
      this.onmessage({ data: JSON.stringify(frame).replaceAll('"' + id + '"', id) });
    }
  }
  const server = await startTestServer(t, undefined, {
    WebSocket: GameSocket, seed(db) {
      db.settings.hoanNguyen.user = { id: 7 };
      db.users[1].balance = 0;
    }
  });
  const url = '/api/tools/identity';
  assert.equal((await server.request(url, 'POST', '', { mode: 'name', query: nickname })).status, 401);
  const { token } = (await server.login('seller', 'seller-test-password')).body;
  const lookup = (mode, query) => server.request(url, 'POST', token, { mode, query });
  for (const [mode, query] of [['name', nickname], ['id', id], ['id', gameCode.toLowerCase()]]) {
    const r = await lookup(mode, query);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.players, [{ nickname, roleId: id, gameCode }]);
  }
  assert.deepEqual(sent.slice(1).map(message => message.suid), [id, id]);
  assert.deepEqual((await lookup('name', 'Absent')).body.players, []);
  const calls = sent.length;
  for (const invalid of ['0000-0000-0000', '0', '18446744073709551616']) {
    assert.equal((await lookup('id', invalid)).status, 400);
  }
  assert.equal(sent.length, calls);
  mismatch = true;
  assert.equal((await lookup('id', id)).status, 502);
  assert.equal(server.db.localOrders.length, 0);
  assert.equal(server.db.transactions.length, 0);
});

test('Render Free permits CTV credit, positive initial balances and purchases without a persistent disk', async t => {
  let creates = 0;
  const server = await startTestServer(t, financeSource(async () => { creates += 1; return { success: true, data: { id: 501, total_price: 10000 } }; }), { env: { RENDER: 'true' } });
  const { token, payload } = await prepareBuyer(server);
  const admin = await server.login('owner', 'owner-test-password');
  const credit = { amount: 1000, idempotency_key: crypto.randomUUID() };
  assert.equal((await server.request('/api/admin/ctv/seller/balance', 'POST', admin.body.token, credit)).status, 200);
  assert.equal((await server.request('/api/admin/ctv/seller/balance', 'POST', admin.body.token, credit)).status, 409);
  const created = await server.request('/api/admin/ctv', 'POST', admin.body.token, { name: 'Free test CTV', username: 'trial', password: 'private-test-ctv-password', balance: 5000 });
  assert.equal(created.status, 200);
  assert.equal(created.body.ctv.balance, 5000);
  assert.equal((await server.request('/api/orders/place', 'POST', token, payload)).status, 200);
  assert.equal(server.db.users.find(user => user.id === 'seller').balance, 36000);
  assert.equal((await server.request('/api/admin/monitor', 'GET', admin.body.token)).body.storageHealthy, true);
  assert.equal(creates, 1);
});

test('monitor records sensitive operations without passwords or tokens, and sessions expire', async t => {
  const server = await startTestServer(t);
  const admin = await server.login('owner', 'owner-test-password');
  const seller = await server.login('seller', 'seller-test-password');
  await server.request('/api/admin/overview', 'GET', seller.body.token);
  await server.request('/api/admin/ctv/seller', 'PUT', admin.body.token, { password: 'private-replacement-password' });
  const monitor = await server.request('/api/admin/monitor', 'GET', admin.body.token);
  assert.ok(monitor.body.events.length >= 3);
  assert.ok(monitor.body.events.some(event => event.details.passwordReset === true));
  assert.doesNotMatch(JSON.stringify(monitor.body.events), /private-replacement-password|owner-test-password|test-upstream-token/);
  server.db.sessions[admin.body.token].createdAt = Date.now() - 13 * 60 * 60 * 1000;
  assert.equal((await server.request('/api/auth/me', 'GET', admin.body.token)).status, 401);
});

test('new tools sidebar, source script policy and monitoring HTML reject injected markup', async t => {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert.match(html, /CÔNG CỤ/);
  assert.match(html, /data-view="identity_tools"/);
  assert.doesNotMatch(html, /data-view="(?:customers|user_search)"/);
  const { context, state } = createClient();
  state.adminMonitor = { storageHealthy: true, financialReady: true, ctvs: [{ name: '<img src=x onerror=alert(1)>', username: '<script>', balance: 0 }], events: [] };
  const rendered = vm.runInContext('renderAdminMonitorHtml()', context);
  assert.doesNotMatch(rendered, /<img|<script/);
  assert.match(rendered, /&lt;img/);
  const server = await startTestServer(t);
  const response = await server.request('/api/health');
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
});

test('same request arriving while catalog is slow is accepted only once', async t => {
  let creates = 0;
  const base = financeSource(async () => {
    creates += 1;
    await new Promise(resolve => setTimeout(resolve, 20));
    return { success: true, data: { id: 501, total_price: 10000 } };
  });
  const server = await startTestServer(t, async (url, options) => {
    if (options.method === 'GET') await new Promise(resolve => setTimeout(resolve, 25));
    return base(url, options);
  });
  const { token, payload } = await prepareBuyer(server);
  await Promise.all([server.request('/api/orders/place', 'POST', token, payload), server.request('/api/orders/place', 'POST', token, payload)]);
  assert.equal(creates, 1);
  assert.equal(server.db.orderIntents.length, 1);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 35000);
});

test('a restart preserves an in-flight hold as uncertain; admin can link a confirmed source order without resending', async t => {
  let creates = 0;
  const intent = {
    id: 'interrupted-intent', requestKey: crypto.randomUUID(), payloadHash: 'test', userId: 'seller', userName: 'Seller',
    status: 'processing', category: 'buff_tim', customerId: 101, customer: { customerId: 101, nickname: 'Test' }, summary: 'Test Tim', heldAmount: 15000, sellPrice: 15000, expectedCost: 10000, createdAt: new Date().toISOString()
  };
  const server = await startTestServer(t, financeSource(async () => { creates += 1; return { success: true }; }), {
    seed: data => {
      data.users.find(u => u.id === 'seller').balance = 35000;
      data.orderIntents = [intent];
      data.transactions.push({ id: intent.id, userId: 'seller', type: 'order_hold', amount: -15000 });
    }
  });
  assert.equal(server.db.orderIntents[0].status, 'uncertain');
  const admin = await server.login('owner', 'owner-test-password');
  const result = await server.request('/api/admin/intents/interrupted-intent/reconcile', 'POST', admin.body.token,
    { resolution: 'created', confirmed: true, remoteOrderId: 777, actualCost: 10000, note: 'Source order 777 was verified before linking.' });
  assert.equal(result.status, 200);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 35000);
  assert.equal(server.db.localOrders[0].remoteOrderId, 777);
  assert.equal(server.db.transactions[0].type, 'order_debit');
  assert.equal(creates, 0);
});

test('unexpected source cost creates a review alert and blocks further purchases until explicit admin acknowledgment', async t => {
  let creates = 0;
  const server = await startTestServer(t, financeSource(async () => {
    creates += 1; return { success: true, data: { id: 500 + creates, total_price: 11000 } };
  }));
  const { token, payload } = await prepareBuyer(server);
  const placed = await server.request('/api/orders/place', 'POST', token, payload);
  assert.equal(placed.body.order.requiresReview, true);
  assert.equal(placed.body.order.costPrice, undefined);
  assert.equal(server.db.localOrders[0].costPrice, 11000);
  const blocked = await server.request('/api/orders/place', 'POST', token, { ...payload, idempotency_key: crypto.randomUUID() });
  assert.equal(blocked.body.code, 'ORDER_REVIEW_REQUIRED');
  assert.equal(creates, 1);
  const admin = await server.login('owner', 'owner-test-password');
  const id = server.db.orderIntents[0].id;
  const acknowledged = await server.request(`/api/admin/intents/${id}/acknowledge`, 'POST', admin.body.token,
    { confirmed: true, note: 'Verified changed source cost, no extra CTV debit.' });
  assert.equal(acknowledged.status, 200);
  assert.equal(server.db.users.find(u => u.id === 'seller').balance, 35000);
});

test('foreign category with the same numeric ID cannot overwrite local customer or completion status', async t => {
  const base = financeSource();
  const server = await startTestServer(t, async (url, options) => {
    if (new URL(url).pathname === '/api/buff-sao-orders') return { ok: true, status: 200, json: async () => ({ data: { data: [{ id: 42, status: 'completed', completed_cnt: 999, customer: { nickname: 'Foreign customer' } }] } }) };
    return base(url, options);
  }, { seed: data => data.localOrders.push({ id: 'owned-tim', category: 'buff_tim', remoteOrderId: 42, status: 'pending', completedCnt: 0, placedBy: { id: 'seller' }, customer: { nickname: 'Own customer' }, sellPrice: 15000 }) });
  const seller = await server.login('seller', 'seller-test-password');
  const response = await server.request('/api/orders', 'GET', seller.body.token);
  assert.equal(response.body.orders[0].customer.nickname, 'Own customer');
  assert.equal(response.body.orders[0].status, 'pending');
  assert.equal(response.body.orders[0].completedCnt, 0);
});

test('settlements expose only CTV-visible order fields, excluding source refund and internal costs', async t => {
  const server = await startTestServer(t, financeSource(), { seed: data => data.localOrders.push({ id: 'mine', placedBy: { id: 'seller' }, customer: {}, sellPrice: 15000, costPrice: 10000, markupAmount: 5000, sourceRefunded: 4000, apiOrderPath: '/private/source', intentId: 'internal' }) });
  const seller = await server.login('seller', 'seller-test-password');
  const response = await server.request('/api/settlements', 'GET', seller.body.token);
  for (const field of ['costPrice', 'markupAmount', 'sourceRefunded', 'apiOrderPath', 'intentId']) assert.equal(response.body.orders[0][field], undefined);
});

test('ping responds immediately, catalog supports compression and invalidates cache on price changes', async t => {
  const server = await startTestServer(t, financeSource());
  const ping = await server.request('/api/ping');
  assert.equal(ping.status, 200);
  assert.equal(ping.body.ok, true);

  const admin = await server.login('owner', 'owner-test-password');
  const cat1 = await server.request('/api/catalog', 'GET', admin.body.token);
  assert.equal(cat1.status, 200);
  assert.equal(cat1.body.catalog.buff_tim[0].total_price, 15000);

  await server.request('/api/admin/settings', 'PUT', admin.body.token, { packagePriceOverrides: { 'buff_tim:7': 19000 } });
  const cat2 = await server.request('/api/catalog', 'GET', admin.body.token);
  assert.equal(cat2.status, 200);
  assert.equal(cat2.body.catalog.buff_tim[0].total_price, 19000);
});

test('admin backup export excludes upstream secrets and backup import restores CTVs safely', async t => {
  const server = await startTestServer(t);
  const admin = await server.login('owner', 'owner-test-password');
  const seller = await server.login('seller', 'seller-test-password');

  assert.equal((await server.request('/api/admin/backup/export', 'GET', seller.body.token)).status, 403);
  assert.equal((await server.request('/api/admin/backup/import', 'POST', seller.body.token, { backup: {} })).status, 403);

  const exported = await server.request('/api/admin/backup/export', 'GET', admin.body.token);
  assert.equal(exported.status, 200);
  assert.equal(exported.body.backup.settings.hoanNguyen.password, '');
  assert.equal(exported.body.backup.settings.hoanNguyen.token, '');
  assert.equal(exported.body.backup.users.length, 2);

  // Reject malformed backup
  assert.equal((await server.request('/api/admin/backup/import', 'POST', admin.body.token, { backup: { users: [] } })).status, 400);

  // Modify backup (add a CTV) and restore while preserving upstream credentials
  const modified = structuredClone(exported.body.backup);
  modified.users.push({ id: 'ctv_restored', username: 'restored01', email: 'restored01@znplay.vn', password: 'restored-ctv-password-123', name: 'Restored CTV', phone: '', role: 'ctv', balance: 75000, isLocked: false, createdAt: new Date().toISOString() });
  const imported = await server.request('/api/admin/backup/import', 'POST', admin.body.token, { backup: modified });
  assert.equal(imported.status, 200);
  assert.equal(server.db.users.find(u => u.username === 'restored01')?.balance, 75000);
  assert.equal(server.db.settings.hoanNguyen.password, 'source-test-password');
  assert.equal(server.db.settings.hoanNguyen.token, 'test-upstream-token');
  assert.equal((await server.login('restored01', 'restored-ctv-password-123')).status, 200);
});

test('weather_buff status follows is_send_task when source has no separate weather toggle, and exhausted sales fall back to regular price', async t => {
  const base = financeSource();
  const server = await startTestServer(t, async (url, options) => {
    const p = new URL(url).pathname;
    if (p === '/api/settings') {
      return { ok: true, status: 200, json: async () => ({ data: { is_send_task: true, is_send_fruitorder_coin: true, is_send_fruitorder_fruit: true, is_send_farmgiftorder: false, is_send_bufftimorder: true } }) };
    }
    if (p === '/api/buff-tim-price-packages') {
      return {
        ok: true, status: 200,
        json: async () => ({
          data: [
            { id: 7, is_active: true, quantity: 1000, total_price: 10000, original_price: 10000, effective_price: 6000, is_on_sale: true, sale: { id: 1, sale_price: 6000, slots_total: 10, slots_used: 10, slots_remaining: 0, status: 'active' } },
            { id: 8, is_active: true, quantity: 5000, total_price: 30000, original_price: 30000, effective_price: 20000, is_on_sale: true, sale: { id: 2, sale_price: 20000, slots_total: 10, slots_used: 3, slots_remaining: 7, status: 'active' } },
          ],
        }),
      };
    }
    return base(url, options);
  });
  const seller = await server.login('seller', 'seller-test-password');
  const cat = await server.request('/api/catalog?refresh=1', 'GET', seller.body.token);
  assert.equal(cat.status, 200);
  assert.equal(cat.body.systemStatus.weather_buff, true);
  assert.equal(cat.body.systemStatus.farm_gift, false);
  assert.equal(cat.body.systemStatus.fruit_coin, true);
  // Package 7 has 0 remaining sale slots -> must use regular price (10000 + 5000 = 15000), not sale price
  assert.equal(cat.body.catalog.buff_tim[0].is_on_sale, false);
  assert.equal(cat.body.catalog.buff_tim[0].total_price, 15000);
  // Package 8 has 7 remaining sale slots -> must use sale price (20000 + 5000 = 25000)
  assert.equal(cat.body.catalog.buff_tim[1].is_on_sale, true);
  assert.equal(cat.body.catalog.buff_tim[1].total_price, 25000);
});

test('per-category percentage and manual pricing modes work across packages, fruits, mutations, and reset overrides', async t => {
  const server = await startTestServer(t, financeSource());
  const admin = await server.login('owner', 'owner-test-password');
  const seller = await server.login('seller', 'seller-test-password');

  // Reject invalid mode or out-of-range percent
  assert.equal((await server.request('/api/admin/settings', 'PUT', admin.body.token, { categoryMarkupModes: { buff_tim: 'invalid' } })).status, 400);
  assert.equal((await server.request('/api/admin/settings', 'PUT', admin.body.token, { categoryMarkupPercents: { buff_tim: 999 } })).status, 400);
  assert.equal((await server.request('/api/admin/settings', 'PUT', admin.body.token, { categoryMarkupPercents: { constructor: 10 } })).status, 400);

  // Switch buff_tim to +20% (base cost 10000 -> 12000) and fruit_by_fruit to +50% (base 130 -> 195, mut1 1000 -> 1500)
  const updated = await server.request('/api/admin/settings', 'PUT', admin.body.token, {
    categoryMarkupModes: { buff_tim: 'percent', fruit_by_fruit: 'percent', weather_buff: 'percent' },
    categoryMarkupPercents: { buff_tim: 20, fruit_by_fruit: 50, weather_buff: 15 },
  });
  assert.equal(updated.status, 200);

  const catPct = await server.request('/api/catalog', 'GET', seller.body.token);
  assert.equal(catPct.body.catalog.buff_tim[0].total_price, 12000);
  assert.equal(catPct.body.catalog.fruit_by_fruit[0].unit_price, 195);
  assert.equal(catPct.body.catalog.fruit_by_fruit[0].mutation_prices[0].unit_price, 1500);

  // Manual package override beats category percentage, then resetCategoryOverrides brings it back to +20%
  await server.request('/api/admin/settings', 'PUT', admin.body.token, { packagePriceOverrides: { 'buff_tim:7': 14500 } });
  const catOvr = await server.request('/api/catalog', 'GET', seller.body.token);
  assert.equal(catOvr.body.catalog.buff_tim[0].total_price, 14500);

  await server.request('/api/admin/settings', 'PUT', admin.body.token, { resetCategoryOverrides: ['buff_tim'] });
  const catReset = await server.request('/api/catalog', 'GET', seller.body.token);
  assert.equal(catReset.body.catalog.buff_tim[0].total_price, 12000);

  // Switch back to fixed +3000đ on buff_tim -> 13000đ, and pricingVersion increments
  const beforeVer = catReset.body.pricingVersion;
  await server.request('/api/admin/settings', 'PUT', admin.body.token, {
    categoryMarkupModes: { buff_tim: 'fixed' },
    categoryMarkups: { buff_tim: 3000 },
  });
  const catFixed = await server.request('/api/catalog', 'GET', seller.body.token);
  assert.equal(catFixed.body.catalog.buff_tim[0].total_price, 13000);
  assert.ok(catFixed.body.pricingVersion > beforeVer);
});

test('per-package custom markup overrides on buff_tim, buff_sao, and fruit_coin survive general category updates and apply accurately on checkout', async t => {
  let tim500Cost = 2000000;
  let placedCalls = 0;
  const server = await startTestServer(t, async (url, options = {}) => {
    const p = new URL(url).pathname;
    const json = (data) => ({ ok: true, status: 200, json: async () => data });
    if (p === '/api/settings') return json({ data: { is_send_task: true, is_send_bufftimorder: true, is_send_buffsaoorder: true, is_send_fruitorder: true } });
    if (p === '/api/buff-tim-price-packages') {
      return json({
        data: [
          { id: 7, quantity: 1000, is_active: true, total_price: 10000, original_price: 10000 },
          { id: 99, quantity: 500000, is_active: true, total_price: tim500Cost, original_price: tim500Cost },
        ]
      });
    }
    if (p === '/api/buff-sao-price-packages') {
      return json({
        data: [
          { id: 11, quantity: 10000, is_active: true, total_price: 35000, original_price: 35000 },
          { id: 12, quantity: 100000, is_active: true, total_price: 300000, original_price: 300000 },
        ]
      });
    }
    if (p === '/api/fruit-coin-price-packages') {
      return json({
        data: [
          { id: 21, coin_quantity: 10000000, is_active: true, total_price: 7000, original_price: 7000 },
          { id: 22, coin_quantity: 100000000, is_active: true, total_price: 65000, original_price: 65000 },
        ]
      });
    }
    if (p === '/api/fruit-stock') {
      return json({ data: [], meta: { coin_tiers: [{ min_coin: 0, markup_percent: 0, is_default: true }, { min_coin: 50000, markup_percent: 10 }] } });
    }
    if (p === '/api/customers/resolve-by-role-id') return json({ success: true, data: { id: 101, nickname: 'Buyer', suid: '123456', role_id: 'BUY-1234' } });
    if (p === '/api/buff-tim-orders' && options.method === 'POST') {
      placedCalls += 1;
      return json({ success: true, data: { id: 9001, total_price: tim500Cost } });
    }
    return json({ data: [] });
  }, { seed(db) { db.users[1].balance = 5000000; } });

  const admin = await server.login('owner', 'owner-test-password');
  const seller = await server.login('seller', 'seller-test-password');

  // 1. Validation rejects malformed packageMarkupOverrides
  for (const bad of [
    { packageMarkupOverrides: [] },
    { packageMarkupOverrides: { 'constructor:1': { mode: 'fixed', value: 1000 } } },
    { packageMarkupOverrides: { 'buff_tim:0': { mode: 'fixed', value: 1000 } } },
    { packageMarkupOverrides: { 'buff_tim:99': { mode: 'invalid', value: 1000 } } },
    { packageMarkupOverrides: { 'buff_tim:99': { mode: 'fixed', value: -1 } } },
    { packageMarkupOverrides: { 'buff_tim:99': { mode: 'percent', value: 501 } } },
  ]) {
    assert.equal((await server.request('/api/admin/settings', 'PUT', admin.body.token, bad)).status, 400);
  }

  // 2. Set custom per-package markups: 500K Tim (+50.000đ), 100K Sao (+12.5%), 100M Xu (+15.000đ)
  const setCustom = await server.request('/api/admin/settings', 'PUT', admin.body.token, {
    categoryMarkups: { buff_tim: 3500, buff_sao: 3500, fruit_coin: 3500 },
    categoryMarkupModes: { buff_tim: 'fixed', buff_sao: 'fixed', fruit_coin: 'fixed' },
    packageMarkupOverrides: {
      'buff_tim:99': { mode: 'fixed', value: 50000 },
      'buff_sao:12': { mode: 'percent', value: 12.5 },
      'fruit_coin:22': { mode: 'fixed', value: 15000 },
    },
  });
  assert.equal(setCustom.status, 200);

  const cat1 = await server.request('/api/catalog?refresh=1', 'GET', seller.body.token);
  assert.equal(cat1.body.catalog.buff_tim.find(p => p.id === 7).total_price, 13500);
  assert.equal(cat1.body.catalog.buff_tim.find(p => p.id === 99).total_price, 2050000);
  assert.equal(cat1.body.catalog.buff_tim.find(p => p.id === 99)._admin, undefined);
  assert.equal(cat1.body.catalog.buff_sao.find(p => p.id === 11).total_price, 38500);
  assert.equal(cat1.body.catalog.buff_sao.find(p => p.id === 12).total_price, 337500);
  const coin22 = cat1.body.catalog.fruit_coin.find(p => p.id === 22);
  assert.equal(cat1.body.catalog.fruit_coin.find(p => p.id === 21).total_price, 10500);
  assert.equal(coin22.total_price, 80000);
  assert.equal(coin22.prices_by_tier['50000'].total_price, 86500); // 65000 * 1.10 + 15000

  // 3. Update general category rules (fixed & percent) -> updates ALL non-custom packages, preserves custom ones!
  const updCat = await server.request('/api/admin/settings', 'PUT', admin.body.token, {
    categoryMarkups: { buff_tim: 6000, fruit_coin: 5000 },
    categoryMarkupModes: { buff_tim: 'fixed', buff_sao: 'percent', fruit_coin: 'fixed' },
    categoryMarkupPercents: { buff_sao: 20 },
  });
  assert.equal(updCat.status, 200);

  const cat2 = await server.request('/api/catalog', 'GET', seller.body.token);
  assert.equal(cat2.body.catalog.buff_tim.find(p => p.id === 7).total_price, 16000);   // changed by general rule
  assert.equal(cat2.body.catalog.buff_tim.find(p => p.id === 99).total_price, 2050000); // preserved!
  assert.equal(cat2.body.catalog.buff_sao.find(p => p.id === 11).total_price, 42000);   // changed to +20%
  assert.equal(cat2.body.catalog.buff_sao.find(p => p.id === 12).total_price, 337500);  // preserved (+12.5%)!
  assert.equal(cat2.body.catalog.fruit_coin.find(p => p.id === 21).total_price, 12000); // changed to +5000đ
  assert.equal(cat2.body.catalog.fruit_coin.find(p => p.id === 22).total_price, 80000); // preserved (+15000đ)!

  // 4. Source cost changes on 500K Tim -> custom +50.000đ stays intact and checkout charges exact sell price
  tim500Cost = 1900000;
  const cat3 = await server.request('/api/catalog?refresh=1', 'GET', admin.body.token);
  const pkg99Adm = cat3.body.catalog.buff_tim.find(p => p.id === 99);
  assert.equal(pkg99Adm.total_price, 1950000);
  assert.deepEqual(pkg99Adm._admin.custom_override, { type: 'markup', mode: 'fixed', value: 50000 });

  const sel = await server.request('/api/customer/resolve-role-id', 'POST', seller.body.token, { role_id: 'BUY-1234' });
  assert.equal(sel.status, 200);
  const place = await server.request('/api/orders/place', 'POST', seller.body.token, {
    category: 'buff_tim',
    customer_id: 101,
    game_profile_id: null,
    price_package_id: 99,
    expected_price: 1950000,
    idempotency_key: crypto.randomUUID(),
  });
  assert.equal(place.status, 200);
  assert.equal(placedCalls, 1);
  assert.equal(server.db.users[1].balance, 5000000 - 1950000);

  // 5. Removing override on a single package returns ONLY that package to the general category rule
  await server.request('/api/admin/settings', 'PUT', admin.body.token, {
    packageMarkupOverrides: { 'buff_tim:99': null },
    packagePriceOverrides: { 'buff_tim:99': null },
  });
  const cat4 = await server.request('/api/catalog', 'GET', seller.body.token);
  assert.equal(cat4.body.catalog.buff_tim.find(p => p.id === 99).total_price, 1906000); // 1900000 + general 6000
  assert.equal(cat4.body.catalog.buff_sao.find(p => p.id === 12).total_price, 337500);  // still preserved!

  // 6. Client UI Tab 1 shows per-package edit button for fruit_coin/buff_tim/buff_sao and NEVER auto-wipes overrides
  const client = createClient();
  client.state.user = { role: 'admin', name: 'Admin' };
  client.state.adminPricingTab = 'categories';
  client.state.catalogData = cat4.body;
  client.state.adminOverview = (await server.request('/api/admin/overview', 'GET', admin.body.token)).body;
  const html = vm.runInContext('renderAdminPricingPageHtml()', client.context);
  assert.match(html, /data-open-cat-pkgs="fruit_coin"/);
  assert.match(html, /data-open-cat-pkgs="buff_tim"/);
  assert.match(html, /data-open-cat-pkgs="buff_sao"/);
  assert.match(html, /Giữ nguyên 1 gói chỉnh riêng/);
  assert.doesNotMatch(html, /admCatApplyOvr_/);
});

test('passive CTV catalog reads reuse 10-minute cache while pre-order refresh fetches live upstream prices', async t => {
  let upstreamSettingsHits = 0;
  let livePrice = 10000;
  const base = financeSource();
  const server = await startTestServer(t, async (url, options) => {
    const p = new URL(url).pathname;
    if (p === '/api/settings') upstreamSettingsHits += 1;
    if (p === '/api/buff-tim-price-packages') {
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 7, is_active: true, quantity: 100, total_price: livePrice }] }) };
    }
    return base(url, options);
  });
  const seller = await server.login('seller', 'seller-test-password');
  const first = await server.request('/api/catalog', 'GET', seller.body.token);
  assert.equal(first.body.catalog.buff_tim[0].total_price, 15000);
  assert.equal(upstreamSettingsHits, 1);

  // Passive read reuses cache (zero upstream calls)
  livePrice = 12000;
  const cached = await server.request('/api/catalog', 'GET', seller.body.token);
  assert.equal(cached.body.catalog.buff_tim[0].total_price, 15000);
  assert.equal(upstreamSettingsHits, 1);

  // Wait past 1.5s burst guard and verify pre-order ?refresh=1 gets the live updated price
  await new Promise(resolve => setTimeout(resolve, 1600));
  const refreshed = await server.request('/api/catalog?refresh=1', 'GET', seller.body.token);
  assert.equal(refreshed.body.catalog.buff_tim[0].total_price, 17000);
  assert.equal(upstreamSettingsHits, 2);
});

test('raw source files and dotfiles are blocked, minified bundle hides upstream supplier name, and image proxy hides supplier URL', async t => {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const base = financeSource();
  let pngHits = 0;
  const server = await startTestServer(t, async (url, options) => {
    if (String(url).includes('/assets/playtogether/images/test.png')) {
      pngHits += 1;
      return { ok: true, status: 200, arrayBuffer: async () => pngHeader };
    }
    return base(url, options);
  });

  // 1. Minified HTML & security headers
  const rootRes = await fetch(`${server.base}/`);
  assert.equal(rootRes.status, 200);
  assert.equal(rootRes.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(rootRes.headers.get('x-permitted-cross-domain-policies'), 'none');
  const htmlText = await rootRes.text();
  assert.match(htmlText, /\/assets\/zn\.bundle\.js/);
  assert.match(htmlText, /\/assets\/zn\.bundle\.css/);
  assert.doesNotMatch(htmlText, /<!--/);
  assert.doesNotMatch(htmlText, /hoannguyen/i);

  // 2. Minified JS & CSS bundles + ETag 304 + zero upstream brand leaks
  const jsRes = await fetch(`${server.base}/assets/zn.bundle.js`);
  assert.equal(jsRes.status, 200);
  const etag = jsRes.headers.get('etag');
  assert.ok(etag);
  const jsText = await jsRes.text();
  assert.doesNotMatch(jsText, /hoannguyen/i);
  assert.doesNotMatch(jsText, /SCREENSHOT 1/i);
  assert.ok(jsText.length < clientSource.length + toolsSource.length);
  const js304 = await fetch(`${server.base}/assets/zn.bundle.js`, { headers: { 'If-None-Match': etag } });
  assert.equal(js304.status, 304);

  const cssRes = await fetch(`${server.base}/assets/zn.bundle.css`);
  assert.equal(cssRes.status, 200);

  // 3. Raw source files, dotfiles, source maps, and backend filenames return 404
  for (const blocked of ['/app.js', '/tools.js', '/styles.css', '/index.html', '/.env', '/.git/config', '/server.js', '/package.json', '/assets/zn.bundle.js.map']) {
    const r = await fetch(`${server.base}${blocked}`);
    assert.equal(r.status, 404, `Expected 404 for ${blocked}`);
  }

  // 4. Image proxy hides supplier origin (200 image/png, no 302 redirect, cached, rejects traversal)
  const img1 = await fetch(`${server.base}/assets/playtogether/images/test.png`, { redirect: 'manual' });
  assert.equal(img1.status, 200);
  assert.equal(img1.headers.get('content-type'), 'image/png');
  assert.equal(pngHits, 1);
  const img2 = await fetch(`${server.base}/assets/playtogether/images/test.png`, { redirect: 'manual' });
  assert.equal(img2.status, 200);
  assert.equal(pngHits, 1);
  for (const badImg of ['/assets/playtogether/images/..%2fsecret.png', '/assets/playtogether/images/bad.html']) {
    const r = await fetch(`${server.base}${badImg}`, { redirect: 'manual' });
    assert.equal(r.status, 404, `Expected 404 for ${badImg}`);
  }
});

test('weather_buff full workflow: Admin pricing, package-first order creation, slot assignment, weather config, package lock, and toggle validation', async t => {
  const upstreamCalls = [];
  let wbOrderState = null;
  const base = financeSource();
  const server = await startTestServer(t, async (url, options = {}) => {
    const p = new URL(url).pathname;
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(options.body) : null;
    if (p === '/api/weather-buff-price-packages') {
      return {
        ok: true, status: 200, json: async () => ({
          success: true, data: [
            { id: 16, quantity: 10, total_price: 2000, original_price: 2000, effective_price: 2000, is_active: true, is_on_sale: false },
            { id: 23, quantity: 200, total_price: 25000, original_price: 25000, effective_price: 25000, is_active: true, is_on_sale: false },
          ]
        })
      };
    }
    if (p === '/api/weather-buff-types') {
      return {
        ok: true, status: 200, json: async () => ({
          success: true, data: [
            { id: 1, name: 'Mưa', enum_key: 'Rain', icon_path_and_name: 'Weather/icon_weather_Rain', diamond: 50, is_active: true, sort_order: 1 },
            { id: 2, name: 'Bão', enum_key: 'Thunderstorm', icon_path_and_name: 'Weather/icon_weather_Thunderstorm', diamond: 60, is_active: true, sort_order: 2 },
          ]
        })
      };
    }
    if (p === '/api/weather-buff-orders' && method === 'POST') {
      upstreamCalls.push({ p, method, body });
      wbOrderState = {
        id: 7701,
        price_package_id: body.price_package_id,
        package_quantity: body.price_package_id === 16 ? 10 : 200,
        total_price: body.price_package_id === 16 ? 2000 : 25000,
        customer_count: body.customer_count || 1,
        is_active: false,
        status: 'pending',
        completed_cnt: 0,
        public_token: 'tok123abc987def',
        slots: [{ slot_index: 0, customer_id: null, customer: null }],
        weathers: [],
      };
      return { ok: true, status: 200, json: async () => ({ success: true, data: wbOrderState }) };
    }
    if (p === '/api/weather-buff-orders/7701/share-link' && method === 'POST') {
      return { ok: true, status: 200, json: async () => ({ success: true, data: { token: 'tok123abc987def', path: '/track/weather/tok123abc987def', url: 'https://thoitietplay.us/track/weather/tok123abc987def' } }) };
    }
    if (p === '/api/weather-buff-orders/7701/slots/0' && method === 'PUT') {
      upstreamCalls.push({ p, method, body });
      wbOrderState.slots = [{ slot_index: 0, customer_id: body.customer_id, customer: { id: body.customer_id, nickname: 'KhachWeather', suid: '99887766' } }];
      return { ok: true, status: 200, json: async () => ({ success: true, data: wbOrderState }) };
    }
    if (p === '/api/weather-buff-orders/7701/weathers' && method === 'PUT') {
      upstreamCalls.push({ p, method, body });
      wbOrderState.weathers = body.weathers.map((w, idx) => ({
        id: 900 + idx,
        weather_type_id: w.weather_type_id,
        position: idx,
        quantity: w.quantity,
        completed_cnt: 0,
        weather_type: { id: w.weather_type_id, name: w.weather_type_id === 1 ? 'Mưa' : 'Bão', icon_path_and_name: 'Weather/icon_weather_Rain' },
      }));
      return { ok: true, status: 200, json: async () => ({ success: true, data: wbOrderState }) };
    }
    if (p === '/api/weather-buff-orders/7701/toggle-active' && method === 'PUT') {
      upstreamCalls.push({ p, method });
      wbOrderState.is_active = !wbOrderState.is_active;
      wbOrderState.status = wbOrderState.is_active ? 'assigned' : 'pending';
      return { ok: true, status: 200, json: async () => ({ success: true, data: wbOrderState }) };
    }
    if (p === '/api/weather-buff-orders' && method === 'GET') {
      return { ok: true, status: 200, json: async () => ({ success: true, data: { data: wbOrderState ? [wbOrderState] : [] } }) };
    }
    if (p === '/api/customers/resolve-by-role-id' && method === 'POST') {
      return { ok: true, status: 200, json: async () => ({ success: true, data: { id: 555, nickname: 'KhachWeather', suid: '99887766', role_id: body.role_id } }) };
    }
    return base(url, options);
  }, {
    seed(data) {
      data.users.push({ id: 'seller2', username: 'seller2', password: 'seller2-test-password', role: 'ctv', name: 'Seller2', balance: 50000 });
    },
  });

  const admin = await server.login('owner', 'owner-test-password');
  const seller = await server.login('seller', 'seller-test-password');
  const seller2 = await server.login('seller2', 'seller2-test-password');

  // 1. Admin configures +3.000đ markup on weather_buff -> 10 lần (cost 2.000đ) sells for 5.000đ
  const setRes = await server.request('/api/admin/settings', 'PUT', admin.body.token, {
    categoryMarkups: { weather_buff: 3000 },
    categoryMarkupModes: { weather_buff: 'fixed' },
  });
  assert.equal(setRes.status, 200);

  const cat = await server.request('/api/catalog?refresh=1', 'GET', seller.body.token);
  assert.equal(cat.status, 200);
  assert.equal(cat.body.catalog.weather_buff[0].total_price, 5000);
  assert.equal(cat.body.catalog.weather_buff[0]._admin, undefined);
  assert.equal(cat.body.catalog.weather_buff_types.length, 2);
  assert.match(cat.body.catalog.weather_buff_types[0].icon, /^\/assets\/playtogether\/images\//);

  // 2. CTV places weather_buff package order WITHOUT selecting customer first
  const place = await server.request('/api/orders/place', 'POST', seller.body.token, {
    category: 'weather_buff',
    price_package_id: 16,
    expect_sale: true,
    expected_price: 5000,
    idempotency_key: 'wb_order_place_test_key_001',
  });
  assert.equal(place.status, 200);
  assert.equal(place.body.success, true);
  assert.equal(place.body.userBalance, 45000);
  assert.equal(place.body.order.isActive, false);
  assert.equal(place.body.order.remoteOrderId, 7701);
  assert.deepEqual(upstreamCalls[0].body, {
    customer_count: 1,
    price_package_id: 16,
    expect_sale: false,
    expect_package_sale_id: null,
  });

  // 3. Cannot toggle ON before customer & weathers are configured
  const toggleEarly = await server.request('/api/orders/weather_buff/7701/toggle-active', 'PUT', seller.body.token);
  assert.equal(toggleEarly.status, 400);
  assert.match(toggleEarly.body.message, /gán khách/i);

  // 4. Cannot assign an unselected customer ID (403) or edit another CTV's order (403)
  const badSlot = await server.request('/api/orders/weather_buff/7701/slots/0', 'PUT', seller.body.token, { customer_id: 555 });
  assert.equal(badSlot.status, 403);
  const otherCtvSlot = await server.request('/api/orders/weather_buff/7701/slots/0', 'PUT', seller2.body.token, { customer_id: 555 });
  assert.equal(otherCtvSlot.status, 403);

  // 5. Select customer via Role ID and assign to slot 0
  const resolved = await server.request('/api/customer/resolve-role-id', 'POST', seller.body.token, { role_id: 'ABCD-1234' });
  assert.equal(resolved.status, 200);
  const assignSlot = await server.request('/api/orders/weather_buff/7701/slots/0', 'PUT', seller.body.token, { customer_id: 555 });
  assert.equal(assignSlot.status, 200);
  assert.equal(assignSlot.body.order.customer.nickname, 'KhachWeather');

  // 6. Still cannot toggle ON before choosing weathers
  const toggleNoWeather = await server.request('/api/orders/weather_buff/7701/toggle-active', 'PUT', seller.body.token);
  assert.equal(toggleNoWeather.status, 400);
  assert.match(toggleNoWeather.body.message, /thời tiết/i);

  // 7. Reject weather lines exceeding package quantity (11 > 10)
  const overQty = await server.request('/api/orders/weather_buff/7701/weathers', 'PUT', seller.body.token, {
    weathers: [{ id: null, weather_type_id: 1, quantity: 11 }],
  });
  assert.equal(overQty.status, 400);

  // 8. Save valid weather lines (even if client tries passing price_package_id: 23, server locks to paid 16!)
  const saveW = await server.request('/api/orders/weather_buff/7701/weathers', 'PUT', seller.body.token, {
    price_package_id: 23,
    weathers: [
      { id: null, weather_type_id: 1, quantity: 6 },
      { id: null, weather_type_id: 2, quantity: 4 },
    ],
  });
  assert.equal(saveW.status, 200);
  const weatherCall = upstreamCalls.find(c => c.p === '/api/weather-buff-orders/7701/weathers');
  assert.equal(weatherCall.body.price_package_id, 16);
  assert.equal(weatherCall.body.weathers.length, 2);

  // 9. Toggle ON now succeeds
  const toggleOk = await server.request('/api/orders/weather_buff/7701/toggle-active', 'PUT', seller.body.token);
  assert.equal(toggleOk.status, 200);
  const listRes = await server.request('/api/orders?category=weather_buff&refresh=1', 'GET', seller.body.token);
  assert.equal(listRes.body.orders.length, 1);
  assert.equal(listRes.body.orders[0].isActive, true);
  assert.equal(listRes.body.orders[0].customer.nickname, 'KhachWeather');
  assert.equal(listRes.body.orders[0].weather.weathers.length, 2);
  assert.equal(listRes.body.orders[0].weather.trackUrl, 'https://thoitietplay.us/track/weather/tok123abc987def');

  // 10. Share-link ownership and refusal to delete a running weather order
  const linkOwn = await server.request('/api/orders/weather_buff/7701/share-link', 'POST', seller.body.token);
  assert.equal(linkOwn.status, 200);
  assert.equal(linkOwn.body.url, 'https://thoitietplay.us/track/weather/tok123abc987def');
  const linkOther = await server.request('/api/orders/weather_buff/7701/share-link', 'POST', seller2.body.token);
  assert.equal(linkOther.status, 403);
  const delCtv = await server.request('/api/orders/weather_buff/7701', 'DELETE', seller.body.token);
  assert.equal(delCtv.status, 409);
});

test('empty weather deletion enforces ownership and age, rechecks the source and reconciles the original sale exactly once', async t => {
  const row = {
    id: 81, status: 'pending', is_active: false, completed_cnt: 0, sending_cnt: 0, failed_cnt: 0,
    weathers: [], slots: [{ customer_id: null, customer: null }]
  };
  let mode = 'reject', spent = 10000, present = true, deletes = 0;
  const json = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });
  const server = await startTestServer(t, async (url, options) => {
    const p = new URL(url);
    if (p.pathname === '/api/seller-settlements') return json({ data: { weekly_limit: { spent } } });
    if (options.method === 'DELETE') {
      deletes++;
      assert.equal(p.pathname, '/api/weather-buff-orders/81');
      if (mode === 'reject') return json({ success: false }, 422);
      if (mode === 'uncertain') throw new Error('Connection lost');
      await new Promise(resolve => setTimeout(resolve, 30));
      spent = 0;
      present = false;
      return json({ success: true });
    }
    const orders = present && p.pathname === '/api/weather-buff-orders' && p.searchParams.get('status_group') === 'active' ? [row] : [];
    return json({ success: true, data: { data: orders, total: orders.length } });
  }, {
    seed(data) {
      data.localOrders.push({
        id: 'weather-81', remoteOrderId: 81, category: 'weather_buff', sellPrice: 15000, costPrice: 10000,
        status: 'pending', placedBy: { id: 'seller', role: 'ctv' }, createdAt: new Date().toISOString()
      });
      data.transactions.push({ id: 'debit', userId: 'seller', type: 'order_debit', amount: -15000 });
      data.users.push({ id: 'other', role: 'ctv', balance: 2500 });
    }
  });
  const seller = (await server.login('seller', 'seller-test-password')).body.token;
  const admin = (await server.login('owner', 'owner-test-password')).body.token;
  const del = () => server.request('/api/orders/weather_buff/81', 'DELETE', seller, { amount: 99999 });
  const monitor = async () => (await server.request('/api/admin/monitor?ctvs=1', 'GET', admin)).body;
  const order = server.db.localOrders[0];
  assert.equal((await monitor()).adminPayable, 62500);
  order.placedBy.id = 'other';
  assert.equal((await del()).status, 403);
  order.placedBy.id = 'seller';
  assert.equal((await del()).status, 409);
  order.createdAt = new Date(Date.now() - 15001).toISOString();
  const listing = await server.request('/api/orders?category=weather_buff', 'GET', seller);
  assert.equal(listing.body.orders[0].weatherDeleteAt, Date.parse(order.createdAt) + 15000);
  assert.equal(listing.body.orders[0].weatherDeleteUntil, Date.parse(order.createdAt) + 3 * 60 * 60 * 1000);
  // Weather orders older than 3 hours cannot be deleted by CTV and do not expose weatherDeleteAt
  const prevCreatedAt = order.createdAt;
  order.createdAt = new Date(Date.now() - 3 * 60 * 60 * 1000 - 1000).toISOString();
  const expiredListing = await server.request('/api/orders?category=weather_buff&refresh=1', 'GET', seller);
  assert.equal(expiredListing.body.orders[0].weatherDeleteAt, undefined);
  assert.equal(expiredListing.body.orders[0].weatherDeleteUntil, undefined);
  const expiredDel = await del();
  assert.equal(expiredDel.status, 409);
  assert.match(expiredDel.body.message, /quá 3 tiếng/);
  assert.equal(deletes, 0);
  // Also blocked if source created_at is older than 3 hours even when local createdAt is fresh
  order.createdAt = prevCreatedAt;
  row.created_at = new Date(Date.now() - 3 * 60 * 60 * 1000 - 5000).toISOString();
  assert.equal((await del()).status, 409);
  assert.equal(deletes, 0);
  delete row.created_at;
  for (const [key, value] of Object.entries({
    status: 'assigned', is_active: true, completed_cnt: 1, failed_cnt: 1,
    sending_cnt: 1, remote_ref: 'started', casting: {}, slots: [{ customer_id: 55 }], weathers: [{ quantity: 1 }]
  })) {
    const prev = row[key];
    row[key] = value;
    assert.equal((await del()).status, 409, key);
    row[key] = prev;
  }
  assert.equal(deletes, 0);
  assert.equal((await del()).status, 409);
  assert.equal(order.weatherDeletePending, undefined);
  mode = 'uncertain';
  assert.equal((await del()).status, 503);
  assert.equal(order.weatherDeletePending, true);
  assert.equal(server.db.users[1].balance, 50000);
  assert.equal((await server.request('/api/orders/weather_buff/81/toggle-active', 'PUT', seller)).status, 409);
  mode = 'success';
  const pair = await Promise.all([del(), del()]);
  assert.deepEqual(pair.map(r => r.status).sort(), [200, 409]);
  assert.equal(deletes, 3);
  assert.equal(pair.find(r => r.status === 200).body.refundedAmount, 15000);
  assert.equal((await del()).status, 403);
  assert.equal(server.db.transactions.filter(t => t.type === 'order_refund').length, 1);
  const totals = await monitor();
  assert.equal(totals.walletTotals.balance, 67500);
  assert.equal(totals.walletTotals.totalSpent, 0);
  assert.equal(totals.adminPayable, 67500);
  assert.equal(totals.ctvs[0].orderCount, 0);
  assert.ok(totals.events.some(e => e.details?.refundedAmount === 15000));
  const detail = (await server.request('/api/admin/monitor/ctv/seller', 'GET', admin)).body;
  assert.equal(detail.summary.balance, 65000);
  assert.equal(detail.summary.totalSpent, 0);
  assert.equal(detail.summary.totalProfit, 0);
  assert.equal(detail.orders.length, 0);
  assert.equal(detail.transactions[0].type, 'order_refund');
  assert.equal(detail.transactions[0].amount, 15000);
  spent = null;
  assert.equal((await monitor()).adminPayable, null);
});

test('admin can settle an interrupted weather deletion only after checking active and completed orders', async t => {
  let completed = false;
  const server = await startTestServer(t, async (url, options) => {
    assert.equal(options.method, 'GET');
    const rows = completed && new URL(url).searchParams.get('status_group') === 'completed' ? [{ id: 81, status: 'completed' }] : [];
    return { ok: true, status: 200, json: async () => ({ success: true, data: { data: rows, total: rows.length } }) };
  }, {
    seed(data) {
      data.localOrders.push({
        id: 'pending-delete', remoteOrderId: 81, category: 'weather_buff', sellPrice: 7000, costPrice: 4500,
        status: 'pending', placedBy: { id: 'seller', role: 'ctv' }, createdAt: new Date(Date.now() - 30000).toISOString(), weatherDeletePending: true
      });
    }
  });
  const seller = (await server.login('seller', 'seller-test-password')).body.token;
  const admin = (await server.login('owner', 'owner-test-password')).body.token;
  const del = (token, confirmed_deleted) => server.request('/api/orders/weather_buff/81', 'DELETE', token, { confirmed_deleted });
  assert.equal((await del(seller, true)).status, 409);
  assert.equal((await del(admin, false)).status, 409);
  completed = true;
  assert.equal((await del(admin, true)).status, 409);
  assert.equal(server.db.transactions.length, 0);
  assert.equal(server.db.localOrders[0].weatherDeletePending, undefined);
  completed = false;
  server.db.localOrders[0].weatherDeletePending = true;
  assert.equal((await del(admin, true)).body.refundedAmount, 7000);
  assert.equal(server.db.users[1].balance, 57000);
  assert.equal(server.db.localOrders.length, 0);
});

test('admin per-CTV monitor endpoint returns isolated orders, wallet transactions, and activity logs without secrets', async t => {
  const server = await startTestServer(t, financeSource(), {
    seed(data) {
      data.users.push({ id: 'seller2', username: 'seller2', password: 'seller2-test-password', role: 'ctv', name: 'Seller Two', balance: 20000 });
      data.localOrders.push(
        { id: 'ord-s1', remoteOrderId: 101, category: 'buff_tim', categoryName: 'Buff Tim', summary: 'Buff 100 Tim', customer: { nickname: 'KhachA', suid: '111' }, sellPrice: 15000, costPrice: 10000, markupAmount: 5000, status: 'completed', isActive: false, placedBy: { id: 'seller', name: 'Seller', role: 'ctv' }, createdAt: new Date().toISOString() },
        { id: 'ord-s2', remoteOrderId: 202, category: 'buff_sao', categoryName: 'Buff Sao', summary: 'Buff 50 Sao', customer: { nickname: 'KhachB', suid: '222' }, sellPrice: 12000, costPrice: 8000, markupAmount: 4000, status: 'pending', isActive: true, placedBy: { id: 'seller2', name: 'Seller Two', role: 'ctv' }, createdAt: new Date().toISOString() }
      );
      data.transactions.push(
        { id: 'tx-s1', userId: 'seller', type: 'admin_topup', amount: 50000, balanceAfter: 50000, note: 'Nap cho seller 1', createdAt: '2026-11-22T09:00:00Z' },
        { id: 'tx-s2', userId: 'seller2', type: 'admin_topup', amount: 20000, balanceAfter: 20000, note: 'Nap cho seller 2', createdAt: '2026-11-22T09:01:00Z' }
      );
    },
  });

  const admin = await server.login('owner', 'owner-test-password');
  const seller = await server.login('seller', 'seller-test-password');
  const seller2 = await server.login('seller2', 'seller2-test-password');
  assert.ok(seller2.body.token);

  // CTV cannot access per-CTV monitor
  assert.equal((await server.request('/api/admin/monitor/ctv/seller', 'GET', seller.body.token)).status, 403);
  // Missing CTV returns 404
  assert.equal((await server.request('/api/admin/monitor/ctv/unknown', 'GET', admin.body.token)).status, 404);

  // Admin top-up on seller appears in seller's activity log
  const topup = await server.request('/api/admin/ctv/seller/balance', 'POST', admin.body.token, {
    amount: 10000,
    note: 'Nap them test',
    idempotency_key: crypto.randomUUID(),
  });
  assert.equal(topup.status, 200);

  // Overview monitor includes per-CTV order stats
  const mon = await server.request('/api/admin/monitor', 'GET', admin.body.token);
  const s1Row = mon.body.ctvs.find(u => u.id === 'seller');
  assert.equal(s1Row.orderCount, 1);
  assert.equal(s1Row.totalSell, 15000);
  assert.equal(s1Row.totalProfit, 5000);

  // Detailed CTV endpoint returns strictly seller's orders, transactions, and events
  const det = await server.request('/api/admin/monitor/ctv/seller', 'GET', admin.body.token);
  assert.equal(det.status, 200);
  assert.equal(det.body.ctv.password, undefined);
  assert.equal(det.body.summary.orderCount, 1);
  assert.equal(det.body.summary.completedCount, 1);
  assert.equal(det.body.summary.totalSell, 15000);
  assert.equal(det.body.summary.totalProfit, 5000);
  assert.equal(det.body.summary.totalTopup, 60000);
  assert.equal(det.body.orders.length, 1);
  assert.equal(det.body.orders[0].id, 'ord-s1');
  assert.ok(det.body.transactions.every(tx => tx.userId === 'seller'));
  assert.ok(det.body.events.some(ev => ev.actorId === 'seller'));
  assert.ok(det.body.events.some(ev => ev.details?.userId === 'seller' && ev.details?.amount === 10000));
  assert.ok(det.body.events.every(ev => ev.actorId !== 'seller2'));
  assert.doesNotMatch(JSON.stringify(det.body), /seller-test-password|owner-test-password|test-upstream-token/);

  // Client monitor HTML with selected CTV detail safely escapes XSS payloads
  const { context, state } = createClient();
  state.adminMonitor = mon.body;
  state.adminMonitorCtvId = 'seller';
  state.adminMonitorCtvTab = 'orders';
  state.adminMonitorCtvDetail = {
    ...det.body,
    ctv: { ...det.body.ctv, name: '<img src=x onerror=alert(1)>' },
    orders: [{ ...det.body.orders[0], summary: '<script>evil()</script>' }],
  };
  const rendered = vm.runInContext('renderAdminMonitorHtml()', context);
  assert.doesNotMatch(rendered, /<img|<script/);
  assert.match(rendered, /&lt;script&gt;/);
});

test('admin maintenance toggle blocks logged-in and newly logging-in CTVs with maintenance message while Admin retains full access', async t => {
  const server = await startTestServer(t, financeSource());
  const admin = await server.login('owner', 'owner-test-password');
  const seller = await server.login('seller', 'seller-test-password');

  // CTV cannot toggle maintenance
  assert.equal((await server.request('/api/admin/maintenance', 'POST', seller.body.token, { enabled: true })).status, 403);

  // Admin enables maintenance mode
  const onRes = await server.request('/api/admin/maintenance', 'POST', admin.body.token, { enabled: true });
  assert.equal(onRes.status, 200);
  assert.equal(onRes.body.maintenanceMode, true);

  // /api/ping reports maintenance: true immediately
  const pingOn = await server.request('/api/ping');
  assert.equal(pingOn.body.maintenance, true);

  // Logged-in CTV is blocked on /api/auth/me and /api/catalog with 503 + exact message
  const ctvMe = await server.request('/api/auth/me', 'GET', seller.body.token);
  assert.equal(ctvMe.status, 503);
  assert.equal(ctvMe.body.code, 'MAINTENANCE');
  assert.equal(ctvMe.body.message, 'Hệ thống Zn đang bảo trì');

  const ctvCat = await server.request('/api/catalog', 'GET', seller.body.token);
  assert.equal(ctvCat.status, 503);
  assert.equal(ctvCat.body.message, 'Hệ thống Zn đang bảo trì');

  // New CTV login is also blocked with 503 maintenance message
  const ctvLoginBlocked = await server.login('seller', 'seller-test-password');
  assert.equal(ctvLoginBlocked.status, 503);
  assert.equal(ctvLoginBlocked.body.message, 'Hệ thống Zn đang bảo trì');

  // Admin continues accessing everything normally (login, me, overview, catalog)
  const adminRelogin = await server.login('owner', 'owner-test-password');
  assert.equal(adminRelogin.status, 200);
  const adminOverview = await server.request('/api/admin/overview', 'GET', adminRelogin.body.token);
  assert.equal(adminOverview.status, 200);
  assert.equal(adminOverview.body.settings.maintenanceMode, true);
  assert.equal((await server.request('/api/catalog', 'GET', adminRelogin.body.token)).status, 200);

  // Admin disables maintenance mode -> CTV resumes seamlessly with existing token
  const offRes = await server.request('/api/admin/maintenance', 'POST', adminRelogin.body.token, { enabled: false });
  assert.equal(offRes.status, 200);
  assert.equal(offRes.body.maintenanceMode, false);
  assert.equal((await server.request('/api/ping')).body.maintenance, false);
  assert.equal((await server.request('/api/auth/me', 'GET', seller.body.token)).status, 200);
  assert.equal((await server.request('/api/catalog', 'GET', seller.body.token)).status, 200);

  // Admin notify-update bumps updateVersion exposed by /api/ping; CTV cannot call it
  assert.equal((await server.request('/api/admin/notify-update', 'POST', seller.body.token)).status, 403);
  const beforeVer = (await server.request('/api/ping')).body.updateVersion;
  const notifyRes = await server.request('/api/admin/notify-update', 'POST', adminRelogin.body.token);
  assert.equal(notifyRes.status, 200);
  assert.ok(notifyRes.body.updateVersion > beforeVer);
  assert.equal((await server.request('/api/ping')).body.updateVersion, notifyRes.body.updateVersion);

  // Client CTV auto-update behavior: online CTV auto-reloads, offline CTV auto-reloads on next visit, and shows updated notice once
  const persisted = new Map();
  const makeCtvBrowser = (remoteVer, token = '') => {
    const bodyChildren = [];
    const byId = new Map();
    const makeEl = (tag = 'div') => ({
      tagName: tag.toUpperCase(),
      style: {},
      innerHTML: '',
      textContent: '',
      value: '',
      children: [],
      parentNode: null,
      classList: { remove() { }, toggle() { }, contains: () => false },
      setAttribute() { },
      addEventListener() { },
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      remove() {
        if (this.id) byId.delete(this.id);
        const i = bodyChildren.indexOf(this);
        if (i >= 0) bodyChildren.splice(i, 1);
        this.parentNode = null;
      },
    });
    const session = new Map(token ? [['znplay_token', token]] : []);
    let reloads = 0;
    const ctx = vm.createContext({
      localStorage: {
        getItem: k => (persisted.has(k) ? persisted.get(k) : null),
        setItem: (k, v) => persisted.set(k, String(v)),
        removeItem: k => persisted.delete(k),
      },
      sessionStorage: {
        getItem: k => (session.has(k) ? session.get(k) : null),
        setItem: (k, v) => session.set(k, String(v)),
        removeItem: k => session.delete(k),
      },
      window: {
        location: { reload() { reloads += 1; } },
        addEventListener() { },
      },
      document: {
        hidden: false,
        body: {
          appendChild(child) {
            child.parentNode = this;
            if (child.id) byId.set(child.id, child);
            bodyChildren.push(child);
            return child;
          },
        },
        createElement: tag => makeEl(tag),
        getElementById: id => byId.get(id) || makeEl('div'),
        querySelectorAll: () => [],
        addEventListener() { },
      },
      fetch: async url => {
        if (url === '/api/ping') return { ok: true, status: 200, json: async () => ({ ok: true, maintenance: false, updateVersion: remoteVer }) };
        if (url === '/api/auth/me') return { ok: true, status: 200, json: async () => ({ success: true, user: { id: 'seller', role: 'ctv', name: 'CTV' }, updateVersion: remoteVer }) };
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      },
      console: { ...console, error() { } },
      setTimeout() { },
      setInterval() { },
    });
    vm.runInContext(backupClientSource.replace(/^export /gm, '') + '\n' + toolsSource.replace(/^export /m, '') + '\n' + clientSource.replace(/^import .*;\r?\n/gm, '').replace(/bootstrap\(\);\s*$/, '') + '\nglobalThis.testState = state;', ctx);
    return { ctx, getReloads: () => reloads, getNotice: () => byId.get('znCtvUpdatedNotice') };
  };

  // 1. CTV logs in at version 100 -> persisted, no reload
  const b1 = makeCtvBrowser(100, 'tok-ctv');
  await b1.ctx.initAuth();
  assert.equal(b1.getReloads(), 0);
  assert.equal(persisted.get('znplay_ctv_update_ver'), '100');

  // 2. Online CTV receives version 200 -> immediate auto-reload + notice flag
  assert.equal(b1.ctx.handleCtvUpdateVersion(200, { isCtvConfirmed: true }), true);
  assert.equal(b1.getReloads(), 1);
  assert.equal(persisted.get('znplay_ctv_update_ver'), '200');
  assert.equal(persisted.get('znplay_ctv_updated_notice'), '1');

  // 3. After reload at version 200 -> no loop, shows "Zn đã tự động cập nhật phiên bản mới"
  const b2 = makeCtvBrowser(200, 'tok-ctv');
  await b2.ctx.initAuth();
  b2.ctx.showCtvUpdatedNoticeIfPending();
  assert.equal(b2.getReloads(), 0);
  assert.equal(persisted.has('znplay_ctv_updated_notice'), false);
  assert.match(b2.getNotice()?.children?.[0]?.textContent || '', /Zn đã tự động cập nhật phiên bản mới/);

  // 4. Offline CTV (logged out, no session token) opens browser later when server is at version 300 -> auto-reloads immediately
  const b3 = makeCtvBrowser(300, '');
  await b3.ctx.bootstrap();
  assert.equal(b3.getReloads(), 1);
  assert.equal(persisted.get('znplay_ctv_update_ver'), '300');
  assert.equal(persisted.get('znplay_ctv_updated_notice'), '1');

  // 5. After offline auto-reload at version 300 -> no loop, shows notice on login screen
  const b4 = makeCtvBrowser(300, '');
  await b4.ctx.bootstrap();
  assert.equal(b4.getReloads(), 0);
  assert.match(b4.getNotice()?.children?.[0]?.textContent || '', /Zn đã tự động cập nhật phiên bản mới/);
});

test('scoped catalog refresh calls only target category endpoints, omits seller-settlements for CTV, and returns compact fruit mutations', async t => {
  const hitPaths = [];
  const base = financeSource();
  const server = await startTestServer(t, async (url, options = {}) => {
    hitPaths.push(new URL(url).pathname);
    return base(url, options);
  });
  const seller = await server.login('seller', 'seller-test-password');

  // 1. Scoped buff_tim refresh calls ONLY /api/settings + /api/buff-tim-price-packages (2 calls, zero fruit-items or settlements!)
  hitPaths.length = 0;
  const timRes = await server.request('/api/catalog?refresh=1&scope=buff_tim&compact=1', 'GET', seller.body.token);
  assert.equal(timRes.status, 200);
  assert.equal(timRes.body.partialScope, 'buff_tim');
  assert.equal(timRes.body.catalog.buff_tim.length, 1);
  assert.equal(timRes.body.catalog.fruit_by_fruit, undefined);
  assert.deepEqual([...new Set(hitPaths)].sort(), ['/api/buff-tim-price-packages', '/api/settings']);

  // 2. Scoped fruit_by_fruit refresh with compact=1 calls ONLY 3 fruit endpoints and returns compact mp tuples (no _admin)
  hitPaths.length = 0;
  const fruitRes = await server.request('/api/catalog?refresh=1&scope=fruit_by_fruit&compact=1', 'GET', seller.body.token);
  assert.equal(fruitRes.status, 200);
  assert.equal(fruitRes.body.partialScope, 'fruit_by_fruit');
  assert.deepEqual([...new Set(hitPaths)].sort(), ['/api/fruit-items', '/api/fruit-stock', '/api/settings']);
  const firstFruit = fruitRes.body.catalog.fruit_by_fruit[0];
  assert.ok(Array.isArray(firstFruit.mp));
  assert.equal(firstFruit.mutation_prices, undefined);
  assert.equal(firstFruit._admin, undefined);

  // 3. Full CTV catalog load skips /api/seller-settlements (Admin-only!)
  hitPaths.length = 0;
  const fullCtv = await server.request('/api/catalog?refresh=1&compact=1', 'GET', seller.body.token);
  assert.equal(fullCtv.status, 200);
  assert.equal(hitPaths.includes('/api/seller-settlements'), false);
  assert.equal(fullCtv.body.weeklyLimit, undefined);

  // 4. Order placement uses scoped refresh (for buff_tim, never pulls 586KB fruit-items!)
  await server.request('/api/customer/resolve-role-id', 'POST', seller.body.token, { role_id: 'FAST-123' });
  hitPaths.length = 0;
  const place = await server.request('/api/orders/place', 'POST', seller.body.token, {
    category: 'buff_tim',
    customer_id: 101,
    price_package_id: 7,
    expected_price: 15000,
    idempotency_key: 'fast_scoped_order_key_001',
  });
  assert.equal(place.status, 200);
  assert.equal(hitPaths.includes('/api/fruit-items'), false);
  assert.equal(hitPaths.includes('/api/seller-settlements'), false);
});

test('anti-DDoS and anti-abuse shields: account brute-force lock, image proxy negative cache, and CTV refresh burst limit', async t => {
  let missingImgHits = 0;
  const base = financeSource();
  const server = await startTestServer(t, async (url, options = {}) => {
    if (String(url).includes('/assets/playtogether/images/nonexistent.png')) {
      missingImgHits += 1;
      return { ok: false, status: 404, arrayBuffer: async () => Buffer.alloc(0) };
    }
    return base(url, options);
  });

  // 1. Image proxy negative 404 cache prevents upstream amplification on repeated fake PNG probes
  const m1 = await fetch(`${server.base}/assets/playtogether/images/nonexistent.png`);
  const m2 = await fetch(`${server.base}/assets/playtogether/images/nonexistent.png`);
  assert.equal(m1.status, 404);
  assert.equal(m2.status, 404);
  assert.equal(missingImgHits, 1);

  // 2. Per-account brute-force protection locks target username after 10 wrong password attempts
  for (let i = 0; i < 10; i++) {
    const r = await server.login('seller', 'wrong-password-attempt');
    assert.equal(r.status, 401);
  }
  const lockedAttempt = await server.login('seller', 'seller-test-password');
  assert.equal(lockedAttempt.status, 429);

  // Admin account is unaffected by brute-force against seller!
  const adminOk = await server.login('owner', 'owner-test-password');
  assert.equal(adminOk.status, 200);
});

test('order category and history tables omit sending, completed, failed, and note columns with aligned cells', () => {
  const categories = ['fruit_coin', 'weather_buff', 'buff_sao', 'buff_luot_xem', 'buff_tim', 'farm_gift', 'mail_gift', 'guestbook'];
  const sampleOrders = categories.map((cat, idx) => ({
    id: `ord-${idx + 1}`,
    remoteOrderId: 900 + idx,
    category: cat,
    summary: `Gói ${cat}`,
    totalCnt: 100,
    sendingCnt: 12,
    completedCnt: 40,
    failedCnt: 3,
    sellPrice: 25000,
    costPrice: 20000,
    markupAmount: 5000,
    status: 'assigned',
    isActive: true,
    note: `SECRET_ORDER_NOTE_${idx}`,
    createdAt: '2026-11-23T06:00:00Z',
    customer: { nickname: `Player${idx}`, suid: `SUID${idx}`, customerId: idx + 1 },
    ...(cat === 'weather_buff'
      ? { weather: { packageQuantity: 10, trackUrl: 'https://thoitietplay.us/track/weather/tok123', slots: [{ customer_id: idx + 1 }], weathers: [{ name: 'Mưa', quantity: 10, completed_cnt: 4 }] } }
      : {}),
  }));

  for (const role of ['admin', 'ctv']) {
    const client = createClient();
    client.state.user = { id: role, role, name: role.toUpperCase(), balance: 100000 };
    client.state.catalogData = { systemStatus: {}, processingRates: {} };

    for (const cat of categories) {
      client.state.orders = [];
      const emptyHtml = client.context.renderOrderCategoryPageHtml(cat);
      const thMatches = [...emptyHtml.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(m => m[1].trim());
      for (const removed of ['ĐANG GỬI', 'HOÀN THÀNH', 'THẤT BẠI', 'GHI CHÚ']) {
        assert.equal(thMatches.includes(removed), false, `${role}/${cat} should omit ${removed}`);
      }
      const emptyColspan = emptyHtml.match(/<td colspan="(\d+)"/);
      assert.ok(emptyColspan, `${role}/${cat} empty row should have colspan`);
      assert.equal(Number(emptyColspan[1]), thMatches.length, `${role}/${cat} empty colspan must match header count`);

      client.state.orders = sampleOrders;
      const populatedHtml = client.context.renderOrderCategoryPageHtml(cat);
      const tbodyHtml = populatedHtml.match(/<tbody id="catOrdersTbody">([\s\S]*?)<\/tbody>/)[1];
      const tdMatches = [...tbodyHtml.matchAll(/<td(?:\s[^>]*)?>/gi)];
      assert.equal(tdMatches.length, thMatches.length, `${role}/${cat} row td count must match header count`);
      assert.doesNotMatch(tbodyHtml, /SECRET_ORDER_NOTE_/);
    }

    client.state.orders = [];
    const emptyHist = client.context.renderOrderHistoryHtml();
    const histTh = [...emptyHist.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(m => m[1].trim());
    for (const removed of ['ĐANG GỬI', 'HOÀN THÀNH', 'THẤT BẠI', 'GHI CHÚ']) {
      assert.equal(histTh.includes(removed), false, `${role}/history should omit ${removed}`);
    }
    const histEmptyColspan = emptyHist.match(/<td colspan="(\d+)"/);
    assert.equal(Number(histEmptyColspan[1]), histTh.length);

    client.state.orders = sampleOrders;
    const histHtml = client.context.renderOrderHistoryHtml();
    const histTbody = histHtml.match(/<tbody id="histOrdersTbody">([\s\S]*?)<\/tbody>/)[1];
    const rows = [...histTbody.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
    assert.equal(rows.length, sampleOrders.length);
    for (const row of rows) {
      const tds = [...row[1].matchAll(/<td(?:\s[^>]*)?>/gi)];
      assert.equal(tds.length, histTh.length, `${role}/history row td count must match header count`);
    }
    assert.doesNotMatch(histTbody, /SECRET_ORDER_NOTE_/);
  }
});

test('monitor uses the complete ledger, caps activity at 50 and finds orders beyond the first page', async t => {
  const server = await startTestServer(t, undefined, {
    seed(db) {
      const createdAt = new Date().toISOString();
      db.auditLog = Array.from({ length: 65 }, (_, i) => ({ id: String(i), actorId: 'seller', createdAt }));
      db.localOrders = Array.from({ length: 321 }, (_, i) => ({
        id: `order-${i}`, intentId: `intent-${i}`, category: 'buff_tim',
        placedBy: { id: 'seller' }, summary: `package-${i}`, sellPrice: 100, createdAt
      }));
      db.transactions = db.localOrders.map(o => ({ id: o.intentId, userId: 'seller', amount: -100, type: 'order_debit', createdAt }));
      for (const [type, amount] of [['admin_topup', 50000], ['admin_deduct', -500], ['order_refund', 60], ['order_hold', -200], ['order_release', 100]]) {
        db.transactions.unshift({ id: crypto.randomUUID(), userId: 'seller', type, amount, createdAt });
      }
      db.users[1].balance = 17360;
      for (let i = 0; i < 20; i++) {
        db.users.push({ id: `other-${i}`, role: 'ctv', balance: 0 });
      }
      db.users.at(-1).balance = 700;
      db.users.at(-1).isLocked = true;
      db.transactions.push(
        { id: 'last-topup', userId: 'other-19', type: 'admin_topup', amount: 1000, createdAt },
        { id: 'last-debit', userId: 'other-19', type: 'order_debit', amount: -300, createdAt },
        { id: 'owner-topup', userId: 'owner', type: 'admin_topup', amount: 9000, createdAt }
      );
    }
  });
  const token = (await server.login('owner', 'owner-test-password')).body.token;
  const get = async path => (await server.request('/api/admin/monitor' + path, 'GET', token)).body;
  const overview = await get('');
  assert.equal(overview.ctvs.length, 20);
  assert.equal(overview.ctvCount, 21);
  assert.deepEqual(overview.walletTotals, { totalTopup: 51000, totalSpent: 32340, balance: 18060 });
  assert.deepEqual((await get('?ctvs=40')).walletTotals, overview.walletTotals);
  const client = createClient();
  client.state.adminMonitor = overview;
  const html = vm.runInContext('renderAdminMonitorHtml()', client.context);
  const totalsPanel = html.split('</section>')[0];
  assert.match(totalsPanel, /Tổng ví của toàn bộ CTV/);
  for (const amount of ['51.000đ', '32.340đ', '18.060đ']) assert.ok(totalsPanel.includes(amount));
  assert.equal(overview.events.length, 20);
  assert.equal((await get('?events=80')).events.length, 50);
  assert.equal(overview.ctvs[0].totalSpent, 32040);
  const first = await get('/ctv/seller');
  assert.equal(first.summary.totalTopup, 50000);
  assert.equal(first.summary.balance, 17360);
  assert.equal(first.summary.held, 100);
  assert.equal(first.summary.deducted, 500);
  assert.equal(first.orders.length, 20);
  assert.equal(first.summary.orderCount, 321);
  const more = await get('/ctv/seller?orders=40');
  assert.equal(more.orders.length, 40);
  assert.equal(more.summary.totalSpent, first.summary.totalSpent);
  const hit = await get('/ctv/seller?q=package-320');
  assert.deepEqual(hit.orders.map(o => [o.id, o.debit]), [['order-320', 100]]);
});

test('remote pagination merges all source pages and retains known orders on an interrupted refresh', async t => {
  let outage = false;
  const server = await startTestServer(t, async url => {
    const u = new URL(url);
    const match = u.pathname.endsWith('guestbook-orders');
    const page = Number(u.searchParams.get('page'));
    if (outage && match && page === 2) throw new Error('Unavailable');
    return {
      ok: true, status: 200, json: async () => ({
        data: {
          current_page: page, last_page: match ? 2 : 1,
          data: match ? Array.from({ length: 17 }, (_, i) => ({ id: i + 1 + (page - 1) * 17, created_at: new Date().toISOString() })) : []
        }
      })
    };
  });
  const token = (await server.login('owner', 'owner-test-password')).body.token;
  const get = async query => (await server.request('/api/orders?' + query, 'GET', token)).body;
  const first = await get('limit=20');
  assert.equal(first.partial, false);
  assert.equal(first.orders.length, 20);
  assert.equal(first.page.totalCount, 34);
  assert.equal((await get('limit=40')).orders.length, 34);
  assert.equal((await get('limit=20&q=34')).orders[0].remoteOrderId, 34);
  outage = true;
  const partial = await get('refresh=1&limit=40');
  assert.equal(partial.partial, true);
  assert.equal(new Set(partial.orders.map(o => o.id)).size, 34);
});

test('Sunday midnight Vietnam time clears previous history and preserves open orders, balances and all ledger entries', async t => {
  const boundary = Date.parse('2026-11-28T17:00:00Z');
  let now = boundary - 1000;
  class Clock extends Date { static now() { return now; } }
  const server = await startTestServer(t, undefined, {
    clock: Clock, seed(db) {
      const old = new Date(now).toISOString();
      db.localOrders = ['completed', 'pending', 'cancelled'].map((status, i) => ({ id: String(i), status, createdAt: old }));
      db.localOrders.push({ id: 'new', status: 'completed', createdAt: new Date(boundary).toISOString() });
      db.transactions = [{ id: 'deposit', type: 'admin_topup', userId: 'seller', amount: 50000, createdAt: old }];
      db.auditLog = [{ id: 'old', createdAt: old }, { id: 'new', createdAt: new Date(boundary).toISOString() }];
    }
  });
  assert.equal(server.db.localOrders.length, 4);
  now = boundary;
  await server.request('/api/ping');
  await server.request('/api/ping');
  assert.deepEqual(Array.from(server.db.localOrders, o => o.id), ['1', 'new']);
  assert.deepEqual(Array.from(server.db.auditLog, e => e.id), ['new']);
  assert.equal(server.db.transactions.length, 1);
  assert.equal(server.db.users[1].balance, 50000);
});

test('CTV scoped live progress sync fetches only active category endpoint and detects completion immediately', async t => {
  let now = Date.parse('2026-11-24T12:00:00Z');
  class Clock extends Date { static now() { return now; } }
  let progress = 37;
  let finished = false;
  const hitPaths = [];
  const server = await startTestServer(t, async url => {
    const u = new URL(url);
    hitPaths.push(`${u.pathname}?${u.searchParams.get('status_group') || ''}`);
    if (u.pathname === '/api/fruit-coin-orders' && u.searchParams.get('status_group') === 'active') {
      return { ok: true, status: 200, json: async () => ({ data: { current_page: 1, last_page: 1, data: finished ? [] : [{ id: 18294, status: 'assigned', is_active: true, total_cnt: 100, completed_cnt: progress, customer: { nickname: 'Niuubie5', suid: '7829' } }] } }) };
    }
    if (u.pathname === '/api/fruit-coin-orders' && u.searchParams.get('status_group') === 'completed') {
      return { ok: true, status: 200, json: async () => ({ data: { current_page: 1, last_page: 1, data: finished ? [{ id: 18294, status: 'completed', is_active: false, total_cnt: 100, completed_cnt: 100, customer: { nickname: 'Niuubie5', suid: '7829' } }] : [] } }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: { current_page: 1, last_page: 1, data: [] } }) };
  }, {
    clock: Clock,
    seed(db) {
      db.localOrders.push({
        id: 'ord-fruit-1', remoteOrderId: 18294, category: 'fruit_coin', categoryName: 'Trái cây',
        summary: 'Gói 10.000.000 Xu', customer: { nickname: 'Niuubie5', suid: '7829' },
        sellPrice: 3000, status: 'assigned', isActive: true, totalCnt: 100, completedCnt: 0,
        placedBy: { id: 'seller', name: 'Seller', role: 'ctv' }, createdAt: new Date(now).toISOString(),
      });
    },
  });

  const seller = (await server.login('seller', 'seller-test-password')).body.token;
  // Initial scoped load for fruit_all touches ONLY fruit active + fruit completed (2 calls instead of 11).
  const first = await server.request('/api/orders?category=fruit_all&limit=20', 'GET', seller);
  assert.equal(first.status, 200);
  assert.equal(first.body.orders[0].completedCnt, 37);
  assert.equal(first.body.page.categoryStats.completed_coin_units, 37);
  assert.equal(first.body.page.categoryStats.completed_fruit_units, 0);
  assert.equal(hitPaths.length, 2);

  // Within 10s, live progress poll uses cache -> 0 upstream calls.
  now += 5000;
  progress = 68;
  const cached = await server.request('/api/orders?category=fruit_all&limit=20&live=1', 'GET', seller);
  assert.equal(cached.body.orders[0].completedCnt, 37);
  assert.equal(hitPaths.length, 2);

  // After 10s, live progress poll fetches ONLY the 1 active endpoint (not completed, not other 9 endpoints).
  now += 6000;
  const updated = await server.request('/api/orders?category=fruit_all&limit=20&live=1', 'GET', seller);
  assert.equal(updated.body.orders[0].completedCnt, 68);
  assert.equal(hitPaths.length, 3);
  assert.equal(hitPaths[2], '/api/fruit-coin-orders?active');

  // Once order finishes and disappears from active, server detects missing active order & immediately checks completed.
  now += 11000;
  finished = true;
  const done = await server.request('/api/orders?category=fruit_all&limit=20&live=1', 'GET', seller);
  assert.equal(done.body.orders[0].status, 'completed');
  assert.equal(done.body.orders[0].completedCnt, 100);
  assert.equal(hitPaths.length, 5);

  // Rendered UI localizes status badges and filter labels to Vietnamese.
  const client = createClient();
  client.state.user = { id: 'seller', role: 'ctv', name: 'Seller', balance: 50000 };
  client.state.catalogData = { systemStatus: { fruit_coin: true }, processingRates: {} };
  client.state.orders = [
    { id: '1', remoteOrderId: 18294, category: 'fruit_coin', summary: 'Gói 10M Xu', sellPrice: 3000, status: 'assigned', isActive: true, totalCnt: 100, completedCnt: 68, createdAt: new Date(now).toISOString(), customer: { nickname: 'Niuubie5', suid: '7829' } },
    { id: '2', remoteOrderId: 18295, category: 'fruit_coin', summary: 'Gói 5M Xu', sellPrice: 2000, status: 'pending', isActive: false, totalCnt: 100, completedCnt: 0, createdAt: new Date(now).toISOString(), customer: { nickname: 'Player2', suid: '1111' } },
  ];
  const html = client.context.renderOrderCategoryPageHtml('fruit_coin');
  assert.match(html, /Đang chạy/);
  assert.match(html, /Chờ xử lý/);
  assert.match(html, /Tự động cập nhật tiến độ/);
  assert.doesNotMatch(html, />assigned<|>pending<|\(Active\)|\(Paused\)/);

  client.state.user.role = 'admin';
  client.state.catalogData.systemStatus = { fruit_coin: false, fruit_by_fruit: true };
  client.state.orderPage = { categoryStats: { completed_orders: 94, total_orders: 187 } };
  client.state.remoteSummaries = { fruit_coin: { completed_orders: 4, total_orders: 97, completed_fruit_units: 1029, total_fruit_units: 2237, completed_coin_units: 2503637177, total_coin_units: 5540000000 } };
  const adminHtml = client.context.renderOrderCategoryPageHtml('fruit_coin');
  assert.match(adminHtml, /Gửi xu · Không hoạt động/);
  assert.match(adminHtml, /Gửi trái cây · Đang hoạt động/);
  assert.match(adminHtml, /<strong>4<\/strong>\s*<span>\/ 97/);
  assert.match(adminHtml, /1\.029 \/ 2\.237/);
  assert.match(adminHtml, /2\.503\.637\.177 \/ 5\.540\.000\.000/);
});

test('on-demand customer snapshot endpoint enforces CTV isolation, caches responses, and includes daily fruit quota only for fruit orders', async t => {
  let now = Date.parse('2026-11-24T16:30:00Z');
  class Clock extends Date { static now() { return now; } }
  const hits = [];
  const server = await startTestServer(t, async url => {
    const u = new URL(url);
    hits.push(u.pathname);
    if (u.pathname === '/api/fruit-coin-orders' && u.searchParams.get('status_group') === 'completed') {
      return {
        ok: true, status: 200,
        json: async () => ({
          data: {
            current_page: 1, last_page: 1,
            data: [{
              id: 18334, customer_id: 43168, game_profile_id: 73066, total_price: 4000,
              status: 'completed', is_active: true, total_cnt: 10000000, completed_cnt: 10000000,
              customer: { id: 43168, nickname: 'QuaccXhamster', suid: '1080183253328797012' },
              game_profile: {
                id: 73066, nickname: 'QuaccXhamster', region: 'vn1', achievement_level: 13,
                photo_url: 'https://example.test/avatar.png', user_likes: 51, home_likes: 0,
                total_home_visit_count: 0, follower_count: 0, created_at: '2026-11-20T11:29:37Z',
              },
            }],
          },
        }),
      };
    }
    if (u.pathname === '/api/fruit-coin-orders/18334/daily-quota') {
      return { ok: true, status: 200, json: async () => ({ success: true, data: { used: 30, limit: 30, resets_at: '2026-11-25T07:00:00+07:00' } }) };
    }
    if (u.pathname === '/api/buff-tim-orders' && u.searchParams.get('status_group') === 'active') {
      return {
        ok: true, status: 200,
        json: async () => ({
          data: {
            current_page: 1, last_page: 1,
            data: [{
              id: 7001, customer_id: 9001, game_profile_id: 8001, total_price: 9000,
              status: 'assigned', is_active: true, total_cnt: 100, completed_cnt: 40,
              customer: { id: 9001, nickname: 'TimUser', suid: '999888' },
              game_profile: {
                id: 8001, nickname: 'TimUser', region: 'vn1', achievement_level: 25,
                user_likes: 120, home_likes: 12, total_home_visit_count: 8, follower_count: 4,
                created_at: '2026-11-24T10:00:00Z',
              },
            }],
          },
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ data: { current_page: 1, last_page: 1, data: [] } }) };
  }, {
    clock: Clock,
    seed(db) {
      db.localOrders.push(
        {
          id: 'ord-f1', remoteOrderId: 18334, category: 'fruit_coin', categoryName: 'Trái cây',
          summary: 'Gói 10.000.000 Xu', customer: { customerId: 43168, nickname: 'QuaccXhamster', suid: '1080183253328797012' },
          sellPrice: 6000, costPrice: 4000, status: 'completed', isActive: false, totalCnt: 10000000, completedCnt: 10000000,
          placedBy: { id: 'seller', name: 'Seller', role: 'ctv' }, createdAt: '2026-11-24T11:30:00Z',
        },
        {
          id: 'ord-t1', remoteOrderId: 7001, category: 'buff_tim', categoryName: 'Buff Tim',
          summary: 'Buff 100 Tim', customer: { customerId: 9001, nickname: 'TimUser', suid: '999888' },
          sellPrice: 12000, costPrice: 9000, status: 'assigned', isActive: true, totalCnt: 100, completedCnt: 40,
          placedBy: { id: 'owner', name: 'Owner', role: 'admin' }, createdAt: '2026-11-24T10:05:00Z',
        }
      );
    },
  });

  const seller = (await server.login('seller', 'seller-test-password')).body.token;
  const admin = (await server.login('owner', 'owner-test-password')).body.token;

  // CTV cannot inspect another user's order
  assert.equal((await server.request('/api/orders/buff_tim/7001/customer-snapshot', 'GET', seller)).status, 403);
  assert.equal(hits.length, 0);

  // CTV inspects their own fruit order: returns profile + dailyFruitQuota, hides source cost
  const fruitSnap = await server.request('/api/orders/fruit_coin/18334/customer-snapshot', 'GET', seller);
  assert.equal(fruitSnap.status, 200);
  assert.equal(fruitSnap.body.cached, false);
  assert.equal(fruitSnap.body.profile.nickname, 'QuaccXhamster');
  assert.equal(fruitSnap.body.profile.achievementLevel, 13);
  assert.equal(fruitSnap.body.profile.userLikes, 51);
  assert.deepEqual(fruitSnap.body.dailyFruitQuota, { used: 30, limit: 30, resetsAt: '2026-11-25T07:00:00+07:00' });
  assert.equal(fruitSnap.body.order.costPrice, undefined);
  assert.equal(fruitSnap.body.order.total_price, undefined);
  const hitsAfterFirst = hits.length;

  // Second view within 45s returns instantly from RAM cache (0 upstream hits)
  now += 10000;
  const fruitCached = await server.request('/api/orders/fruit_coin/18334/customer-snapshot', 'GET', seller);
  assert.equal(fruitCached.status, 200);
  assert.equal(fruitCached.body.cached, true);
  assert.equal(hits.length, hitsAfterFirst);

  // Admin inspects non-fruit order: returns profile without calling daily-quota
  const timSnap = await server.request('/api/orders/buff_tim/7001/customer-snapshot', 'GET', admin);
  assert.equal(timSnap.status, 200);
  assert.equal(timSnap.body.profile.nickname, 'TimUser');
  assert.equal(timSnap.body.profile.userLikes, 120);
  assert.equal(timSnap.body.dailyFruitQuota, null);
  assert.equal(hits.some(p => p.includes('7001/daily-quota')), false);

  // Eye button renders for both CTV and Admin across order pages
  const client = createClient();
  client.state.user = { id: 'seller', role: 'ctv', name: 'Seller', balance: 50000 };
  client.state.catalogData = { systemStatus: { fruit_coin: true }, processingRates: {} };
  client.state.orders = [{
    id: 'ord-f1', remoteOrderId: 18334, category: 'fruit_coin', summary: 'Gói 10M Xu', sellPrice: 6000,
    status: 'completed', isActive: false, totalCnt: 100, completedCnt: 100, createdAt: '2026-11-20T11:30:00Z',
    customer: { nickname: 'QuaccXhamster', suid: '1080183253328797012' },
  }];
  const ctvHtml = client.context.renderOrderCategoryPageHtml('fruit_coin');
  assert.match(ctvHtml, /data-view-order-customer="18334"/);
});

test('app versions follow vx.x.text, restrict editing to admin, show 3 latest releases, and hide all upstream branding', async t => {
  const server = await startTestServer(t, financeSource(), {
    seed: data => {
      data.auditLog = data.auditLog || [];
      data.auditLog.unshift({
        id: 'legacy-1',
        createdAt: new Date().toISOString(),
        actorId: 'owner',
        actorName: 'Admin',
        action: 'POST /api/admin/hoannguyen/reconnect',
        details: { note: 'Synced from https://hoannguyenplaytogether.com' },
      });
    },
  });
  const admin = (await server.login('owner', 'owner-test-password')).body.token;
  const seller = (await server.login('seller', 'seller-test-password')).body.token;

  // CTV cannot edit app versions
  const ctvEdit = await server.request('/api/admin/app-versions', 'PUT', seller, {
    appVersions: [{ version: 'v9.9.hack', date: '25/11/2026', highlights: ['Nope'] }],
  });
  assert.equal(ctvEdit.status, 403);

  // Admin rejects invalid version format (must be vx.x.text where x is number and text starts with letter)
  const badVer = await server.request('/api/admin/app-versions', 'PUT', admin, {
    appVersions: [{ version: 'v2.4.123', date: '25/11/2026', highlights: ['Invalid suffix'] }],
  });
  assert.equal(badVer.status, 400);

  // Admin saves 3 releases and upstream mentions in highlights are automatically scrubbed to Server Zn
  const updated = await server.request('/api/admin/app-versions', 'PUT', admin, {
    appVersions: [
      { version: 'v2.5.nova', date: '25/11/2026', highlights: ['Giao diện icon SVG mới', 'Đồng bộ trực tiếp với HoanNguyen'] },
      { version: 'v2.4.auros', date: '20/11/2026', highlights: ['Tối ưu bảng giá'] },
      { version: 'v2.3.stable', date: '15/11/2026', highlights: ['Thêm xem hồ sơ khách'] },
    ],
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.currentVersion, 'v2.5.nova');
  assert.equal(updated.body.appVersions.length, 3);
  assert.equal(updated.body.appVersions[0].highlights[1], 'Đồng bộ trực tiếp với Server Zn');

  // Ping, auth/me, overview, and monitor expose version info and never leak upstream brand or domain
  const ping = await server.request('/api/ping');
  assert.equal(ping.body.currentVersion, 'v2.5.nova');
  assert.equal(ping.body.appVersions.length, 3);

  const me = await server.request('/api/auth/me', 'GET', seller);
  assert.equal(me.body.currentVersion, 'v2.5.nova');
  assert.equal(me.body.appVersions.length, 3);

  const overview = await server.request('/api/admin/overview', 'GET', admin);
  assert.equal(overview.body.settings.appVersions[0].version, 'v2.5.nova');
  assert.doesNotMatch(JSON.stringify(overview.body), /hoannguyen|hoannguyenplaytogether/i);

  const monitor = await server.request('/api/admin/monitor', 'GET', admin);
  assert.doesNotMatch(JSON.stringify(monitor.body), /hoannguyen|hoannguyenplaytogether/i);
  assert.match(JSON.stringify(monitor.body.events), /Server Zn/);

  // Admin CTV view renders version editor panel
  const client = createClient();
  client.state.user = { id: 'owner', role: 'admin', name: 'Admin' };
  client.state.adminOverview = overview.body;
  const adminCtvHtml = client.context.renderAdminCtvPageHtml();
  assert.match(adminCtvHtml, /id="adminVersionManagerPanel"/);
  assert.match(adminCtvHtml, /v2\.5\.nova/);

  // Every SVG in index.html, app.js, tools.js must have explicit width and height attributes so no icon can expand unbounded
  const htmlRaw = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  for (const [fname, content] of [['index.html', htmlRaw], ['app.js', clientSource], ['tools.js', toolsSource]]) {
    const svgs = content.match(/<svg\b[^>]*>/gi) || [];
    for (const tag of svgs) {
      assert.match(tag, /\bwidth=/i, `SVG missing width in ${fname}: ${tag}`);
      assert.match(tag, /\bheight=/i, `SVG missing height in ${fname}: ${tag}`);
    }
  }
});

test('enriched identity lookup extracts full player profile fields and caches on-demand detail safely', async t => {
  const id = '791671405538107068';
  const gameCode = 'RMHG-XUHL-LMYC';
  const nickname = 'thwtraidisc';
  let detailCalls = 0;
  let searchCalls = 0;
  class RichGameSocket {
    constructor() { queueMicrotask(() => this.onopen()); }
    close() { }
    send(raw) {
      const req = JSON.parse(raw);
      if (req.type === 'profile_search') {
        searchCalls++;
        const frame = {
          type: 'profile_search_result',
          profiles: [{
            Nickname: nickname,
            suid: id,
            PhotoUrl: 'http://graph.facebook.com/12345/picture?height=196&width=196',
            PhotoID: 1,
            AchievementLevel: 19,
            Region: 'vn1',
            RegionName: 'Phố Việt',
            LastLogin: '25/11/2026 4:41:08 CH',
            IntroStr: '  Xin chào Play Together  ',
            Is_Online: true,
            Online_Status: 'Online',
            FacebookAccountID: 'secret-fb-id',
          }],
        };
        this.onmessage({ data: JSON.stringify(frame) });
      } else if (req.type === 'request_profile') {
        detailCalls++;
        const frame = {
          type: 'request_profile_result',
          profile: {
            UserSuid: id,
            FriendCount: 17,
            Profile: {
              Nickname: nickname,
              suid: id,
              PhotoUrl: 'https://graph.facebook.com/12345/picture?height=196&width=196',
              PhotoID: 1,
              AchievementLevel: 19,
              Region: 'vn1',
              LastLogin: '25/11/2026 4:41:08 CH',
              IntroStr: '  Xin chào Play Together  ',
              UserLikes: 1104248,
              HomeLikes: 1102836,
              FollowerCount: 1000,
              ProfileCount: {
                TodayProfileVisitCount: 212,
                TotalProfileVisitCount: 19163,
                TotalHomeVisitCount: 2098,
              },
            },
          },
        };
        setTimeout(() => this.onmessage({ data: JSON.stringify(frame) }), 15);
      }
    }
  }
  const server = await startTestServer(t, undefined, {
    WebSocket: RichGameSocket,
    seed(db) {
      db.settings.hoanNguyen.user = { id: 120 };
      db.users[1].balance = 0;
    },
  });
  const seller = (await server.login('seller', 'seller-test-password')).body.token;
  const admin = (await server.login('owner', 'owner-test-password')).body.token;

  // Name search returns enriched search metadata, upgrades avatar to HTTPS, omits private FB account ID
  const byName = await server.request('/api/tools/identity', 'POST', seller, { mode: 'name', query: nickname });
  assert.equal(byName.status, 200);
  assert.equal(searchCalls, 1);
  assert.equal(detailCalls, 0);
  const pName = byName.body.players[0];
  assert.equal(pName.nickname, nickname);
  assert.equal(pName.roleId, id);
  assert.equal(pName.gameCode, gameCode);
  assert.equal(pName.photoUrl, 'https://graph.facebook.com/12345/picture?height=196&width=196');
  assert.equal(pName.achievementLevel, 19);
  assert.equal(pName.region, 'vn1');
  assert.equal(pName.regionName, 'Phố Việt');
  assert.equal(pName.isOnline, true);
  assert.equal(pName.onlineStatus, 'Online');
  assert.equal(pName.lastLogin, '25/11/2026 4:41:08 CH');
  assert.equal(pName.intro, 'Xin chào Play Together');
  assert.equal('FacebookAccountID' in pName, false);

  // ID lookup immediately returns full profile metrics + inferred regionName
  const byId = await server.request('/api/tools/identity', 'POST', seller, { mode: 'id', query: gameCode });
  assert.equal(byId.status, 200);
  assert.equal(detailCalls, 1);
  const pId = byId.body.players[0];
  assert.equal(pId.hasFullProfile, true);
  assert.equal(pId.regionName, 'Phố Việt');
  assert.equal(pId.userLikes, 1104248);
  assert.equal(pId.homeLikes, 1102836);
  assert.equal(pId.followerCount, 1000);
  assert.equal(pId.friendCount, 17);
  assert.equal(pId.todayProfileVisitCount, 212);
  assert.equal(pId.totalProfileVisitCount, 19163);
  assert.equal(pId.totalHomeVisitCount, 2098);

  // On-demand detail endpoint requires auth, validates ID, deduplicates inflight calls, and serves 60s cache
  assert.equal((await server.request('/api/tools/identity/detail', 'POST', '', { roleId: id })).status, 401);
  assert.equal((await server.request('/api/tools/identity/detail', 'POST', seller, { roleId: '0' })).status, 400);
  const [d1, d2] = await Promise.all([
    server.request('/api/tools/identity/detail', 'POST', seller, { roleId: id }),
    server.request('/api/tools/identity/detail', 'POST', admin, { roleId: gameCode }),
  ]);
  assert.equal(d1.status, 200);
  assert.equal(d2.status, 200);
  assert.equal(detailCalls, 2); // Shared single inflight WS request across both callers
  const d3 = await server.request('/api/tools/identity/detail', 'POST', seller, { roleId: id });
  assert.equal(d3.status, 200);
  assert.equal(d3.body.cached, true);
  assert.equal(detailCalls, 2); // Served directly from cache without touching WS
  assert.equal(d3.body.player.userLikes, 1104248);
  assert.equal(d3.body.player.friendCount, 17);

  // Admin force refresh bypasses cache
  const dForce = await server.request('/api/tools/identity/detail', 'POST', admin, { roleId: id, force: true });
  assert.equal(dForce.status, 200);
  assert.equal(dForce.body.cached, false);
  assert.equal(detailCalls, 3);
  assert.equal(server.db.localOrders.length, 0);
  assert.equal(server.db.transactions.length, 0);
});

test('backup on-demand progress sync and white-label tracking link load only when refreshed and never leak secrets or prices', async t => {
  let now = Date.parse('2026-11-27T15:30:00Z');
  class Clock extends Date { static now() { return now; } }
  let orderHits = 0;
  let pauseHits = 0;
  let resumeHits = 0;
  let doneCount = 9;
  let remoteStatus = 'running';
  const s = await startTestServer(t, async (url) => {
    const u = new URL(url);
    if (u.origin === 'https://ptg.qzeen.dev') {
      if (u.pathname.endsWith('/services')) {
        return Response.json({ services: { weather: { enabled: true, maxPerOrder: 200, catalog: [{ productId: 90800006, name: 'Bão tuyết' }] } } });
      }
      if (u.pathname.endsWith('/quote')) return Response.json({ quote: { amount: 25650 } });
      if (u.pathname.endsWith('/orders')) {
        return Response.json({ paid: true, job: { id: 3519, service: 'weather', status: 'running', amount: 25650, params: { total: 100 } } });
      }
      if (u.pathname.endsWith('/order/pause')) {
        pauseHits += 1;
        remoteStatus = 'paused';
        return Response.json({ ok: true });
      }
      if (u.pathname.endsWith('/order/resume')) {
        resumeHits += 1;
        remoteStatus = 'running';
        return Response.json({ ok: true });
      }
      if (u.pathname.endsWith('/order') && u.searchParams.get('id') === '3519') {
        orderHits += 1;
        return Response.json({
          job: {
            id: 3519, service: 'weather', status: remoteStatus, amount: 25650, weatherLeft: 100 - doneCount,
            params: { total: 100, done: { '0': doneCount }, items: [{ productId: 90800006, count: 100 }] },
            progress: {
              steps: [{ productId: 90800006, name: 'Bão tuyết', target: 100, done: doneCount }],
              map: { khu: 278, inZone: true, population: 3, customersHere: 1, weather: { name: 'Bão tuyết', remainingSec: 160 } },
              pauseNote: 'Chi tiết tại https://ptg.qzeen.dev/xem.html#secret',
            },
          },
        });
      }
    }
    return Response.json({ data: { current_page: 1, last_page: 1, data: [] } });
  }, {
    clock: Clock,
    env: { QZEEN_API_KEY: 'mock-key-secret-xyz' },
    seed(db) {
      db.users[1].backupBalance = 50000;
      db.users.push({ id: 'other-ctv', username: 'otherctv', password: 'other-ctv-test-password', role: 'ctv', name: 'Other CTV', balance: 0, backupBalance: 0 });
      // Seed a legacy pre-existing backup order without backupTrackToken to verify lazy backfill
      db.localOrders.push({
        id: 'legacy-bk-1', remoteOrderId: 3519, category: 'backup_weather', categoryName: 'Dự phòng · Thuê buff thời tiết',
        summary: 'Thuê buff thời tiết · Bão tuyết × 100', customer: { nickname: 'LinhhSaDDBOY' },
        costPrice: 25650, markupAmount: 5000, sellPrice: 30650,
        placedBy: { id: 'seller', name: 'Seller', username: 'seller', role: 'ctv' },
        status: 'running', backupStatus: 'running', isActive: true, totalCnt: 100, completedCnt: 0,
        createdAt: new Date(now).toISOString(),
      });
    },
  });

  const admin = (await s.login('owner', 'owner-test-password')).body.token;
  const ctv = (await s.login('seller', 'seller-test-password')).body.token;
  const otherCtv = (await s.login('otherctv', 'other-ctv-test-password')).body.token;

  // 1. Listing backup orders backfills backupTrackUrl with 0 upstream calls and reports canPause=true
  const list1 = await s.request('/api/backup/orders', 'GET', ctv);
  assert.equal(list1.status, 200);
  assert.equal(orderHits, 0);
  assert.equal(list1.body.orders[0].canPause, true);
  assert.equal(list1.body.orders[0].canResume, false);
  const trackUrl = list1.body.orders[0].backupTrackUrl;
  assert.match(trackUrl, /^\/track\/backup\/[A-Za-z0-9_-]{16,64}$/);
  const trackToken = trackUrl.split('/').pop();

  // 2. Public tracking endpoint without ?refresh=1 reads cached DB state ONLY (0 upstream calls)
  const pubCached = await s.request('/api/public/backup-track/' + trackToken);
  assert.equal(pubCached.status, 200);
  assert.equal(pubCached.body.cached, true);
  assert.equal(orderHits, 0);
  assert.equal(pubCached.body.order.canPause, true);
  assert.equal(pubCached.body.order.canResume, false);
  assert.equal(pubCached.body.order.totalCnt, 100);
  assert.equal(pubCached.body.order.completedCnt, 0);
  assert.equal(pubCached.body.order.sellPrice, undefined);
  assert.equal(pubCached.body.order.costPrice, undefined);
  assert.equal(pubCached.body.order.placedBy, undefined);
  assert.doesNotMatch(JSON.stringify(pubCached.body), /30650|25650|mock-key|qzeen|hoannguyen|seller/i);

  // 3. Invalid or unknown tracking tokens return 404; forbidden action like cancel returns 400
  assert.equal((await s.request('/api/public/backup-track/invalid')).status, 404);
  assert.equal((await s.request('/api/public/backup-track/aaaaaaaaaaaaaaaaaaaaaa')).status, 404);
  assert.equal((await s.request('/api/public/backup-track/' + trackToken + '/cancel', 'POST', '', {})).status, 400);

  // 4. Clicking "Tải lại dữ liệu" (CTV refresh) fetches live progress (9/100) and obeys 4s CTV cache
  const ref1 = await s.request('/api/backup/orders/legacy-bk-1/refresh', 'POST', ctv, {});
  assert.equal(ref1.status, 200);
  assert.equal(ref1.body.cached, false);
  assert.equal(ref1.body.completedCnt, 9);
  assert.equal(ref1.body.totalCnt, 100);
  assert.equal(ref1.body.backupProgress.khu, 278);
  assert.equal(orderHits, 1);

  now += 2000;
  doneCount = 15;
  const ref2Ctv = await s.request('/api/backup/orders/legacy-bk-1/refresh', 'POST', ctv, {});
  assert.equal(ref2Ctv.status, 200);
  assert.equal(ref2Ctv.body.cached, true);
  assert.equal(orderHits, 1);

  // Admin has 2s cooldown, so Admin refresh at +2s fetches fresh 15/100!
  const ref2Admin = await s.request('/api/backup/orders/legacy-bk-1/refresh', 'POST', admin, {});
  assert.equal(ref2Admin.status, 200);
  assert.equal(ref2Admin.body.cached, false);
  assert.equal(ref2Admin.body.completedCnt, 15);
  assert.equal(orderHits, 2);

  // 5. Public tracking ?refresh=1 respects 8s shared cache, then fetches after 8s
  doneCount = 24;
  now += 3000;
  const pubStillCached = await s.request('/api/public/backup-track/' + trackToken + '?refresh=1');
  assert.equal(pubStillCached.status, 200);
  assert.equal(pubStillCached.body.cached, true);
  assert.equal(pubStillCached.body.order.completedCnt, 15);
  assert.equal(orderHits, 2);

  now += 6000;
  const pubFresh = await s.request('/api/public/backup-track/' + trackToken + '?refresh=1');
  assert.equal(pubFresh.status, 200);
  assert.equal(pubFresh.body.cached, false);
  assert.equal(pubFresh.body.order.completedCnt, 24);
  assert.equal(pubFresh.body.order.progress.steps[0].done, 24);
  assert.doesNotMatch(JSON.stringify(pubFresh.body), /30650|25650|mock-key|qzeen|hoannguyen|https?:\/\//i);
  assert.equal(orderHits, 3);

  // 6. Public tracking toggle (Tạm dừng / Bật chạy) works safely, obeys 3s cooldown, blocks terminal orders, and never leaks prices
  const pubPause = await s.request('/api/public/backup-track/' + trackToken + '/pause', 'POST', '', {});
  assert.equal(pubPause.status, 200);
  assert.equal(pubPause.body.changed, true);
  assert.equal(pubPause.body.order.backupStatus, 'paused');
  assert.equal(pubPause.body.order.canPause, false);
  assert.equal(pubPause.body.order.canResume, true);
  assert.equal(pauseHits, 1);
  assert.doesNotMatch(JSON.stringify(pubPause.body), /30650|25650|mock-key|qzeen|hoannguyen/i);

  // Rapid second toggle within 3s is rejected with 429
  const pubTooFast = await s.request('/api/public/backup-track/' + trackToken + '/resume', 'POST', '', {});
  assert.equal(pubTooFast.status, 429);
  assert.equal(resumeHits, 0);

  // After 3s, resume works and switches order back to running
  now += 3500;
  const pubResume = await s.request('/api/public/backup-track/' + trackToken + '/resume', 'POST', '', {});
  assert.equal(pubResume.status, 200);
  assert.equal(pubResume.body.changed, true);
  assert.equal(pubResume.body.order.backupStatus, 'running');
  assert.equal(pubResume.body.order.canPause, true);
  assert.equal(pubResume.body.order.canResume, false);
  assert.equal(resumeHits, 1);

  // 7. Authenticated CTV pause/resume enforces strict ownership (other CTV gets 404)
  assert.equal((await s.request('/api/backup/orders/legacy-bk-1/pause', 'POST', otherCtv, {})).status, 404);
  now += 3500;
  const ctvPause = await s.request('/api/backup/orders/legacy-bk-1/pause', 'POST', ctv, {});
  assert.equal(ctvPause.status, 200);
  assert.equal(pauseHits, 2);

  // Terminal order ("done") refuses pause/resume with 409
  now += 3500;
  remoteStatus = 'done';
  const doneToggle = await s.request('/api/public/backup-track/' + trackToken + '/resume', 'POST', '', {});
  assert.equal(doneToggle.status, 409);

  // 8. White-label HTML shell & minified track bundle serve cleanly while raw /track-backup.js is blocked
  const pageRes = await fetch(`${s.base}${trackUrl}`);
  assert.equal(pageRes.status, 200);
  const pageHtml = await pageRes.text();
  assert.match(pageHtml, /\/assets\/zn\.track\.js/);
  assert.match(pageHtml, /\/assets\/zn\.bundle\.css/);
  assert.doesNotMatch(pageHtml, /qzeen|hoannguyen/i);

  const trackJs = await fetch(`${s.base}/assets/zn.track.js`);
  assert.equal(trackJs.status, 200);
  const trackJsText = await trackJs.text();
  assert.match(trackJsText, /btnTrackSwitch/);
  assert.match(trackJsText, /btnTrackToggle/);
  assert.doesNotMatch(trackJsText, /qzeen|hoannguyen/i);
  assert.equal((await fetch(`${s.base}/track-backup.js`)).status, 404);

  // 9. Order History renders backup progress bar and tracking link with aligned cells
  const client = createClient();
  client.state.user = { id: 'seller', role: 'ctv', name: 'Seller', balance: 50000, backupBalance: 50000 };
  client.state.orders = [{
    id: 'legacy-bk-1', remoteOrderId: 3519, category: 'backup_weather', categoryName: 'Dự phòng · Thuê buff thời tiết',
    summary: 'Thuê buff thời tiết · Bão tuyết × 100', customer: { nickname: 'LinhhSaDDBOY' },
    sellPrice: 30650, status: 'running', backupStatus: 'running', statusText: 'Đang chạy',
    totalCnt: 100, completedCnt: 24, backupProgress: { unit: 'lần' }, backupTrackUrl: trackUrl,
    createdAt: new Date(now).toISOString(),
  }];
  const histHtml = client.context.renderOrderHistoryHtml();
  assert.match(histHtml, /24%/);
  assert.match(histHtml, /24\/100 lần/);
  assert.match(histHtml, /Mở link theo dõi/);
  const histTh = [...histHtml.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)];
  const histTbody = histHtml.match(/<tbody id="histOrdersTbody">([\s\S]*?)<\/tbody>/)[1];
  const histTds = [...histTbody.matchAll(/<td(?:\s[^>]*)?>/gi)];
  assert.equal(histTds.length, histTh.length);
});

test('external backup API orders sync strictly for Admin only with ZnStudio tracking links and zero CTV visibility or accounting distortion', async t => {
  let now = Date.parse('2026-11-27T16:15:00Z');
  class Clock extends Date { static now() { return now; } }
  let listHits = 0;
  let resumeHits = 0;
  let extStatus = 'ready';
  const s = await startTestServer(t, async (url) => {
    const u = new URL(url);
    if (u.origin === 'https://ptg.qzeen.dev') {
      if (u.pathname.endsWith('/orders')) {
        listHits += 1;
        return Response.json({
          items: [
            {
              id: 3545, service: 'weather', title: 'Thuê buff thời tiết', status: extStatus, amount: 35100,
              weatherLeft: 200, createdAt: 1795796022056, paidAt: 1795796022057,
              params: {
                charName: 'AlexChocoPie', charNames: ['AlexChocoPie'], total: 200, done: {},
                items: [
                  { productId: 90800002, count: 40, name: 'Bão' },
                  { productId: 90800006, count: 40, name: 'Bão tuyết' },
                  { productId: 90800008, count: 40, name: 'Cực quang' },
                  { productId: 90800007, count: 40, name: 'Ánh trăng' },
                  { productId: 90800011, count: 40, name: 'Gió cát' },
                ],
              },
              progress: { steps: null, inRoom: true },
            },
            {
              id: 3519, service: 'weather', title: 'Thuê buff thời tiết', status: 'running', amount: 25650,
              weatherLeft: 80, createdAt: 1795790607307, paidAt: 1795790607307,
              params: { charName: 'CtvPlayer', total: 100, done: { '0': 20 }, items: [{ productId: 90800006, count: 100, name: 'Bão tuyết' }] },
              progress: { steps: [{ name: 'Bão tuyết', target: 100, done: 20 }] },
            },
          ],
        });
      }
      if (u.pathname.endsWith('/order') && u.searchParams.get('id') === '3545') {
        return Response.json({
          job: {
            id: 3545, service: 'weather', status: extStatus, amount: 35100, weatherLeft: 200,
            params: { charName: 'AlexChocoPie', total: 200, done: {}, items: [{ productId: 90800002, count: 40, name: 'Bão' }] },
            progress: { steps: [{ name: 'Bão', target: 40, done: 0 }] },
          },
        });
      }
      if (u.pathname.endsWith('/order/resume')) {
        resumeHits += 1;
        extStatus = 'running';
        return Response.json({ ok: true });
      }
    }
    return Response.json({ data: { current_page: 1, last_page: 1, data: [] } });
  }, {
    clock: Clock,
    env: { QZEEN_API_KEY: 'mock-key-secret' },
    seed(db) {
      db.localOrders.push({
        id: 'ctv-bk-3519', remoteOrderId: 3519, category: 'backup_weather', categoryName: 'Dự phòng · Thuê buff thời tiết',
        summary: 'Thuê buff thời tiết · Bão tuyết × 100', customer: { nickname: 'CtvPlayer' },
        costPrice: 25650, markupAmount: 5000, sellPrice: 30650,
        placedBy: { id: 'seller', name: 'Seller', username: 'seller', role: 'ctv' },
        status: 'running', backupStatus: 'running', isActive: true, totalCnt: 100, completedCnt: 0,
        createdAt: new Date(1795790607307).toISOString(),
      });
    },
  });

  const admin = (await s.login('owner', 'owner-test-password')).body.token;
  const ctv = (await s.login('seller', 'seller-test-password')).body.token;

  // 1. CTV calling ?sync=1&force=1 NEVER triggers API sync and NEVER sees external orders
  const ctvBefore = await s.request('/api/backup/orders?sync=1&force=1', 'GET', ctv);
  assert.equal(ctvBefore.status, 200);
  assert.equal(listHits, 0);
  assert.deepEqual(ctvBefore.body.orders.map(o => o.remoteOrderId), [3519]);

  // 2. Admin calling ?sync=1 pulls #3545 into Admin list with persistent ZnStudio tracking link and deduplicates #3519
  const admList1 = await s.request('/api/backup/orders?sync=1', 'GET', admin);
  assert.equal(admList1.status, 200);
  assert.equal(listHits, 1);
  assert.deepEqual(admList1.body.orders.map(o => o.remoteOrderId), [3545, 3519]);
  const extOrder = admList1.body.orders[0];
  assert.equal(extOrder.id, 'BKS-3545');
  assert.equal(extOrder.externalSync, true);
  assert.equal(extOrder.sellPrice, null);
  assert.equal(extOrder.costPrice, undefined);
  assert.equal(extOrder.customer.nickname, 'AlexChocoPie');
  assert.equal(extOrder.totalCnt, 200);
  assert.equal(extOrder.canResume, true);
  assert.match(extOrder.backupTrackUrl, /^\/track\/backup\/[A-Za-z0-9_-]{16,64}$/);
  assert.doesNotMatch(JSON.stringify(admList1.body), /35100|mock-key|qzeen/i);

  // Syncing again keeps the exact same ZnStudio tracking token (shared links never break)
  now += 20000;
  const admList2 = await s.request('/api/backup/orders?sync=1', 'GET', admin);
  assert.equal(admList2.body.orders[0].backupTrackUrl, extOrder.backupTrackUrl);

  // 3. CTV STILL sees ONLY their own order #3519 and cannot control BKS-3545 (404)
  const ctvAfter = await s.request('/api/backup/orders?sync=1&force=1', 'GET', ctv);
  assert.deepEqual(ctvAfter.body.orders.map(o => o.remoteOrderId), [3519]);
  assert.equal((await s.request('/api/backup/orders/BKS-3545/refresh', 'POST', ctv, {})).status, 404);
  assert.equal((await s.request('/api/backup/orders/BKS-3545/resume', 'POST', ctv, {})).status, 404);

  // 4. Financial overview & monitor are completely unaffected by synced API order #3545
  const overview = await s.request('/api/admin/overview', 'GET', admin);
  assert.equal(overview.body.stats.totalLocalOrders, 1);
  assert.equal(overview.body.stats.totalRevenue, 30650);
  assert.equal(overview.body.stats.totalCost, 25650);

  // 5. Public ZnStudio tracking link for #3545 works and allows toggling Bật chạy without leaking prices/supplier
  const token3545 = extOrder.backupTrackUrl.split('/').pop();
  const pubView = await s.request('/api/public/backup-track/' + token3545);
  assert.equal(pubView.status, 200);
  assert.equal(pubView.body.order.remoteOrderId, 3545);
  assert.equal(pubView.body.order.customerNickname, 'AlexChocoPie');
  assert.equal(pubView.body.order.canResume, true);
  assert.doesNotMatch(JSON.stringify(pubView.body), /35100|mock-key|qzeen/i);

  const pubRun = await s.request('/api/public/backup-track/' + token3545 + '/resume', 'POST', '', {});
  assert.equal(pubRun.status, 200);
  assert.equal(resumeHits, 1);
  assert.equal(pubRun.body.order.backupStatus, 'running');
  assert.equal(pubRun.body.order.canPause, true);
});

test('buff_luot_xem supports scoped catalog sync, markup/override pricing, CTV order placement, live sync and Admin UI', async t => {
  const hitPaths = [];
  let createdPayload = null;
  let toggledId = null;
  let deletedId = null;
  const activeOrders = [
    {
      id: 33,
      customer_id: 44143,
      game_profile_id: null,
      price_package_id: 3,
      total_cnt: 1000,
      total_price: 15000,
      sending_cnt: 2,
      completed_cnt: 224,
      failed_cnt: 0,
      status: 'assigned',
      is_active: true,
      created_at: new Date().toISOString(),
      customer: { id: 44143, nickname: null, suid: '791671405587794844', role_id: 'MJ7Y-DV9L-LMYC' },
      game_profile: { nickname: 'ViewUser', region: 'vn1', achievement_level: 9, user_likes: 50, home_likes: 20, total_home_visit_count: 10, follower_count: 5, total_profile_visit_count: 1234, today_profile_visit_count: 88 },
    },
  ];
  const base = financeSource();
  const s = await startTestServer(t, async (url, options = {}) => {
    const u = new URL(url);
    const p = u.pathname;
    hitPaths.push(p);
    if (p === '/api/settings') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            is_send_task: true,
            is_send_bufftimorder: false,
            is_send_buffluotxemorder: true,
            is_send_buffsaoorder: true,
            is_send_fruitorder: true,
          },
        }),
      };
    }
    if (p === '/api/buff-luot-xem-price-packages') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            { id: 3, quantity: 1000, total_price: 15000, is_active: true },
            { id: 2, quantity: 500, total_price: 9000, is_active: true },
            { id: 9, quantity: 9999, total_price: 99999, is_active: false },
          ],
        }),
      };
    }
    if (p === '/api/tasks/processing-rate') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { buff_luot_xem_order: { assigned_rate: 0, completed_rate: 17.7, cooldown_second: 0 } },
        }),
      };
    }
    if (p === '/api/buff-luot-xem-orders' && options.method === 'POST') {
      createdPayload = JSON.parse(options.body);
      const next = {
        id: 88,
        customer_id: createdPayload.customer_id,
        price_package_id: createdPayload.price_package_id,
        total_cnt: 1000,
        total_price: 15000,
        completed_cnt: 0,
        status: 'pending',
        is_active: true,
        created_at: new Date().toISOString(),
        customer: { id: 101, nickname: 'Test customer', suid: 'test-suid' },
      };
      activeOrders.unshift(next);
      return { ok: true, status: 200, json: async () => ({ success: true, data: next }) };
    }
    if (p === '/api/buff-luot-xem-orders' && (!options.method || options.method === 'GET')) {
      const group = u.searchParams.get('status_group');
      const list = group === 'completed' ? [] : activeOrders;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { current_page: 1, last_page: 1, total: list.length, data: list },
          summary: { total_orders: list.length, active_orders: list.length, completed_orders: 0, inactive_orders: 0 },
        }),
      };
    }
    if (p === '/api/buff-luot-xem-orders/88/toggle-active' && options.method === 'PUT') {
      toggledId = 88;
      return { ok: true, status: 200, json: async () => ({ success: true, data: { id: 88, is_active: false, status: 'pending' } }) };
    }
    if (p === '/api/buff-luot-xem-orders/88' && options.method === 'DELETE') {
      deletedId = 88;
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }
    return base(url, options);
  }, {
    seed(data) {
      data.users.find(u => u.id === 'seller').balance = 100000;
    },
  });

  const admin = (await s.login('owner', 'owner-test-password')).body.token;
  const ctv = (await s.login('seller', 'seller-test-password')).body.token;

  // 1. Scoped catalog sync calls ONLY /api/settings + /api/buff-luot-xem-price-packages, sorts ascending & hides inactive
  hitPaths.length = 0;
  const scoped = await s.request('/api/catalog?refresh=1&scope=buff_luot_xem&compact=1', 'GET', ctv);
  assert.equal(scoped.status, 200);
  assert.equal(scoped.body.systemStatus.buff_luot_xem, true);
  assert.deepEqual([...new Set(hitPaths)].sort(), ['/api/buff-luot-xem-price-packages', '/api/settings']);
  assert.deepEqual(scoped.body.catalog.buff_luot_xem.map(p => [p.id, p.quantity, p.total_price]), [
    [2, 500, 14000],
    [3, 1000, 20000],
  ]);
  assert.equal(scoped.body.catalog.buff_luot_xem[0]._admin, undefined);

  // 2. Admin applies +% general rule and protected per-package markup override
  const setRes = await s.request('/api/admin/settings', 'PUT', admin, {
    categoryMarkupModes: { buff_luot_xem: 'percent' },
    categoryMarkupPercents: { buff_luot_xem: 20 },
    packageMarkupOverrides: { 'buff_luot_xem:3': { mode: 'fixed', value: 7000 } },
  });
  assert.equal(setRes.status, 200);
  const pricedCtv = await s.request('/api/catalog?scope=buff_luot_xem&compact=1', 'GET', ctv);
  assert.equal(pricedCtv.body.catalog.buff_luot_xem.find(p => p.id === 2).total_price, 10800); // 9000 * 1.2
  assert.equal(pricedCtv.body.catalog.buff_luot_xem.find(p => p.id === 3).total_price, 22000); // 15000 + 7000

  // 3. CTV places buff_luot_xem order -> exact upstream payload, wallet debit, and immediate totalCnt
  await s.request('/api/customer/resolve-role-id', 'POST', ctv, { role_id: 'TEST-1234' });
  const placed = await s.request('/api/orders/place', 'POST', ctv, {
    category: 'buff_luot_xem',
    customer_id: 101,
    game_profile_id: null,
    price_package_id: 3,
    expected_price: 22000,
    idempotency_key: crypto.randomUUID(),
  });
  assert.equal(placed.status, 200);
  assert.deepEqual(createdPayload, {
    customer_id: 101,
    price_package_id: 3,
    is_active: true,
    confirm_duplicate_customer: false,
  });
  assert.equal(placed.body.order.totalCnt, 1000);
  assert.equal(placed.body.order.sellPrice, 22000);
  assert.equal(placed.body.userBalance, 78000);

  // 4. Scoped CTV order view returns only CTV's own order (never Admin's external order #33), Admin sees both (#88 and #33 with role_id fallback)
  hitPaths.length = 0;
  const ctvOrders = await s.request('/api/orders?category=buff_luot_xem&live=1&limit=20', 'GET', ctv);
  assert.equal(ctvOrders.status, 200);
  assert.deepEqual(ctvOrders.body.orders.map(o => o.remoteOrderId), [88]);
  assert.deepEqual([...new Set(hitPaths)], ['/api/buff-luot-xem-orders']);

  const admOrders = await s.request('/api/orders?category=buff_luot_xem&limit=20', 'GET', admin);
  assert.equal(admOrders.status, 200);
  assert.ok(admOrders.body.orders.some(o => o.remoteOrderId === 88));
  const synced33 = admOrders.body.orders.find(o => o.remoteOrderId === 33);
  assert.ok(synced33);
  assert.equal(synced33.customer.nickname, 'MJ7Y-DV9L-LMYC');
  assert.equal(synced33.summary, 'Buff 1.000 Lượt xem');

  // 5. Customer snapshot includes totalProfileVisitCount and isolates CTV from order #33
  assert.equal((await s.request('/api/orders/buff_luot_xem/33/customer-snapshot', 'GET', ctv)).status, 403);
  const snap33 = await s.request('/api/orders/buff_luot_xem/33/customer-snapshot', 'GET', admin);
  assert.equal(snap33.status, 200);
  assert.equal(snap33.body.profile.totalProfileVisitCount, 1234);

  // 6. CTV can toggle own order, cannot delete; Admin delete removes order and auto-refunds 22,000đ to CTV wallet
  assert.equal((await s.request('/api/orders/buff_luot_xem/88/toggle-active', 'PUT', ctv)).status, 200);
  assert.equal(toggledId, 88);
  assert.equal((await s.request('/api/orders/buff_luot_xem/88', 'DELETE', ctv)).status, 403);
  const delRes = await s.request('/api/orders/buff_luot_xem/88', 'DELETE', admin);
  assert.equal(delRes.status, 200);
  assert.equal(deletedId, 88);
  assert.equal(delRes.body.refundedAmount, 22000);
  assert.equal(s.db.users.find(u => u.id === 'seller').balance, 100000);

  // 7. Client UI renders sidebar entry, dashboard card, order category page and admin per-package editor button
  const indexHtml = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert.match(indexHtml, /data-view="buff_luot_xem"/);
  assert.match(indexHtml, /id="dot_buff_luot_xem"/);
  const fullAdmCatalog = (await s.request('/api/catalog?refresh=1', 'GET', admin)).body;
  const client = createClient();
  client.state.user = { role: 'admin', name: 'Owner' };
  client.state.catalogData = fullAdmCatalog;
  client.state.adminOverview = (await s.request('/api/admin/overview', 'GET', admin)).body;
  client.state.adminPricingTab = 'categories';
  const pricingHtml = vm.runInContext('renderAdminPricingPageHtml()', client.context);
  assert.match(pricingHtml, /data-cat-card="buff_luot_xem"/);
  assert.match(pricingHtml, /data-open-cat-pkgs="buff_luot_xem"/);
  const catPageHtml = vm.runInContext('renderOrderCategoryPageHtml("buff_luot_xem")', client.context);
  assert.match(catPageHtml, /Đơn Buff Lượt Xem Hồ Sơ/);
  assert.match(catPageHtml, /17\.7 lượt xem\/phút/);
});

test('backup orders support limit/offset pagination, status filter, finished-only delete/clear for Admin and CTV without losing accounting or resurrecting API orders', async t => {
  let now = Date.parse('2026-11-28T09:00:00Z');
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const s = await startTestServer(t, async (url) => {
    const u = new URL(url);
    if (u.origin === 'https://ptg.qzeen.dev' && u.pathname.endsWith('/orders')) {
      return Response.json({
        items: [
          { id: 4010, service: 'guide', status: 'done', amount: 15000, createdAt: now - 1000, paidAt: now - 1000, params: { charName: 'ExtDone1', bots: 5, minutes: 30 } },
          { id: 4011, service: 'guide', status: 'done', amount: 15000, createdAt: now - 2000, paidAt: now - 2000, params: { charName: 'ExtDone2', bots: 5, minutes: 30 } },
          { id: 4012, service: 'guide', status: 'running', amount: 15000, createdAt: now - 3000, paidAt: now - 3000, params: { charName: 'ExtRun1', bots: 5, minutes: 30 } },
        ],
      });
    }
    return Response.json({ data: { current_page: 1, last_page: 1, data: [] } });
  }, {
    clock: Clock,
    env: { QZEEN_API_KEY: 'mock-key-secret' },
    seed(db) {
      db.localOrders.push(
        { id: 'bk-ctv-run', remoteOrderId: 4001, category: 'backup_guide', categoryName: 'Dự phòng · Thuê dắt thẻ', summary: 'Thuê dắt thẻ · 5 bot · 30 phút', customer: { nickname: 'CtvRun' }, costPrice: 10000, markupAmount: 5000, sellPrice: 15000, placedBy: { id: 'seller', name: 'Seller', role: 'ctv' }, status: 'running', backupStatus: 'running', isActive: true, totalCnt: 30, completedCnt: 10, createdAt: new Date(now - 500).toISOString() },
        { id: 'bk-ctv-done1', remoteOrderId: 4002, category: 'backup_guide', categoryName: 'Dự phòng · Thuê dắt thẻ', summary: 'Thuê dắt thẻ · 5 bot · 30 phút', customer: { nickname: 'CtvDone1' }, costPrice: 10000, markupAmount: 5000, sellPrice: 15000, placedBy: { id: 'seller', name: 'Seller', role: 'ctv' }, status: 'completed', backupStatus: 'done', isActive: false, totalCnt: 30, completedCnt: 30, createdAt: new Date(now - 4000).toISOString() },
        { id: 'bk-ctv-done2', remoteOrderId: 4003, category: 'backup_guide', categoryName: 'Dự phòng · Thuê dắt thẻ', summary: 'Thuê dắt thẻ · 5 bot · 30 phút', customer: { nickname: 'CtvDone2' }, costPrice: 10000, markupAmount: 5000, sellPrice: 15000, placedBy: { id: 'seller', name: 'Seller', role: 'ctv' }, status: 'failed', backupStatus: 'failed', isActive: false, totalCnt: 30, completedCnt: 0, createdAt: new Date(now - 5000).toISOString() },
        { id: 'bk-ctv-done3', remoteOrderId: 4004, category: 'backup_guide', categoryName: 'Dự phòng · Thuê dắt thẻ', summary: 'Thuê dắt thẻ · 5 bot · 30 phút', customer: { nickname: 'CtvDone3' }, costPrice: 10000, markupAmount: 5000, sellPrice: 15000, placedBy: { id: 'seller', name: 'Seller', role: 'ctv' }, status: 'completed', backupStatus: 'done', isActive: false, totalCnt: 30, completedCnt: 30, createdAt: new Date(now - 6000).toISOString() },
        { id: 'bk-adm-done', remoteOrderId: 4005, category: 'backup_emptymap', categoryName: 'Dự phòng · Thuê map trống', summary: 'Thuê map trống', customer: { nickname: 'AdmDone' }, costPrice: 5000, markupAmount: 2000, sellPrice: 7000, placedBy: { id: 'owner', name: 'Owner', role: 'admin' }, status: 'completed', backupStatus: 'done', isActive: false, totalCnt: 1, completedCnt: 1, createdAt: new Date(now - 7000).toISOString() },
        { id: 'bk-ctv-done4', remoteOrderId: 4006, category: 'backup_guide', categoryName: 'Dự phòng · Thuê dắt thẻ', summary: 'Thuê dắt thẻ · 5 bot · 30 phút', customer: { nickname: 'CtvDone4' }, costPrice: 10000, markupAmount: 5000, sellPrice: 15000, placedBy: { id: 'seller', name: 'Seller', role: 'ctv' }, status: 'completed', backupStatus: 'done', isActive: false, totalCnt: 30, completedCnt: 30, createdAt: new Date(now - 8000).toISOString() },
        { id: 'bk-ctv-done5', remoteOrderId: 4007, category: 'backup_guide', categoryName: 'Dự phòng · Thuê dắt thẻ', summary: 'Thuê dắt thẻ · 5 bot · 30 phút', customer: { nickname: 'CtvDone5' }, costPrice: 10000, markupAmount: 5000, sellPrice: 15000, placedBy: { id: 'seller', name: 'Seller', role: 'ctv' }, status: 'completed', backupStatus: 'done', isActive: false, totalCnt: 30, completedCnt: 30, createdAt: new Date(now - 9000).toISOString() },
      );
    },
  });

  const admin = (await s.login('owner', 'owner-test-password')).body.token;
  const ctv = (await s.login('seller', 'seller-test-password')).body.token;

  // 1. CTV pagination: limit=5 offset=0 returns 5 newest of 6 own orders with hasMore=true; offset=5 returns remaining 1
  const ctvP1 = await s.request('/api/backup/orders?limit=5&offset=0', 'GET', ctv);
  assert.equal(ctvP1.status, 200);
  assert.equal(ctvP1.body.orders.length, 5);
  assert.equal(ctvP1.body.total, 6);
  assert.equal(ctvP1.body.totalAll, 6);
  assert.equal(ctvP1.body.activeCount, 1);
  assert.equal(ctvP1.body.finishedCount, 5);
  assert.equal(ctvP1.body.hasMore, true);
  assert.equal(ctvP1.body.orders[0].canDelete, false); // running
  assert.equal(ctvP1.body.orders[1].canDelete, true);  // done

  const ctvP2 = await s.request('/api/backup/orders?limit=5&offset=5', 'GET', ctv);
  assert.equal(ctvP2.body.orders.length, 1);
  assert.equal(ctvP2.body.hasMore, false);
  assert.equal(ctvP2.body.orders[0].remoteOrderId, 4007);

  // Status filters work cleanly
  const ctvActive = await s.request('/api/backup/orders?limit=5&status=active', 'GET', ctv);
  assert.deepEqual(ctvActive.body.orders.map(o => o.remoteOrderId), [4001]);

  // 2. Running order CANNOT be deleted (409) by CTV or Admin; CTV cannot delete Admin's order (404)
  assert.equal((await s.request('/api/backup/orders/bk-ctv-run', 'DELETE', ctv)).status, 409);
  assert.equal((await s.request('/api/backup/orders/bk-ctv-run', 'DELETE', admin)).status, 409);
  assert.equal((await s.request('/api/backup/orders/bk-adm-done', 'DELETE', ctv)).status, 404);

  // 3. CTV deletes single finished order & bulk-clears remaining finished orders -> leaves ONLY running order for CTV
  const ctvDel1 = await s.request('/api/backup/orders/bk-ctv-done1', 'DELETE', ctv);
  assert.equal(ctvDel1.status, 200);
  const ctvClear = await s.request('/api/backup/orders/clear-finished', 'POST', ctv, {});
  assert.equal(ctvClear.status, 200);
  assert.equal(ctvClear.body.removedCount, 4);
  const ctvAfter = await s.request('/api/backup/orders?limit=5', 'GET', ctv);
  assert.deepEqual(ctvAfter.body.orders.map(o => o.remoteOrderId), [4001]);
  assert.equal(ctvAfter.body.finishedCount, 0);

  // 4. Admin STILL sees ALL 7 local orders + 3 external API orders (10 total) AND full financial accounting is 100% preserved!
  const admSync = await s.request('/api/backup/orders?limit=5&offset=0&sync=1', 'GET', admin);
  assert.equal(admSync.status, 200);
  assert.equal(admSync.body.totalAll, 10);
  assert.equal(admSync.body.activeCount, 2);   // 4001 + 4012
  assert.equal(admSync.body.finishedCount, 8);
  assert.equal(admSync.body.orders.length, 5);
  assert.equal(admSync.body.hasMore, true);

  // 5. Admin deletes finished external API order BKS-4010 and clears remaining 7 finished orders -> only 2 active orders remain!
  assert.equal((await s.request('/api/backup/orders/BKS-4012', 'DELETE', admin)).status, 409); // running external order blocked
  assert.equal((await s.request('/api/backup/orders/BKS-4010', 'DELETE', admin)).status, 200);
  const admClear = await s.request('/api/backup/orders/clear-finished', 'POST', admin, {});
  assert.equal(admClear.status, 200);
  assert.equal(admClear.body.removedCount, 7);

  // 6. Re-syncing with ?sync=1&force=1 does NOT resurrect deleted finished external orders (4010, 4011) or hidden local orders!
  now += 20000;
  const admAfterSync = await s.request('/api/backup/orders?limit=5&sync=1&force=1', 'GET', admin);
  assert.equal(admAfterSync.body.totalAll, 2);
  assert.deepEqual(admAfterSync.body.orders.map(o => o.remoteOrderId), [4001, 4012]);

  // 7. Admin Monitor & Overview STILL retain all 7 local orders for exact revenue/profit reconciliation!
  const overview = await s.request('/api/admin/overview', 'GET', admin);
  assert.equal(overview.body.stats.totalLocalOrders, 7);
  assert.equal(overview.body.stats.totalRevenue, 97000);
  assert.equal(overview.body.stats.totalProfit, 32000);
});

test('read-only POST lookups skip persistent DB writes while recording RAM monitor events, and long-term ledger compaction preserves exact balances', async t => {
  const now = Date.parse('2026-11-28T09:00:00Z');
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const oldIso = new Date(now - 120 * 24 * 60 * 60 * 1000).toISOString(); // 120 days ago
  const recentIso = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days ago

  const base = financeSource();
  class MockGameSocket {
    constructor() { setTimeout(() => this.onopen?.(), 0); }
    send(raw) {
      const msg = JSON.parse(raw);
      if (msg.type === 'profile_search') {
        this.onmessage?.({ data: JSON.stringify({ type: 'profile_search_result', profiles: [{ suid: '123456', Nickname: 'SpeedPlayer', Region: 'vn1', AchievementLevel: 10 }] }) });
      }
    }
    close() { }
  }
  const s = await startTestServer(t, async (url, options = {}) => {
    const u = new URL(url);
    if (u.origin === 'https://ptg.qzeen.dev') {
      if (u.pathname.endsWith('/services')) return Response.json({ services: { emptymap: { enabled: true, free: 2 } } });
      if (u.pathname.endsWith('/quote')) return Response.json({ quote: { amount: 2000 } });
    }
    return base(url, options);
  }, {
    clock: Clock,
    WebSocket: MockGameSocket,
    env: { QZEEN_API_KEY: 'mock-key' },
    seed(db) {
      db.settings.hoanNguyen.user = { id: 7 };
      const seller = db.users.find(u => u.id === 'seller');
      // Build 5,020 transactions:
      // - 2,000 recent (<90d): 2,000 x (-10đ) main order_debit = -20,000đ
      // - 1 old open order_hold (-5,000đ) -> MUST NOT be compacted
      // - 1 old tx linked to an open localOrder (-10,000đ) -> MUST NOT be compacted
      // - 3,018 old settled transactions (>90d):
      //     - 1 old main topup: +500,000đ
      //     - 1 old backup topup: +200,000đ
      //     - 1 old backup debit: -40,000đ
      //     - 1 old main deduct: -15,000đ
      //     - 3,014 old main order_debits: 3,014 x (-100đ) = -301,400đ
      // Net expected main balance: 500,000 - 15,000 - 301,400 - 20,000 - 5,000 - 10,000 = 148,600đ
      // Net expected backup balance: 200,000 - 40,000 = 160,000đ
      seller.balance = 148600;
      seller.backupBalance = 160000;
      db.localOrders.push({
        id: 'open-linked-order', intentId: 'tx-open-linked', remoteOrderId: 999, category: 'buff_tim',
        sellPrice: 10000, costPrice: 5000, status: 'pending', placedBy: { id: 'seller', name: 'Seller', role: 'ctv' },
        createdAt: oldIso,
      });
      const txs = [];
      for (let i = 0; i < 2000; i++) {
        txs.push({ id: `tx-rec-${i}`, userId: 'seller', userName: 'Seller', wallet: 'main', type: 'order_debit', amount: -10, balanceAfter: 148600, note: 'Recent', createdAt: recentIso });
      }
      txs.push({ id: 'tx-old-hold', userId: 'seller', userName: 'Seller', wallet: 'main', type: 'order_hold', amount: -5000, balanceAfter: 168600, note: 'Pending hold', createdAt: oldIso });
      txs.push({ id: 'tx-open-linked', userId: 'seller', userName: 'Seller', wallet: 'main', type: 'order_debit', amount: -10000, balanceAfter: 173600, note: 'Linked open order', createdAt: oldIso });
      txs.push({ id: 'tx-old-topup', userId: 'seller', userName: 'Seller', wallet: 'main', type: 'admin_topup', amount: 500000, balanceAfter: 500000, note: 'Old topup', createdAt: oldIso });
      txs.push({ id: 'tx-old-bk-topup', userId: 'seller', userName: 'Seller', wallet: 'backup', source: 'backup', type: 'admin_topup', amount: 200000, balanceAfter: 200000, note: 'Old DP topup', createdAt: oldIso });
      txs.push({ id: 'tx-old-bk-debit', userId: 'seller', userName: 'Seller', wallet: 'backup', source: 'backup', type: 'order_debit', amount: -40000, balanceAfter: 160000, note: 'Old DP debit', createdAt: oldIso });
      txs.push({ id: 'tx-old-deduct', userId: 'seller', userName: 'Seller', wallet: 'main', type: 'admin_deduct', amount: -15000, balanceAfter: 485000, note: 'Old deduct', createdAt: oldIso });
      for (let i = 0; i < 3014; i++) {
        txs.push({ id: `tx-old-${i}`, userId: 'seller', userName: 'Seller', wallet: 'main', type: 'order_debit', amount: -100, balanceAfter: 183600, note: 'Old order', createdAt: oldIso });
      }
      db.transactions = txs;
    },
  });

  // 1. Startup compaction folded the 3,016 old debits/deducts into ledgerRollups while keeping 2,000 recent + 2 protected + 2 admin_topup entries!
  assert.equal(s.db.transactions.length, 2004);
  assert.ok(s.db.transactions.some(tx => tx.id === 'tx-old-hold'));
  assert.ok(s.db.transactions.some(tx => tx.id === 'tx-open-linked'));
  assert.ok(s.db.transactions.some(tx => tx.id === 'tx-old-topup'));
  assert.ok(s.db.transactions.some(tx => tx.id === 'tx-old-bk-topup'));
  assert.equal(s.db.ledgerRollups.seller.archivedCount, 3016);

  const admin = (await s.login('owner', 'owner-test-password')).body.token;
  const ctv = (await s.login('seller', 'seller-test-password')).body.token;

  // 2. Reconciliation in Admin Monitor, per-CTV detail & CTV settlements matches to the exact single đồng (unaccountedBalance === 0)!
  const mon = (await s.request('/api/admin/monitor', 'GET', admin)).body;
  assert.deepEqual(mon.walletTotals, { totalTopup: 500000, totalSpent: 331400, balance: 148600 });
  assert.equal(mon.backupTopup, 200000);
  assert.equal(mon.backupSpent, 40000);
  assert.equal(mon.backupHeld, 0);
  assert.equal(mon.backupBalance, 160000);

  const det = (await s.request('/api/admin/monitor/ctv/seller', 'GET', admin)).body;
  assert.equal(det.summary.unaccountedBalance, 0);
  assert.equal(det.summary.totalTopup, 500000);
  assert.equal(det.summary.totalSpent, 331400);
  assert.equal(det.summary.held, 5000);
  assert.equal(det.summary.deducted, 15000);
  assert.equal(det.summary.backupTopup, 200000);
  assert.equal(det.summary.backupSpent, 40000);

  const settle = (await s.request('/api/settlements', 'GET', ctv)).body;
  assert.equal(settle.summary.mainSpent, 331400);
  assert.equal(settle.summary.backupSpent, 40000);
  assert.equal(settle.summary.totalSpent, 371400);

  // 3. Export + import backup preserves ledgerRollups with 0đ drift
  const exported = (await s.request('/api/admin/backup/export', 'GET', admin)).body.backup;
  assert.equal(exported.ledgerRollups.seller.archivedCount, 3016);
  const imported = await s.request('/api/admin/backup/import', 'POST', admin, { backup: exported });
  assert.equal(imported.status, 200);
  const detAfterImport = (await s.request('/api/admin/monitor/ctv/seller', 'GET', admin)).body;
  assert.equal(detAfterImport.summary.unaccountedBalance, 0);

  // 4. Read-only POST lookups perform ZERO persistent DB writes while still appearing in live Admin Monitor events!
  const writesBeforeLookups = s.getWriteCount();
  assert.equal((await s.request('/api/tools/identity', 'POST', ctv, { mode: 'name', query: 'SpeedPlayer' })).status, 200);
  assert.equal((await s.request('/api/customer/search-ingame', 'POST', ctv, { nickname: 'SpeedPlayer' })).status, 200);
  assert.equal((await s.request('/api/customer/resolve-role-id', 'POST', ctv, { role_id: 'TEST-1234' })).status, 200);
  assert.equal((await s.request('/api/catalog/preview-fruit', 'POST', ctv, { fruit_item_id: 1, total_cnt: 10, mutation_list: [] })).status, 200);
  assert.equal((await s.request('/api/backup/quote', 'POST', ctv, { category: 'backup_emptymap' })).status, 200);
  assert.equal(s.getWriteCount(), writesBeforeLookups); // ZERO DB writes across all 5 read-only POSTs!

  const liveEvents = (await s.request('/api/admin/monitor', 'GET', admin)).body.events;
  assert.ok(liveEvents.some(e => e.action === 'POST /tools/identity'));
  assert.ok(liveEvents.some(e => e.action === 'POST /backup/quote'));

  // 5. Real financial mutations STILL write immediately to persistent storage
  const adj = await s.request('/api/admin/ctv/seller/balance', 'POST', admin, {
    wallet: 'main', amount: 1000, note: 'Test persist', idempotency_key: crypto.randomUUID(),
  });
  assert.equal(adj.status, 200);
  assert.ok(s.getWriteCount() > writesBeforeLookups);
});

test('per-category CTV visibility toggles hide categories securely for CTV while keeping Admin access intact', async t => {
  const base = financeSource();
  let upstreamOrderCalls = 0;
  let backupQuoteCalls = 0;
  let backupCreateCalls = 0;
  const s = await startTestServer(t, async (url, options = {}) => {
    const u = new URL(url);
    if (u.origin === 'https://ptg.qzeen.dev') {
      if (u.pathname.endsWith('/services')) {
        return Response.json({ services: { emptymap: { enabled: true, free: 4 }, guide: { enabled: true, minMinutes: 10, maxHours: 2, maxBots: 10 } } });
      }
      if (u.pathname.endsWith('/quote')) {
        backupQuoteCalls += 1;
        return Response.json({ quote: { amount: 2500 } });
      }
      if (u.pathname.endsWith('/orders') && options.method === 'POST') {
        backupCreateCalls += 1;
        return Response.json({ orderId: 901, amount: 2500, status: 'queued' });
      }
    }
    if (u.pathname === '/api/buff-tim-orders' && options.method === 'POST') {
      upstreamOrderCalls += 1;
    }
    return base(url, options);
  }, {
    env: { QZEEN_API_KEY: 'mock-key' },
    seed(db) {
      const seller = db.users.find(u => u.id === 'seller');
      seller.balance = 500000;
      seller.backupBalance = 500000;
    },
  });

  const admin = (await s.login('owner', 'owner-test-password')).body.token;
  const ctvLogin = await s.login('seller', 'seller-test-password');
  const ctv = ctvLogin.body.token;
  assert.deepEqual(ctvLogin.body.hiddenCategories, {});

  // 1. Security: CTV cannot toggle hiddenCategories; invalid keys or non-boolean values are rejected
  assert.equal((await s.request('/api/admin/settings', 'PUT', ctv, { hiddenCategories: { buff_tim: true } })).status, 403);
  assert.equal((await s.request('/api/admin/settings', 'PUT', admin, { hiddenCategories: { __proto__: true, bad_key: true } })).status, 400);
  assert.equal((await s.request('/api/admin/settings', 'PUT', admin, { hiddenCategories: { buff_tim: 'yes' } })).status, 400);

  // 2. Admin hides buff_tim, fruit_by_fruit, and backup_emptymap
  const pingBefore = (await s.request('/api/ping')).body;
  assert.equal(pingBefore.hiddenCategories, undefined); // public /api/ping never leaks category names

  const hideRes = await s.request('/api/admin/settings', 'PUT', admin, {
    hiddenCategories: { buff_tim: true, fruit_by_fruit: true, backup_emptymap: true },
  });
  assert.equal(hideRes.status, 200);
  assert.deepEqual(hideRes.body.hiddenCategories, { buff_tim: true, fruit_by_fruit: true, backup_emptymap: true });

  const pingAfter = (await s.request('/api/ping')).body;
  assert.ok(pingAfter.visibilityVersion > pingBefore.visibilityVersion);
  assert.equal(pingAfter.hiddenCategories, undefined);

  // 3. CTV receives stripped catalog for hidden categories, while non-hidden fruit_coin remains visible
  const meCtv = (await s.request('/api/auth/me', 'GET', ctv)).body;
  assert.deepEqual(meCtv.hiddenCategories, { buff_tim: true, fruit_by_fruit: true, backup_emptymap: true });

  const ctvCat = (await s.request('/api/catalog', 'GET', ctv)).body;
  assert.deepEqual(ctvCat.catalog.buff_tim, []);
  assert.deepEqual(ctvCat.catalog.fruit_by_fruit, []);
  assert.deepEqual(ctvCat.mutations, {});
  assert.ok(ctvCat.catalog.fruit_coin.length > 0);

  // Admin STILL sees full packages for hidden categories
  const admCat = (await s.request('/api/catalog', 'GET', admin)).body;
  assert.ok(admCat.catalog.buff_tim.length > 0);
  assert.ok(admCat.catalog.fruit_by_fruit.length > 0);

  // 4. CTV is blocked on preview-fruit and order placement for hidden categories with ZERO debit & ZERO upstream calls
  const ctvFruitPreview = await s.request('/api/catalog/preview-fruit', 'POST', ctv, { fruit_item_id: 1, total_cnt: 10, mutation_list: [] });
  assert.equal(ctvFruitPreview.status, 403);
  assert.equal(ctvFruitPreview.body.code, 'CATEGORY_HIDDEN');
  assert.equal(ctvFruitPreview.body.message, 'Zn đang ẩn danh mục này');

  const ctvPlaceHidden = await s.request('/api/orders/place', 'POST', ctv, {
    category: 'buff_tim',
    customer_id: 101,
    game_profile_id: 201,
    price_package_id: 7,
    idempotency_key: 'hide-test-ctv-buff-tim-1',
  });
  assert.equal(ctvPlaceHidden.status, 403);
  assert.equal(ctvPlaceHidden.body.code, 'CATEGORY_HIDDEN');
  assert.equal(ctvPlaceHidden.body.message, 'Zn đang ẩn danh mục này');
  assert.equal(upstreamOrderCalls, 0);
  assert.equal(s.db.users.find(u => u.id === 'seller').balance, 500000);

  // Admin can STILL place buff_tim order even while hidden from CTV
  const admPlaceHidden = await s.request('/api/orders/place', 'POST', admin, {
    category: 'buff_tim',
    customer_id: 101,
    game_profile_id: 201,
    price_package_id: 7,
    expected_price: admCat.catalog.buff_tim[0].total_price,
    idempotency_key: 'hide-test-adm-buff-tim-1',
  });
  assert.equal(admPlaceHidden.status, 200);
  assert.equal(upstreamOrderCalls, 1);

  // 5. Backup services hide emptymap for CTV (strips free count + blocks quote/order) while Admin retains full access
  const ctvBkSvc = (await s.request('/api/backup/services', 'GET', ctv)).body;
  const ctvEmpty = ctvBkSvc.services.find(x => x.key === 'emptymap');
  const ctvGuide = ctvBkSvc.services.find(x => x.key === 'guide');
  assert.equal(ctvEmpty.hiddenByZn, true);
  assert.equal(ctvEmpty.enabled, false);
  assert.equal(ctvEmpty.free, undefined);
  assert.equal(ctvGuide.hiddenByZn, false);
  assert.equal(ctvGuide.enabled, true);

  const admBkSvc = (await s.request('/api/backup/services', 'GET', admin)).body;
  const admEmpty = admBkSvc.services.find(x => x.key === 'emptymap');
  assert.equal(admEmpty.hiddenByZn, true);
  assert.equal(admEmpty.enabled, true);
  assert.equal(admEmpty.free, 4);

  const ctvBkQuote = await s.request('/api/backup/quote', 'POST', ctv, { category: 'backup_emptymap' });
  assert.equal(ctvBkQuote.status, 403);
  assert.equal(ctvBkQuote.body.message, 'Zn đang ẩn danh mục này');
  assert.equal(backupQuoteCalls, 0);

  const ctvBkPlace = await s.request('/api/orders/place', 'POST', ctv, {
    category: 'backup_emptymap',
    charName: 'PlayerTest',
    idempotency_key: 'hide-test-ctv-bk-empty-1',
  });
  assert.equal(ctvBkPlace.status, 403);
  assert.equal(ctvBkPlace.body.message, 'Zn đang ẩn danh mục này');
  assert.equal(backupCreateCalls, 0);
  assert.equal(s.db.users.find(u => u.id === 'seller').backupBalance, 500000);

  const admBkQuote = await s.request('/api/backup/quote', 'POST', admin, { category: 'backup_emptymap' });
  assert.equal(admBkQuote.status, 200);
  assert.equal(backupQuoteCalls, 1);

  // 6. Export/import preserves hiddenCategories, and Admin monitor records the visibility change
  const exported = (await s.request('/api/admin/backup/export', 'GET', admin)).body.backup;
  assert.deepEqual(exported.settings.hiddenCategories, { buff_tim: true, fruit_by_fruit: true, backup_emptymap: true });
  const imported = await s.request('/api/admin/backup/import', 'POST', admin, { backup: exported });
  assert.equal(imported.status, 200);

  const mon = (await s.request('/api/admin/monitor', 'GET', admin)).body;
  assert.ok(mon.events.some(e => e.action === 'PUT /admin/settings' && e.details?.hiddenCategories?.buff_tim === true));

  // 7. Admin unhides buff_tim -> CTV immediately regains catalog packages
  const unhideRes = await s.request('/api/admin/settings', 'PUT', admin, { hiddenCategories: { buff_tim: false } });
  assert.equal(unhideRes.status, 200);
  assert.deepEqual(unhideRes.body.hiddenCategories, { fruit_by_fruit: true, backup_emptymap: true });
  const ctvCatAfter = (await s.request('/api/catalog', 'GET', ctv)).body;
  assert.ok(ctvCatAfter.catalog.buff_tim.length > 0);
});

test('admin CTV monitor top-up history returns only wallet deposits with wallet filters, paging, and admin-only access', async t => {
  const s = await startTestServer(t, financeSource(), {
    seed(db) {
      const seller = db.users.find(u => u.id === 'seller');
      seller.balance = 240000;
      seller.backupBalance = 150000;
      db.transactions.push(
        { id: 't-top-3', userId: 'seller', userName: 'Seller', wallet: 'backup', source: 'backup', type: 'admin_topup', amount: 150000, balanceAfter: 150000, note: 'Nạp Ví Nguồn DP lần 1', createdAt: '2026-11-28T10:00:00Z' },
        { id: 't-deb-1', userId: 'seller', userName: 'Seller', wallet: 'main', type: 'order_debit', amount: -10000, balanceAfter: 240000, note: 'Đặt đơn Buff Tim', createdAt: '2026-11-28T09:30:00Z' },
        { id: 't-ded-1', userId: 'seller', userName: 'Seller', wallet: 'main', type: 'admin_deduct', amount: -50000, balanceAfter: 250000, note: 'Admin trừ tiền', createdAt: '2026-11-28T09:00:00Z' },
        { id: 't-top-2', userId: 'seller', userName: 'Seller', wallet: 'main', type: 'admin_topup', amount: 200000, balanceAfter: 300000, note: 'Nạp Ví CTV lần 2', createdAt: '2026-11-28T08:00:00Z' },
        { id: 't-top-1', userId: 'seller', userName: 'Seller', wallet: 'main', type: 'admin_topup', amount: 100000, balanceAfter: 100000, note: 'Nạp Ví CTV lần 1', createdAt: '2026-11-27T08:00:00Z' },
      );
    },
  });

  const admin = (await s.login('owner', 'owner-test-password')).body.token;
  const ctv = (await s.login('seller', 'seller-test-password')).body.token;

  // CTV cannot access Admin CTV monitor detail
  assert.equal((await s.request('/api/admin/monitor/ctv/seller', 'GET', ctv)).status, 403);

  // All top-ups: strictly ONLY admin_topup rows (3), never order_debit or admin_deduct!
  const allRes = await s.request('/api/admin/monitor/ctv/seller?topups=2', 'GET', admin);
  assert.equal(allRes.status, 200);
  assert.equal(allRes.body.topupCount, 3);
  assert.equal(allRes.body.topups.length, 2);
  assert.ok(allRes.body.topups.every(tx => tx.type === 'admin_topup'));
  assert.deepEqual(allRes.body.topups.map(tx => tx.id), ['t-top-3', 't-top-2']);
  assert.equal(allRes.body.topupSummary.totalCount, 3);
  assert.equal(allRes.body.topupSummary.mainCount, 2);
  assert.equal(allRes.body.topupSummary.backupCount, 1);
  assert.equal(allRes.body.topupSummary.mainTotal, 300000);
  assert.equal(allRes.body.topupSummary.backupTotal, 150000);
  assert.equal(allRes.body.topupSummary.lastTopupAt, '2026-11-28T10:00:00Z');
  assert.equal(allRes.body.summary.unaccountedBalance, 0);

  // Filter strictly by main wallet (Ví CTV)
  const mainRes = await s.request('/api/admin/monitor/ctv/seller?topupWallet=main', 'GET', admin);
  assert.equal(mainRes.status, 200);
  assert.equal(mainRes.body.topupCount, 2);
  assert.deepEqual(mainRes.body.topups.map(tx => tx.id), ['t-top-2', 't-top-1']);
  assert.ok(mainRes.body.topups.every(tx => tx.wallet === 'main'));

  // Filter strictly by backup wallet (Ví Nguồn DP)
  const bkRes = await s.request('/api/admin/monitor/ctv/seller?topupWallet=backup', 'GET', admin);
  assert.equal(bkRes.status, 200);
  assert.equal(bkRes.body.topupCount, 1);
  assert.deepEqual(bkRes.body.topups.map(tx => tx.id), ['t-top-3']);
  assert.equal(bkRes.body.topups[0].wallet, 'backup');
});
