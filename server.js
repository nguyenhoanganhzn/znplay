import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
// Reject sessions created by the former automatic / quick-login UI.
const AUTH_VERSION = 2;

// ============================================================================
// SECURITY HEADERS & BODY PARSER
// ============================================================================
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (/\.(html|js)$/.test(filePath)) res.setHeader('Cache-Control', 'no-store');
  },
}));

// ============================================================================
// PASSWORD HASHING & RATE LIMITING
// ============================================================================
function hashPassword(plain) {
  const s = String(plain || '');
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(s, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(plain, stored) {
  const p = String(plain || '');
  const st = String(stored || '');
  if (!st.startsWith('scrypt$')) {
    return p === st;
  }
  const parts = st.split('$');
  if (parts.length !== 3) return false;
  const [, salt, hashHex] = parts;
  const derived = crypto.scryptSync(p, salt, 64);
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

const loginAttempts = new Map();
function checkLoginRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: now + 60000 };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + 60000;
  }
  entry.count += 1;
  loginAttempts.set(ip, entry);
  return entry.count <= 25;
}

// ============================================================================
// PERSISTENT ATOMIC DATABASE (data/db.json)
// ============================================================================
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DB_PATH = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_DB = {
  settings: {
    brandName: 'ZNPLAY',
    defaultMarkup: 5000,
    categoryMarkups: {
      fruit_coin: 5000,
      fruit_by_fruit: 0, // Trái cây lẻ tính theo đơn giá từng trái (VD: Nhân sâm 130đ -> 170đ) + phí đơn tùy chọn
      buff_tim: 5000,
      buff_sao: 5000,
      guestbook: 5000,
      farm_gift: 5000,
      mail_gift: 5000,
      weather_buff: 5000,
    },
    // Tùy chỉnh giá bán CTV trực tiếp cho từng gói cố định: { "fruit_coin:80": 15000, "buff_tim:94": 10000 }
    packagePriceOverrides: {},
    // Tùy chỉnh đơn giá bán CTV cho từng loại trái cây (VD: Nhân sâm id=1 gốc 130đ -> bán CTV 170đ)
    fruitUnitPrices: {
      '1': 170, // Nhân sâm: gốc 130đ -> mặc định ví dụ 170đ (Admin tùy chỉnh tự do)
    },
    // Tùy chỉnh đơn giá bán CTV cho từng hệ đột biến của trái: { "1:1": 3500 }
    fruitMutationPrices: {},
    // Mức cộng mặc định cho mỗi trái cây nếu chưa chỉnh riêng từng trái (VNĐ/trái)
    defaultFruitUnitMarkup: 40,
    hoanNguyen: {
      baseUrl: 'https://hoannguyenplaytogether.com',
      email: process.env.HOANNGUYEN_EMAIL || '',
      password: process.env.HOANNGUYEN_PASSWORD || '',
      token: '',
      user: null,
      lastLoginAt: null,
    },
  },
  users: [],
  sessions: {},
  localOrders: [],
  transactions: [],
};

function createInitialDb() {
  const password = process.env.ADMIN_PASSWORD || '';
  if (password.length < 12 || password.length > 128) {
    throw new Error('Lần chạy đầu cần đặt ADMIN_PASSWORD từ 12 đến 128 ký tự trong biến môi trường.');
  }
  const initial = structuredClone(DEFAULT_DB);
  initial.users.push({
    id: `usr_admin_${crypto.randomUUID()}`,
    username: (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase(),
    email: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
    password: hashPassword(password),
    name: 'Quản trị viên',
    phone: '',
    role: 'admin',
    balance: 0,
    isLocked: false,
    createdAt: new Date().toISOString(),
  });
  return initial;
}

function applyUpstreamEnvironment(data) {
  const source = data.settings.hoanNguyen;
  let changed = false;
  for (const [key, envKey] of [['email', 'HOANNGUYEN_EMAIL'], ['password', 'HOANNGUYEN_PASSWORD']]) {
    if (process.env[envKey] && source[key] !== process.env[envKey]) {
      source[key] = process.env[envKey];
      changed = true;
    }
  }
  if (changed) {
    source.token = '';
    source.user = null;
    source.lastLoginAt = null;
  }
  return changed;
}

function saveDb(data) {
  try {
    const json = JSON.stringify(data, null, 2);
    const tmpPath = `${DB_PATH}.tmp`;
    fs.writeFileSync(tmpPath, json, 'utf8');
    try {
      fs.renameSync(tmpPath, DB_PATH);
    } catch {
      fs.writeFileSync(DB_PATH, json, 'utf8');
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  } catch (err) {
    console.error('Error saving db.json:', err.message);
  }
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err?.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

function loadDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      const merged = {
        ...DEFAULT_DB,
        ...raw,
        settings: {
          ...DEFAULT_DB.settings,
          ...(raw.settings || {}),
          categoryMarkups: {
            ...DEFAULT_DB.settings.categoryMarkups,
            ...(raw.settings?.categoryMarkups || {}),
          },
          packagePriceOverrides: {
            ...DEFAULT_DB.settings.packagePriceOverrides,
            ...(raw.settings?.packagePriceOverrides || {}),
          },
          fruitUnitPrices: {
            ...DEFAULT_DB.settings.fruitUnitPrices,
            ...(raw.settings?.fruitUnitPrices || {}),
          },
          fruitMutationPrices: {
            ...DEFAULT_DB.settings.fruitMutationPrices,
            ...(raw.settings?.fruitMutationPrices || {}),
          },
          hoanNguyen: {
            ...DEFAULT_DB.settings.hoanNguyen,
            ...(raw.settings?.hoanNguyen || {}),
          },
        },
      };
      if (!Array.isArray(merged.users) || !merged.users.some(user => user.role === 'admin')) {
        throw new Error('Database has no administrator');
      }
      // Preserve local accounts; never reset their passwords from deployment variables.
      let migrated = applyUpstreamEnvironment(merged);
      for (const u of merged.users || []) {
        if (u.password && !String(u.password).startsWith('scrypt$')) {
          u.password = hashPassword(u.password);
          migrated = true;
        }
      }
      if (migrated) saveDb(merged);
      return merged;
    }
  } catch (err) {
    throw new Error('Không thể đọc cơ sở dữ liệu hiện có. Dừng máy chủ để tránh ghi đè dữ liệu; hãy kiểm tra hoặc khôi phục bản sao lưu.');
  }
  const initial = createInitialDb();
  saveDb(initial);
  return initial;
}

let db = loadDb();

// ============================================================================
// MUTATIONS TABLE & CATEGORY METADATA
// ============================================================================
const FRUIT_MUTATIONS = {
  1: { key: 1, name: 'Ánh vàng', abbr: 'Av', color: '#fac42d' },
  2: { key: 2, name: 'Cầu vồng', abbr: 'Cv', color: '#ff7b68' },
  3: { key: 3, name: 'Ẩm ướt', abbr: 'Au', color: '#61b8ff' },
  4: { key: 4, name: 'Nhiễm điện', abbr: 'Nd', color: '#ded725' },
  5: { key: 5, name: 'Gió', abbr: 'Gi', color: '#56cdf5' },
  6: { key: 6, name: 'Khí lạnh', abbr: 'Kl', color: '#9fd3ff' },
  7: { key: 7, name: 'Cát', abbr: 'Ca', color: '#f0c345' },
  8: { key: 8, name: 'Ánh trăng', abbr: 'At', color: '#be95ff' },
  9: { key: 9, name: 'Băng', abbr: 'Ba', color: '#49e1d1' },
  10: { key: 10, name: 'Cực quang', abbr: 'Cq', color: '#f598f8' },
  11: { key: 11, name: 'Sương', abbr: 'Ss', color: '#a5e049' },
  12: { key: 12, name: 'Khô', abbr: 'Kh', color: '#f3af67' },
  13: { key: 13, name: 'Nguyền rủa', abbr: 'Nr', color: '#cc82be' },
  14: { key: 14, name: 'Đèn trời', abbr: 'Dt', color: '#e87718' },
  15: { key: 15, name: 'Ảo ảnh', abbr: 'Aa', color: '#e597ec' },
  16: { key: 16, name: 'Pháo hoa', abbr: 'Ph', color: '#fd7adf' },
  17: { key: 17, name: 'Bướm', abbr: 'Bu', color: '#7665d3' },
  18: { key: 18, name: 'Giai điệu', abbr: 'Gđ', color: '#49e1d1' },
  19: { key: 19, name: 'Tê điện', abbr: 'Tđ', color: '#00ff00' },
};

const CATEGORY_METADATA = {
  farm_gift: {
    key: 'farm_gift',
    name: 'Đơn quà nông trại',
    menuLabel: 'Quà nông trại',
    unit: 'quà',
    apiOrderPath: '/api/farm-gift-orders',
    settingKey: 'is_send_farmgiftorder',
    rateKey: 'farm_gift_order',
  },
  mail_gift: {
    key: 'mail_gift',
    name: 'Đơn quà thư',
    menuLabel: 'Quà thư',
    unit: 'thư',
    apiOrderPath: '/api/mail-gift-orders',
    settingKey: 'is_send_mailgiftorder',
    rateKey: 'mail_gift_order',
  },
  guestbook: {
    key: 'guestbook',
    name: 'Đơn bài viết lưu bút',
    menuLabel: 'Bài viết',
    unit: 'bài viết',
    apiOrderPath: '/api/guestbook-orders',
    settingKey: 'is_send_guestbookorder',
    rateKey: 'guest_book_order',
  },
  buff_tim: {
    key: 'buff_tim',
    name: 'Đơn Buff Tim',
    menuLabel: 'Buff Tim',
    unit: 'tim',
    apiOrderPath: '/api/buff-tim-orders',
    settingKey: 'is_send_bufftimorder',
    rateKey: 'buff_tim_order',
  },
  buff_sao: {
    key: 'buff_sao',
    name: 'Đơn Buff Sao',
    menuLabel: 'Buff Sao',
    unit: 'sao',
    apiOrderPath: '/api/buff-sao-orders',
    settingKey: 'is_send_buffsaoorder',
    rateKey: 'buff_sao_order',
  },
  weather_buff: {
    key: 'weather_buff',
    name: 'Đơn Buff Thời Tiết',
    menuLabel: 'Buff Thời Tiết',
    unit: 'lần',
    apiOrderPath: '/api/weather-buff-orders',
    settingKey: 'is_send_weatherbufforder',
    rateKey: 'weather_buff_order',
  },
  fruit_coin: {
    key: 'fruit_coin',
    name: 'Đơn Trái cây & Xu nông trại',
    menuLabel: 'Trái cây',
    unit: 'trái / xu',
    apiOrderPath: '/api/fruit-coin-orders',
    settingKey: 'is_send_fruitorder',
    rateKey: 'fruit_order',
  },
  fruit_by_fruit: {
    key: 'fruit_by_fruit',
    name: 'Đơn Trái cây & Đột biến',
    menuLabel: 'Trái cây',
    unit: 'trái',
    apiOrderPath: '/api/fruit-coin-orders',
    settingKey: 'is_send_fruitorder',
    rateKey: 'fruit_order',
  },
};

