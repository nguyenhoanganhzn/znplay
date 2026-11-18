const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const options = { skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run against PostgreSQL' };
async function isolatedSchema(t) {
  const schema = 'znplay_test_' + randomUUID().replaceAll('-', '');
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  await client.query('CREATE SCHEMA ' + schema);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set('options', '-c search_path=' + schema);
  t.after(async () => {
    try { await client.query('DROP SCHEMA ' + schema + ' CASCADE'); }
    finally { await client.end(); }
  });
  return { client, schema, url };
}

test('PostgreSQL imports once, commits in order, rejects a replaced writer and rolls back a failed debit', options, async t => {
  const { openPostgres } = await import('../postgres-store.js');
  const { client, schema, url } = await isolatedSchema(t);
  const stores = [];
  t.after(() => Promise.all(stores.map(store => store.close())));
  const seed = { settings: {}, sessions: { old: { userId: 'u' } }, users: [{ id: 'u', balance: 50000 }],
    transactions: [], orderIntents: [], localOrders: [], auditLog: [] };
  await openPostgres(url.href, () => structuredClone(seed), { importOnly: true });
  await assert.rejects(openPostgres(url.href, () => seed, { importOnly: true }), /đã có dữ liệu/);
  const open = async () => {
    const store = await openPostgres(url.href, () => assert.fail('Must read the existing database'));
    stores.push(store);
    return store;
  };
  const first = await open();
  assert.deepEqual(first.state, seed);
  first.state.users[0].balance -= 10000;
  first.state.orderIntents.push({ id: 'intent', status: 'processing' });
  const held = first.save(first.state);
  first.state.transactions.unshift({ id: 'tx', amount: -10000 });
  const recorded = first.save(first.state);
  await Promise.all([held, recorded]);
  const replacement = await open();
  assert.deepEqual(replacement.state, first.state);
  assert.equal(await first.ready(), false);
  await assert.rejects(first.save(seed), /tiếp quản/);
  const committed = structuredClone(replacement.state);
  await client.query(`ALTER TABLE ${schema}.znplay_records ADD CHECK (key <> 'transactions/refused')`);
  replacement.state.users[0].balance = 0;
  replacement.state.transactions.unshift({ id: 'refused', amount: -40000 });
  await assert.rejects(replacement.save(replacement.state));
  assert.deepEqual((await open()).state, committed);
});

test('HTTP service restores an imported wallet, session and pending hold after restart on Render', options, async t => {
  const { url } = await isolatedSchema(t);
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'znplay-import-'));
  const legacyPath = path.join(dataDir, 'db.json');
  const password = randomUUID();
  await fs.writeFile(legacyPath, JSON.stringify({
    users: [{ id: 'a', role: 'admin', username: 'owner', password },
      { id: 'u', role: 'ctv', username: 'seller', password, balance: 50000 }],
    orderIntents: [{ id: 'pending', status: 'processing', userId: 'u', heldAmount: 5000 }],
  }));
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const env = { ...process.env, RENDER: 'true', DATA_DIR: dataDir, DATABASE_URL: url.href,
    PORT: String(port), HOST: '127.0.0.1', ADMIN_PASSWORD: '', HOANNGUYEN_EMAIL: '', HOANNGUYEN_PASSWORD: '' };
  const server = path.resolve(__dirname, '../server.js');
  let child;
  async function stop() {
    if (child && child.exitCode === null && !child.signalCode) {
      const stopped = once(child, 'exit');
      child.kill();
      await stopped;
    }
  }
  t.after(async () => { await stop(); await fs.rm(dataDir, { recursive: true, force: true }); });
  const request = (route, token, body) => fetch('http://127.0.0.1:' + port + route, {
    method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + (token || ''), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  async function start() {
    child = spawn(process.execPath, [server], { env, stdio: 'ignore', windowsHide: true });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error('Server exited during startup');
      const health = await request('/api/health').then(r => r.json()).catch(() => null);
      if (health?.storage === 'postgresql' && health.success) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.fail('Server readiness timeout');
  }
  assert.equal(spawnSync(process.execPath, [server, '--import-json'], { env, windowsHide: true }).status, 0);
  await fs.unlink(legacyPath);
  await start();
  const login = await (await request('/api/auth/login', '', { identifier: 'owner', password })).json();
  assert.ok(login.token);
  const payload = { amount: 2500, idempotency_key: randomUUID() };
  const credits = await Promise.all([1, 2].map(() => request('/api/admin/ctv/u/balance', login.token, payload)));
  assert.deepEqual(credits.map(r => r.status).sort(), [200, 409]);
  await stop();
  await start();
  const monitor = await (await request('/api/admin/monitor', login.token)).json();
  assert.equal(monitor.ctvs[0].balance, 52500);
  assert.equal(monitor.intents[0].status, 'uncertain');
  assert.equal(monitor.intents[0].heldAmount, 5000);
  assert.ok(monitor.events.length >= 3);
});
