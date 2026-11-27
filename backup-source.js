export const backupServices = {
  weather: 'Thuê buff thời tiết',
  guide: 'Thuê dắt thẻ',
  emptymap: 'Thuê map trống',
  treasure: 'Thuê dắt đảo kho báu',
  seeds: 'Mua hạt dưa hấu',
};

export function isBackupCategory(category) {
  return typeof category === 'string' && category.startsWith('backup_') && Object.hasOwn(backupServices, category.slice(7));
}

const fail = (message, status = 400) => Object.assign(new Error(message), { status, backupMessage: true });
const inRange = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const maps = ['square', 'camp', 'resort', 'downtown'];
const statuses = {
  unpaid: 'Chờ thanh toán', queued: 'Đang xếp hàng', preparing: 'Đang chuẩn bị', ready: 'Sẵn sàng',
  friending: 'Chờ kết bạn', running: 'Đang chạy', paused: 'Tạm dừng', done: 'Hoàn thành',
  failed: 'Lỗi', cancelled: 'Đã hủy',
};

function parameters(service, input, config) {
  const args = { service };
  if (service === 'guide' || service === 'treasure') {
    if (!inRange(input.minutes, config.minMinutes, config.maxHours * 60)) throw fail('Thời gian thuê ngoài giới hạn.');
    args.minutes = input.minutes;
  }
  if (service === 'guide') {
    if (!inRange(input.bots, 1, config.maxBots)) throw fail('Số bot ngoài giới hạn.');
    args.bots = input.bots;
    if (input.maps !== undefined) {
      if (!Array.isArray(input.maps) || !input.maps.length || input.maps.length > maps.length ||
          new Set(input.maps).size !== input.maps.length || !input.maps.every(m => maps.includes(m))) throw fail('Chọn ít nhất một bản đồ hợp lệ.');
      args.maps = input.maps;
    }
  }
  if (service === 'weather') {
    if (!Array.isArray(input.items) || !input.items.length || input.items.length > config.maxPerOrder) throw fail('Chọn thời tiết cần buff.');
    args.items = input.items.map(line => {
      if (!config.catalog.some(row => row.productId === line?.productId) || !inRange(line?.count, 1, config.maxPerOrder)) throw fail('Loại hoặc số lần buff không hợp lệ.');
      return { productId: line.productId, count: line.count };
    });
    if (args.items.reduce((sum, line) => sum + line.count, 0) > config.maxPerOrder) throw fail('Tổng số lần buff vượt giới hạn của nguồn.');
  }
  if (service === 'seeds') {
    if (!inRange(input.quantity, 1, config.maxPerOrder)) throw fail('Số hạt ngoài giới hạn.');
    args.quantity = input.quantity;
  }
  return args;
}