// ============================================================================
// PRICING ENGINE (PER-PRODUCT, PER-FRUIT, PER-MUTATION & PER-CATEGORY)
// ============================================================================

function getPackageSellingPrice(categoryKey, pkgId, costEffective, costOriginal, tierMarkupPercent = 0) {
  const pkgKey = `${categoryKey}:${pkgId}`;
  const override = db.settings.packagePriceOverrides?.[pkgKey];
  const catMarkup = Number(db.settings.categoryMarkups?.[categoryKey] ?? db.settings.defaultMarkup ?? 5000);
  const factor = tierMarkupPercent > 0 ? (100 + tierMarkupPercent) / 100 : 1;

  const adjustedCostEffective = Math.round(Number(costEffective || 0) * factor);
  const adjustedCostOriginal = Math.round(Number(costOriginal || costEffective || 0) * factor);

  let sellEffective;
  if (override !== undefined && override !== null && override !== '' && Number(override) > 0) {
    sellEffective = Math.round(Number(override) * factor);
  } else {
    sellEffective = adjustedCostEffective + catMarkup;
  }

  const markupDiff = sellEffective - adjustedCostEffective;
  const sellOriginal = Math.max(sellEffective, adjustedCostOriginal + markupDiff);

  return {
    costEffective: adjustedCostEffective,
    costOriginal: adjustedCostOriginal,
    sellEffective,
    sellOriginal,
    profit: sellEffective - adjustedCostEffective,
    hasCustomOverride: override !== undefined && override !== null && override !== '',
  };
}

function getFruitUnitPricing(fruitItem) {
  const fid = String(fruitItem.id);
  const costBase = Number(fruitItem.base_price || 0);
  const customUnit = db.settings.fruitUnitPrices?.[fid];
  const defaultFruitMarkup = Number(db.settings.defaultFruitUnitMarkup ?? 40);

  const sellBase =
    customUnit !== undefined && customUnit !== null && customUnit !== '' && Number(customUnit) >= 0
      ? Number(customUnit)
      : costBase + defaultFruitMarkup;

  const unitDiff = sellBase - costBase;

  const mutations = (fruitItem.mutation_prices || []).map((mp) => {
    const mKey = `${fid}:${mp.mutation_key}`;
    const costMut = Number(mp.unit_price || 0);
    const customMut = db.settings.fruitMutationPrices?.[mKey];
    const sellMut =
      customMut !== undefined && customMut !== null && customMut !== '' && Number(customMut) >= 0
        ? Number(customMut)
        : costMut + unitDiff;
    return {
      mutation_key: mp.mutation_key,
      mutation_name: FRUIT_MUTATIONS[mp.mutation_key]?.name || `Hệ ${mp.mutation_key}`,
      mutation_abbr: FRUIT_MUTATIONS[mp.mutation_key]?.abbr || String(mp.mutation_key),
      mutation_color: FRUIT_MUTATIONS[mp.mutation_key]?.color || '#b6d9fc',
      cost_unit_price: costMut,
      sell_unit_price: sellMut,
      has_custom_override: customMut !== undefined && customMut !== null && customMut !== '',
    };
  });

  return {
    costBase,
    sellBase,
    profitPerFruit: sellBase - costBase,
    hasCustomOverride: customUnit !== undefined && customUnit !== null && customUnit !== '',
    mutations,
  };
}

// Calculates exact CTV selling price for a fruit order (matching HoanNguyen's multi-mutation formula)
function calculateFruitOrderSellingPrice(fruitItem, totalCnt, mutationList = []) {
  const qty = Math.max(1, Math.floor(Number(totalCnt || 1)));
  const pricing = getFruitUnitPricing(fruitItem);
  const orderFee = Number(db.settings.categoryMarkups?.fruit_by_fruit ?? 0);

  const cleanMuts = Array.isArray(mutationList) ? mutationList.map(Number).filter(Boolean) : [];
  if (cleanMuts.length === 0) {
    return qty * pricing.sellBase + orderFee;
  }

  let sumMutSell = 0;
  for (const mk of cleanMuts) {
    const mObj = pricing.mutations.find((m) => Number(m.mutation_key) === mk);
    sumMutSell += mObj ? mObj.sell_unit_price : pricing.sellBase;
  }
  const combinedUnitSell = Math.max(pricing.sellBase, sumMutSell - (cleanMuts.length - 1) * pricing.sellBase);
  return qty * combinedUnitSell + orderFee;
}

// ============================================================================
// HOANNGUYEN UPSTREAM API CLIENT
// ============================================================================
let loginPromise = null;
const upstreamStatus = { connected: false, lastCheckedAt: null, lastError: '' };

function upstreamFailure(error) {
  const code = error.cause?.code || error.code;
  let message = error.message;
  if (code === 'EACCES' || code === 'EPERM') {
    message = 'Máy chủ localhost đang bị chặn kết nối mạng tới nguồn HoanNguyen. Cần khởi động lại máy chủ với quyền truy cập mạng.';
  } else if (['TimeoutError', 'AbortError'].includes(error.name) || code === 'UND_ERR_CONNECT_TIMEOUT') {
    message = 'Nguồn HoanNguyen phản hồi quá chậm. Vui lòng thử kết nối lại.';
  } else if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
    message = 'Không phân giải được địa chỉ nguồn HoanNguyen. Vui lòng kiểm tra mạng hoặc DNS.';
  } else if (message === 'fetch failed') {
    message = 'Không thể kết nối tới nguồn HoanNguyen. Vui lòng kiểm tra kết nối mạng của máy chủ.';
  }
  const failure = new Error(message || 'Không thể kết nối tới nguồn HoanNguyen.');
  failure.status = error.status || 502;
  failure.data = error.data;
  Object.assign(upstreamStatus, { connected: false, lastCheckedAt: new Date().toISOString(), lastError: failure.message });
  return failure;
}

function upstreamSuccess() {
  Object.assign(upstreamStatus, { connected: true, lastCheckedAt: new Date().toISOString(), lastError: '' });
}

async function fetchHoanNguyen(url, options = {}) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  } catch (error) {
    throw upstreamFailure(error);
  }
}

async function loginToHoanNguyen(force = false) {
  const hn = db.settings.hoanNguyen;
  if (!force && hn.token) return hn.token;
  if (loginPromise) return loginPromise;
  if (!hn.email || !hn.password) {
    throw upstreamFailure(new Error('Chưa cấu hình tài khoản nguồn. Đặt HOANNGUYEN_EMAIL và HOANNGUYEN_PASSWORD hoặc nhập tại Cấu hình nguồn API.'));
  }

  loginPromise = (async () => {
    try {
      const res = await fetchHoanNguyen(`${hn.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          email: hn.email,
          password: hn.password,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        throw new Error(data.message || 'Không thể đăng nhập hệ thống nguồn');
      }
      db.settings.hoanNguyen.token = data.token;
      db.settings.hoanNguyen.user = data.user || null;
      db.settings.hoanNguyen.lastLoginAt = new Date().toISOString();
      saveDb(db);
      upstreamSuccess();
      return data.token;
    } catch (error) {
      throw upstreamFailure(error);
    } finally {
      loginPromise = null;
    }
  })();

  return loginPromise;
}

async function hnApiCall(apiPath, method = 'GET', body = null, retry = true) {
  const hn = db.settings.hoanNguyen;
  const token = await loginToHoanNguyen(false);

  const headers = {
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'Authorization': `Bearer ${token}`,
  };

  const options = { method, headers };
  if (body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const res = await fetchHoanNguyen(`${hn.baseUrl}${apiPath}`, options);
  if (res.status === 401 && retry) {
    await loginToHoanNguyen(true);
    return hnApiCall(apiPath, method, body, false);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw upstreamFailure(new Error(`Nguồn HoanNguyen trả về dữ liệu không hợp lệ (HTTP ${res.status}).`));
  }
  if ((!res.ok || data.success === false) && !data.needs_confirmation) {
    const err = new Error(data.message || `API Error (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw upstreamFailure(err);
  }
  upstreamSuccess();
  return data;
}

// ============================================================================
// WEBSOCKET HELPER FOR IN-GAME PLAYER SEARCH & PROFILE DETAIL
// ============================================================================
function searchInGameByWebSocket(nickname, timeoutMs = 12000) {
  return new Promise(async (resolve, reject) => {
    try {
      await loginToHoanNguyen(false);
    } catch {}
    const userId = db.settings.hoanNguyen.user?.id || 120;
    const wsUrl = 'wss://hoannguyenplaytogether.com/api/ws/connect?platform=web&view=seller-fruit-coin-orders';
    const ws = new WebSocket(wsUrl);
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws.close(); } catch {}
        reject(new Error('Tìm kiếm nhân vật quá thời gian chờ, vui lòng thử lại.'));
      }
    }, timeoutMs);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'profile_search',
        search_nickname: nickname.trim(),
        user_id: userId,
      }));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'profile_search_result') {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            try { ws.close(); } catch {}
            resolve(Array.isArray(msg.profiles) ? msg.profiles : []);
          }
        } else if (msg.type === 'error') {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            try { ws.close(); } catch {}
            reject(new Error(msg.message || 'Lỗi khi tìm kiếm nhân vật trong game'));
          }
        }
      } catch {}
    };

    ws.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        try { ws.close(); } catch {}
        reject(new Error('Không thể kết nối máy chủ tìm kiếm game'));
      }
    };
  });
}

