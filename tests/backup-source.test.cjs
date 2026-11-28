const test = require('node:test');
const assert = require('node:assert/strict');

test('backup quotes preserve weather sequence, service limits and only allow documented order fields', async () => {
  const { createBackupSource } = await import('../backup-source.js');
  const services = {
    weather: { enabled: true, maxPerOrder: 10, catalog: [{ productId: 21, name: 'Gió' }, { productId: 22, name: 'Mưa' }] },
    guide: { enabled: true, maxBots: 5, minMinutes: 10, maxHours: 1 },
    treasure: { enabled: true, minMinutes: 10, maxHours: 2 },
    seeds: { enabled: true, maxPerOrder: 50 }, emptymap: { enabled: true, free: 0 },
  };
  let quoted;
  const source = createBackupSource({ apiKey: 'mock-key', validMoney: n => Number.isSafeInteger(n) && n > 0,
    sellingPrice: (_, cost) => cost + 100, request: async (url, options) => {
      assert.equal(options.redirect, 'error');
      if (url.endsWith('/services')) return Response.json({ services });
      assert.ok(url.endsWith('/quote'));
      quoted = JSON.parse(options.body);
      return Response.json({ quote: { amount: 2500 } });
    } });
  const cases = [
    ['weather', { items: [{ productId: 22, count: 4 }, { productId: 21, count: 6 }] }, 'A, B'],
    ['guide', { bots: 2, minutes: 60, maps: ['square', 'resort'] }, 'A, B'],
    ['treasure', { minutes: 120 }, 'A'], ['seeds', { quantity: 50 }, 'A'], ['emptymap', {}, 'A'],
  ];
  for (const [service, params, charName] of cases) {
    const result = await source.prepare({ category: 'backup_' + service, ...params, charName, payWith: 'qr', amount: 1 }, true);
    assert.deepEqual(quoted, { service, ...params });
    assert.deepEqual(result.args, { service, ...params, charName });
    assert.equal(result.sellPrice, 2600);
  }
  for (const [service, params] of [
    ['weather', { items: [{ productId: 22, count: 7 }, { productId: 21, count: 5 }] }],
    ['weather', { items: [{ productId: 999, count: 1 }] }], ['guide', { minutes: 10, bots: 1, maps: [] }],
    ['guide', { minutes: 1000, bots: 5 }], ['guide', { minutes: 10, bots: 6 }],
    ['seeds', { quantity: 51 }], ['treasure', { minutes: 9 }], ['emptymap', { charName: 'A, B' }],
  ]) await assert.rejects(source.prepare({ category: 'backup_' + service, charName: 'A', ...params }, true));
});