export function createBackupSource({ apiKey, request, sellingPrice, validMoney }) {
  const health = { connected: false, checkedAt: null };
  let cached, loading, retryAt = 0;

  async function call(path, body) {
    if (!apiKey) throw fail('Nguồn dự phòng chưa được cấu hình.', 503);
    if (Date.now() < retryAt) throw Object.assign(fail('Nguồn đang giới hạn lượt gọi. Vui lòng thử lại sau.', 429), { rejected: true });
    let response, data;
    try {
      const headers = { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' };
      if (body) headers['Content-Type'] = 'application/json';
      response = await request('https://ptg.qzeen.dev/api/v1/' + path, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(12000),
        headers,
        ...(body && { body: JSON.stringify(body) }),
      });
      if (response.status === 429) retryAt = Date.now() + 1000 * Math.min(120, Math.max(1, Number(response.headers?.get('Retry-After')) || 15));
      data = await response.json();
    } catch {
      health.connected = false;
      health.checkedAt = new Date().toISOString();
      throw fail('Chưa nhận được phản hồi hợp lệ từ nguồn dự phòng.', 503);
    }
    health.checkedAt = new Date().toISOString();
    health.connected = response.ok || (response.status === 400 && typeof data?.error === 'string');
    if (!response.ok || data?.error) {
      const rejected = [400, 401, 404, 429].includes(response.status) && typeof data?.error === 'string';
      const message = response.status === 400 ? 'Nguồn từ chối yêu cầu. Kiểm tra tham số, tình trạng dịch vụ và số dư tài khoản nguồn.'
        : response.status === 429 ? 'Nguồn đang giới hạn lượt gọi. Vui lòng thử lại sau.' : 'Chưa thể thực hiện yêu cầu tại nguồn dự phòng.';
      throw Object.assign(fail(message, rejected && response.status === 400 ? 400 : 503), { rejected });
    }
    return data;
  }

  async function catalog(fresh = false) {
    if (!fresh && cached?.until > Date.now()) return cached.value;
    if (!loading) loading = call('services').then(data => {
      if (!data?.services || !Object.keys(backupServices).some(k => typeof data.services[k]?.enabled === 'boolean')) {
        health.connected = false;
        throw fail('Nguồn dự phòng chưa trả được danh mục.', 503);
      }
      const value = Object.entries(backupServices).map(([key, title]) => {
        const raw = data.services[key] || {};
        const row = { key, title, enabled: typeof raw.enabled === 'boolean' ? raw.enabled : null };
        for (const field of ['maxPerOrder', 'minMinutes', 'maxHours', 'maxBots', 'free', 'waitMin']) {
          if (Number.isSafeInteger(raw[field]) && raw[field] >= 0) row[field] = raw[field];
        }
        if (key === 'weather') row.catalog = (Array.isArray(raw.catalog) ? raw.catalog : [])
          .filter(item => Number.isSafeInteger(item?.productId) && typeof item.name === 'string')
          .map(({ productId, name }) => ({ productId, name: name.slice(0, 100) }));
        return row;
      });
      cached = { value, until: Date.now() + 15000 };
      return value;
    }).finally(() => { loading = null; });
    return loading;
  }

  async function prepare(input, withCustomer = false) {
    if (!isBackupCategory(input?.category)) throw fail('Dịch vụ dự phòng không hợp lệ.');
    const service = input.category.slice(7);
    const config = (await catalog(true)).find(row => row.key === service);
    if (config.enabled !== true) throw fail('Dịch vụ dự phòng đang tạm ngưng hoặc chưa có trạng thái.');
    const args = parameters(service, input, config);
    let charName;
    if (withCustomer) {
      const names = typeof input.charName === 'string' ? input.charName.split(',').map(name => name.trim()) : [];
      const maxNames = ['guide', 'weather'].includes(service) ? 10 : 1;
      if (!names.length || names.length > maxNames || names.some(n => !n || n.length > 100 || /[\x00-\x1f]/.test(n))) throw fail('Danh sách tên nhân vật không hợp lệ.');
      charName = names.join(', ');
    }
    const { quote } = await call('quote', args);
    if (!validMoney(quote?.amount, false)) throw fail('Nguồn dự phòng trả giá không hợp lệ.', 503);
    const costPrice = quote.amount;
    const summary = [config.title, args.bots && args.bots + ' bot', args.minutes && args.minutes + ' phút',
      args.quantity && args.quantity + ' hạt', args.items?.map(i => config.catalog.find(w => w.productId === i.productId).name + ' × ' + i.count).join(', ')].filter(Boolean).join(' · ');
    return { args: { ...args, ...(withCustomer && { charName }) }, summary, costPrice, sellPrice: sellingPrice(input.category, costPrice) };
  }

  function status(job) {
    if (!Object.hasOwn(statuses, job?.status)) throw fail('Nguồn chưa trả trạng thái đơn hợp lệ.', 503);
    return { backupStatus: job.status, statusText: statuses[job.status],
      status: job.status === 'done' ? 'completed' : job.status,
      isActive: !['paused', 'ready', 'done', 'failed', 'cancelled'].includes(job.status) };
  }
  async function create(args) {
    const result = await call('orders', { ...args, payWith: 'wallet' });
    if (result?.paid !== true || !inRange(result.job?.id, 1, Number.MAX_SAFE_INTEGER) || !validMoney(result.job.amount) ||
        (result.job.service && result.job.service !== args.service)) throw fail('Nguồn chưa xác nhận đầy đủ đơn đã thanh toán.', 503);
    return { success: true, data: { id: result.job.id, total_price: result.job.amount, ...status(result.job) } };
  }
  async function refresh(order, reconciliation) {
    const { job } = await call('order?id=' + encodeURIComponent(order.remoteOrderId));
    if (job?.id !== Number(order.remoteOrderId) || job.service !== order.category.slice(7)) throw fail('Thông tin đơn tại nguồn chưa khớp.', 503);
    if (reconciliation && (job.amount !== reconciliation.actualCost || !job.paidAt ||
        (Array.isArray(job.params?.charNames) && job.params.charNames.join(', ') !== reconciliation.charName))) {
      throw fail('Mã đơn, người nhận, khoản thanh toán hoặc chi phí chưa khớp với nguồn.');
    }
    return status(job);
  }
  return { health, catalog, prepare, create, refresh,
    resume: id => call('order/resume', { id }), statusText: key => Object.hasOwn(statuses, key) ? statuses[key] : 'Chờ cập nhật' };
}