function requestProfileDetailByWebSocket(suid, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const wsUrl = 'wss://hoannguyenplaytogether.com/api/ws/connect?platform=web&view=seller-fruit-coin-orders';
    const ws = new WebSocket(wsUrl);
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws.close(); } catch {}
        reject(new Error('Không nhận được chi tiết hồ sơ từ máy chủ game'));
      }
    }, timeoutMs);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'request_profile',
        suid: String(suid),
      }));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'request_profile_result' && msg.profile) {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            try { ws.close(); } catch {}
            resolve(msg.profile);
          }
        } else if (msg.type === 'error' && msg.request_context === 'request_profile') {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            try { ws.close(); } catch {}
            reject(new Error(msg.message || 'Không thể lấy thông tin chi tiết nhân vật'));
          }
        }
      } catch {}
    };

    ws.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        try { ws.close(); } catch {}
        reject(new Error('Lỗi kết nối khi lấy chi tiết hồ sơ'));
      }
    };
  });
}

// ============================================================================
// AUTH & STRICT WALLET ENFORCEMENT MIDDLEWARE
// ============================================================================
function getAuthUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token || !db.sessions[token]) return null;
  const sessionData = db.sessions[token];
  if (sessionData.authVersion !== AUTH_VERSION) return null;
  const userId = sessionData.userId;
  const user = db.users.find((u) => u.id === userId);
  if (!user || user.isLocked) return null;
  return user;
}

function requireAuth(req, res, next) {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Vui lòng đăng nhập tài khoản để tiếp tục.',
    });
  }
  req.user = user;
  next();
}

// CTV MUST have balance > 0 to perform interactive operations
function requirePositiveBalanceForCtv(req, res, next) {
  const user = req.user;
  if (user.role !== 'admin' && Number(user.balance || 0) <= 0) {
    return res.status(403).json({
      success: false,
      code: 'INSUFFICIENT_BALANCE',
      message: 'Số dư tài khoản CTV của bạn hiện là 0đ. Vui lòng nạp tiền vào tài khoản để có thể thao tác và đặt đơn!',
    });
  }
  next();
}

function requireAdmin(req, res, next) {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Chỉ Quản trị viên (Admin) mới có quyền truy cập mục này.',
    });
  }
  req.user = user;
  next();
}

function sanitizeUser(u) {
  const { password, allowCredit, customMarkupOffset, ...rest } = u;
  return rest;
}

// ============================================================================
// PLAY TOGETHER ASSET PROXY
// ============================================================================
app.get('/assets/playtogether/*', (req, res) => {
  const targetUrl = `https://hoannguyenplaytogether.com${req.originalUrl}`;
  res.redirect(302, targetUrl);
});

// ============================================================================
// AUTH ENDPOINTS
// ============================================================================
app.get('/api/health', (req, res) => {
  res.json({ success: true });
});

app.post('/api/auth/login', (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (!checkLoginRateLimit(ip)) {
    return res.status(429).json({
      success: false,
      message: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi 1 phút rồi thử lại.',
    });
  }

  const { identifier, email, username, password } = req.body || {};
  const loginKey = String(identifier || email || username || '').trim().toLowerCase();
  const pwd = String(password || '');

  const user = db.users.find(
    (u) => u.email?.toLowerCase() === loginKey || u.username?.toLowerCase() === loginKey
  );

  if (!user || !verifyPassword(pwd, user.password)) {
    return res.status(401).json({
      success: false,
      message: 'Tài khoản hoặc mật khẩu không chính xác.',
    });
  }

  if (user.isLocked) {
    return res.status(403).json({
      success: false,
      message: 'Tài khoản của bạn đang tạm khóa. Vui lòng liên hệ Admin ZnPlay.',
    });
  }

  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { userId: user.id, createdAt: Date.now(), authVersion: AUTH_VERSION };
  saveDb(db);

  res.json({
    success: true,
    message: 'Đăng nhập thành công',
    token,
    user: sanitizeUser(user),
  });
});

app.get('/api/auth/me', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
  }
  res.json({ success: true, user: sanitizeUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (token && db.sessions[token]) {
    delete db.sessions[token];
    saveDb(db);
  }
  res.json({ success: true });
});

// ============================================================================
// REALTIME CATALOG, SYSTEM STATUS & PROCESSING RATE SYNC
// ============================================================================
let catalogCache = {
  timestamp: 0,
  raw: null,
};

function getCurrentMondayStr() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function fetchRawCatalogFromHoanNguyen(force = false) {
  const now = Date.now();
  if (!force && catalogCache.raw && now - catalogCache.timestamp < 15000) {
    return catalogCache.raw;
  }

  const weekStart = getCurrentMondayStr();

  const [
    fruitCoinRes,
    fruitItemsRes,
    fruitStockRes,
    buffTimRes,
    buffSaoRes,
    guestbookRes,
    farmGiftsRes,
    mailGiftsRes,
    weatherPkgRes,
    weatherTypesRes,
    settingsRes,
    ratesRes,
    settlementRes,
  ] = await Promise.all([
    hnApiCall('/api/fruit-coin-price-packages?active=1').catch(error => ({ upstreamError: error })),
    hnApiCall('/api/fruit-items?active=1').catch(error => ({ upstreamError: error })),
    hnApiCall('/api/fruit-stock').catch(() => ({ data: [], meta: {} })),
    hnApiCall('/api/buff-tim-price-packages?active=1').catch(() => ({ data: [] })),
    hnApiCall('/api/buff-sao-price-packages?active=1').catch(() => ({ data: [] })),
    hnApiCall('/api/guestbook-price-packages?active=1').catch(() => ({ data: [] })),
    // IMPORTANT: Only fetch active=1 gifts for seller order creation, matching HoanNguyen exactly!
    hnApiCall('/api/gifts?type=farm&active=1').catch(() => ({ data: [] })),
    hnApiCall('/api/gifts?type=mail&active=1').catch(() => ({ data: [] })),
    hnApiCall('/api/weather-buff-price-packages?active=1').catch(() => ({ data: [] })),
    hnApiCall('/api/weather-buff-types?active=1').catch(() => ({ data: [] })),
    hnApiCall(
      '/api/settings?keys=is_send_task,is_send_fruitorder,is_send_farmgiftorder,is_send_mailgiftorder,is_send_guestbookorder,is_send_bufftimorder,is_send_buffsaoorder,is_send_weatherbufforder,min_coin_per_fruit,max_coin_for_fruit_order,max_fruits_per_customer_per_day,is_buff_sao_custom_quantity,is_buff_tim_custom_quantity'
    ).catch(error => ({ upstreamError: error })),
    hnApiCall('/api/tasks/processing-rate').catch(() => ({ data: {} })),
    hnApiCall(`/api/seller-settlements?week_start=${weekStart}`).catch(() => ({ data: null })),
  ]);

  // Wait for every request before recording failure; late successes must not
  // turn the status green after a required catalog request has failed.
  const failedRequired = [fruitCoinRes, fruitItemsRes, settingsRes].find(result => result.upstreamError);
  if (failedRequired) throw upstreamFailure(failedRequired.upstreamError);
  upstreamSuccess();

  const raw = {
    fruitCoinPackages: Array.isArray(fruitCoinRes?.data) ? fruitCoinRes.data : [],
    fruitItems: Array.isArray(fruitItemsRes?.data) ? fruitItemsRes.data : [],
    fruitStock: Array.isArray(fruitStockRes?.data) ? fruitStockRes.data : [],
    fruitStockMeta: fruitStockRes?.meta || {},
    buffTimPackages: Array.isArray(buffTimRes?.data) ? buffTimRes.data : [],
    buffSaoPackages: Array.isArray(buffSaoRes?.data) ? buffSaoRes.data : [],
    guestbookPackages: Array.isArray(guestbookRes?.data) ? guestbookRes.data : [],
    farmGifts: Array.isArray(farmGiftsRes?.data) ? farmGiftsRes.data : [],
    mailGifts: Array.isArray(mailGiftsRes?.data) ? mailGiftsRes.data : [],
    weatherPackages: Array.isArray(weatherPkgRes?.data) ? weatherPkgRes.data : [],
    weatherTypes: Array.isArray(weatherTypesRes?.data) ? weatherTypesRes.data : [],
    hnSettings: settingsRes?.data || {},
    processingRates: ratesRes?.data || {},
    weeklyLimit: settlementRes?.data?.weekly_limit || null,
    syncedAt: new Date().toISOString(),
  };

  catalogCache = { timestamp: now, raw };
  return raw;
}

function buildPublicPackage(pkg, categoryKey, isAdmin, tierMarkupPercent = 0) {
  const rawBaseCost = Number(pkg.original_price ?? pkg.total_price ?? 0);
  const rawEffectiveCost = Number(
    pkg.is_on_sale && pkg.effective_price != null
      ? pkg.effective_price
      : pkg.sale?.sale_price != null
      ? pkg.sale.sale_price
      : pkg.total_price ?? 0
  );

  const calc = getPackageSellingPrice(categoryKey, pkg.id, rawEffectiveCost, rawBaseCost, tierMarkupPercent);

  const result = {
    id: pkg.id,
    quantity: pkg.quantity ?? pkg.coin_quantity,
    coin_quantity: pkg.coin_quantity ?? pkg.quantity,
    is_active: pkg.is_active,
    is_on_sale: !!pkg.is_on_sale,
    // CTV ONLY sees the final selling price as the standard package price!
    total_price: calc.sellEffective,
    effective_price: calc.sellEffective,
    original_price: calc.sellOriginal,
    sale: pkg.sale
      ? {
          id: pkg.sale.id,
          sale_price: calc.sellEffective,
          slots_total: pkg.sale.slots_total,
          slots_used: pkg.sale.slots_used,
          slots_remaining: pkg.sale.slots_remaining,
          title: pkg.sale.title,
          status: pkg.sale.status,
        }
      : null,
  };

  // ONLY Admin receives the underlying HoanNguyen cost & profit numbers
  if (isAdmin) {
    result._admin = {
      cost_effective: calc.costEffective,
      cost_original: calc.costOriginal,
      profit: calc.profit,
      has_custom_override: calc.hasCustomOverride,
    };
  }

  return result;
}

