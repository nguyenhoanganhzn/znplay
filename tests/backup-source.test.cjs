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
});
