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