app.get('/api/catalog', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.role === 'admin';
    const force = req.query.refresh === '1';

    const raw = await fetchRawCatalogFromHoanNguyen(force);
    const coinTiers = Array.isArray(raw.fruitStockMeta?.coin_tiers)
      ? raw.fruitStockMeta.coin_tiers
      : [];

    // System status per category (exact match with HoanNguyen's OrderSystemStatusChip)
    const isSendTask = !!raw.hnSettings?.is_send_task;
    const systemStatus = {
      farm_gift: isSendTask && !!raw.hnSettings?.is_send_farmgiftorder,
      mail_gift: isSendTask && !!raw.hnSettings?.is_send_mailgiftorder,
      guestbook: isSendTask && !!raw.hnSettings?.is_send_guestbookorder,
      buff_tim: isSendTask && !!raw.hnSettings?.is_send_bufftimorder,
      buff_sao: isSendTask && !!raw.hnSettings?.is_send_buffsaoorder,
      weather_buff: isSendTask && (raw.hnSettings?.is_send_weatherbufforder ?? false),
      fruit_coin: isSendTask && !!raw.hnSettings?.is_send_fruitorder,
      fruit_by_fruit: isSendTask && !!raw.hnSettings?.is_send_fruitorder,
    };

    // 1. Fruit Coin Packages
    const fruitCoinPackages = raw.fruitCoinPackages.map((pkg) => {
      const basePkg = buildPublicPackage(pkg, 'fruit_coin', isAdmin, 0);
      const pricesByTier = {};
      for (const tier of coinTiers) {
        const tPkg = buildPublicPackage(pkg, 'fruit_coin', isAdmin, Number(tier.markup_percent || 0));
        pricesByTier[tier.min_coin] = {
          min_coin: tier.min_coin,
          markup_percent: tier.markup_percent,
          total_price: tPkg.total_price,
          original_price: tPkg.original_price,
          _admin: isAdmin ? tPkg._admin : undefined,
        };
      }
      return {
        ...basePkg,
        prices_by_tier: pricesByTier,
      };
    });

    // 2. Fruit Items (154 fruits + 19 mutations)
    const stockMap = new Map();
    for (const s of raw.fruitStock) {
      stockMap.set(Number(s.fruit_item_id), s);
    }

    const fruitItems = raw.fruitItems.map((fi) => {
      const st = stockMap.get(Number(fi.id));
      const iconPath = fi.item?.icon_path_and_name
        ? `/assets/playtogether/images/${fi.item.icon_path_and_name.replace(/^\/+/, '').replace(/\.png$/i, '')}.png`
        : null;
      const fPricing = getFruitUnitPricing(fi);

      const itemObj = {
        id: fi.id,
        item_id: fi.item_id,
        name: fi.item?.name || `Trái #${fi.id}`,
        grade: fi.item?.grade || 1,
        icon: iconPath,
        // CTV only sees sellBase as the official unit_price!
        unit_price: fPricing.sellBase,
        stock_quantity: st ? Number(st.total_quantity || 0) : 0,
        priority: fi.priority ?? st?.priority ?? 0,
        mutation_prices: fPricing.mutations.map((m) => ({
          mutation_key: m.mutation_key,
          mutation_name: m.mutation_name,
          mutation_abbr: m.mutation_abbr,
          mutation_color: m.mutation_color,
          unit_price: m.sell_unit_price,
          _admin: isAdmin
            ? {
                cost_unit_price: m.cost_unit_price,
                profit: m.sell_unit_price - m.cost_unit_price,
                has_custom_override: m.has_custom_override,
              }
            : undefined,
        })),
      };

      if (isAdmin) {
        itemObj._admin = {
          cost_unit_price: fPricing.costBase,
          profit_per_fruit: fPricing.profitPerFruit,
          has_custom_override: fPricing.hasCustomOverride,
        };
      }
      return itemObj;
    });

    // 3. Buff Tim Packages
    const buffTimPackages = raw.buffTimPackages.map((pkg) =>
      buildPublicPackage(pkg, 'buff_tim', isAdmin, 0)
    );

    // 4. Buff Sao Packages
    const buffSaoPackages = raw.buffSaoPackages.map((pkg) =>
      buildPublicPackage(pkg, 'buff_sao', isAdmin, 0)
    );

    // 5. Guestbook Packages
    const guestbookPackages = raw.guestbookPackages.map((pkg) =>
      buildPublicPackage(pkg, 'guestbook', isAdmin, 0)
    );

    // 6. Active Farm Gifts & Mail Gifts (Exact match with HoanNguyen active=1)
    const formatGiftList = (giftArr, catKey) =>
      giftArr
        .filter((g) => g.is_active)
        .map((g) => {
          const iconPath = g.item?.icon_path_and_name
            ? `/assets/playtogether/images/${g.item.icon_path_and_name.replace(/^\/+/, '').replace(/\.png$/i, '')}.png`
            : null;
          const packages = (g.gift_plants || [])
            .filter((gp) => gp.is_active)
            .map((gp) => buildPublicPackage(gp, catKey, isAdmin, 0));
          return {
            id: g.id,
            name: g.item?.name || `Quà #${g.id}`,
            type: g.type,
            grade: g.item?.grade || 1,
            icon: iconPath,
            packages,
          };
        })
        .filter((g) => g.packages.length > 0);

    const farmGifts = formatGiftList(raw.farmGifts, 'farm_gift');
    const mailGifts = formatGiftList(raw.mailGifts, 'mail_gift');

    // 7. Weather Buff Packages
    const weatherPackages = raw.weatherPackages.map((pkg) =>
      buildPublicPackage(pkg, 'weather_buff', isAdmin, 0)
    );

    res.json({
      success: true,
      syncedAt: raw.syncedAt,
      systemStatus,
      processingRates: raw.processingRates,
      hnSettings: {
        min_coin_per_fruit: raw.hnSettings?.min_coin_per_fruit ?? 400000,
        max_coin_for_fruit_order: raw.hnSettings?.max_coin_for_fruit_order ?? 600000,
        max_fruits_per_customer_per_day: raw.hnSettings?.max_fruits_per_customer_per_day ?? 30,
      },
      weeklyLimit: isAdmin ? raw.weeklyLimit : undefined,
      coinStock: raw.fruitStockMeta?.coin || null,
      coinTiers,
      mutations: FRUIT_MUTATIONS,
      catalog: {
        fruit_coin: fruitCoinPackages,
        fruit_by_fruit: fruitItems,
        buff_tim: buffTimPackages,
        buff_sao: buffSaoPackages,
        guestbook: guestbookPackages,
        farm_gift: farmGifts,
        mail_gift: mailGifts,
        weather_buff: weatherPackages,
      },
    });
  } catch (err) {
    console.error('Error in GET /api/catalog:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Không thể tải dữ liệu bảng giá.',
    });
  }
});

// Preview Fruit Order Price (Calculates CTV selling price using Admin's per-fruit/per-mutation prices)
app.post('/api/catalog/preview-fruit', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.role === 'admin';
    const { fruit_item_id, total_cnt, mutation_list } = req.body || {};
    const qty = Math.max(1, Math.floor(Number(total_cnt || 1)));
    const muts = Array.isArray(mutation_list) ? mutation_list.map(Number).filter(Boolean) : [];

    const raw = await fetchRawCatalogFromHoanNguyen(false);
    const fi = raw.fruitItems.find((f) => Number(f.id) === Number(fruit_item_id));
    if (!fi) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy loại trái cây này.' });
    }

    const previewRes = await hnApiCall('/api/order-pricing/preview-fruit', 'POST', {
      fruit_item_id: Number(fruit_item_id),
      total_cnt: qty,
      mutation_list: muts,
    });

    const costPrice = Number(previewRes?.data?.total_price ?? 0);
    const sellPrice = calculateFruitOrderSellingPrice(fi, qty, muts);

    const responseData = {
      total_price: sellPrice,
    };
    if (isAdmin) {
      responseData._admin = {
        cost_price: costPrice,
        profit: sellPrice - costPrice,
      };
    }

    res.json({
      success: true,
      data: responseData,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message || 'Không thể tính giá đơn trái cây.',
    });
  }
});

// Fruit Stock Detail by fruit_item_id
app.get('/api/catalog/fruit-stock/:id', requireAuth, async (req, res) => {
  try {
    const data = await hnApiCall(`/api/fruit-stock?fruit_item_id=${encodeURIComponent(req.params.id)}`);
    res.json(data);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ============================================================================
// CUSTOMER SEARCH & PROFILE RESOLUTION (REQUIRES CTV POSITIVE BALANCE!)
// ============================================================================
app.post('/api/customer/search-ingame', requireAuth, requirePositiveBalanceForCtv, async (req, res) => {
  try {
    const { nickname } = req.body || {};
    if (!nickname || !String(nickname).trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên nhân vật cần tìm.' });
    }
    const profiles = await searchInGameByWebSocket(String(nickname).trim());
    res.json({ success: true, profiles });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message || 'Lỗi khi tìm kiếm nhân vật trong game.',
    });
  }
});

app.post('/api/customer/select-ingame', requireAuth, requirePositiveBalanceForCtv, async (req, res) => {
  try {
    const { profile } = req.body || {};
    if (!profile || !profile.suid) {
      return res.status(400).json({ success: false, message: 'Thông tin nhân vật không hợp lệ.' });
    }

    let detail = null;
    try {
      detail = await requestProfileDetailByWebSocket(profile.suid, 10000);
    } catch {}

    const payload = {
      suid: String(profile.suid),
      nickname: profile.Nickname || profile.nickname || 'Player',
      region: profile.Region || profile.region || 'vn1',
      achievement_level: Number(profile.AchievementLevel ?? profile.achievement_level ?? 1),
      photo_url: profile.PhotoUrl ?? profile.photo_url ?? null,
      photo_id: Number(profile.PhotoID ?? profile.photo_id ?? 1),
      friend_status_type: Number(profile.FriendStatusType ?? profile.friend_status_type ?? 0),
      last_login: profile.LastLogin || profile.last_login || new Date().toLocaleString('vi-VN'),
      user_likes: Number(detail?.Profile?.UserLikes ?? 0),
      home_likes: Number(detail?.Profile?.HomeLikes ?? 0),
      total_home_visit_count: Number(detail?.Profile?.ProfileCount?.TotalHomeVisitCount ?? 0),
      follower_count: Number(detail?.Profile?.FollowerCount ?? 0),
    };

    const saveRes = await hnApiCall('/api/game-profiles', 'POST', payload);
    if (!saveRes?.success || !saveRes?.data) {
      throw new Error(saveRes?.message || 'Không thể lưu hồ sơ khách hàng.');
    }

    res.json({
      success: true,
      customer: {
        customerId: saveRes.data.customer_id,
        gameProfileId: saveRes.data.id,
        nickname: saveRes.data.nickname || payload.nickname,
        suid: payload.suid,
        region: profile.RegionName || payload.region,
        photoUrl: payload.photo_url,
        onlineStatus: profile.Online_Status || null,
      },
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message || 'Không thể chọn nhân vật này.',
    });
  }
});

app.post('/api/customer/resolve-role-id', requireAuth, requirePositiveBalanceForCtv, async (req, res) => {
  try {
    const { role_id } = req.body || {};
    if (!role_id || !String(role_id).trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập Role ID.' });
    }
    const r = await hnApiCall('/api/customers/resolve-by-role-id', 'POST', {
      role_id: String(role_id).trim(),
    });
    const cust = r?.data;
    if (!cust?.id) {
      return res.status(404).json({ success: false, message: 'Role ID không hợp lệ hoặc không tìm thấy.' });
    }
    res.json({
      success: true,
      customer: {
        customerId: Number(cust.id),
        gameProfileId: null,
        nickname: cust.nickname || `Role ID: ${role_id}`,
        suid: String(cust.suid || ''),
        roleId: String(cust.role_id || role_id),
      },
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message || 'Không tìm thấy khách hàng với Role ID này.',
    });
  }
});

app.get('/api/customer/saved', requireAuth, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const page = String(req.query.page || '1');
    const qs = new URLSearchParams({ page, per_page: '15' });
    if (q) qs.set('q', q);

    const r = await hnApiCall(`/api/customers?${qs.toString()}`);
    const list = Array.isArray(r?.data?.data) ? r.data.data : [];
    res.json({
      success: true,
      customers: list,
      total: r?.data?.total || list.length,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message || 'Không thể tải danh sách khách hàng.',
    });
  }
});

