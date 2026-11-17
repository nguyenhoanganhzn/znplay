const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');

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
  const fakeFs = {
    existsSync: filePath => !(options.fresh && filePath.endsWith('db.json')),
    mkdirSync() {},
    readFileSync: () => options.corrupt ? '{broken json' : JSON.stringify(data),
    writeFileSync() {}, renameSync() {}, unlinkSync() {},
  };
  const context = vm.createContext({
    express: () => {
      const app = express();
      app.listen = () => {}; // Avoid the production listener and startup login.
      return app;
    },
    fs: fakeFs, path, crypto,
    fileURLToPath: () => path.join(root, 'server.js'),
    process: { env: options.env || {}, on() {} }, console: { ...console, error() {} }, structuredClone, URL, Buffer, AbortSignal,
    fetch: upstreamFetch,
  });
  context.express.json = express.json;
  context.express.static = express.static;
  vm.runInContext(serverSource.replace(/^import .*;\r?\n/gm, '')
    .replace('import.meta.url', '"file:///test/server.js"')
    + '\nglobalThis.testApp = app; globalThis.testDb = db;', context);
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
  return { request, login, db: context.testDb, setUpstreamFetch: value => { context.fetch = value; } };
}

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
  assert.equal(overview.body.settings.hoanNguyen.connected, false);
  assert.match(overview.body.settings.hoanNguyen.lastError, /bị chặn kết nối mạng/);
  const reconnect = await request('/api/admin/hoannguyen/reconnect', 'POST', token);
  assert.equal(reconnect.status, 502);
  assert.match(reconnect.body.message, /bị chặn kết nối mạng/);
  const catalog = await request('/api/catalog?refresh=1', 'GET', token);
  assert.equal(catalog.body.success, false);
  assert.equal(catalog.body.catalog, undefined);
  setUpstreamFetch(async url => ({
    ok: true, status: 200,
    json: async () => url.endsWith('/api/auth/login') ? { token: 'fresh-upstream-token' } : { success: true, data: [] },
  }));
  const recovered = await request('/api/admin/hoannguyen/reconnect', 'POST', token);
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.hoanNguyen.connected, true);
  assert.equal(recovered.body.hoanNguyen.lastError, '');
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
  assert.equal(overview.body.settings.hoanNguyen.connected, false);
  assert.equal(overview.body.settings.hoanNguyen.lastError, 'Catalog unavailable');
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
    ['/api/admin/hoannguyen/reconnect', 'POST'], ['/api/admin/password', 'PUT'],
    ['/api/admin/future-route', 'GET'],
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
      classList: { remove() {}, toggle() {} },
    });
    return elements.get(id);
  };
  const storage = new Map(token ? [['znplay_token', token]] : []);
  const context = vm.createContext({
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    document: { getElementById: element, querySelectorAll: () => [] },
    fetch: fetchImpl, console: { ...console, error() {} }, setTimeout,
  });
  vm.runInContext(clientSource.replace(/bootstrap\(\);\s*$/, '') + '\nglobalThis.testState = state;', context);
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

test('CTV navigation cannot render admin pages or preserve prior admin data', () => {
  const { context, state, element } = createClient();
  state.user = { role: 'ctv', balance: 100 };
  context.renderOrderCategoryPageHtml = () => 'CTV order page';
  context.bindOrderCategoryPageEvents = () => {};
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