test('backup source extracts live progress across services and strips supplier names/URLs', async () => {
  const { createBackupSource } = await import('../backup-source.js');
  const jobs = {
    3519: {
      id: 3519, service: 'weather', status: 'running', amount: 25650, weatherLeft: 91,
      params: { total: 100, done: { '0': 9 }, items: [{ productId: 90800006, count: 100 }] },
      progress: {
        steps: [{ productId: 90800006, name: 'Bão tuyết', target: 100, done: 9 }],
        map: { khu: 278, inZone: true, population: 3, customersHere: 1, weather: { name: 'Bão tuyết', remainingSec: 160 } },
        pauseNote: 'Xem tại https://ptg.qzeen.dev/xem.html#abc bởi qzeen.dev',
      },
    },
    3520: {
      id: 3520, service: 'seeds', status: 'running', amount: 5000,
      params: { quantity: 50, sent: 18 },
    },
    3521: {
      id: 3521, service: 'guide', status: 'running', amount: 12000,
      params: { minutes: 60, leftMs: 25 * 60000 },
    },
    3522: {
      id: 3522, service: 'emptymap', status: 'done', amount: 3000,
      params: {},
    },
  };
  const source = createBackupSource({
    apiKey: 'mock-key',
    validMoney: n => Number.isSafeInteger(n) && n >= 0,
    sellingPrice: (_, cost) => cost + 1000,
    request: async (url) => {
      const id = new URL(url).searchParams.get('id');
      return Response.json({ job: jobs[id] });
    },
  });

  const w = await source.refresh({ remoteOrderId: 3519, category: 'backup_weather' });
  assert.equal(w.totalCnt, 100);
  assert.equal(w.completedCnt, 9);
  assert.equal(w.backupProgress.unit, 'lần');
  assert.deepEqual(w.backupProgress.steps, [{ name: 'Bão tuyết', target: 100, done: 9 }]);
  assert.equal(w.backupProgress.khu, 278);
  assert.equal(w.backupProgress.population, 3);
  assert.equal(w.backupProgress.customersHere, 1);
  assert.equal(w.backupProgress.inZone, true);
  assert.deepEqual(w.backupProgress.activeWeather, { name: 'Bão tuyết', remainingSec: 160 });
  assert.doesNotMatch(w.backupProgress.pauseNote || '', /qzeen|https?:\/\//i);
  assert.ok(w.backupProgress.syncedAt);

  const s = await source.refresh({ remoteOrderId: 3520, category: 'backup_seeds' });
  assert.equal(s.totalCnt, 50);
  assert.equal(s.completedCnt, 18);
  assert.equal(s.backupProgress.unit, 'hạt');

  const g = await source.refresh({ remoteOrderId: 3521, category: 'backup_guide' });
  assert.equal(g.totalCnt, 60);
  assert.equal(g.completedCnt, 35);
  assert.equal(g.backupProgress.leftMin, 25);
  assert.equal(g.backupProgress.unit, 'phút');

  const e = await source.refresh({ remoteOrderId: 3522, category: 'backup_emptymap' });
  assert.equal(e.totalCnt, 1);
  assert.equal(e.completedCnt, 1);
  assert.equal(e.status, 'completed');
  assert.equal(e.backupProgress.unit, 'map');

  // Verify pause and resume hit documented endpoints with exact JSON payload
  const calls = [];
  const ctrl = createBackupSource({
    apiKey: 'mock-key',
    validMoney: n => Number.isSafeInteger(n) && n >= 0,
    sellingPrice: (_, cost) => cost,
    request: async (url, opts) => {
      calls.push({ url, method: opts.method, body: JSON.parse(opts.body) });
      return Response.json({ ok: true });
    },
  });
  await ctrl.pause(3519);
  await ctrl.resume(3519);
  assert.deepEqual(calls, [
    { url: 'https://ptg.qzeen.dev/api/v1/order/pause', method: 'POST', body: { id: 3519 } },
    { url: 'https://ptg.qzeen.dev/api/v1/order/resume', method: 'POST', body: { id: 3519 } },
  ]);
});

test('backup guide order with null leftMs and null khu computes exact elapsed/remaining time, stats and bot positions', async () => {
  const { createBackupSource } = await import('../backup-source.js');
  const now = Date.now();
  const remMs = (34 * 60 + 38) * 1000; // 0:34:38 remaining out of 60m -> 25m22s elapsed (42%)
  const jobs = {
    3857: {
      id: 3857, service: 'guide', status: 'running', amount: 11000,
      params: { minutes: 60, bots: 6, leftMs: null, maps: ['square', 'camp', 'resort', 'downtown'] },
      endsAt: now + remMs,
      progress: {
        phase: 'running', runAt: now - (25 * 60 + 22) * 1000, idleMs: 0,
        map: null, khu: null, inRoom: true,
        stats: { calls: 399, arrived: 127, picked: 89 },
        accs: [
          { n: 3, room: 'Square50028', mapId: 1201, khu: 47, phase: 'ok', here: ['2thg6'] },
          { n: 6, room: 'Square50009', mapId: 1001, khu: 1, phase: 'scan', here: [] },
        ],
        here: ['2thg6'],
      },
    },
    3870: {
      id: 3870, service: 'guide', status: 'paused', amount: 9000,
      params: { minutes: 60, bots: 5, leftMs: 3600000, maps: ['square'] },
      endsAt: null,
      progress: { phase: 'paused', khu: null, pauseWhy: 'name', missing: ['BadName'], stats: null, accs: null },
    },
    3872: {
      id: 3872, service: 'guide', status: 'friending', amount: 9000,
      params: { minutes: 60, bots: 5, leftMs: null, maps: ['square'] },
      endsAt: null,
      progress: { phase: 'friending', accepted: 2, total: 5, khu: null },
    },
  };
  const source = createBackupSource({
    apiKey: 'mock-key',
    validMoney: n => Number.isSafeInteger(n) && n >= 0,
    sellingPrice: (_, cost) => cost + 1000,
    request: async (url) => Response.json({ job: jobs[new URL(url).searchParams.get('id')] }),
  });

  const running = await source.refresh({ remoteOrderId: 3857, category: 'backup_guide' });
  assert.equal(running.totalCnt, 60);
  assert.equal(running.completedCnt, 25); // NOT 60!
  assert.equal(running.backupProgress.khu, null); // NOT 0!
  assert.equal(running.backupProgress.totalSec, 3600);
  assert.ok(running.backupProgress.elapsedSec >= 25 * 60 && running.backupProgress.elapsedSec <= 26 * 60);
  assert.ok(running.backupProgress.leftSec >= 34 * 60 && running.backupProgress.leftSec <= 35 * 60);
  assert.equal(running.backupProgress.leftMin, 35);
  assert.deepEqual(running.backupProgress.guideStats, { calls: 399, arrived: 127, picked: 89 });
  assert.deepEqual(running.backupProgress.maps, ['square', 'camp', 'resort', 'downtown']);
  assert.equal(running.backupProgress.accs.length, 2);
  assert.equal(running.backupProgress.accs[0].hereCount, 1);
  assert.equal(running.backupProgress.hereCount, 1);
  assert.ok(running.backupProgress.endsAt);
  assert.equal(running.backupProgress.endsAtMs, now + remMs);

  const paused = await source.refresh({ remoteOrderId: 3870, category: 'backup_guide' });
  assert.equal(paused.totalCnt, 60);
  assert.equal(paused.completedCnt, 0);
  assert.equal(paused.backupProgress.leftSec, 3600);
  assert.equal(paused.backupProgress.khu, null);
  assert.match(paused.backupProgress.pauseNote, /Không tìm thấy tên nhân vật: BadName/);

  const friending = await source.refresh({ remoteOrderId: 3872, category: 'backup_guide' });
  assert.equal(friending.completedCnt, 0);
  assert.equal(friending.backupProgress.leftSec, 3600);
  assert.deepEqual(friending.backupProgress.friending, { accepted: 2, total: 5 });
});