app.get('/api/customer/saved/:id', requireAuth, async (req, res) => {
  try {
    const r = await hnApiCall(`/api/customers/${encodeURIComponent(req.params.id)}`);
    const c = r?.data;
    if (!c?.id) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng.' });
    }
    const latestProfile =
      Array.isArray(c.game_profiles) && c.game_profiles.length > 0 ? c.game_profiles[0] : null;

    res.json({
      success: true,
      customer: {
        customerId: c.id,
        gameProfileId: latestProfile?.id ?? null,
        nickname: c.nickname || latestProfile?.nickname || `Khách #${c.id}`,
        suid: c.suid || latestProfile?.suid || '',
        roleId: c.role_id || null,
        photoUrl: latestProfile?.photo_url || null,
        region: latestProfile?.region_name || latestProfile?.region || '',
        onlineStatus: latestProfile?.Online_Status || null,
      },
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message || 'Lỗi khi lấy chi tiết khách hàng.',
    });
  }
});

// ============================================================================
// PLACE ORDER ENDPOINT (STRICT WALLET CHECK + SYSTEM ACTIVE CHECK)
// ============================================================================
app.post('/api/orders/place', requireAuth, requirePositiveBalanceForCtv, async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.role === 'admin';
    const {
      category,
      customer_id,
      game_profile_id,
      customer_snapshot,
      coin_price_package_id,
      min_coin_filter,
      fruit_item_id,
      total_cnt,
      mutation_list,
      variant_mode,
      price_package_id,
      expect_sale,
      expect_package_sale_id,
      guest_book_message,
      gift_id,
      gift_plant_id,
      message,
      confirm_duplicate_customer,
    } = req.body || {};

    if (!customer_id) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng tìm và chọn nhân vật khách hàng trước khi tạo đơn.',
      });
    }

    const rawCatalog = await fetchRawCatalogFromHoanNguyen(false);

    // Check if the category is currently active on HoanNguyen
    const isSendTask = !!rawCatalog.hnSettings?.is_send_task;
    const settingKey = CATEGORY_METADATA[category]?.settingKey;
    if (settingKey && (!isSendTask || !rawCatalog.hnSettings?.[settingKey])) {
      return res.status(400).json({
        success: false,
        message: `Danh mục "${CATEGORY_METADATA[category]?.menuLabel || category}" hiện đang tạm ngưng hoạt động trên hệ thống máy chủ. Vui lòng quay lại sau!`,
      });
    }

    let apiPath = '';
    let hnPayload = {};
    let costPrice = 0;
    let sellPrice = 0;
    let orderSummary = '';

    if (category === 'fruit_coin') {
      apiPath = '/api/fruit-coin-orders';
      const pkg = rawCatalog.fruitCoinPackages.find((p) => Number(p.id) === Number(coin_price_package_id));
      if (!pkg) {
        return res.status(400).json({ success: false, message: 'Gói Xu nông trại không hợp lệ.' });
      }
      const tiers = rawCatalog.fruitStockMeta?.coin_tiers || [];
      const selectedTier =
        tiers.find((t) => Number(t.min_coin) === Number(min_coin_filter)) ||
        tiers.find((t) => t.is_default) ||
        tiers[0];
      const tierMarkup = Number(selectedTier?.markup_percent || 0);
      const rawBaseCost = Number(pkg.original_price ?? pkg.total_price ?? 0);
      const rawEffectiveCost = Number(
        pkg.is_on_sale && pkg.effective_price != null ? pkg.effective_price : pkg.total_price
      );

      const calc = getPackageSellingPrice('fruit_coin', pkg.id, rawEffectiveCost, rawBaseCost, tierMarkup);
      costPrice = calc.costEffective;
      sellPrice = calc.sellEffective;

      orderSummary = `Gói ${Number(pkg.coin_quantity || pkg.quantity).toLocaleString('vi-VN')} Xu${
        selectedTier?.min_coin ? ` (Trái ≥ ${Number(selectedTier.min_coin).toLocaleString('vi-VN')} xu)` : ''
      }`;

      hnPayload = {
        customer_id: Number(customer_id),
        game_profile_id: game_profile_id ? Number(game_profile_id) : undefined,
        type: 'by_coin',
        coin_price_package_id: Number(pkg.id),
        min_coin_filter: selectedTier ? Number(selectedTier.min_coin) : undefined,
        expect_sale: !!pkg.is_on_sale,
        expect_package_sale_id: pkg.is_on_sale ? pkg.sale?.id ?? null : null,
        is_active: true,
        confirm_duplicate_customer: !!confirm_duplicate_customer,
      };
    } else if (category === 'fruit_by_fruit') {
      apiPath = '/api/fruit-coin-orders';
      const qty = Math.max(1, Math.floor(Number(total_cnt || 1)));
      const muts = Array.isArray(mutation_list) ? mutation_list.map(Number).filter(Boolean) : [];
      const fi = rawCatalog.fruitItems.find((f) => Number(f.id) === Number(fruit_item_id));
      if (!fi) {
        return res.status(400).json({ success: false, message: 'Loại trái cây không hợp lệ.' });
      }

      const preview = await hnApiCall('/api/order-pricing/preview-fruit', 'POST', {
        fruit_item_id: Number(fruit_item_id),
        total_cnt: qty,
        mutation_list: muts,
      });
      costPrice = Number(preview?.data?.total_price ?? 0);
      sellPrice = calculateFruitOrderSellingPrice(fi, qty, muts);

      const mutNames = muts.map((m) => FRUIT_MUTATIONS[m]?.name || m).join(', ');
      orderSummary = `${qty.toLocaleString('vi-VN')} trái ${fi?.item?.name || `#${fruit_item_id}`}${
        mutNames ? ` [${mutNames}]` : ' [Thường]'
      }`;

      hnPayload = {
        customer_id: Number(customer_id),
        game_profile_id: game_profile_id ? Number(game_profile_id) : undefined,
        type: 'by_fruit',
        fruit_item_id: Number(fruit_item_id),
        total_cnt: qty,
        mutation_list: muts,
        variant_mode: variant_mode || 'select',
        is_active: true,
        confirm_duplicate_customer: !!confirm_duplicate_customer,
      };
    } else if (category === 'buff_tim') {
      apiPath = '/api/buff-tim-orders';
      const pkg = rawCatalog.buffTimPackages.find((p) => Number(p.id) === Number(price_package_id));
      if (!pkg) {
        return res.status(400).json({ success: false, message: 'Gói Buff Tim không hợp lệ.' });
      }
      const useSale = expect_sale !== false && pkg.is_on_sale && pkg.sale;
      const rawEffective = Number(useSale ? pkg.sale.sale_price : pkg.total_price);
      const calc = getPackageSellingPrice('buff_tim', pkg.id, rawEffective, pkg.original_price ?? pkg.total_price, 0);
      costPrice = calc.costEffective;
      sellPrice = calc.sellEffective;
      orderSummary = `Buff ${Number(pkg.quantity).toLocaleString('vi-VN')} Tim${useSale ? ' (Sale)' : ''}`;

      hnPayload = {
        customer_id: Number(customer_id),
        game_profile_id: game_profile_id ? Number(game_profile_id) : undefined,
        price_package_id: Number(pkg.id),
        total_cnt: Number(pkg.quantity),
        is_active: true,
        expect_sale: !!useSale,
        expect_package_sale_id: useSale ? Number(expect_package_sale_id || pkg.sale.id) : null,
        confirm_duplicate_customer: !!confirm_duplicate_customer,
      };
    } else if (category === 'buff_sao') {
      apiPath = '/api/buff-sao-orders';
      const pkg = rawCatalog.buffSaoPackages.find((p) => Number(p.id) === Number(price_package_id));
      if (!pkg) {
        return res.status(400).json({ success: false, message: 'Gói Buff Sao không hợp lệ.' });
      }
      const calc = getPackageSellingPrice('buff_sao', pkg.id, pkg.total_price, pkg.total_price, 0);
      costPrice = calc.costEffective;
      sellPrice = calc.sellEffective;
      orderSummary = `Buff ${Number(pkg.quantity).toLocaleString('vi-VN')} Sao`;

      hnPayload = {
        customer_id: Number(customer_id),
        game_profile_id: game_profile_id ? Number(game_profile_id) : undefined,
        price_package_id: Number(pkg.id),
        total_cnt: Number(pkg.quantity),
        is_active: true,
        confirm_duplicate_customer: !!confirm_duplicate_customer,
      };
    } else if (category === 'guestbook') {
      apiPath = '/api/guestbook-orders';
      const pkg = rawCatalog.guestbookPackages.find((p) => Number(p.id) === Number(price_package_id));
      if (!pkg) {
        return res.status(400).json({ success: false, message: 'Gói Bài viết không hợp lệ.' });
      }
      if (!guest_book_message || !String(guest_book_message).trim()) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập nội dung bài viết lưu bút.' });
      }
      const calc = getPackageSellingPrice('guestbook', pkg.id, pkg.total_price, pkg.total_price, 0);
      costPrice = calc.costEffective;
      sellPrice = calc.sellEffective;
      orderSummary = `Bài viết ${Number(pkg.quantity).toLocaleString('vi-VN')} lượt`;

      hnPayload = {
        customer_id: Number(customer_id),
        game_profile_id: game_profile_id ? Number(game_profile_id) : undefined,
        price_package_id: Number(pkg.id),
        guest_book_message: String(guest_book_message).trim(),
        is_active: true,
      };
    } else if (category === 'farm_gift' || category === 'mail_gift') {
      apiPath = category === 'farm_gift' ? '/api/farm-gift-orders' : '/api/mail-gift-orders';
      const giftList = category === 'farm_gift' ? rawCatalog.farmGifts : rawCatalog.mailGifts;
      const gift = giftList.find((g) => Number(g.id) === Number(gift_id));
      const plantPkg = (gift?.gift_plants || []).find((gp) => Number(gp.id) === Number(gift_plant_id));
      if (!gift || !plantPkg) {
        return res.status(400).json({
          success: false,
          message: 'Gói quà tặng hiện không hoạt động hoặc không tồn tại.',
        });
      }
      const useSale = expect_sale !== false && plantPkg.is_on_sale && plantPkg.sale;
      const rawEffective = Number(useSale ? plantPkg.sale.sale_price : plantPkg.total_price);
      const calc = getPackageSellingPrice(category, plantPkg.id, rawEffective, plantPkg.total_price, 0);
      costPrice = calc.costEffective;
      sellPrice = calc.sellEffective;
      orderSummary = `${gift.item?.name || 'Quà'} × ${Number(plantPkg.quantity).toLocaleString('vi-VN')}`;

      hnPayload = {
        customer_id: Number(customer_id),
        game_profile_id: game_profile_id ? Number(game_profile_id) : undefined,
        gift_id: Number(gift.id),
        gift_plant_id: Number(plantPkg.id),
        message: category === 'mail_gift' ? String(message || 'Cảm ơn quý khách') : undefined,
        expect_sale: category === 'mail_gift' ? !!useSale : undefined,
        expect_package_sale_id: category === 'mail_gift' && useSale ? plantPkg.sale?.id ?? null : undefined,
        is_active: true,
        confirm_duplicate_customer: !!confirm_duplicate_customer,
      };
    } else {
      return res.status(400).json({ success: false, message: 'Danh mục đặt đơn không hợp lệ.' });
    }

    // STRICT WALLET CHECK FOR CTV: Must have enough balance to pay sellPrice!
    if (!isAdmin && Number(user.balance || 0) < sellPrice) {
      return res.status(400).json({
        success: false,
        code: 'INSUFFICIENT_BALANCE',
        message: `Số dư ví CTV không đủ để thanh toán đơn này (Số dư hiện tại: ${Number(
          user.balance || 0
        ).toLocaleString('vi-VN')}đ, Cần thanh toán: ${sellPrice.toLocaleString(
          'vi-VN'
        )}đ). Vui lòng nạp thêm tiền vào ví!`,
      });
    }

    // Forward order creation to HoanNguyen API
    const hnResult = await hnApiCall(apiPath, 'POST', hnPayload);

    if (hnResult?.needs_confirmation && hnResult?.code === 'duplicate_customer') {
      return res.json({
        success: false,
        needs_confirmation: true,
        code: 'duplicate_customer',
        message:
          hnResult.message ||
          'Khách hàng này đang có đơn hàng đang chạy. Bạn có chắc chắn muốn tạo thêm đơn mới?',
        existing_orders: hnResult.data?.existing_orders || [],
        customer: hnResult.data?.customer || customer_snapshot,
      });
    }

    if (!hnResult?.success) {
      return res.status(400).json({
        success: false,
        message: hnResult?.message || 'Tạo đơn hàng thất bại.',
      });
    }

    const createdRemoteOrder = hnResult.data || {};
    const remoteOrderId = createdRemoteOrder.id || null;

    // Deduct sellPrice from CTV balance
    if (!isAdmin) {
      user.balance = Number(user.balance || 0) - sellPrice;
    }

    const profit = sellPrice - costPrice;

    const localOrder = {
      id: `ZNP-${Date.now().toString(36).toUpperCase()}`,
      remoteOrderId,
      category,
      categoryName: CATEGORY_METADATA[category]?.menuLabel || category,
      apiOrderPath: apiPath,
      summary: orderSummary,
      customer: {
        customerId: customer_id,
        gameProfileId: game_profile_id || null,
        nickname:
          createdRemoteOrder.customer?.nickname ||
          customer_snapshot?.nickname ||
          `Khách #${customer_id}`,
        suid: createdRemoteOrder.customer?.suid || customer_snapshot?.suid || '',
      },
      costPrice,
      markupAmount: profit,
      sellPrice,
      placedBy: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
      },
      status: createdRemoteOrder.status || 'pending',
      isActive: createdRemoteOrder.is_active ?? true,
      totalCnt: createdRemoteOrder.total_cnt ?? hnPayload.total_cnt ?? 0,
      sendingCnt: createdRemoteOrder.sending_cnt ?? 0,
      completedCnt: createdRemoteOrder.completed_cnt ?? 0,
      failedCnt: createdRemoteOrder.failed_cnt ?? 0,
      note: createdRemoteOrder.price_adjustment_note || null,
      createdAt: new Date().toISOString(),
    };

    db.localOrders.unshift(localOrder);
    db.transactions.unshift({
      id: `TRX-${Date.now().toString(36).toUpperCase()}`,
      userId: user.id,
      userName: user.name,
      type: 'order_debit',
      amount: -sellPrice,
      balanceAfter: user.balance,
      note: `Tạo đơn ${localOrder.categoryName}: ${localOrder.summary} (${localOrder.customer.nickname})`,
      createdAt: new Date().toISOString(),
    });
    saveDb(db);

    // Strip costPrice & markupAmount before returning to CTV!
    const publicOrder = {
      ...localOrder,
      costPrice: isAdmin ? localOrder.costPrice : undefined,
      markupAmount: isAdmin ? localOrder.markupAmount : undefined,
    };

    res.json({
      success: true,
      message: 'Tạo đơn hàng thành công!',
      order: publicOrder,
      userBalance: user.balance,
    });
  } catch (err) {
    console.error('Error placing order:', err);
    res.status(400).json({
      success: false,
      message: err.message || 'Lỗi khi tạo đơn hàng.',
    });
  }
});

// ============================================================================
// ORDERS LIST & LIVE TELEMETRY SYNC (STRICT ISOLATION FOR CTV!)
// ============================================================================
app.get('/api/orders', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.role === 'admin';
    const categoryFilter = req.query.category || 'all';

    // Fetch live active & completed orders from HoanNguyen across all endpoints
    const [
      fruitActiveRes,
      fruitCompRes,
      timActiveRes,
      timCompRes,
      saoActiveRes,
      saoCompRes,
      bookRes,
      farmGiftRes,
      mailGiftRes,
      weatherRes,
    ] = await Promise.all([
      hnApiCall('/api/fruit-coin-orders?page=1&per_page=25&status_group=active&include_summary=1').catch(() => ({ data: { data: [] } })),
      hnApiCall('/api/fruit-coin-orders?page=1&per_page=15&status_group=completed').catch(() => ({ data: { data: [] } })),
      hnApiCall('/api/buff-tim-orders?page=1&per_page=25&status_group=active&include_summary=1').catch(() => ({ data: { data: [] } })),
      hnApiCall('/api/buff-tim-orders?page=1&per_page=15&status_group=completed').catch(() => ({ data: { data: [] } })),
      hnApiCall('/api/buff-sao-orders?page=1&per_page=25&status_group=active&include_summary=1').catch(() => ({ data: { data: [] } })),
      hnApiCall('/api/buff-sao-orders?page=1&per_page=15&status_group=completed').catch(() => ({ data: { data: [] } })),
      hnApiCall('/api/guestbook-orders?page=1&per_page=25').catch(() => ({ data: { data: [] } })),
      hnApiCall('/api/farm-gift-orders?page=1&per_page=25').catch(() => ({ data: { data: [] } })),
      hnApiCall('/api/mail-gift-orders?page=1&per_page=25').catch(() => ({ data: { data: [] } })),
      hnApiCall('/api/weather-buff-orders?page=1&per_page=25&status_group=active').catch(() => ({ data: { data: [] } })),
    ]);

    const remoteMap = new Map();
    const collectRemote = (arr, catKey) => {
      const list = Array.isArray(arr?.data?.data) ? arr.data.data : [];
      for (const item of list) {
        const actualCat =
          catKey === 'fruit_coin' && item.type === 'by_fruit' ? 'fruit_by_fruit' : catKey;
        remoteMap.set(`${actualCat}:${item.id}`, { ...item, _category: actualCat });
        remoteMap.set(`any:${item.id}`, { ...item, _category: actualCat });
      }
    };

    collectRemote(fruitActiveRes, 'fruit_coin');
    collectRemote(fruitCompRes, 'fruit_coin');
    collectRemote(timActiveRes, 'buff_tim');
    collectRemote(timCompRes, 'buff_tim');
    collectRemote(saoActiveRes, 'buff_sao');
    collectRemote(saoCompRes, 'buff_sao');
    collectRemote(bookRes, 'guestbook');
    collectRemote(farmGiftRes, 'farm_gift');
    collectRemote(mailGiftRes, 'mail_gift');
    collectRemote(weatherRes, 'weather_buff');

    const matchedRemoteKeys = new Set();
    for (const lo of db.localOrders) {
      if (lo.remoteOrderId) {
        const rem =
          remoteMap.get(`${lo.category}:${lo.remoteOrderId}`) ||
          remoteMap.get(`any:${lo.remoteOrderId}`);
        if (rem) {
          lo.status = rem.status || lo.status;
          lo.isActive = rem.is_active ?? lo.isActive;
          lo.totalCnt = rem.total_cnt ?? rem.package_quantity ?? lo.totalCnt;
          lo.sendingCnt = rem.sending_cnt ?? 0;
          lo.completedCnt = rem.completed_cnt ?? lo.completedCnt;
          lo.failedCnt = rem.failed_cnt ?? 0;
          lo.lastAssignedAt = rem.last_assigned_at || null;
          lo.note = rem.price_adjustment_note || rem.note || lo.note || null;
          if (rem.customer) {
            lo.customer.nickname = rem.customer.nickname || lo.customer.nickname;
            lo.customer.suid = rem.customer.suid || lo.customer.suid;
          }
          matchedRemoteKeys.add(`${rem._category}:${rem.id}`);
        }
      }
    }

    // Build list: CTV only sees their own orders and NEVER sees costPrice or markupAmount!
    let results = db.localOrders
      .filter((lo) => isAdmin || lo.placedBy?.id === user.id)
      .map((lo) => ({
        id: lo.id,
        remoteOrderId: lo.remoteOrderId,
        category: lo.category,
        categoryName: CATEGORY_METADATA[lo.category]?.menuLabel || lo.categoryName,
        summary: lo.summary,
        customer: lo.customer,
        sellPrice: lo.sellPrice,
        costPrice: isAdmin ? lo.costPrice : undefined,
        markupAmount: isAdmin ? lo.markupAmount : undefined,
        placedBy: isAdmin ? lo.placedBy : undefined,
        status: lo.status,
        isActive: lo.isActive,
        totalCnt: lo.totalCnt || 0,
        sendingCnt: lo.sendingCnt || 0,
        completedCnt: lo.completedCnt || 0,
        failedCnt: lo.failedCnt || 0,
        lastAssignedAt: lo.lastAssignedAt || null,
        note: lo.note || null,
        createdAt: lo.createdAt,
        source: 'znplay',
      }));

    // Admin also sees pre-existing orders synced from HoanNguyen
    if (isAdmin) {
      for (const [key, rem] of remoteMap.entries()) {
        if (key.startsWith('any:')) continue;
        if (matchedRemoteKeys.has(key)) continue;

        const cat = rem._category;
        const cost = Number(rem.total_price || 0);
        let summary = '';
        let custNickname = rem.customer?.nickname || `Khách #${rem.customer_id || rem.id}`;
        let custSuid = rem.customer?.suid || '';

        if (cat === 'fruit_coin') {
          summary = `Gói ${Number(rem.total_cnt || 0).toLocaleString('vi-VN')} Xu`;
        } else if (cat === 'fruit_by_fruit') {
          summary = `${Number(rem.total_cnt || 0).toLocaleString('vi-VN')} trái ${
            rem.fruit_item?.item?.name || ''
          }`;
        } else if (cat === 'buff_tim') {
          summary = `Buff ${Number(rem.total_cnt || 0).toLocaleString('vi-VN')} Tim`;
        } else if (cat === 'buff_sao') {
          summary = `Buff ${Number(rem.total_cnt || 0).toLocaleString('vi-VN')} Sao`;
        } else if (cat === 'guestbook') {
          summary = `Bài viết: "${String(rem.guest_book_message || '').slice(0, 28)}"`;
        } else if (cat === 'weather_buff') {
          const wName = rem.weathers?.[0]?.weather_type?.name || 'Thời tiết';
          const slotCust = rem.slots?.find((s) => s.customer)?.customer;
          if (slotCust) {
            custNickname = slotCust.nickname || custNickname;
            custSuid = slotCust.suid || custSuid;
          }
          summary = `${wName} (${rem.package_quantity || 0} lần)`;
        } else {
          summary = `${rem.gift?.item?.name || 'Quà'} × ${Number(rem.total_cnt || 0).toLocaleString('vi-VN')}`;
        }

        results.push({
          id: `HN-${rem.id}`,
          remoteOrderId: rem.id,
          category: cat,
          categoryName: CATEGORY_METADATA[cat]?.menuLabel || cat,
          summary,
          customer: {
            customerId: rem.customer_id,
            gameProfileId: rem.game_profile_id,
            nickname: custNickname,
            suid: custSuid,
          },
          costPrice: cost,
          markupAmount: 0,
          sellPrice: cost,
          placedBy: {
            id: 'usr_admin_1',
            name: rem.creator?.name || 'Admin (Gốc)',
            role: 'admin',
          },
          status: rem.status || 'assigned',
          isActive: rem.is_active ?? true,
          totalCnt: rem.total_cnt ?? rem.package_quantity ?? 0,
          sendingCnt: rem.sending_cnt ?? 0,
          completedCnt: rem.completed_cnt ?? 0,
          failedCnt: rem.failed_cnt ?? 0,
          lastAssignedAt: rem.last_assigned_at || null,
          note: rem.price_adjustment_note || rem.note || null,
          createdAt: rem.created_at || new Date().toISOString(),
          source: 'hoannguyen_sync',
        });
      }
    }

    if (categoryFilter && categoryFilter !== 'all') {
      if (categoryFilter === 'fruit_all') {
        results = results.filter((o) => o.category === 'fruit_coin' || o.category === 'fruit_by_fruit');
      } else {
        results = results.filter((o) => o.category === categoryFilter);
      }
    }

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      success: true,
      orders: results,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Không thể tải danh sách đơn hàng.',
    });
  }
});

// Toggle Active / Inactive Order (Strict ownership check for CTV)
app.put('/api/orders/:category/:remoteId/toggle-active', requireAuth, requirePositiveBalanceForCtv, async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.role === 'admin';
    const { category, remoteId } = req.params;

    const lo = db.localOrders.find((o) => String(o.remoteOrderId) === String(remoteId));
    if (!isAdmin && (!lo || lo.placedBy?.id !== user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Bạn chỉ có thể thao tác trên đơn hàng do chính tài khoản của bạn tạo.',
      });
    }

    const meta = CATEGORY_METADATA[category];
    if (!meta) {
      return res.status(400).json({ success: false, message: 'Danh mục đơn không hợp lệ.' });
    }
    const r = await hnApiCall(`${meta.apiOrderPath}/${encodeURIComponent(remoteId)}/toggle-active`, 'PUT');
    res.json({
      success: true,
      message: r?.message || 'Đã cập nhật trạng thái bật/tắt đơn hàng.',
      data: r?.data,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message || 'Không thể bật/tắt đơn hàng này.',
    });
  }
});

// Delete Unstarted / Completed Order (Strict ownership check for CTV + Auto Refund)
app.delete('/api/orders/:category/:remoteId', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.role === 'admin';
    const { category, remoteId } = req.params;

    const idx = db.localOrders.findIndex((o) => String(o.remoteOrderId) === String(remoteId));
    if (!isAdmin && (idx < 0 || db.localOrders[idx].placedBy?.id !== user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Bạn chỉ có thể xóa đơn hàng do chính tài khoản của bạn tạo.',
      });
    }

    const meta = CATEGORY_METADATA[category];
    if (!meta) {
      return res.status(400).json({ success: false, message: 'Danh mục đơn không hợp lệ.' });
    }
    const r = await hnApiCall(`${meta.apiOrderPath}/${encodeURIComponent(remoteId)}`, 'DELETE', {
      deletion_note: req.body?.deletion_note || 'Xóa đơn từ ZnPlay',
    });

    if (idx >= 0) {
      const lo = db.localOrders[idx];
      if (lo.status !== 'completed' && lo.placedBy?.role === 'ctv') {
        const ctvUser = db.users.find((u) => u.id === lo.placedBy.id);
        if (ctvUser) {
          ctvUser.balance = Number(ctvUser.balance || 0) + Number(lo.sellPrice || 0);
          db.transactions.unshift({
            id: `TRX-${Date.now().toString(36).toUpperCase()}`,
            userId: ctvUser.id,
            userName: ctvUser.name,
            type: 'order_refund',
            amount: Number(lo.sellPrice || 0),
            balanceAfter: ctvUser.balance,
            note: `Hoàn tiền xóa đơn #${remoteId} (${lo.summary})`,
            createdAt: new Date().toISOString(),
          });
        }
      }
      db.localOrders.splice(idx, 1);
      saveDb(db);
    }

    res.json({
      success: true,
      message: r?.message || 'Đã xóa đơn hàng thành công.',
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message || 'Không thể xóa đơn hàng (chỉ xóa được đơn chưa chạy hoặc đã hoàn thành).',
    });
  }
});

// ============================================================================
// WEEKLY SETTLEMENTS & TRANSACTION LEDGER
// ============================================================================
app.get('/api/settlements', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.role === 'admin';
    const weekStart = String(req.query.week_start || getCurrentMondayStr());

    if (isAdmin) {
      const hnSettle = await hnApiCall(`/api/seller-settlements?week_start=${encodeURIComponent(weekStart)}`).catch(
        () => ({ data: null })
      );
      res.json({
        success: true,
        mode: 'admin',
        weekStart,
        hnSettlement: hnSettle?.data || null,
        localOrders: db.localOrders,
        transactions: db.transactions.slice(0, 100),
      });
    } else {
      const myOrders = db.localOrders.filter((o) => o.placedBy?.id === user.id);
      const myTrx = db.transactions.filter((t) => t.userId === user.id).slice(0, 100);
      const totalSpent = myOrders.reduce((s, o) => s + Number(o.sellPrice || 0), 0);
      res.json({
        success: true,
        mode: 'ctv',
        weekStart,
        summary: {
          orderCount: myOrders.length,
          totalSpent,
          currentBalance: user.balance,
        },
        orders: myOrders.map(({ costPrice, markupAmount, ...rest }) => rest),
        transactions: myTrx,
      });
    }
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ============================================================================
// ADMIN ENDPOINTS (PER-ITEM PRICING, CTV ACCOUNTS, HOANNGUYEN CONFIG)
// ============================================================================
// Apply authorization to the entire namespace, including future admin routes.
app.use('/api/admin', requireAdmin);

app.put('/api/admin/password', (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || !verifyPassword(currentPassword, req.user.password)) {
    return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không chính xác.' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 128) {
    return res.status(400).json({ success: false, message: 'Mật khẩu mới cần từ 12 đến 128 ký tự.' });
  }
  if (verifyPassword(newPassword, req.user.password)) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn mật khẩu mới khác mật khẩu hiện tại.' });
  }
  req.user.password = hashPassword(newPassword);
  for (const [token, session] of Object.entries(db.sessions)) {
    const userId = typeof session === 'string' ? session : session.userId;
    if (userId === req.user.id) delete db.sessions[token];
  }
  saveDb(db);
  res.json({ success: true, message: 'Đã đổi mật khẩu. Vui lòng đăng nhập lại bằng mật khẩu mới.' });
});

app.get('/api/admin/overview', requireAdmin, async (req, res) => {
  try {
    if (!upstreamStatus.lastCheckedAt || Date.now() - Date.parse(upstreamStatus.lastCheckedAt) > 30000) {
      await hnApiCall('/api/settings?keys=is_send_task');
    }
  } catch {}

  const ctvList = db.users
    .filter((u) => u.role === 'ctv')
    .map((u) => {
      const ctvOrders = db.localOrders.filter((o) => o.placedBy?.id === u.id);
      const totalSpent = ctvOrders.reduce((s, o) => s + Number(o.sellPrice || 0), 0);
      const totalProfit = ctvOrders.reduce((s, o) => s + Number(o.markupAmount || 0), 0);
      return {
        ...sanitizeUser(u),
        totalOrders: ctvOrders.length,
        totalSpent,
        totalProfit,
      };
    });

  const totalLocalOrders = db.localOrders.length;
  const totalRevenue = db.localOrders.reduce((s, o) => s + Number(o.sellPrice || 0), 0);
  const totalCost = db.localOrders.reduce((s, o) => s + Number(o.costPrice || 0), 0);
  const totalProfit = db.localOrders.reduce((s, o) => s + Number(o.markupAmount || 0), 0);

  res.json({
    success: true,
    settings: {
      brandName: db.settings.brandName,
      defaultMarkup: db.settings.defaultMarkup,
      defaultFruitUnitMarkup: db.settings.defaultFruitUnitMarkup ?? 40,
      categoryMarkups: db.settings.categoryMarkups,
      packagePriceOverrides: db.settings.packagePriceOverrides,
      fruitUnitPrices: db.settings.fruitUnitPrices,
      fruitMutationPrices: db.settings.fruitMutationPrices,
      hoanNguyen: {
        baseUrl: db.settings.hoanNguyen.baseUrl,
        email: db.settings.hoanNguyen.email,
        ...upstreamStatus,
        user: db.settings.hoanNguyen.user,
        lastLoginAt: db.settings.hoanNguyen.lastLoginAt,
      },
    },
    stats: {
      totalLocalOrders,
      totalRevenue,
      totalCost,
      totalProfit,
      totalCtvCount: ctvList.length,
    },
    ctvs: ctvList,
    transactions: db.transactions.slice(0, 80),
  });
});

app.put('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const {
      defaultMarkup,
      defaultFruitUnitMarkup,
      categoryMarkups,
      packagePriceOverrides,
      fruitUnitPrices,
      fruitMutationPrices,
      hoanNguyenEmail,
      hoanNguyenPassword,
    } = req.body || {};

    if (defaultMarkup !== undefined) {
      db.settings.defaultMarkup = Math.max(0, Number(defaultMarkup));
    }
    if (defaultFruitUnitMarkup !== undefined) {
      db.settings.defaultFruitUnitMarkup = Math.max(0, Number(defaultFruitUnitMarkup));
    }
    if (categoryMarkups && typeof categoryMarkups === 'object') {
      for (const [k, v] of Object.entries(categoryMarkups)) {
        if (v !== undefined && v !== '') {
          db.settings.categoryMarkups[k] = Math.max(0, Number(v));
        }
      }
    }
    if (packagePriceOverrides && typeof packagePriceOverrides === 'object') {
      for (const [k, v] of Object.entries(packagePriceOverrides)) {
        if (v === null || v === '' || Number(v) <= 0) {
          delete db.settings.packagePriceOverrides[k];
        } else {
          db.settings.packagePriceOverrides[k] = Math.round(Number(v));
        }
      }
    }
    if (fruitUnitPrices && typeof fruitUnitPrices === 'object') {
      for (const [k, v] of Object.entries(fruitUnitPrices)) {
        if (v === null || v === '' || Number(v) < 0) {
          delete db.settings.fruitUnitPrices[k];
        } else {
          db.settings.fruitUnitPrices[k] = Math.round(Number(v));
        }
      }
    }
    if (fruitMutationPrices && typeof fruitMutationPrices === 'object') {
      for (const [k, v] of Object.entries(fruitMutationPrices)) {
        if (v === null || v === '' || Number(v) < 0) {
          delete db.settings.fruitMutationPrices[k];
        } else {
          db.settings.fruitMutationPrices[k] = Math.round(Number(v));
        }
      }
    }

    let needRelogin = false;
    if (hoanNguyenEmail && hoanNguyenEmail.trim() !== db.settings.hoanNguyen.email) {
      db.settings.hoanNguyen.email = hoanNguyenEmail.trim();
      needRelogin = true;
    }
    if (hoanNguyenPassword && hoanNguyenPassword.trim() !== '') {
      db.settings.hoanNguyen.password = hoanNguyenPassword.trim();
      needRelogin = true;
    }

    saveDb(db);
    if (needRelogin) {
      db.settings.hoanNguyen.token = '';
      catalogCache = { timestamp: 0, raw: null };
      saveDb(db);
      await loginToHoanNguyen(true);
      await fetchRawCatalogFromHoanNguyen(true);
    }

    res.json({
      success: true,
      message: 'Đã lưu toàn bộ bảng giá CTV và cấu hình hệ thống thành công!',
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message || 'Lỗi khi lưu cấu hình.',
    });
  }
});

app.post('/api/admin/hoannguyen/reconnect', requireAdmin, async (req, res) => {
  try {
    await loginToHoanNguyen(true);
    await fetchRawCatalogFromHoanNguyen(true);
    res.json({
      success: true,
      message: 'Đã kết nối lại và đồng bộ dữ liệu mới nhất từ HoanNguyen!',
      hoanNguyen: {
        email: db.settings.hoanNguyen.email,
        ...upstreamStatus,
        user: db.settings.hoanNguyen.user,
        lastLoginAt: db.settings.hoanNguyen.lastLoginAt,
      },
    });
  } catch (err) {
    res.status(502).json({
      success: false,
      message: err.message || 'Không thể kết nối tới HoanNguyen.',
    });
  }
});

// Create CTV Account
app.post('/api/admin/ctv', requireAdmin, (req, res) => {
  const { name, username, email, password, phone, balance } = req.body || {};
  const cleanUsername = String(username || '').trim().toLowerCase();
  const cleanEmail = String(email || `${cleanUsername}@znplay.vn`).trim().toLowerCase();

  if (!name || !cleanUsername || !password) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng nhập đầy đủ Tên CTV, Tên đăng nhập và Mật khẩu.',
    });
  }

  const exists = db.users.some(
    (u) => u.username?.toLowerCase() === cleanUsername || u.email?.toLowerCase() === cleanEmail
  );
  if (exists) {
    return res.status(400).json({
      success: false,
      message: 'Tên đăng nhập hoặc Email CTV đã tồn tại.',
    });
  }

  const initBalance = Math.max(0, Number(balance || 0));
  const newCtv = {
    id: `usr_ctv_${Date.now().toString(36)}`,
    username: cleanUsername,
    email: cleanEmail,
    password: hashPassword(String(password)),
    name: String(name).trim(),
    phone: String(phone || '').trim(),
    role: 'ctv',
    balance: initBalance,
    isLocked: false,
    createdAt: new Date().toISOString(),
  };

  db.users.push(newCtv);
  if (initBalance > 0) {
    db.transactions.unshift({
      id: `TRX-${Date.now().toString(36).toUpperCase()}`,
      userId: newCtv.id,
      userName: newCtv.name,
      type: 'admin_topup',
      amount: initBalance,
      balanceAfter: initBalance,
      note: 'Số dư khởi tạo khi mở tài khoản CTV',
      createdAt: new Date().toISOString(),
    });
  }
  saveDb(db);

  res.json({
    success: true,
    message: `Đã tạo tài khoản CTV "${newCtv.name}" (${newCtv.username}) thành công!`,
    ctv: sanitizeUser(newCtv),
  });
});

// Update CTV Account
app.put('/api/admin/ctv/:id', requireAdmin, (req, res) => {
  const ctv = db.users.find((u) => u.id === req.params.id && u.role === 'ctv');
  if (!ctv) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản CTV.' });
  }

  const { name, email, phone, password, isLocked } = req.body || {};
  if (name !== undefined) ctv.name = String(name).trim();
  if (email !== undefined) ctv.email = String(email).trim().toLowerCase();
  if (phone !== undefined) ctv.phone = String(phone).trim();
  if (password !== undefined && String(password).trim() !== '') {
    ctv.password = hashPassword(String(password).trim());
  }
  if (isLocked !== undefined) ctv.isLocked = !!isLocked;

  saveDb(db);
  res.json({
    success: true,
    message: `Đã cập nhật tài khoản CTV "${ctv.name}".`,
    ctv: sanitizeUser(ctv),
  });
});

// Top-up / Deduct CTV Balance
app.post('/api/admin/ctv/:id/balance', requireAdmin, (req, res) => {
  const ctv = db.users.find((u) => u.id === req.params.id && u.role === 'ctv');
  if (!ctv) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản CTV.' });
  }

  const amount = Number(req.body?.amount || 0);
  const note = String(req.body?.note || 'Admin điều chỉnh số dư').trim();
  if (!Number.isFinite(amount) || amount === 0) {
    return res.status(400).json({ success: false, message: 'Số tiền điều chỉnh phải khác 0.' });
  }

  ctv.balance = Math.max(0, Number(ctv.balance || 0) + amount);
  db.transactions.unshift({
    id: `TRX-${Date.now().toString(36).toUpperCase()}`,
    userId: ctv.id,
    userName: ctv.name,
    type: amount > 0 ? 'admin_topup' : 'admin_deduct',
    amount,
    balanceAfter: ctv.balance,
    note,
    createdAt: new Date().toISOString(),
  });
  saveDb(db);

  res.json({
    success: true,
    message: `Đã ${amount > 0 ? 'nạp' : 'trừ'} ${Math.abs(amount).toLocaleString('vi-VN')}đ cho CTV ${
      ctv.name
    }. Số dư mới: ${ctv.balance.toLocaleString('vi-VN')}đ`,
    ctv: sanitizeUser(ctv),
  });
});

// Delete CTV Account
app.delete('/api/admin/ctv/:id', requireAdmin, (req, res) => {
  const idx = db.users.findIndex((u) => u.id === req.params.id && u.role === 'ctv');
  if (idx < 0) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản CTV.' });
  }
  const removed = db.users.splice(idx, 1)[0];
  saveDb(db);
  res.json({
    success: true,
    message: `Đã xóa tài khoản CTV "${removed.name}".`,
  });
});

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, async () => {
  console.log(`ZnPlay Server running at http://localhost:${PORT}`);
  try {
    await hnApiCall('/api/settings?keys=is_send_task');
    console.log(
      'Connected to HoanNguyen API as:',
      db.settings.hoanNguyen.user?.name || db.settings.hoanNguyen.email
    );
  } catch (err) {
    console.warn('Initial HoanNguyen login warning:', err.message);
  }
});
