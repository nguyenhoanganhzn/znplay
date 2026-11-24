import express from 'express';
import { openPostgres } from './postgres-store.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HAS_ZLIB = typeof zlib !== 'undefined' && typeof zlib.gzipSync === 'function';
const HAS_ESBUILD = typeof esbuild !== 'undefined' && typeof esbuild.buildSync === 'function';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
// Reject sessions created by the former automatic / quick-login UI.
const AUTH_VERSION = 2;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
app.set('trust proxy', process.env.RENDER === 'true' ? 1 : false);

// ============================================================================
// SECURITY HEADERS, COMPRESSION & PROTECTED BUNDLE CACHE
// ============================================================================
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});
// Global Application-Layer DDoS & Flood Shield (bounded Map, zero memory leak)
const globalIpHits = new Map();
function checkBoundedBucket(map, key, maxHits, windowMs, maxSize = 2000) {
  const now = Date.now();
  if (map.size > maxSize) {
    for (const [k, v] of map) if (now > v.resetAt) map.delete(k);
    if (map.size > maxSize) map.delete(map.keys().next().value);
  }
  const entry = map.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count += 1;
  map.set(key, entry);
  return { allowed: entry.count <= maxHits, remaining: Math.max(0, maxHits - entry.count), retrySec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
}

app.use((req, res, next) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const hit = checkBoundedBucket(globalIpHits, ip, 600, 60000, 3000);
  if (!hit.allowed) {
    res.setHeader('Retry-After', String(hit.retrySec));
    return res.status(429).json({
      success: false,
      message: 'Hệ thống ghi nhận quá nhiều yêu cầu từ địa chỉ này. Vui lòng thử lại sau ít giây.',
    });
  }
  next();
});
app.use((req, res, next) => {
  if (req.path === '/api/admin/backup/import') return next();
  return express.json({ limit: '256kb' })(req, res, next);
});

function sendJsonPayload(req, res, sendOriginal, body) {
  if (!HAS_ZLIB) return sendOriginal(body);
  const accept = String(req.headers['accept-encoding'] || '');
  const jsonStr = JSON.stringify(body);
  if (jsonStr.length < 1024 || (!accept.includes('br') && !accept.includes('gzip'))) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.send(jsonStr);
  }
  const rawBuf = Buffer.from(jsonStr, 'utf8');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Vary', 'Accept-Encoding');
  if (accept.includes('br') && typeof zlib.brotliCompressSync === 'function') {
    const compressed = zlib.brotliCompressSync(rawBuf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } });
    res.setHeader('Content-Encoding', 'br');
    return res.send(compressed);
  }
  const compressed = zlib.gzipSync(rawBuf, { level: 6 });
  res.setHeader('Content-Encoding', 'gzip');
  return res.send(compressed);
}

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  const sendOriginal = res.json.bind(res);
  const send = body => sendJsonPayload(req, res, sendOriginal, body);
  const unavailable = () => {
    res.status(503);
    return send({ success: false, message: 'Kho dữ liệu tạm thời chưa sẵn sàng.' });
  };
  res.json = body => {
    const actor = req.user || req.auditUser;
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const recordActivity = Boolean(actor && isMutation);
    let committed = null;
    if (recordActivity) {
      pushAuditRecord(actor, `${req.method} ${req.path}`, { status: res.statusCode, ...req.auditDetails });
      committed = saveDb(db);
    } else if (req.needsSave) {
      committed = saveDb(db);
    } else if (postgres?.hasPending?.()) {
      committed = postgres.flush();
    }
    if (!committed) return send(body);
    committed.then(() => send(body), unavailable);
    return res;
  };
  if (postgres) {
    if (!storageHealthy) return unavailable();
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    if (isMutation) {
      postgres.ready().then(ready => ready && storageHealthy ? next() : unavailable(), unavailable);
      return;
    }
    if (postgres.hasPending?.()) {
      postgres.flush().then(() => storageHealthy ? next() : unavailable(), unavailable);
      return;
    }
  }
  next();
});

// Pre-bundled, minified & compressed static assets (zero source comments, zero raw JS exposure, instant ETag 304)
const PUBLIC_DIR = path.join(__dirname, 'public');
const staticCache = new Map();

function packStaticBuffer(rawBuf, mime) {
  const etag = `"${crypto.createHash('sha1').update(rawBuf).digest('hex').slice(0, 16)}"`;
  const gzip = HAS_ZLIB ? zlib.gzipSync(rawBuf, { level: 6 }) : null;
  const br = HAS_ZLIB && typeof zlib.brotliCompressSync === 'function'
    ? zlib.brotliCompressSync(rawBuf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })
    : null;
  return { raw: rawBuf, gzip, br, etag, mime };
}

function minifyHtmlDocument(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/href="\/styles\.css"/g, 'href="/assets/zn.bundle.css"')
    .replace(/<script\s+type="module"\s+src="\/app\.js"><\/script>/g, '<script src="/assets/zn.bundle.js" defer></script>')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function ensureProtectedAssets() {
  if (staticCache.size > 0 || !HAS_ESBUILD) return;
  try {
    const htmlPath = path.join(PUBLIC_DIR, 'index.html');
    const jsPath = path.join(PUBLIC_DIR, 'app.js');
    const cssPath = path.join(PUBLIC_DIR, 'styles.css');
    if (!fs.existsSync(htmlPath) || !fs.existsSync(jsPath) || !fs.existsSync(cssPath)) return;

    const bundledJs = esbuild.buildSync({
      entryPoints: [jsPath],
      bundle: true,
      minify: true,
      format: 'iife',
      target: ['es2020'],
      legalComments: 'none',
      sourcemap: false,
      write: false,
    });
    const jsOut = bundledJs.outputFiles?.[0]?.contents;
    if (!jsOut) return;

    const cssRaw = fs.readFileSync(cssPath, 'utf8');
    const cssMin = esbuild.transformSync(cssRaw, { loader: 'css', minify: true, legalComments: 'none' }).code;

    const htmlRaw = fs.readFileSync(htmlPath, 'utf8');
    const htmlMin = minifyHtmlDocument(htmlRaw);

    staticCache.set('index.html', packStaticBuffer(Buffer.from(htmlMin, 'utf8'), 'text/html; charset=utf-8'));
    staticCache.set('assets/zn.bundle.js', packStaticBuffer(Buffer.from(jsOut), 'application/javascript; charset=utf-8'));
    staticCache.set('assets/zn.bundle.css', packStaticBuffer(Buffer.from(cssMin, 'utf8'), 'text/css; charset=utf-8'));
  } catch (err) {
    console.error('Asset bundle build failed:', err.message);
  }
}

function serveCachedStatic(req, res, cacheKey) {
  ensureProtectedAssets();
  const asset = staticCache.get(cacheKey);
  if (!asset) return false;
  res.setHeader('Content-Type', asset.mime);
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('ETag', asset.etag);
  res.setHeader('Vary', 'Accept-Encoding');
  if (req.headers['if-none-match'] === asset.etag) {
    res.status(304).end();
    return true;
  }
  const accept = String(req.headers['accept-encoding'] || '');
  if (asset.br && accept.includes('br')) {
    res.setHeader('Content-Encoding', 'br');
    res.send(asset.br);
    return true;
  }
  if (asset.gzip && accept.includes('gzip')) {
    res.setHeader('Content-Encoding', 'gzip');
    res.send(asset.gzip);
    return true;
  }
  res.send(asset.raw);
  return true;
}

const BLOCKED_RAW_PATHS = new Set(['app.js', 'tools.js', 'styles.css', 'index.html']);
const BLOCKED_EXTENSIONS = /\.(?:js|mjs|cjs|css|json|map|env|sql|log|bak|md|yml|yaml|ts|tsx|jsx|php|sh|ps1)$/i;
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return next();
  const cleanPath = req.path.replace(/^\/+/, '');
  if (cleanPath.startsWith('.') || cleanPath.includes('/.')) {
    return res.status(404).end();
  }
  if (req.path === '/') {
    if (serveCachedStatic(req, res, 'index.html')) return;
  }
  if (cleanPath === 'assets/zn.bundle.js' || cleanPath === 'assets/zn.bundle.css') {
    if (serveCachedStatic(req, res, cleanPath)) return;
  }
  if ((HAS_ESBUILD && BLOCKED_RAW_PATHS.has(cleanPath)) || BLOCKED_EXTENSIONS.test(cleanPath)) {
    return res.status(404).end();
  }
  next();
});

app.use(express.static(PUBLIC_DIR, {
  dotfiles: 'deny',
  setHeaders(res, filePath) {
    if (/\.(html|js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
    else if (/\.(jpg|jpeg|png|webp|svg|ico)$/i.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=604800');
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

function hashPasswordAsync(plain) {
  const s = String(plain || '');
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(s, salt, 64, (err, derived) => {
      if (err) reject(err);
      else resolve(`scrypt$${salt}$${derived.toString('hex')}`);
    });
  });
}

function verifyPasswordAsync(plain, stored) {
  const p = String(plain || '');
  const st = String(stored || '');
  if (!p || p.length > 128 || !st) return Promise.resolve(false);
  if (!st.startsWith('scrypt$')) {
    return Promise.resolve(p === st);
  }
  const parts = st.split('$');
  if (parts.length !== 3) return Promise.resolve(false);
  const [, salt, hashHex] = parts;
  const expected = Buffer.from(hashHex, 'hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(p, salt, 64, (err, derived) => {
      if (err) reject(err);
      else if (derived.length !== expected.length) resolve(false);
      else resolve(crypto.timingSafeEqual(derived, expected));
    });
  });
}

const loginAttempts = new Map();
const loginAccountFailures = new Map();
function checkLoginRateLimit(ip) {
  return checkBoundedBucket(loginAttempts, ip, 20, 60000, 1500).allowed;
}
function isLoginAccountThrottled(loginKey) {
  const now = Date.now();
  const entry = loginAccountFailures.get(loginKey);
  if (!entry) return false;
  if (now > entry.resetAt) {
    loginAccountFailures.delete(loginKey);
    return false;
  }
  return entry.count >= 10;
}
function recordLoginAccountFailure(loginKey) {
  if (!loginKey) return;
  checkBoundedBucket(loginAccountFailures, loginKey, 10, 5 * 60000, 1500);
}
function clearLoginAccountFailure(loginKey) {
  if (loginKey) loginAccountFailures.delete(loginKey);
}

// ============================================================================
// PERSISTENT ATOMIC DATABASE (data/db.json)
// ============================================================================
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DB_PATH = path.join(DATA_DIR, 'db.json');
let storageHealthy = true;
let postgres;
const storageError = () => Object.assign(new Error('Không lưu được dữ liệu. Tạm dừng thao tác để bảo vệ số dư.'), { status: 503 });

function asyncRoute(handler) {
  return (req, res, next) => handler(req, res, next).catch(next);
}

if (!process.env.DATABASE_URL && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}

const DEFAULT_DB = {
  settings: {
    brandName: 'ZnStudio',
    maintenanceMode: false,
    clientUpdateVersion: 0,
    defaultMarkup: 5000,
    categoryMarkups: {
      fruit_coin: 5000,
      fruit_by_fruit: 0, // Phí cộng thêm tùy chọn mỗi đơn Trái cây lẻ (+VNĐ/đơn)
      buff_tim: 5000,
      buff_sao: 5000,
      guestbook: 5000,
      farm_gift: 5000,
      mail_gift: 5000,
      weather_buff: 5000,
    },
    // Chế độ cộng giá từng danh mục: 'fixed' (+VNĐ) hoặc 'percent' (+%)
    categoryMarkupModes: {
      fruit_coin: 'fixed',
      fruit_by_fruit: 'fixed',
      buff_tim: 'fixed',
      buff_sao: 'fixed',
      guestbook: 'fixed',
      farm_gift: 'fixed',
      mail_gift: 'fixed',
      weather_buff: 'fixed',
    },
    // Mức cộng theo % cho từng danh mục (0..500%)
    categoryMarkupPercents: {
      fruit_coin: 0,
      fruit_by_fruit: 0,
      buff_tim: 0,
      buff_sao: 0,
      guestbook: 0,
      farm_gift: 0,
      mail_gift: 0,
      weather_buff: 0,
    },
    // Tùy chỉnh giá bán CTV trực tiếp cho từng gói cố định: { "fruit_coin:80": 15000, "buff_tim:94": 10000 }
    packagePriceOverrides: {},
    // Tùy chỉnh đơn giá bán CTV cho từng loại trái cây (trống = tự động theo giá gốc HoanNguyen + defaultFruitUnitMarkup)
    fruitUnitPrices: {},
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
  orderIntents: [],
  auditLog: [],
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

async function saveDb(data) {
  if (!storageHealthy) throw storageError();
  try {
    if (postgres) return await postgres.save(data);
    const json = JSON.stringify(data, null, 2);
    const tmpPath = `${DB_PATH}.tmp`;
    fs.writeFileSync(tmpPath, json, { encoding: 'utf8', mode: 0o600, flush: true });
    fs.renameSync(tmpPath, DB_PATH);
  } catch (err) {
    storageHealthy = false;
    throw storageError();
  }
}

function normalizeDb(raw) {
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
      categoryMarkupModes: {
        ...DEFAULT_DB.settings.categoryMarkupModes,
        ...(raw.settings?.categoryMarkupModes || {}),
      },
      categoryMarkupPercents: {
        ...DEFAULT_DB.settings.categoryMarkupPercents,
        ...(raw.settings?.categoryMarkupPercents || {}),
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
  return { data: merged, migrated };
}

function readSeed(requireFile = false) {
  if (!fs.existsSync(DB_PATH)) {
    if (requireFile) throw new Error('Cần bản sao db.json hiện hành để nhập PostgreSQL. Xem README.');
    return { data: createInitialDb(), migrated: true };
  }
  try {
    return normalizeDb(JSON.parse(fs.readFileSync(DB_PATH, 'utf8')));
  } catch {
    throw new Error('Không thể đọc cơ sở dữ liệu hiện có. Dừng máy chủ để tránh ghi đè dữ liệu; hãy kiểm tra hoặc khôi phục bản sao lưu.');
  }
}

const importOnly = process.argv?.includes('--import-json');
if (importOnly && !process.env.DATABASE_URL) throw new Error('Cần DATABASE_URL để nhập PostgreSQL.');
let db;
if (process.env.DATABASE_URL) {
  // Only require db.json when running explicit --import-json migration.
  // When attaching a fresh free PostgreSQL (Neon/Supabase) on Render, initialize cleanly using ADMIN_PASSWORD.
  const requireFile = importOnly;
  postgres = await openPostgres(process.env.DATABASE_URL, () => readSeed(requireFile).data, { importOnly });
  if (importOnly) {
    console.log('Đã nhập dữ liệu ZnPlay vào PostgreSQL.');
    process.exit(0);
  }
  const loaded = normalizeDb(postgres.state);
  db = loaded.data;
  if (loaded.migrated) await saveDb(db);
} else {
  const loaded = readSeed();
  db = loaded.data;
  if (loaded.migrated) await saveDb(db);
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Sunday 00:00 in Vietnam corresponds to Saturday 17:00 UTC.
function vietnamWeekStart(now = Date.now()) {
  const anchor = Date.UTC(1970, 0, 3, 17);
  return anchor + Math.floor((now - anchor) / WEEK_MS) * WEEK_MS;
}

function isPastOrderHistory(order, cutoff) {
  return Date.parse(order.createdAt) < cutoff && ['completed', 'cancelled'].includes(order.status)
    && !order.weatherDeletePending && !order.requiresReview && !order.refundPending && !order.cancelRequested;
}

function pruneWeekHistory(cutoff) {
  const orders = db.localOrders.filter(order => !isPastOrderHistory(order, cutoff));
  const events = db.auditLog.filter(event => !(Date.parse(event.createdAt) < cutoff));
  if (orders.length === db.localOrders.length && events.length === db.auditLog.length) return false;
  db.localOrders = orders;
  db.auditLog = events;
  return true;
}

let cleanedWeek = vietnamWeekStart();
if (pruneWeekHistory(cleanedWeek)) await saveDb(db);

async function rollWeekIfNeeded() {
  const cutoff = vietnamWeekStart();
  if (cleanedWeek === cutoff) return;
  cleanedWeek = cutoff;
  orderCache = {};
  if (pruneWeekHistory(cutoff)) await saveDb(db);
}

app.use('/api', (req, res, next) => rollWeekIfNeeded().then(() => next(), next));

function pushAuditRecord(actor, action, details = {}) {
  db.auditLog.unshift({
    id: crypto.randomUUID(), actorId: actor.id, actorName: actor.name,
    actorRole: actor.role, action: String(action).slice(0, 160), details,
    createdAt: new Date().toISOString(),
  });
  if (db.auditLog.length > 5000) db.auditLog = db.auditLog.slice(0, 5000);
}

function validMoney(value, allowZero = true) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= (allowZero ? 0 : 1) && value <= 1e12;
}

function publicError(req, error, fallback) {
  return req.user?.role === 'ctv' && error.upstream ? `${fallback} Liên hệ admin nếu lỗi tiếp diễn.` : error.message || fallback;
}

function enabled(value) { return value === true || value === 1 || value === '1' || value === 'true'; }

function financialGuard(req, res, next) {
  if (!storageHealthy) return res.status(503).json({ success: false, message: 'Lưu trữ đang lỗi. Tạm khóa thao tác tài chính; liên hệ admin.' });
  if (!req.user || req.user.isLocked || !db.users.some(u => u.id === req.user.id && !u.isLocked)) {
    return res.status(403).json({ success: false, message: 'Tài khoản không còn được phép thao tác.' });
  }
  next();
}

function validFruitInput(qty, mutations) {
  return Number.isSafeInteger(qty) && qty >= 1 && qty <= 1500 && Array.isArray(mutations) &&
    mutations.length <= 19 && new Set(mutations).size === mutations.length &&
    mutations.every(key => Number.isInteger(key) && Object.hasOwn(FRUIT_MUTATIONS, key));
}

const searchResults = new Map();
const chosenCustomers = new Map();
const actionLimits = new Map();
function limitInteractive(req, res, next) {
  const key = req.user.id;
  const now = Date.now();
  if (actionLimits.size > 1000) {
    for (const [k, v] of actionLimits) if (v.until <= now) actionLimits.delete(k);
    if (actionLimits.size > 1000) actionLimits.delete(actionLimits.keys().next().value);
  }
  const entry = actionLimits.get(key);
  if (entry && entry.until > now && entry.count >= 30) return res.status(429).json({ success: false, message: 'Bạn thao tác quá nhanh. Vui lòng đợi một phút.' });
  if (!entry || entry.until <= now) actionLimits.set(key, { until: now + 60000, count: 1 });
  else entry.count += 1;
  next();
}

function rememberCustomer(userId, customer) {
  const key = `${userId}:${customer.customerId}`;
  chosenCustomers.set(key, { customer, until: Date.now() + 30 * 60000 });
  if (chosenCustomers.size > 10000) {
    for (const [id, entry] of chosenCustomers) if (entry.until < Date.now()) chosenCustomers.delete(id);
    if (chosenCustomers.size > 10000) chosenCustomers.delete(chosenCustomers.keys().next().value);
  }
  return customer;
}

function normalizeWeatherSlots(slots, customerCount = 1) {
  const count = Math.max(1, Math.min(4, Number(customerCount) || 1));
  const list = Array.isArray(slots) ? slots : [];
  const byIdx = new Map();
  for (const s of list) {
    const idx = Number(s?.slot_index);
    if (!Number.isSafeInteger(idx) || idx < 0 || idx >= count) continue;
    byIdx.set(idx, {
      slot_index: idx,
      customer_id: s.customer_id ? Number(s.customer_id) : null,
      customer: s.customer
        ? {
            id: Number(s.customer.id || s.customer_id || 0),
            nickname: String(s.customer.nickname || ''),
            suid: String(s.customer.suid || ''),
          }
        : null,
    });
  }
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(byIdx.get(i) || { slot_index: i, customer_id: null, customer: null });
  }
  return result;
}

function normalizeWeatherLines(weathers) {
  if (!Array.isArray(weathers)) return [];
  return [...weathers]
    .sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0))
    .map((w, idx) => ({
      id: w?.id ? Number(w.id) : null,
      weather_type_id: Number(w?.weather_type_id || w?.weather_type?.id || 0),
      position: Number(w?.position ?? idx),
      quantity: Math.max(0, Number(w?.quantity || 0)),
      completed_cnt: Math.max(0, Number(w?.completed_cnt || 0)),
      name: String(w?.weather_type?.name || w?.name || `Thời tiết #${w?.weather_type_id || idx + 1}`),
      icon: w?.weather_type?.icon_path_and_name
        ? `/assets/playtogether/images/${String(w.weather_type.icon_path_and_name).replace(/^\/+/, '').replace(/\.png$/i, '')}.png`
        : w?.icon || null,
    }));
}

function buildSafeWeatherTrackUrl(url, publicToken) {
  const cleanUrl = typeof url === 'string' && /^https:\/\/[A-Za-z0-9.-]+\/track\/weather\/[A-Za-z0-9_-]+$/.test(url.trim()) && !/hoannguyen/i.test(url)
    ? url.trim()
    : null;
  if (cleanUrl) return cleanUrl;
  const tok = typeof publicToken === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(publicToken.trim()) ? publicToken.trim() : null;
  return tok ? `https://thoitietplay.us/track/weather/${tok}` : null;
}

function normalizeWeatherMeta(rem, prev = null) {
  const customerCount = Math.max(1, Math.min(4, Number(rem?.customer_count ?? prev?.customerCount ?? 1)));
  const packageQuantity = Math.max(0, Number(rem?.package_quantity ?? prev?.packageQuantity ?? 0));
  const pricePackageId = Number(rem?.price_package_id ?? prev?.pricePackageId ?? 0) || null;
  const slots = rem?.slots !== undefined ? normalizeWeatherSlots(rem.slots, customerCount) : (prev?.slots || normalizeWeatherSlots([], customerCount));
  const weathers = rem?.weathers !== undefined ? normalizeWeatherLines(rem.weathers) : (prev?.weathers || []);
  const publicToken = (typeof rem?.public_token === 'string' && rem.public_token.trim())
    ? rem.public_token.trim()
    : (prev?.publicToken || null);
  const trackUrl = buildSafeWeatherTrackUrl(rem?.track_url || rem?.url || prev?.trackUrl, publicToken);
  const casting = rem?.casting
    ? {
        weather_id: Number(rem.casting.weather_id || 0) || null,
        name: String(rem.casting.name || ''),
        started_at: rem.casting.started_at || null,
        duration_seconds: Number(rem.casting.duration_seconds || 300),
      }
    : null;
  return {
    pricePackageId,
    packageQuantity,
    customerCount,
    remoteRef: rem?.remote_ref || prev?.remoteRef || null,
    publicToken,
    trackUrl,
    slots,
    weathers,
    casting,
  };
}

function formatWeatherOrderSummary(weatherMeta, fallbackSummary = '') {
  const pkgQty = Number(weatherMeta?.packageQuantity || 0);
  const lines = Array.isArray(weatherMeta?.weathers) ? weatherMeta.weathers : [];
  if (lines.length === 0) {
    return pkgQty > 0 ? `Gói ${pkgQty.toLocaleString('vi-VN')} lần (Chưa chọn thời tiết)` : (fallbackSummary || 'Buff Thời Tiết');
  }
  const parts = lines.slice(0, 3).map(w => `${w.name} ×${Number(w.quantity || 0)}`);
  if (lines.length > 3) parts.push(`+${lines.length - 3} loại`);
  return `${parts.join(', ')}${pkgQty > 0 ? ` (${pkgQty.toLocaleString('vi-VN')} lần)` : ''}`;
}

function publicOrder(order, isAdmin) {
  if (isAdmin) return order;
  const safe = {};
  for (const key of ['id', 'remoteOrderId', 'category', 'categoryName', 'summary', 'customer', 'sellPrice', 'status',
    'isActive', 'totalCnt', 'sendingCnt', 'completedCnt', 'failedCnt', 'createdAt', 'cancelRequested', 'refundedAmount', 'refundPending', 'requiresReview']) safe[key] = order[key];
  if (order.category === 'weather_buff' && order.weather) {
    safe.weather = order.weather;
  }
  return { ...safe, note: order.requiresReview ? 'Đang được admin đối soát.' : null };
}

function releaseIntent(intent, reason) {
  if (intent.heldAmount > 0 && !intent.releasedAt) {
    const owner = db.users.find(u => u.id === intent.userId);
    if (!owner || !validMoney(owner.balance) || !validMoney(owner.balance + intent.heldAmount)) throw new Error('Không thể đối soát do tài khoản hoặc số dư không hợp lệ.');
    owner.balance += intent.heldAmount;
    intent.releasedAt = new Date().toISOString();
    db.transactions.unshift({ id: crypto.randomUUID(), userId: owner.id, userName: owner.name,
      type: 'order_release', amount: intent.heldAmount, balanceAfter: owner.balance,
      note: reason, createdAt: intent.releasedAt });
  }
}

const interrupted = db.orderIntents.filter(intent => intent.status === 'processing');
for (const intent of interrupted) {
  intent.status = 'uncertain';
  intent.message = 'Máy chủ khởi động lại khi đang gửi đơn. Cần admin đối soát nguồn trước khi xử lý tiếp.';
}
if (interrupted.length) await saveDb(db);

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
    // HoanNguyen's WeatherBuffOrdersBoard uses <OrderSystemStatusChip /> without a category key (depends only on is_send_task).
    settingKey: null,
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

function validPercent(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 500;
}

function getPackageSellingPrice(categoryKey, pkgId, costEffective, costOriginal, tierMarkupPercent = 0) {
  const pkgKey = `${categoryKey}:${pkgId}`;
  const override = db.settings.packagePriceOverrides?.[pkgKey];
  const catMode = db.settings.categoryMarkupModes?.[categoryKey] === 'percent' ? 'percent' : 'fixed';
  const catMarkup = Number(db.settings.categoryMarkups?.[categoryKey] ?? db.settings.defaultMarkup ?? 5000);
  const catPercent = Number(db.settings.categoryMarkupPercents?.[categoryKey] ?? 0);
  const factor = tierMarkupPercent > 0 ? (100 + tierMarkupPercent) / 100 : 1;

  const adjustedCostEffective = Math.round(Number(costEffective || 0) * factor);
  const adjustedCostOriginal = Math.round(Number(costOriginal || costEffective || 0) * factor);
  if (!validMoney(adjustedCostEffective) || !validMoney(adjustedCostOriginal) || !validMoney(catMarkup) || !validPercent(catPercent)) {
    throw new Error('Giá nguồn hoặc bảng giá chưa hợp lệ.');
  }

  const hasOverride = override !== undefined && override !== null && override !== '' && Number(override) > 0;
  let sellEffective;
  let sellOriginal;
  if (hasOverride) {
    sellEffective = Math.max(adjustedCostEffective, Math.round(Number(override) * factor));
    const markupDiff = sellEffective - adjustedCostEffective;
    sellOriginal = Math.max(sellEffective, adjustedCostOriginal + markupDiff);
  } else if (catMode === 'percent') {
    sellEffective = Math.max(adjustedCostEffective, Math.round(adjustedCostEffective * (100 + catPercent) / 100));
    sellOriginal = Math.max(sellEffective, Math.round(adjustedCostOriginal * (100 + catPercent) / 100));
  } else {
    sellEffective = Math.max(adjustedCostEffective, adjustedCostEffective + catMarkup);
    const markupDiff = sellEffective - adjustedCostEffective;
    sellOriginal = Math.max(sellEffective, adjustedCostOriginal + markupDiff);
  }

  if (!validMoney(sellEffective, false)) throw new Error('Giá bán không hợp lệ.');

  return {
    costEffective: adjustedCostEffective,
    costOriginal: adjustedCostOriginal,
    sellEffective,
    sellOriginal,
    profit: sellEffective - adjustedCostEffective,
    hasCustomOverride: hasOverride,
    markupMode: hasOverride ? 'override' : catMode,
  };
}

function getFruitUnitPricing(fruitItem) {
  const fid = String(fruitItem.id);
  const costBase = Number(fruitItem.base_price || 0);
  const customUnit = db.settings.fruitUnitPrices?.[fid];
  const fruitMode = db.settings.categoryMarkupModes?.fruit_by_fruit === 'percent' ? 'percent' : 'fixed';
  const defaultFruitMarkup = Number(db.settings.defaultFruitUnitMarkup ?? 40);
  const fruitPercent = Number(db.settings.categoryMarkupPercents?.fruit_by_fruit ?? 0);
  if (!validMoney(defaultFruitMarkup) || !validPercent(fruitPercent)) throw new Error('Cấu hình mức cộng trái cây không hợp lệ.');

  const hasCustomUnit = customUnit !== undefined && customUnit !== null && customUnit !== '' && Number(customUnit) >= 0;
  const requestedBase = hasCustomUnit
    ? Number(customUnit)
    : fruitMode === 'percent'
    ? Math.round(costBase * (100 + fruitPercent) / 100)
    : costBase + defaultFruitMarkup;

  const sellBase = Math.max(costBase, requestedBase);
  if (!validMoney(costBase) || !validMoney(sellBase)) throw new Error('Đơn giá trái cây không hợp lệ.');
  const unitDiff = sellBase - costBase;

  const mutations = (fruitItem.mutation_prices || []).map((mp) => {
    const mKey = `${fid}:${mp.mutation_key}`;
    const costMut = Number(mp.unit_price || 0);
    const customMut = db.settings.fruitMutationPrices?.[mKey];
    const hasCustomMut = customMut !== undefined && customMut !== null && customMut !== '' && Number(customMut) >= 0;
    const requestedMut = hasCustomMut
      ? Number(customMut)
      : fruitMode === 'percent' && !hasCustomUnit
      ? Math.round(costMut * (100 + fruitPercent) / 100)
      : costMut + unitDiff;
    const sellMut = Math.max(costMut, requestedMut);
    if (!validMoney(costMut) || !validMoney(sellMut)) throw new Error('Giá hệ đột biến không hợp lệ.');
    return {
      mutation_key: mp.mutation_key,
      mutation_name: FRUIT_MUTATIONS[mp.mutation_key]?.name || `Hệ ${mp.mutation_key}`,
      mutation_abbr: FRUIT_MUTATIONS[mp.mutation_key]?.abbr || String(mp.mutation_key),
      mutation_color: FRUIT_MUTATIONS[mp.mutation_key]?.color || '#b6d9fc',
      cost_unit_price: costMut,
      sell_unit_price: sellMut,
      has_custom_override: hasCustomMut,
    };
  });

  return {
    costBase,
    sellBase,
    profitPerFruit: sellBase - costBase,
    hasCustomOverride: hasCustomUnit,
    markupMode: hasCustomUnit ? 'override' : fruitMode,
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
  failure.upstream = true;
  failure.status = error.status || 502;
  failure.data = error.data;
  Object.assign(upstreamStatus, { connected: false, lastCheckedAt: new Date().toISOString(), lastError: failure.message });
  return failure;
}

function upstreamSuccess() {
  Object.assign(upstreamStatus, { connected: true, lastCheckedAt: new Date().toISOString(), lastError: '' });
}

async function fetchHoanNguyen(url, options = {}, timeoutMs = 15000) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
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
      await saveDb(db);
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

async function hnApiCall(apiPath, method = 'GET', body = null, retry = true, timeoutMs = 15000) {
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

  const res = await fetchHoanNguyen(`${hn.baseUrl}${apiPath}`, options, timeoutMs);
  if (res.status === 401 && retry) {
    if (db.settings.hoanNguyen.token === token) await loginToHoanNguyen(true);
    return hnApiCall(apiPath, method, body, false, timeoutMs);
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
const PROFILE_SOCKET_URL = 'wss://hoannguyenplaytogether.com/api/ws/connect?platform=web&view=seller-fruit-coin-orders';
let activeWsSearches = 0;
const MAX_CONCURRENT_WS_SEARCHES = 6;

async function queryGameClient(request, timeoutMs) {
  if (activeWsSearches >= MAX_CONCURRENT_WS_SEARCHES) {
    throw Object.assign(new Error('Máy chủ tìm kiếm đang bận. Vui lòng thử lại sau.'), { status: 503 });
  }
  activeWsSearches++;
  try {
    await loginToHoanNguyen(false);
    if (!db.settings.hoanNguyen.user?.id) await loginToHoanNguyen(true);
    const userId = db.settings.hoanNguyen.user?.id;
    if (!userId) throw new Error('Nguồn chưa xác nhận tài khoản tìm kiếm. Liên hệ admin.');

    return await new Promise((resolve, reject) => {
      const ws = new WebSocket(PROFILE_SOCKET_URL);
      const timer = setTimeout(() => finish(new Error('Nguồn game phản hồi quá chậm. Vui lòng thử lại.')), timeoutMs);
      let settled = false;
      function finish(error, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { ws.close(); } catch {}
        if (error) reject(error);
        else resolve(value);
      }
      ws.onopen = () => {
        try { ws.send(JSON.stringify({ ...request, user_id: userId })); }
        catch { finish(new Error('Không gửi được yêu cầu tới nguồn game.')); }
      };
      ws.onerror = ws.onclose = () => finish(new Error('Mất kết nối với nguồn game. Vui lòng thử lại.'));
      ws.onmessage = event => {
        let msg;
        try {
          // Some clients serialize 64-bit IDs as JSON numbers. Read their original digits.
          msg = JSON.parse(event.data, (key, value, context) =>
            (key === 'suid' || key === 'UserSuid') && typeof value === 'number' ? context.source : value);
        } catch { return; }
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'error' && (!msg.request_context || msg.request_context === request.type)) {
          finish(new Error(msg.message || 'Nguồn game chưa trả được kết quả.'));
        } else if (msg.type === request.type + '_result') {
          if (request.type === 'profile_search' && Array.isArray(msg.profiles)) finish(null, msg.profiles);
          else if (request.type === 'request_profile' && msg.profile?.Profile &&
              String(msg.profile.UserSuid ?? msg.profile.Profile.suid) === request.suid &&
              String(msg.profile.Profile.suid ?? request.suid) === request.suid) finish(null, msg.profile);
          else finish(new Error('Hồ sơ nguồn trả về không khớp với yêu cầu. Vui lòng thử lại.'));
        }
      };
    });
  } finally {
    activeWsSearches--;
  }
}

function searchInGameByWebSocket(nickname, timeoutMs = 12000) {
  return queryGameClient({ type: 'profile_search', search_nickname: nickname.trim() }, timeoutMs);
}

function requestProfileDetailByWebSocket(suid, timeoutMs = 12000) {
  return queryGameClient({ type: 'request_profile', suid: String(suid) }, timeoutMs);
}

const GAME_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const GAME_CODE_PATTERN = /^([2-9A-HJ-NP-Z]{4})[- ]?([2-9A-HJ-NP-Z]{4})[- ]?([2-9A-HJ-NP-Z]{4})$/;

// The display code packs the low seven bytes of the SUID in little-endian order,
// followed by its high nibble. Each group of five bits is one display character.
function gameCodeFromId(id) {
  let value = BigInt(id);
  if (value >= (1n << 60n)) return null;
  let packed = 0n;
  for (let i = 0; i < 7; i++) {
    packed = (packed << 8n) | (value & 255n);
    value >>= 8n;
  }
  packed = (packed << 4n) | value;
  let code = '';
  for (let i = 0; i < 12; i++) {
    code = GAME_CODE_ALPHABET[Number(packed & 31n)] + code;
    packed >>= 5n;
  }
  return code.match(/.{4}/g).join('-');
}

function numericGameId(input) {
  if (/^\d{1,20}$/.test(input)) {
    const n = BigInt(input);
    return n > 0n && n < (1n << 64n) ? n.toString() : null;
  }
  const groups = GAME_CODE_PATTERN.exec(input.toUpperCase());
  if (!groups) return null;
  let packed = 0n;
  for (const char of groups.slice(1).join('')) {
    packed = (packed << 5n) | BigInt(GAME_CODE_ALPHABET.indexOf(char));
  }
  let value = packed & 15n;
  packed >>= 4n;
  for (let i = 0; i < 7; i++) {
    value = (value << 8n) | (packed & 255n);
    packed >>= 8n;
  }
  return value > 0n ? value.toString() : null;
}

// ============================================================================
// AUTH & STRICT WALLET ENFORCEMENT MIDDLEWARE
// ============================================================================
function getAuthUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token || !db.sessions[token]) return null;
  const sessionData = db.sessions[token];
  if (sessionData.authVersion !== AUTH_VERSION || !Number.isFinite(sessionData.createdAt) ||
      Date.now() - sessionData.createdAt > SESSION_TTL_MS) return null;
  const userId = sessionData.userId;
  const user = db.users.find((u) => u.id === userId);
  if (!user || user.isLocked) return null;
  return user;
}

const MAINTENANCE_MESSAGE = 'Hệ thống Zn đang bảo trì';

function isMaintenanceActive() {
  return Boolean(db?.settings?.maintenanceMode);
}

function requireAuth(req, res, next) {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Vui lòng đăng nhập tài khoản để tiếp tục.',
    });
  }
  if (user.role !== 'admin' && isMaintenanceActive()) {
    return res.status(503).json({
      success: false,
      code: 'MAINTENANCE',
      maintenance: true,
      message: MAINTENANCE_MESSAGE,
    });
  }
  req.user = user;
  user.lastSeenAt = new Date().toISOString();
  next();
}

function requireAdmin(req, res, next) {
  const user = getAuthUser(req);
  if (user) req.user = user;
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
  const { id, username, email, name, phone, role, balance, isLocked, createdAt, lastSeenAt, archivedAt } = u;
  return { id, username, email, name, phone, role, balance, isLocked, createdAt, lastSeenAt, archivedAt };
}

// ============================================================================
// PLAY TOGETHER ASSET PROXY (SERVER-SIDE CACHED + NEGATIVE CACHE + ANTI-ABUSE!)
// ============================================================================
const assetProxyCache = new Map();
const assetNotFoundCache = new Map();
const assetProxyInflight = new Map();
const assetMissLimits = new Map();
const SAFE_ASSET_PATH = /^\/assets\/playtogether\/images\/[A-Za-z0-9_./-]+\.png$/;

function markAssetNotFound(assetPath, ip) {
  const now = Date.now();
  if (assetNotFoundCache.size >= 500) {
    for (const [k, exp] of assetNotFoundCache) if (now > exp) assetNotFoundCache.delete(k);
    if (assetNotFoundCache.size >= 500) assetNotFoundCache.delete(assetNotFoundCache.keys().next().value);
  }
  assetNotFoundCache.set(assetPath, now + 10 * 60000);
  checkBoundedBucket(assetMissLimits, ip, 30, 5 * 60000, 1500);
}

app.get('/assets/playtogether/*', async (req, res) => {
  const assetPath = req.path;
  if (!SAFE_ASSET_PATH.test(assetPath) || assetPath.includes('..') || assetPath.length > 220) {
    return res.status(404).end();
  }
  const cached = assetProxyCache.get(assetPath);
  if (cached) {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    return res.send(cached);
  }
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const missEntry = assetMissLimits.get(ip);
  if (missEntry && Date.now() <= missEntry.resetAt && missEntry.count > 30) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((missEntry.resetAt - Date.now()) / 1000))));
    return res.status(429).end();
  }
  const notFoundUntil = assetNotFoundCache.get(assetPath);
  if (notFoundUntil && Date.now() < notFoundUntil) {
    checkBoundedBucket(assetMissLimits, ip, 30, 5 * 60000, 1500);
    return res.status(404).end();
  }
  if (!assetProxyInflight.has(assetPath) && assetProxyInflight.size >= 12) {
    res.setHeader('Retry-After', '2');
    return res.status(503).end();
  }
  try {
    let job = assetProxyInflight.get(assetPath);
    if (!job) {
      const baseUrl = db.settings.hoanNguyen?.baseUrl || 'https://hoannguyenplaytogether.com';
      job = (async () => {
        const upstream = await fetch(`${baseUrl}${assetPath}`, { signal: AbortSignal.timeout(6000) });
        if (!upstream.ok) return null;
        const buf = Buffer.from(await upstream.arrayBuffer());
        const isPng = buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
        if (!isPng || buf.length > 512 * 1024) return null;
        if (assetProxyCache.size >= 300) assetProxyCache.delete(assetProxyCache.keys().next().value);
        assetProxyCache.set(assetPath, buf);
        return buf;
      })().finally(() => {
        assetProxyInflight.delete(assetPath);
      });
      assetProxyInflight.set(assetPath, job);
    }
    const buf = await job;
    if (!buf) {
      markAssetNotFound(assetPath, ip);
      return res.status(404).end();
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.send(buf);
  } catch {
    res.status(404).end();
  }
});

// ============================================================================
// AUTH & HEALTH ENDPOINTS
// ============================================================================
app.get('/api/ping', (req, res) => {
  res.json({
    ok: true,
    maintenance: isMaintenanceActive(),
    updateVersion: Number(db?.settings?.clientUpdateVersion || 0),
    ts: Date.now(),
  });
});

app.get('/api/health', (req, res) => {
  res.status(storageHealthy ? 200 : 503).json({
    success: storageHealthy,
    storage: postgres ? 'postgresql' : 'json',
    persistent: Boolean(postgres || process.env.DATA_DIR),
    upstream: { connected: upstreamStatus.connected, checkedAt: upstreamStatus.lastCheckedAt },
  });
});

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  req.auditUser = { id: 'anonymous', name: 'Đăng nhập chưa xác thực', role: 'unauthenticated' };
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
  if (!loginKey || loginKey.length > 254 || !pwd || pwd.length > 128 || !storageHealthy) {
    return res.status(storageHealthy ? 401 : 503).json({ success: false, message: 'Không thể đăng nhập. Kiểm tra thông tin hoặc liên hệ admin.' });
  }
  if (isLoginAccountThrottled(loginKey)) {
    return res.status(429).json({
      success: false,
      message: 'Tài khoản này nhập sai mật khẩu quá nhiều lần. Vui lòng đợi 5 phút rồi thử lại.',
    });
  }

  const user = db.users.find(
    (u) => u.email?.toLowerCase() === loginKey || u.username?.toLowerCase() === loginKey
  );

  if (!user || !(await verifyPasswordAsync(pwd, user.password))) {
    recordLoginAccountFailure(loginKey);
    return res.status(401).json({
      success: false,
      message: 'Tài khoản hoặc mật khẩu không chính xác.',
    });
  }
  clearLoginAccountFailure(loginKey);

  if (user.isLocked) {
    return res.status(403).json({
      success: false,
      message: 'Tài khoản của bạn đang tạm khóa. Vui lòng liên hệ Admin ZnStudio.',
    });
  }

  if (user.role !== 'admin' && isMaintenanceActive()) {
    return res.status(503).json({
      success: false,
      code: 'MAINTENANCE',
      maintenance: true,
      message: MAINTENANCE_MESSAGE,
    });
  }

  const token = crypto.randomBytes(32).toString('hex');
  for (const [oldToken, session] of Object.entries(db.sessions)) {
    if (Date.now() - Number(session.createdAt || 0) > SESSION_TTL_MS) delete db.sessions[oldToken];
  }
  const ownSessions = Object.entries(db.sessions).filter(([, session]) => session.userId === user.id).sort((a, b) => a[1].createdAt - b[1].createdAt);
  while (ownSessions.length >= 5) delete db.sessions[ownSessions.shift()[0]];
  db.sessions[token] = { userId: user.id, createdAt: Date.now(), authVersion: AUTH_VERSION };
  user.lastSeenAt = new Date().toISOString();
  req.user = user;
  req.needsSave = true;

  res.json({
    success: true,
    message: 'Đăng nhập thành công',
    token,
    updateVersion: Number(db?.settings?.clientUpdateVersion || 0),
    user: sanitizeUser(user),
  });
}));

app.get('/api/auth/me', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
  }
  if (user.role !== 'admin' && isMaintenanceActive()) {
    return res.status(503).json({
      success: false,
      code: 'MAINTENANCE',
      maintenance: true,
      message: MAINTENANCE_MESSAGE,
      user: sanitizeUser(user),
    });
  }
  user.lastSeenAt = new Date().toISOString();
  res.json({
    success: true,
    maintenance: isMaintenanceActive(),
    updateVersion: Number(db?.settings?.clientUpdateVersion || 0),
    user: sanitizeUser(user),
  });
});

app.post('/api/auth/logout', asyncRoute(async (req, res) => {
  req.user = getAuthUser(req);
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (token && db.sessions[token]) {
    delete db.sessions[token];
    req.needsSave = true;
  }
  res.json({ success: true });
}));

// ============================================================================
// REALTIME CATALOG, SYSTEM STATUS & PROCESSING RATE SYNC
// - CTV passive browsing: 10 min cache (ultra-light, zero lag)
// - Admin passive browsing: 1 min cache
// - Pre-order / explicit refresh (?refresh=1) & order placement: ALWAYS live from HoanNguyen!
// ============================================================================
const CTV_CATALOG_FRESH_MS = 10 * 60 * 1000;   // 10 phút cho CTV xem thường
const ADMIN_CATALOG_FRESH_MS = 60 * 1000;      // 1 phút cho Admin
let lastAdminActivityAt = 0;
let lastCtvActivityAt = 0;
let settingsVersion = 1;
let catalogCache = {
  timestamp: 0,
  raw: null,
};
const catalogResponseCache = new Map();

function getCurrentMondayStr() {
  const local = new Date(Date.now() + 7 * 3600000);
  local.setUTCDate(local.getUTCDate() - (local.getUTCDay() + 6) % 7);
  return local.toISOString().slice(0, 10);
}

const SETTINGS_KEYS_PATH =
  '/api/settings?keys=is_send_task,is_send_fruitorder,is_send_farmgiftorder,is_send_mailgiftorder,is_send_guestbookorder,is_send_bufftimorder,is_send_buffsaoorder,is_send_weatherbufforder,min_coin_per_fruit,max_coin_for_fruit_order,max_fruits_per_customer_per_day,is_buff_sao_custom_quantity,is_buff_tim_custom_quantity';

const VALID_CATALOG_SCOPES = new Set([
  'fruit_coin',
  'fruit_by_fruit',
  'fruit_all',
  'buff_tim',
  'buff_sao',
  'guestbook',
  'farm_gift',
  'mail_gift',
  'weather_buff',
]);

const catalogScopeTimestamps = new Map();
const scopedCatalogPromises = new Map();

function ensureRawCatalogShell() {
  if (!catalogCache.raw) {
    catalogCache.raw = {
      fruitCoinPackages: [],
      fruitItems: [],
      fruitStock: [],
      fruitStockMeta: {},
      buffTimPackages: [],
      buffSaoPackages: [],
      guestbookPackages: [],
      farmGifts: [],
      mailGifts: [],
      weatherPackages: [],
      weatherTypes: [],
      hnSettings: {},
      processingRates: {},
      weeklyLimit: null,
      syncedAt: new Date().toISOString(),
    };
  }
  return catalogCache.raw;
}

// Fast targeted sync for a SINGLE category (only 2-3 tiny upstream requests instead of all 13!)
async function fetchScopedCatalogFromHoanNguyen(scope, { force = true, maxAgeMs = CTV_CATALOG_FRESH_MS, timeoutMs = 5500 } = {}) {
  if (!VALID_CATALOG_SCOPES.has(scope)) {
    return fetchRawCatalogFromHoanNguyen(force, maxAgeMs, { includeAdminWeeklyLimit: false, timeoutMs });
  }
  const now = Date.now();
  const lastScopeTs = Math.max(catalogScopeTimestamps.get(scope) || 0, catalogCache.timestamp || 0);
  if (!force && catalogCache.raw && now - lastScopeTs < maxAgeMs) {
    return catalogCache.raw;
  }
  const inflight = scopedCatalogPromises.get(scope);
  if (inflight) return inflight;

  const job = (async () => {
    const reqs = {
      settings: hnApiCall(SETTINGS_KEYS_PATH, 'GET', null, true, timeoutMs).catch(error => ({ upstreamError: error })),
    };
    if (scope === 'fruit_coin' || scope === 'fruit_all') {
      reqs.fruitCoin = hnApiCall('/api/fruit-coin-price-packages?active=1', 'GET', null, true, timeoutMs).catch(error => ({ upstreamError: error }));
      reqs.fruitStock = hnApiCall('/api/fruit-stock', 'GET', null, true, timeoutMs).catch(() => ({ data: [], meta: {} }));
    }
    if (scope === 'fruit_by_fruit' || scope === 'fruit_all') {
      reqs.fruitItems = hnApiCall('/api/fruit-items?active=1', 'GET', null, true, timeoutMs).catch(error => ({ upstreamError: error }));
      if (!reqs.fruitStock) {
        reqs.fruitStock = hnApiCall('/api/fruit-stock', 'GET', null, true, timeoutMs).catch(() => ({ data: [], meta: {} }));
      }
    }
    if (scope === 'buff_tim') {
      reqs.buffTim = hnApiCall('/api/buff-tim-price-packages?active=1', 'GET', null, true, timeoutMs).catch(error => ({ upstreamError: error }));
    }
    if (scope === 'buff_sao') {
      reqs.buffSao = hnApiCall('/api/buff-sao-price-packages?active=1', 'GET', null, true, timeoutMs).catch(error => ({ upstreamError: error }));
    }
    if (scope === 'guestbook') {
      reqs.guestbook = hnApiCall('/api/guestbook-price-packages?active=1', 'GET', null, true, timeoutMs).catch(error => ({ upstreamError: error }));
    }
    if (scope === 'farm_gift') {
      reqs.farmGifts = hnApiCall('/api/gifts?type=farm&active=1', 'GET', null, true, timeoutMs).catch(error => ({ upstreamError: error }));
    }
    if (scope === 'mail_gift') {
      reqs.mailGifts = hnApiCall('/api/gifts?type=mail&active=1', 'GET', null, true, timeoutMs).catch(error => ({ upstreamError: error }));
    }
    if (scope === 'weather_buff') {
      reqs.weatherPkg = hnApiCall('/api/weather-buff-price-packages?active=1', 'GET', null, true, timeoutMs).catch(error => ({ upstreamError: error }));
      reqs.weatherTypes = hnApiCall('/api/weather-buff-types?active=1', 'GET', null, true, timeoutMs).catch(() => ({ data: [] }));
    }

    const keys = Object.keys(reqs);
    const values = await Promise.all(keys.map(k => reqs[k]));
    const results = Object.fromEntries(keys.map((k, i) => [k, values[i]]));

    const failed = keys.map(k => results[k]).find(r => r && r.upstreamError);
    if (failed) throw upstreamFailure(failed.upstreamError);
    upstreamSuccess();

    const raw = ensureRawCatalogShell();
    raw.hnSettings = results.settings?.data || raw.hnSettings || {};
    if (results.fruitCoin) raw.fruitCoinPackages = Array.isArray(results.fruitCoin.data) ? results.fruitCoin.data : [];
    if (results.fruitItems) raw.fruitItems = Array.isArray(results.fruitItems.data) ? results.fruitItems.data : [];
    if (results.fruitStock) {
      raw.fruitStock = Array.isArray(results.fruitStock.data) ? results.fruitStock.data : raw.fruitStock;
      raw.fruitStockMeta = results.fruitStock.meta || raw.fruitStockMeta || {};
    }
    if (results.buffTim) raw.buffTimPackages = Array.isArray(results.buffTim.data) ? results.buffTim.data : [];
    if (results.buffSao) raw.buffSaoPackages = Array.isArray(results.buffSao.data) ? results.buffSao.data : [];
    if (results.guestbook) raw.guestbookPackages = Array.isArray(results.guestbook.data) ? results.guestbook.data : [];
    if (results.farmGifts) raw.farmGifts = Array.isArray(results.farmGifts.data) ? results.farmGifts.data : [];
    if (results.mailGifts) raw.mailGifts = Array.isArray(results.mailGifts.data) ? results.mailGifts.data : [];
    if (results.weatherPkg) raw.weatherPackages = Array.isArray(results.weatherPkg.data) ? results.weatherPkg.data : [];
    if (results.weatherTypes && Array.isArray(results.weatherTypes.data)) raw.weatherTypes = results.weatherTypes.data;

    const finishedAt = Date.now();
    raw.syncedAt = new Date(finishedAt).toISOString();
    catalogScopeTimestamps.set(scope, finishedAt);
    if (scope === 'fruit_all') {
      catalogScopeTimestamps.set('fruit_coin', finishedAt);
      catalogScopeTimestamps.set('fruit_by_fruit', finishedAt);
    }
    catalogResponseCache.clear();
    return raw;
  })();

  scopedCatalogPromises.set(scope, job);
  try { return await job; }
  finally { scopedCatalogPromises.delete(scope); }
}

let catalogPromise = null;
async function fetchRawCatalogFromHoanNguyen(force = false, maxAgeMs = CTV_CATALOG_FRESH_MS, opts = {}) {
  const age = Date.now() - catalogCache.timestamp;
  const includeAdminWeeklyLimit = opts.includeAdminWeeklyLimit !== false;
  if (!force && catalogCache.raw && age < maxAgeMs && (!includeAdminWeeklyLimit || catalogCache.hasWeeklyLimit)) {
    return catalogCache.raw;
  }
  if (catalogPromise) return catalogPromise;
  catalogPromise = buildRawCatalogFromHoanNguyen(true, opts);
  try { return await catalogPromise; }
  finally { catalogPromise = null; }
}

async function buildRawCatalogFromHoanNguyen(force = false, opts = {}) {
  const now = Date.now();
  const includeAdminWeeklyLimit = opts.includeAdminWeeklyLimit !== false;
  const timeoutMs = opts.timeoutMs || 15000;
  if (!force && catalogCache.raw && now - catalogCache.timestamp < ADMIN_CATALOG_FRESH_MS && (!includeAdminWeeklyLimit || catalogCache.hasWeeklyLimit)) {
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
    hnApiCall('/api/fruit-coin-price-packages?active=1', 'GET', null, true, timeoutMs).catch(error => ({ upstreamError: error })),
    hnApiCall('/api/fruit-items?active=1', 'GET', null, true, timeoutMs).catch(error => ({ upstreamError: error })),
    hnApiCall('/api/fruit-stock', 'GET', null, true, timeoutMs).catch(() => ({ data: [], meta: {} })),
    hnApiCall('/api/buff-tim-price-packages?active=1', 'GET', null, true, timeoutMs).catch(() => ({ data: [] })),
    hnApiCall('/api/buff-sao-price-packages?active=1', 'GET', null, true, timeoutMs).catch(() => ({ data: [] })),
    hnApiCall('/api/guestbook-price-packages?active=1', 'GET', null, true, timeoutMs).catch(() => ({ data: [] })),
    // IMPORTANT: Only fetch active=1 gifts for seller order creation, matching HoanNguyen exactly!
    hnApiCall('/api/gifts?type=farm&active=1', 'GET', null, true, timeoutMs).catch(() => ({ data: [] })),
    hnApiCall('/api/gifts?type=mail&active=1', 'GET', null, true, timeoutMs).catch(() => ({ data: [] })),
    hnApiCall('/api/weather-buff-price-packages?active=1', 'GET', null, true, timeoutMs).catch(() => ({ data: [] })),
    hnApiCall('/api/weather-buff-types?active=1', 'GET', null, true, timeoutMs).catch(() => ({ data: [] })),
    hnApiCall(SETTINGS_KEYS_PATH, 'GET', null, true, timeoutMs).catch(error => ({ upstreamError: error })),
    hnApiCall('/api/tasks/processing-rate', 'GET', null, true, timeoutMs).catch(() => ({ data: {} })),
    includeAdminWeeklyLimit
      ? hnApiCall(`/api/seller-settlements?week_start=${weekStart}`, 'GET', null, true, timeoutMs).catch(() => ({ data: null }))
      : Promise.resolve({ data: null }),
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
    weeklyLimit: includeAdminWeeklyLimit ? (settlementRes?.data?.weekly_limit || null) : (catalogCache.raw?.weeklyLimit || null),
    syncedAt: new Date().toISOString(),
  };

  const ts = Date.now();
  catalogCache = { timestamp: ts, hasWeeklyLimit: includeAdminWeeklyLimit || Boolean(catalogCache.hasWeeklyLimit), raw };
  for (const s of VALID_CATALOG_SCOPES) catalogScopeTimestamps.set(s, ts);
  return raw;
}

function resolveActiveSale(pkg) {
  const salesList = Array.isArray(pkg.sales) && pkg.sales.length
    ? pkg.sales
    : Array.isArray(pkg.active_sales) && pkg.active_sales.length
    ? pkg.active_sales
    : pkg.sale
    ? [pkg.sale]
    : [];
  const activeSales = salesList.filter(s => s && Number(s.slots_remaining ?? 1) > 0 && (!s.status || s.status === 'active'));
  const primary = activeSales[0] || (pkg.sale && Number(pkg.sale.slots_remaining ?? 1) > 0 ? pkg.sale : null);
  const isOnSale = enabled(pkg.is_on_sale) && (
    salesList.length > 0
      ? primary !== null
      : pkg.effective_price != null && Number(pkg.effective_price) < Number(pkg.original_price ?? pkg.total_price ?? 0)
  );
  return { isOnSale, sale: primary };
}

function buildPublicPackage(pkg, categoryKey, isAdmin, tierMarkupPercent = 0) {
  if (!Number.isSafeInteger(Number(pkg.id)) || Number(pkg.id) <= 0) throw new Error('Mã gói nguồn không hợp lệ.');
  const { isOnSale, sale } = resolveActiveSale(pkg);
  const rawBaseCost = Number(pkg.original_price ?? pkg.total_price ?? 0);
  const rawEffectiveCost = Number(
    isOnSale ? (pkg.effective_price ?? sale?.sale_price ?? pkg.total_price ?? 0) : (pkg.total_price ?? 0)
  );

  const calc = getPackageSellingPrice(categoryKey, pkg.id, rawEffectiveCost, rawBaseCost, tierMarkupPercent);

  const result = {
    id: Number(pkg.id),
    quantity: Number(pkg.quantity ?? pkg.coin_quantity),
    coin_quantity: Number(pkg.coin_quantity ?? pkg.quantity),
    is_active: pkg.is_active,
    is_on_sale: isOnSale,
    // CTV ONLY sees the final selling price as the standard package price!
    total_price: calc.sellEffective,
    effective_price: calc.sellEffective,
    original_price: calc.sellOriginal,
    sale: isOnSale && sale
      ? {
          id: sale.id,
          sale_price: calc.sellEffective,
          slots_total: sale.slots_total,
          slots_used: sale.slots_used,
          slots_remaining: sale.slots_remaining,
          title: sale.title,
          status: sale.status,
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

function packCatalogCacheEntry(payload) {
  const rawBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  if (!HAS_ZLIB || rawBuf.length < 1024) {
    return { rawBuf, br: null, gzip: null };
  }
  const br = typeof zlib.brotliCompressSync === 'function'
    ? zlib.brotliCompressSync(rawBuf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } })
    : null;
  const gzip = zlib.gzipSync(rawBuf, { level: 6 });
  return { rawBuf, br, gzip };
}

function sendPackedCatalog(req, res, packed) {
  const accept = String(req.headers['accept-encoding'] || '');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (packed.br && accept.includes('br')) {
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Content-Encoding', 'br');
    return res.send(packed.br);
  }
  if (packed.gzip && accept.includes('gzip')) {
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Content-Encoding', 'gzip');
    return res.send(packed.gzip);
  }
  return res.send(packed.rawBuf);
}

const ctvRefreshLimits = new Map();
app.get('/api/catalog', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.role === 'admin';
    const now = Date.now();
    if (isAdmin) lastAdminActivityAt = now;
    else lastCtvActivityAt = now;

    if (!isAdmin && req.query.refresh === '1') {
      const rl = checkBoundedBucket(ctvRefreshLimits, user.id, 25, 60000, 1000);
      if (!rl.allowed) {
        res.setHeader('Retry-After', String(rl.retrySec));
        return res.status(429).json({
          success: false,
          message: 'Bạn đang làm mới bảng giá quá nhanh. Vui lòng đợi ít giây rồi thử lại.',
        });
      }
    }

    const rawScope = typeof req.query.scope === 'string' ? req.query.scope.trim() : '';
    const scope = VALID_CATALOG_SCOPES.has(rawScope) ? rawScope : '';
    const compact = req.query.compact === '1' && !isAdmin;
    const maxAgeMs = isAdmin ? ADMIN_CATALOG_FRESH_MS : CTV_CATALOG_FRESH_MS;
    const lastScopeTs = scope
      ? Math.max(catalogScopeTimestamps.get(scope) || 0, catalogCache.timestamp || 0)
      : catalogCache.timestamp;

    // Pre-order / manual refresh (?refresh=1): ALWAYS fetch live from HoanNguyen (deduplicated, 1.5s burst guard for CTV, hard 5.5s deadline for fast CTV UX!).
    const force = req.query.refresh === '1' && (isAdmin || now - lastScopeTs > 1500);
    const timeoutMs = !isAdmin && req.query.refresh === '1' ? 5500 : 12000;

    const raw = scope
      ? await fetchScopedCatalogFromHoanNguyen(scope, { force, maxAgeMs, timeoutMs })
      : await fetchRawCatalogFromHoanNguyen(force, maxAgeMs, { includeAdminWeeklyLimit: isAdmin, timeoutMs });

    const cacheKey = `${isAdmin ? 'admin' : 'ctv'}:${scope || 'all'}:${compact ? 'c' : 'f'}:${settingsVersion}:${raw.syncedAt}`;
    const memoized = catalogResponseCache.get(cacheKey);
    if (memoized) {
      return sendPackedCatalog(req, res, memoized);
    }

    const coinTiers = Array.isArray(raw.fruitStockMeta?.coin_tiers)
      ? raw.fruitStockMeta.coin_tiers
      : [];

    // System status per category (exact match with HoanNguyen's OrderSystemStatusChip!)
    // Weather Buff on HoanNguyen has no per-category setting key — it depends solely on is_send_task.
    const isSendTask = enabled(raw.hnSettings?.is_send_task);
    const weatherAllowed = raw.hnSettings?.is_send_weatherbufforder === undefined
      ? true
      : enabled(raw.hnSettings.is_send_weatherbufforder);
    const systemStatus = {
      farm_gift: isSendTask && enabled(raw.hnSettings?.is_send_farmgiftorder),
      mail_gift: isSendTask && enabled(raw.hnSettings?.is_send_mailgiftorder),
      guestbook: isSendTask && enabled(raw.hnSettings?.is_send_guestbookorder),
      buff_tim: isSendTask && enabled(raw.hnSettings?.is_send_bufftimorder),
      buff_sao: isSendTask && enabled(raw.hnSettings?.is_send_buffsaoorder),
      weather_buff: isSendTask && weatherAllowed,
      fruit_coin: isSendTask && enabled(raw.hnSettings?.is_send_fruitorder),
      fruit_by_fruit: isSendTask && enabled(raw.hnSettings?.is_send_fruitorder),
    };

    const want = (k) => !scope || scope === k || (scope === 'fruit_all' && (k === 'fruit_coin' || k === 'fruit_by_fruit'));
    const catalog = {};

    // 1. Fruit Coin Packages
    if (want('fruit_coin')) {
      catalog.fruit_coin = raw.fruitCoinPackages.map((pkg) => {
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
    }

    // 2. Fruit Items (154 fruits + 19 mutations — compact mp tuples for CTV cut payload ~10x!)
    if (want('fruit_by_fruit')) {
      const stockMap = new Map();
      for (const s of raw.fruitStock) {
        stockMap.set(Number(s.fruit_item_id), s);
      }

      catalog.fruit_by_fruit = raw.fruitItems.map((fi) => {
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
          unit_price: fPricing.sellBase,
          stock_quantity: st ? Number(st.total_quantity || 0) : 0,
          priority: fi.priority ?? st?.priority ?? 0,
        };

        if (compact) {
          itemObj.mp = fPricing.mutations.map((m) => [m.mutation_key, m.sell_unit_price]);
        } else {
          itemObj.mutation_prices = fPricing.mutations.map((m) => ({
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
          }));
        }

        if (isAdmin) {
          itemObj._admin = {
            cost_unit_price: fPricing.costBase,
            profit_per_fruit: fPricing.profitPerFruit,
            has_custom_override: fPricing.hasCustomOverride,
          };
        }
        return itemObj;
      });
    }

    // 3-5. Buff Tim, Buff Sao, Guestbook
    if (want('buff_tim')) {
      catalog.buff_tim = raw.buffTimPackages.map((pkg) => buildPublicPackage(pkg, 'buff_tim', isAdmin, 0));
    }
    if (want('buff_sao')) {
      catalog.buff_sao = raw.buffSaoPackages.map((pkg) => buildPublicPackage(pkg, 'buff_sao', isAdmin, 0));
    }
    if (want('guestbook')) {
      catalog.guestbook = raw.guestbookPackages.map((pkg) => buildPublicPackage(pkg, 'guestbook', isAdmin, 0));
    }

    // 6. Active Farm Gifts & Mail Gifts (Exact match with HoanNguyen active=1)
    const formatGiftList = (giftArr, catKey) =>
      giftArr
        .filter((g) => enabled(g.is_active))
        .map((g) => {
          const iconPath = g.item?.icon_path_and_name
            ? `/assets/playtogether/images/${g.item.icon_path_and_name.replace(/^\/+/, '').replace(/\.png$/i, '')}.png`
            : null;
          const packages = (g.gift_plants || [])
            .filter((gp) => enabled(gp.is_active))
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

    if (want('farm_gift')) catalog.farm_gift = formatGiftList(raw.farmGifts, 'farm_gift');
    if (want('mail_gift')) catalog.mail_gift = formatGiftList(raw.mailGifts, 'mail_gift');

    // 7. Weather Buff Packages & Active Weather Types
    if (want('weather_buff')) {
      catalog.weather_buff = raw.weatherPackages
        .filter((pkg) => enabled(pkg.is_active))
        .sort((a, b) => Number(a.quantity || 0) - Number(b.quantity || 0))
        .map((pkg) => buildPublicPackage(pkg, 'weather_buff', isAdmin, 0));

      catalog.weather_buff_types = (raw.weatherTypes || [])
        .filter((wt) => enabled(wt.is_active))
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
        .map((wt) => ({
          id: Number(wt.id),
          name: String(wt.name || `Thời tiết #${wt.id}`),
          enum_key: String(wt.enum_key || ''),
          diamond: Number(wt.diamond || 0),
          icon: wt.icon_path_and_name
            ? `/assets/playtogether/images/${String(wt.icon_path_and_name).replace(/^\/+/, '').replace(/\.png$/i, '')}.png`
            : null,
        }));
    }

    const payload = {
      success: true,
      partialScope: scope || undefined,
      syncedAt: raw.syncedAt,
      pricingVersion: settingsVersion,
      systemStatus,
      processingRates: scope ? undefined : raw.processingRates,
      hnSettings: {
        min_coin_per_fruit: raw.hnSettings?.min_coin_per_fruit ?? 400000,
        max_coin_for_fruit_order: raw.hnSettings?.max_coin_for_fruit_order ?? 600000,
        max_fruits_per_customer_per_day: raw.hnSettings?.max_fruits_per_customer_per_day ?? 30,
      },
      weeklyLimit: isAdmin && !scope ? raw.weeklyLimit : undefined,
      coinStock: (!scope || scope === 'fruit_coin' || scope === 'fruit_by_fruit' || scope === 'fruit_all')
        ? (raw.fruitStockMeta?.coin ? { quantity: Number(raw.fruitStockMeta.coin.quantity) || 0, estimated_per_hour: Number(raw.fruitStockMeta.coin.estimated_per_hour) || 0 } : null)
        : undefined,
      coinTiers: (!scope || scope === 'fruit_coin' || scope === 'fruit_by_fruit' || scope === 'fruit_all')
        ? coinTiers.map(t => ({ min_coin: Number(t.min_coin), markup_percent: Number(t.markup_percent) || 0, quantity: Number(t.quantity) || 0, is_default: enabled(t.is_default) }))
        : undefined,
      mutations: (!scope || scope === 'fruit_by_fruit' || scope === 'fruit_all') ? FRUIT_MUTATIONS : undefined,
      catalog,
    };
    const packed = packCatalogCacheEntry(payload);
    if (catalogResponseCache.size > 24) catalogResponseCache.clear();
    catalogResponseCache.set(cacheKey, packed);
    return sendPackedCatalog(req, res, packed);
  } catch (err) {
    console.error('Error in GET /api/catalog:', err);
    res.status(err?.status === 502 ? 502 : 500).json({
      success: false,
      message: publicError(req, err, 'Không thể tải dữ liệu bảng giá (quá thời gian phản hồi).'),
    });
  }
});

// Preview Fruit Order Price (Calculates CTV selling price using Admin's per-fruit/per-mutation prices)
app.post('/api/catalog/preview-fruit', requireAuth, limitInteractive, async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.role === 'admin';
    const { fruit_item_id, total_cnt, mutation_list } = req.body || {};
    const qty = Number(total_cnt);
    const muts = mutation_list === undefined ? [] : mutation_list;
    if (!validFruitInput(qty, muts)) return res.status(400).json({ success: false, message: 'Số lượng phải là số nguyên 1–1500; hệ đột biến phải hợp lệ và không trùng.' });

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
    if (!validMoney(costPrice) || !validMoney(sellPrice, false) || sellPrice < costPrice) {
      throw new Error('Bảng giá chưa hợp lệ hoặc giá bán thấp hơn chi phí nguồn. Liên hệ admin để cập nhật giá.');
    }

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
      message: publicError(req, err, 'Không thể tính giá đơn trái cây.'),
    });
  }
});

// Fruit Stock Detail by fruit_item_id
app.get('/api/catalog/fruit-stock/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const data = await hnApiCall(`/api/fruit-stock?fruit_item_id=${encodeURIComponent(req.params.id)}`);
    res.json(data);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ============================================================================
// PLAYER LOOKUP & CUSTOMER SEARCH
// ============================================================================
app.post('/api/tools/identity', requireAuth, limitInteractive, async (req, res) => {
  const { mode, query } = req.body || {};
  const term = typeof query === 'string' ? query.trim() : '';
  if (!['name', 'id'].includes(mode) || !term || term.length > 80) {
    return res.status(400).json({ success: false, message: 'Nhập tên nhân vật hoặc ID Game hợp lệ.' });
  }
  try {
    let profiles;
    if (mode === 'id') {
      const id = numericGameId(term);
      if (!id) return res.status(400).json({ success: false, message: 'Nhập ID dạng số hoặc mã nhân vật dạng XXXX-XXXX-XXXX.' });
      const detail = await requestProfileDetailByWebSocket(id);
      profiles = [{ ...detail.Profile, suid: id }];
    } else {
      profiles = await searchInGameByWebSocket(term);
    }
    const players = [];
    const seen = new Set();
    for (const profile of profiles.slice(0, 100)) {
      const id = String(profile?.suid ?? '');
      const nickname = profile?.Nickname ?? profile?.nickname;
      if (!/^\d{1,20}$/.test(id) || !numericGameId(id) || typeof nickname !== 'string' || !nickname.trim() || seen.has(id)) continue;
      players.push({ nickname, roleId: id, gameCode: gameCodeFromId(id) });
      seen.add(id);
    }
    if (profiles.length && !players.length) throw new Error('Hồ sơ nguồn trả về thiếu tên hoặc ID nhân vật.');
    req.auditDetails = { resultCount: players.length, ...(mode === 'id' ? { roleId: term } : { nickname: term }) };
    res.json({ success: true, players });
  } catch (error) {
    res.status(error.status === 503 ? 503 : 502).json({ success: false, message: publicError(req, error, 'Chưa tra cứu được nhân vật từ nguồn game.') });
  }
});

app.post('/api/customer/search-ingame', requireAuth, limitInteractive, async (req, res) => {
  try {
    const { nickname } = req.body || {};
    if (typeof nickname !== 'string' || !nickname.trim() || nickname.length > 80) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên nhân vật cần tìm.' });
    }
    const profiles = (await searchInGameByWebSocket(nickname.trim())).slice(0, 100).map(p => ({
      suid: String(p.suid || ''), Nickname: String(p.Nickname || p.nickname || '').slice(0, 100),
      Region: String(p.Region || 'vn1'), RegionName: String(p.RegionName || ''),
      AchievementLevel: Math.max(0, Number(p.AchievementLevel) || 0),
      PhotoUrl: typeof p.PhotoUrl === 'string' && /^https:\/\//.test(p.PhotoUrl) ? p.PhotoUrl : null,
      PhotoID: Number(p.PhotoID) || 0, FriendStatusType: Number(p.FriendStatusType) || 0,
      Online_Status: String(p.Online_Status || ''), LastLogin: String(p.LastLogin || ''),
    }));
    if (searchResults.size > 1000) {
      const now = Date.now();
      for (const [k, v] of searchResults) if (v.until <= now) searchResults.delete(k);
      if (searchResults.size > 1000) searchResults.delete(searchResults.keys().next().value);
    }
    searchResults.set(req.user.id, { profiles, until: Date.now() + 10 * 60000 });
    req.auditDetails = { nickname: nickname.trim(), resultCount: profiles.length };
    res.json({ success: true, profiles });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: publicError(req, err, 'Lỗi khi tìm kiếm nhân vật trong game.'),
    });
  }
});

app.post('/api/customer/select-ingame', requireAuth, limitInteractive, async (req, res) => {
  try {
    const supplied = req.body?.profile;
    const found = searchResults.get(req.user.id);
    const profile = found?.until > Date.now() && found.profiles.find(p => p.suid === String(supplied?.suid || ''));
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
    req.auditDetails = { customerId: saveRes.data.customer_id, suid: payload.suid };

    res.json({
      success: true,
      customer: rememberCustomer(req.user.id, {
        customerId: saveRes.data.customer_id,
        gameProfileId: saveRes.data.id,
        nickname: saveRes.data.nickname || payload.nickname,
        suid: payload.suid,
        region: profile.RegionName || payload.region,
        photoUrl: payload.photo_url,
        onlineStatus: profile.Online_Status || null,
      }),
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: publicError(req, err, 'Không thể chọn nhân vật này.'),
    });
  }
});

app.post('/api/customer/resolve-role-id', requireAuth, limitInteractive, async (req, res) => {
  try {
    const { role_id } = req.body || {};
    if (typeof role_id !== 'string' || !/^[\w-]{3,80}$/.test(role_id.trim())) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập Role ID.' });
    }
    const r = await hnApiCall('/api/customers/resolve-by-role-id', 'POST', {
      role_id: String(role_id).trim(),
    });
    const cust = r?.data;
    if (!cust?.id) {
      return res.status(404).json({ success: false, message: 'Role ID không hợp lệ hoặc không tìm thấy.' });
    }
    req.auditDetails = { roleId: role_id.trim(), customerId: cust.id };
    res.json({
      success: true,
      customer: rememberCustomer(req.user.id, {
        customerId: Number(cust.id),
        gameProfileId: null,
        nickname: cust.nickname || `Role ID: ${role_id}`,
        suid: String(cust.suid || ''),
        roleId: String(cust.role_id || role_id),
      }),
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: publicError(req, err, 'Không tìm thấy khách hàng với Role ID này.'),
    });
  }
});

app.get('/api/customer/saved', requireAuth, requireAdmin, async (req, res) => {
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
      message: publicError(req, err, 'Không thể tải danh sách khách hàng.'),
    });
  }
});

app.get('/api/customer/saved/:id', requireAuth, requireAdmin, async (req, res) => {
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
      message: publicError(req, err, 'Lỗi khi lấy chi tiết khách hàng.'),
    });
  }
});

// ============================================================================
// PLACE ORDER ENDPOINT (STRICT WALLET CHECK + SYSTEM ACTIVE CHECK)
// ============================================================================
app.post('/api/orders/place', requireAuth, financialGuard, limitInteractive, asyncRoute(async (req, res) => {
  let intent = null;
  let sourceDispatched = false;
  try {
    let user = req.user;
    const isAdmin = user.role === 'admin';
    const requestKey = req.body?.idempotency_key;
    if (typeof requestKey !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(requestKey)) {
      return res.status(400).json({ success: false, message: 'Thiếu mã chống trùng yêu cầu. Tải lại trang và thử lại.' });
    }
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
    const previous = db.orderIntents.find(i => i.userId === user.id && i.requestKey === requestKey);
    if (previous) {
      if (previous.payloadHash !== payloadHash) return res.status(409).json({ success: false, message: 'Mã yêu cầu đã được dùng với nội dung khác.' });
      if (previous.response) return res.status(previous.responseStatus || 200).json({ ...previous.response, userBalance: user.balance });
      return res.status(409).json({ success: false, code: 'ORDER_REVIEW_REQUIRED', message: 'Yêu cầu này đang xử lý hoặc chờ admin đối soát. Không gửi đơn mới để tránh trừ tiền hai lần.' });
    }
    if (db.orderIntents.some(i => i.userId === user.id && (i.status === 'uncertain' || i.requiresReview))) {
      return res.status(409).json({ success: false, code: 'ORDER_REVIEW_REQUIRED', message: 'Có đơn chưa xác định kết quả tại nguồn. Liên hệ admin đối soát trước khi đặt tiếp.' });
    }
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

    if (!Object.hasOwn(CATEGORY_METADATA, category)) {
      return res.status(400).json({ success: false, message: 'Danh mục đặt đơn không hợp lệ.' });
    }
    const isWeatherBuff = category === 'weather_buff';
    if (!isWeatherBuff && (!Number.isSafeInteger(Number(customer_id)) || Number(customer_id) <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng tìm và chọn nhân vật khách hàng trước khi tạo đơn.',
      });
    }

    const selection = isWeatherBuff ? null : chosenCustomers.get(`${user.id}:${customer_id}`);
    if (!isWeatherBuff && !isAdmin && (!selection || selection.until <= Date.now() ||
        Number(selection.customer.gameProfileId || 0) !== Number(game_profile_id || 0))) {
      return res.status(403).json({ success: false, message: 'Vui lòng tìm và chọn lại nhân vật bằng tài khoản của bạn trước khi đặt đơn.' });
    }
    const rawCatalog = await fetchScopedCatalogFromHoanNguyen(category, { force: true, timeoutMs: 8000 });

    // Check if the category is currently active on HoanNguyen
    const isSendTask = enabled(rawCatalog.hnSettings?.is_send_task);
    const settingKey = CATEGORY_METADATA[category]?.settingKey;
    const weatherAllowed = rawCatalog.hnSettings?.is_send_weatherbufforder === undefined
      ? true
      : enabled(rawCatalog.hnSettings.is_send_weatherbufforder);
    if ((settingKey && (!isSendTask || !enabled(rawCatalog.hnSettings?.[settingKey]))) ||
        (isWeatherBuff && (!isSendTask || !weatherAllowed))) {
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
    let selectedWeatherPkg = null;

    if (category === 'fruit_coin') {
      apiPath = '/api/fruit-coin-orders';
      const pkg = rawCatalog.fruitCoinPackages.find((p) => Number(p.id) === Number(coin_price_package_id));
      if (!pkg || !enabled(pkg.is_active)) {
        return res.status(400).json({ success: false, message: 'Gói Xu nông trại không hợp lệ.' });
      }
      const tiers = rawCatalog.fruitStockMeta?.coin_tiers || [];
      const selectedTier =
        tiers.find((t) => Number(t.min_coin) === Number(min_coin_filter)) ||
        tiers.find((t) => t.is_default) ||
        tiers[0];
      const tierMarkup = Number(selectedTier?.markup_percent || 0);
      const { isOnSale, sale } = resolveActiveSale(pkg);
      const rawBaseCost = Number(pkg.original_price ?? pkg.total_price ?? 0);
      const rawEffectiveCost = Number(
        isOnSale ? (pkg.effective_price ?? sale?.sale_price ?? pkg.total_price) : pkg.total_price
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
        expect_sale: isOnSale,
        expect_package_sale_id: isOnSale ? sale?.id ?? null : null,
        is_active: true,
        confirm_duplicate_customer: !!confirm_duplicate_customer,
      };
    } else if (category === 'fruit_by_fruit') {
      apiPath = '/api/fruit-coin-orders';
      const qty = Number(total_cnt);
      const muts = mutation_list === undefined ? [] : mutation_list;
      if (!validFruitInput(qty, muts)) return res.status(400).json({ success: false, message: 'Số lượng hoặc hệ đột biến không hợp lệ.' });
      const fi = rawCatalog.fruitItems.find((f) => Number(f.id) === Number(fruit_item_id));
      if (!fi || !enabled(fi.is_active)) {
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
        variant_mode: 'select',
        is_active: true,
        confirm_duplicate_customer: !!confirm_duplicate_customer,
      };
    } else if (category === 'buff_tim') {
      apiPath = '/api/buff-tim-orders';
      const pkg = rawCatalog.buffTimPackages.find((p) => Number(p.id) === Number(price_package_id));
      if (!pkg || !enabled(pkg.is_active)) {
        return res.status(400).json({ success: false, message: 'Gói Buff Tim không hợp lệ.' });
      }
      const { isOnSale, sale } = resolveActiveSale(pkg);
      const useSale = expect_sale !== false && isOnSale && sale;
      const rawEffective = Number(useSale ? (pkg.effective_price ?? sale.sale_price) : pkg.total_price);
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
        expect_package_sale_id: useSale ? Number(sale.id) : null,
        confirm_duplicate_customer: !!confirm_duplicate_customer,
      };
    } else if (category === 'buff_sao') {
      apiPath = '/api/buff-sao-orders';
      const pkg = rawCatalog.buffSaoPackages.find((p) => Number(p.id) === Number(price_package_id));
      if (!pkg || !enabled(pkg.is_active)) {
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
      if (!pkg || !enabled(pkg.is_active)) {
        return res.status(400).json({ success: false, message: 'Gói Bài viết không hợp lệ.' });
      }
      if (typeof guest_book_message !== 'string' || !guest_book_message.trim() || guest_book_message.length > 100) {
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
      if (!gift || !plantPkg || !enabled(gift.is_active) || !enabled(plantPkg.is_active) || (message && String(message).length > 500)) {
        return res.status(400).json({
          success: false,
          message: 'Gói quà tặng hiện không hoạt động hoặc không tồn tại.',
        });
      }
      const { isOnSale, sale } = resolveActiveSale(plantPkg);
      const useSale = expect_sale !== false && isOnSale && sale;
      const rawEffective = Number(useSale ? (plantPkg.effective_price ?? sale.sale_price) : plantPkg.total_price);
      const calc = getPackageSellingPrice(category, plantPkg.id, rawEffective, plantPkg.original_price ?? plantPkg.total_price, 0);
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
        expect_package_sale_id: category === 'mail_gift' && useSale ? sale?.id ?? null : undefined,
        is_active: true,
        confirm_duplicate_customer: !!confirm_duplicate_customer,
      };
    } else if (category === 'weather_buff') {
      apiPath = '/api/weather-buff-orders';
      const pkg = (rawCatalog.weatherPackages || []).find((p) => Number(p.id) === Number(price_package_id));
      if (!pkg || !enabled(pkg.is_active)) {
        return res.status(400).json({ success: false, message: 'Gói Buff Thời Tiết không hợp lệ hoặc đang tạm ngưng.' });
      }
      selectedWeatherPkg = pkg;
      const { isOnSale, sale } = resolveActiveSale(pkg);
      const useSale = expect_sale !== false && isOnSale && sale;
      const rawBaseCost = Number(pkg.original_price ?? pkg.total_price ?? 0);
      const rawEffectiveCost = Number(
        useSale ? (pkg.effective_price ?? sale.sale_price ?? pkg.total_price) : pkg.total_price
      );
      const calc = getPackageSellingPrice('weather_buff', pkg.id, rawEffectiveCost, rawBaseCost, 0);
      costPrice = calc.costEffective;
      sellPrice = calc.sellEffective;
      orderSummary = `Gói ${Number(pkg.quantity).toLocaleString('vi-VN')} lần (Chưa chọn thời tiết)${useSale ? ' [Sale]' : ''}`;

      hnPayload = {
        customer_count: 1,
        price_package_id: Number(pkg.id),
        expect_sale: !!useSale,
        expect_package_sale_id: useSale ? Number(sale.id) : null,
      };
    } else {
      return res.status(400).json({ success: false, message: 'Danh mục đặt đơn không hợp lệ.' });
    }

    if (!validMoney(costPrice) || !validMoney(sellPrice, false) || sellPrice < costPrice) {
      throw new Error('Bảng giá không hợp lệ hoặc thấp hơn chi phí nguồn. Đã chặn đặt đơn; liên hệ admin.');
    }
    if (req.body.expected_price !== sellPrice) {
      return res.status(409).json({ success: false, code: 'PRICE_CHANGED', message: 'Giá đã thay đổi. Vui lòng làm mới bảng giá và xác nhận lại trước khi đặt đơn.' });
    }
    user = db.users.find(u => u.id === req.user.id);
    if (!user || user.isLocked || !storageHealthy) throw new Error('Tài khoản hoặc lưu trữ đã bị khóa. Đơn chưa được gửi.');
    const racedIntent = db.orderIntents.find(i => i.userId === user.id && i.requestKey === requestKey);
    if (racedIntent) {
      if (racedIntent.payloadHash !== payloadHash) return res.status(409).json({ success: false, message: 'Mã yêu cầu đã được dùng với nội dung khác.' });
      if (racedIntent.response) return res.status(racedIntent.responseStatus || 200).json({ ...racedIntent.response, userBalance: user.balance });
      return res.status(409).json({ success: false, code: 'ORDER_REVIEW_REQUIRED', message: 'Yêu cầu đã được tiếp nhận, không gửi lại trong khi đang chờ nguồn.' });
    }
    // Reserve funds synchronously and persist BEFORE any billable source request.
    if (!isAdmin && (!validMoney(user.balance) || user.balance < sellPrice)) {
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

    intent = { id: crypto.randomUUID(), requestKey, payloadHash, userId: user.id, userName: user.name,
      category, customerId: isWeatherBuff ? null : Number(customer_id), expectedCost: costPrice, sellPrice,
      customer: isWeatherBuff ? { customerId: null, nickname: 'Chưa gán khách', suid: '' } : (selection?.customer || { customerId: Number(customer_id) }), summary: orderSummary,
      heldAmount: isAdmin ? 0 : sellPrice, status: 'processing', createdAt: new Date().toISOString() };
    if (!isAdmin) {
      user.balance -= sellPrice;
      db.transactions.unshift({ id: intent.id, userId: user.id, userName: user.name, type: 'order_hold',
        amount: -sellPrice, balanceAfter: user.balance, note: `Giữ tiền cho yêu cầu ${intent.id}`, createdAt: intent.createdAt });
    }
    db.orderIntents.unshift(intent);
    req.auditDetails = { intentId: intent.id, category, customerId: intent.customerId, sellPrice, heldAmount: intent.heldAmount };
    await saveDb(db);
    sourceDispatched = true;
    const hnResult = await hnApiCall(apiPath, 'POST', hnPayload);

    if (hnResult?.needs_confirmation && hnResult?.code === 'duplicate_customer') {
      releaseIntent(intent, 'Nguồn yêu cầu xác nhận đơn trùng; đã trả khoản giữ tiền.');
      intent.status = 'confirmation_required';
      intent.response = {
        success: false,
        needs_confirmation: true,
        code: 'duplicate_customer',
        message:
          hnResult.message ||
          'Khách hàng này đang có đơn hàng đang chạy. Bạn có chắc chắn muốn tạo thêm đơn mới?',
      };
      req.needsSave = true;
      return res.json(intent.response);
    }

    if (!hnResult?.success) {
      throw Object.assign(new Error('Nguồn từ chối tạo đơn.'), { status: 400 });
    }

    const createdRemoteOrder = hnResult.data || {};
    const remoteOrderId = createdRemoteOrder.id || null;
    if (!Number.isSafeInteger(Number(remoteOrderId)) || Number(remoteOrderId) <= 0) throw new Error('Nguồn chưa trả mã đơn hợp lệ.');
    if (db.localOrders.some(order => order.category === category && String(order.remoteOrderId) === String(remoteOrderId))) {
      throw new Error('Nguồn trả mã đơn đã được liên kết. Cần admin đối soát trước khi ghi thêm giao dịch.');
    }
    const actualCost = createdRemoteOrder.total_price === undefined ? costPrice : Number(createdRemoteOrder.total_price);
    const needsReview = !validMoney(actualCost) || actualCost !== costPrice;
    if (validMoney(actualCost)) costPrice = actualCost;

    const profit = sellPrice - costPrice;
    let weatherShareData = null;
    if (isWeatherBuff) {
      weatherShareData = await hnApiCall(`/api/weather-buff-orders/${encodeURIComponent(remoteOrderId)}/share-link`, 'POST')
        .then((r) => (r?.success ? r.data : null))
        .catch(() => null);
    }
    const weatherMeta = isWeatherBuff
      ? normalizeWeatherMeta(
          {
            ...createdRemoteOrder,
            price_package_id: createdRemoteOrder.price_package_id ?? hnPayload.price_package_id,
            package_quantity: createdRemoteOrder.package_quantity ?? selectedWeatherPkg?.quantity ?? 0,
            customer_count: createdRemoteOrder.customer_count ?? 1,
            public_token: weatherShareData?.token || createdRemoteOrder.public_token || null,
            track_url: weatherShareData?.url || null,
          },
          null
        )
      : undefined;

    const localOrder = {
      id: `ZNP-${crypto.randomUUID()}`,
      intentId: intent.id,
      remoteOrderId,
      category,
      categoryName: CATEGORY_METADATA[category]?.menuLabel || category,
      apiOrderPath: apiPath,
      summary: isWeatherBuff ? formatWeatherOrderSummary(weatherMeta, orderSummary) : orderSummary,
      customer: isWeatherBuff
        ? { customerId: null, gameProfileId: null, nickname: 'Chưa gán khách', suid: '' }
        : {
            customerId: customer_id,
            gameProfileId: game_profile_id || null,
            nickname:
              createdRemoteOrder.customer?.nickname ||
              selection?.customer.nickname ||
              `Khách #${customer_id}`,
            suid: createdRemoteOrder.customer?.suid || selection?.customer.suid || '',
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
      isActive: createdRemoteOrder.is_active ?? (isWeatherBuff ? false : true),
      totalCnt: createdRemoteOrder.total_cnt ?? createdRemoteOrder.package_quantity ?? hnPayload.total_cnt ?? (selectedWeatherPkg?.quantity || 0),
      sendingCnt: createdRemoteOrder.sending_cnt ?? 0,
      completedCnt: createdRemoteOrder.completed_cnt ?? 0,
      failedCnt: createdRemoteOrder.failed_cnt ?? 0,
      note: createdRemoteOrder.price_adjustment_note || null,
      weather: weatherMeta,
      requiresReview: needsReview,
      createdAt: new Date().toISOString(),
    };

    db.localOrders.unshift(localOrder);
    orderCache = { previous: orderCache.result || orderCache.previous };
    const debit = db.transactions.find(t => t.id === intent.id);
    if (debit) { debit.type = 'order_debit'; debit.note = `Tạo đơn ${localOrder.categoryName}: ${localOrder.summary}`; }
    intent.status = 'completed';
    intent.remoteOrderId = remoteOrderId;
    req.auditDetails.remoteOrderId = remoteOrderId;
    req.auditDetails.requiresReview = needsReview;
    intent.requiresReview = needsReview;
    intent.response = {
      success: true,
      message: isWeatherBuff
        ? 'Tạo đơn Buff Thời Tiết thành công! Hãy gán khách hàng và chọn loại thời tiết để bật chạy.'
        : 'Tạo đơn hàng thành công!',
      order: publicOrder(localOrder, isAdmin),
      userBalance: user.balance,
    };
    req.needsSave = true;
    res.json(intent.response);
  } catch (err) {
    const definitiveRejection = err.status >= 400 && err.status < 500 || (err.status === 200 && err.data?.success === false);
    if (intent && sourceDispatched && !definitiveRejection) {
      intent.status = 'uncertain';
      intent.message = 'Chưa xác định nguồn đã tạo đơn hay chưa; khoản tiền vẫn được giữ để admin đối soát. Không đặt lại đơn này.';
      try { await saveDb(db); } catch {}
      return res.status(409).json({ success: false, code: 'ORDER_REVIEW_REQUIRED', message: intent.message });
    }
    if (intent && storageHealthy) {
      releaseIntent(intent, 'Nguồn từ chối đơn; đã trả khoản giữ tiền.');
      intent.status = 'rejected';
      intent.responseStatus = 400;
      intent.response = { success: false, message: 'Nguồn đã từ chối đơn. Khoản giữ tiền đã được trả lại.' };
      req.needsSave = true;
      return res.status(400).json(intent.response);
    }
    res.status(err.status === 503 ? 503 : 400).json({
      success: false,
      message: publicError(req, err, 'Lỗi khi tạo đơn hàng.'),
    });
  }
}));

// ============================================================================
// ORDERS LIST & LIVE TELEMETRY SYNC (STRICT ISOLATION FOR CTV!)
// ============================================================================
const orderPaths = [
  '/api/fruit-coin-orders?page=1&per_page=100&status_group=active&include_summary=1',
  '/api/fruit-coin-orders?page=1&per_page=100&status_group=completed',
  '/api/buff-tim-orders?page=1&per_page=100&status_group=active&include_summary=1',
  '/api/buff-tim-orders?page=1&per_page=100&status_group=completed',
  '/api/buff-sao-orders?page=1&per_page=100&status_group=active&include_summary=1',
  '/api/buff-sao-orders?page=1&per_page=100&status_group=completed',
  '/api/guestbook-orders?page=1&per_page=100',
  '/api/farm-gift-orders?page=1&per_page=100',
  '/api/mail-gift-orders?page=1&per_page=100',
  '/api/weather-buff-orders?page=1&per_page=100&status_group=active&include_summary=1',
  '/api/weather-buff-orders?page=1&per_page=100&status_group=completed',
];

const ORDER_FRESH_MS = 15000;
const ORDER_STALE_MS = 90000;
let orderCache = {};
async function loadRemoteOrders(force = false) {
  const cache = orderCache;
  const now = Date.now();
  if (!force && cache.result) {
    if (cache.until > now) return cache.result;
    if (cache.staleUntil > now) {
      if (!cache.pending) {
        cache.pending = fetchRemoteOrderPages(cache).finally(() => { cache.pending = null; });
      }
      return cache.result;
    }
  }
  if (cache.pending) return cache.pending;
  cache.pending = fetchRemoteOrderPages(cache);
  try { return await cache.pending; }
  finally { cache.pending = null; }
}

async function fetchOrderGroup(path, previous) {
  const rows = new Map();
  let first;
  try {
    for (let page = 1; ; page++) {
      const response = await hnApiCall(path.replace('page=1&', `page=${page}&`));
      const data = response?.data;
      if (!Array.isArray(data?.data) || (data.current_page != null && Number(data.current_page) !== page)) {
        throw new Error('Trang đơn nguồn không hợp lệ.');
      }
      first ??= response;
      const before = rows.size;
      for (const order of data.data) if (order?.id != null) rows.set(String(order.id), order);
      if (page > 1 && rows.size === before && data.data.length) throw new Error('Trang đơn nguồn bị lặp.');
      if (data.last_page != null ? page >= Number(data.last_page) : !data.next_page_url) break;
      if (!data.data.length) throw new Error('Trang đơn nguồn bị thiếu.');
    }
    if (first.data.total != null && Number(first.data.total) !== rows.size) {
      throw new Error('Tổng số đơn nguồn thay đổi trong khi tải.');
    }
    return { page: { ...first, data: { ...first.data, data: [...rows.values()] } }, partial: false };
  } catch {
    for (const order of previous?.data?.data || []) if (!rows.has(String(order.id))) rows.set(String(order.id), order);
    const source = first || previous;
    return { page: source && { ...source, data: { ...source.data, data: [...rows.values()] } }, partial: true };
  }
}

async function fetchRemoteOrderPages(cache) {
  const groups = await Promise.all(orderPaths.map((path, i) => fetchOrderGroup(path, (cache.result || cache.previous)?.pages[i])));
  const pages = groups.map(group => group.page);
  const partial = groups.some(group => group.partial);
  cache.result = { pages, partial };
  delete cache.previous;
  const finishedAt = Date.now();
  cache.until = finishedAt + (partial ? 2000 : ORDER_FRESH_MS);
  cache.staleUntil = finishedAt + (partial ? 5000 : ORDER_STALE_MS);
  return cache.result;
}

app.get('/api/orders', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.role === 'admin';
    const categoryFilter = req.query.category || 'all';
    const now = Date.now();
    // Anti-spam burst guard: CTV can force-refresh orders at most once every 3s (placing/editing orders clears orderCache immediately).
    const force = req.query.refresh === '1' && (isAdmin || !orderCache.result || now - (orderCache.lastForceAt || 0) > 3000);
    if (force) orderCache.lastForceAt = now;

    if (!isAdmin && !db.localOrders.some(order => order.placedBy?.id === user.id)) {
      return res.json({ success: true, orders: [], partial: false, page: { totalCount: 0, activeCount: 0, filteredCount: 0 } });
    }
    const remote = await loadRemoteOrders(force);

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
      weatherCompRes,
    ] = remote.pages;

    const remoteMap = new Map();
    const collectRemote = (arr, catKey) => {
      const list = Array.isArray(arr?.data?.data) ? arr.data.data : [];
      for (const item of list) {
        const actualCat =
          catKey === 'fruit_coin' && item.type === 'by_fruit' ? 'fruit_by_fruit' : catKey;
        remoteMap.set(`${actualCat}:${item.id}`, { ...item, _category: actualCat });
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
    collectRemote(weatherCompRes, 'weather_buff');

    const matchedRemoteKeys = new Set();
    for (const lo of db.localOrders) {
      if (lo.remoteOrderId) {
        const rem = remoteMap.get(`${lo.category}:${lo.remoteOrderId}`);
        if (rem) matchedRemoteKeys.add(`${rem._category}:${rem.id}`);
        if (rem && lo.status !== 'cancelled') {
          lo.status = rem.status || lo.status;
          lo.isActive = rem.is_active ?? lo.isActive;
          lo.totalCnt = rem.total_cnt ?? rem.package_quantity ?? lo.totalCnt;
          lo.sendingCnt = rem.sending_cnt ?? 0;
          lo.completedCnt = rem.completed_cnt ?? lo.completedCnt;
          lo.failedCnt = rem.failed_cnt ?? 0;
          lo.lastAssignedAt = rem.last_assigned_at || null;
          lo.note = rem.price_adjustment_note || rem.note || lo.note || null;
          if (lo.category === 'weather_buff') {
            lo.weather = normalizeWeatherMeta(rem, lo.weather);
            lo.summary = formatWeatherOrderSummary(lo.weather, lo.summary);
            const assignedCust = lo.weather.slots.find(s => s.customer)?.customer || null;
            lo.customer = assignedCust
              ? {
                  customerId: assignedCust.id,
                  gameProfileId: lo.customer?.gameProfileId || null,
                  nickname: assignedCust.nickname || `Khách #${assignedCust.id}`,
                  suid: assignedCust.suid || '',
                }
              : { customerId: null, gameProfileId: null, nickname: 'Chưa gán khách', suid: '' };
          } else if (rem.customer) {
            lo.customer ??= {};
            lo.customer.nickname = rem.customer.nickname || lo.customer.nickname;
            lo.customer.suid = rem.customer.suid || lo.customer.suid;
          }
        }
      }
    }

    const cutoff = vietnamWeekStart();
    // Once the source confirms its full list, remove last week's orders that it has cleared.
    if (!remote.partial) {
      const retained = db.localOrders.filter(o => !(Date.parse(o.createdAt) < cutoff && o.remoteOrderId
        && !o.weatherDeletePending && !o.requiresReview && !o.cancelRequested && !o.refundPending
        && !remoteMap.has(`${o.category}:${o.remoteOrderId}`)));
      if (retained.length !== db.localOrders.length) {
        db.localOrders = retained;
        req.needsSave = true;
      }
    }
    if (db.localOrders.some(o => isPastOrderHistory(o, cutoff))) {
      pruneWeekHistory(cutoff);
      req.needsSave = true;
    }
    // Scope the list before including source-only orders for administrators.
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
        note: isAdmin
          ? lo.note || null
          : lo.cancelRequested
          ? 'Đã gửi yêu cầu hủy cho admin.'
          : lo.requiresReview
          ? 'Đang được admin đối soát.'
          : lo.category === 'weather_buff' && lo.note && !/hoannguyen|giá|price/i.test(lo.note)
          ? lo.note
          : null,
        weather: lo.category === 'weather_buff' ? lo.weather || null : undefined,
        weatherDeletePending: lo.weatherDeletePending || undefined,
        weatherDeleteAt: !isAdmin && lo.category === 'weather_buff' && lo.status === 'pending' && !lo.weatherDeletePending && !lo.requiresReview && !lo.refundPending && !lo.refundedAmount &&
          emptyWeatherOrder(remoteMap.get(`weather_buff:${lo.remoteOrderId}`)) ? Date.parse(lo.createdAt) + 15000 : undefined,
        cancelRequested: !!lo.cancelRequested,
        requiresReview: !!lo.requiresReview,
        createdAt: lo.createdAt,
        source: 'znplay',
      }));

    // Admin also sees pre-existing orders synced from HoanNguyen
    if (isAdmin) {
      for (const [key, rem] of remoteMap.entries()) {
        if (key.startsWith('any:')) continue;
        if (matchedRemoteKeys.has(key)) continue;

        if (isPastOrderHistory({ createdAt: rem.created_at, status: rem.status }, cutoff)) continue;
        const cat = rem._category;
        const cost = Number(rem.total_price || 0);
        let summary = '';
        let custNickname = rem.customer?.nickname || `Khách #${rem.customer_id || rem.id}`;
        let custSuid = rem.customer?.suid || '';
        let weatherMeta;

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
          weatherMeta = normalizeWeatherMeta(rem, null);
          const slotCust = weatherMeta.slots.find((s) => s.customer)?.customer;
          if (slotCust) {
            custNickname = slotCust.nickname || custNickname;
            custSuid = slotCust.suid || custSuid;
          } else {
            custNickname = 'Chưa gán khách';
            custSuid = '';
          }
          summary = formatWeatherOrderSummary(weatherMeta, `Buff Thời Tiết (${rem.package_quantity || 0} lần)`);
        } else {
          summary = `${rem.gift?.item?.name || 'Quà'} × ${Number(rem.total_cnt || 0).toLocaleString('vi-VN')}`;
        }

        results.push({
          id: `HN-${cat}-${rem.id}`,
          remoteOrderId: rem.id,
          category: cat,
          categoryName: CATEGORY_METADATA[cat]?.menuLabel || cat,
          summary,
          customer: {
            customerId: cat === 'weather_buff' ? (weatherMeta?.slots.find(s => s.customer)?.customer_id ?? null) : rem.customer_id,
            gameProfileId: rem.game_profile_id,
            nickname: custNickname,
            suid: custSuid,
          },
          costPrice: cost,
          markupAmount: 0,
          sellPrice: cost,
          placedBy: {
            id: 'usr_admin_1',
            name: rem.creator?.name || 'HoanNguyen',
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
          weather: cat === 'weather_buff' ? weatherMeta : undefined,
          createdAt: rem.created_at || new Date().toISOString(),
          source: 'hoannguyen_sync',
        });
      }
    }

    const totalCount = results.length;
    const activeCount = results.filter(o => !['completed','cancelled'].includes(o.status) && o.isActive).length;
    if (categoryFilter && categoryFilter !== 'all') {
      if (categoryFilter === 'fruit_all') {
        results = results.filter((o) => o.category === 'fruit_coin' || o.category === 'fruit_by_fruit');
      } else {
        results = results.filter((o) => o.category === categoryFilter);
      }
    }

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    let page;
    if (req.query.limit !== undefined) {
      const stats = { total_orders: results.length, completed_orders: 0, active_orders: 0, inactive_orders: 0,
        total_units: 0, completed_units: 0, active_units: 0, inactive_units: 0 };
      for (const o of results) {
        stats.total_units += Number(o.totalCnt || 0);
        stats.completed_units += Number(o.completedCnt || 0);
        if (o.status === 'completed') stats.completed_orders++;
        else if (o.status !== 'cancelled') {
          stats[o.isActive ? 'active_orders' : 'inactive_orders']++;
          stats[o.isActive ? 'active_units' : 'inactive_units'] += Math.max(0, o.totalCnt - o.completedCnt);
        }
      }
      const q = String(req.query.q || '').trim().toLowerCase();
      results = results.filter(o => {
        if (req.query.active === '1' && !o.isActive || req.query.active === '0' && o.isActive) return false;
        if (req.query.progress === 'completed' && o.status !== 'completed') return false;
        if (req.query.progress === 'running' && ['completed','cancelled'].includes(o.status)) return false;
        return !q || [o.customer?.nickname, o.customer?.suid, o.remoteOrderId, o.id, o.weather?.trackUrl].some(v => String(v ?? '').toLowerCase().includes(q));
      });
      page = { totalCount, activeCount, categoryStats: stats, filteredCount: results.length };
      results = results.slice(0, listLimit(req.query.limit));
    }

    res.json({
      success: true,
      serverTime: Date.now(),
      orders: results,
      page,
      partial: remote.partial,
      remoteSummaries: isAdmin
        ? {
            fruit_coin: fruitActiveRes?.summary || fruitActiveRes?.data?.summary || null,
            buff_tim: timActiveRes?.summary || timActiveRes?.data?.summary || null,
            buff_sao: saoActiveRes?.summary || saoActiveRes?.data?.summary || null,
            weather_buff: weatherRes?.summary || weatherRes?.data?.summary || null,
          }
        : undefined,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: publicError(req, err, 'Không thể tải danh sách đơn hàng.'),
    });
  }
});

const weatherMutationLocks = new Set();
function orderMutation(handler) {
  return asyncRoute(async (req, res) => {
    if (req.params.category && req.params.category !== 'weather_buff') return handler(req, res);
    const key = String(req.params.remoteId).replace(/^0+(?=\d)/, '');
    if (weatherMutationLocks.has(key)) return res.status(409).json({ success: false, message: 'Đơn đang được xử lý. Vui lòng làm mới.' });
    weatherMutationLocks.add(key);
    try { await handler(req, res); }
    finally { weatherMutationLocks.delete(key); }
  });
}

// Toggle Active / Inactive Order (Strict ownership check for CTV)
app.put('/api/orders/:category/:remoteId/toggle-active', requireAuth, financialGuard, limitInteractive, orderMutation(async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.role === 'admin';
    const { category, remoteId } = req.params;

    const lo = db.localOrders.find((o) => o.category === category && String(o.remoteOrderId) === String(remoteId));
    if (!isAdmin && (!lo || lo.placedBy?.id !== user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Bạn chỉ có thể thao tác trên đơn hàng do chính tài khoản của bạn tạo.',
      });
    }

    const meta = CATEGORY_METADATA[category];
    if (!Object.hasOwn(CATEGORY_METADATA, category)) {
      return res.status(400).json({ success: false, message: 'Danh mục đơn không hợp lệ.' });
    }
    if (lo?.status === 'cancelled' || lo?.requiresReview || lo?.weatherDeletePending) return res.status(409).json({ success: false, message: 'Đơn đã hủy hoặc đang chờ đối soát; không thể bật/tắt.' });
    if (category === 'weather_buff' && lo && !lo.isActive && lo.weather) {
      const hasCust = (lo.weather.slots || []).some(s => s.customer_id || s.customer);
      const totalWeathers = (lo.weather.weathers || []).reduce((sum, w) => sum + Number(w.quantity || 0), 0);
      if (!hasCust) {
        return res.status(400).json({ success: false, message: 'Vui lòng gán khách hàng vào đơn Buff Thời Tiết trước khi bật chạy!' });
      }
      if (totalWeathers <= 0) {
        return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất 1 loại thời tiết trước khi bật chạy!' });
      }
      if (lo.weather.packageQuantity > 0 && totalWeathers > lo.weather.packageQuantity) {
        return res.status(400).json({ success: false, message: 'Tổng số lần thời tiết đang vượt gói đã mua. Hãy chỉnh lại trước khi bật!' });
      }
    }
    const r = await hnApiCall(`${meta.apiOrderPath}/${encodeURIComponent(remoteId)}/toggle-active`, 'PUT');
    orderCache = { previous: orderCache.result || orderCache.previous };
    if (lo && r?.data) {
      lo.isActive = r.data.is_active ?? !lo.isActive;
      if (r.data.status) lo.status = r.data.status;
      if (category === 'weather_buff') {
        lo.weather = normalizeWeatherMeta(r.data, lo.weather);
      }
      req.needsSave = true;
    }
    res.json({
      success: true,
      message: 'Đã cập nhật trạng thái bật/tắt đơn hàng.',
      data: isAdmin ? r?.data : undefined,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: publicError(req, err, 'Không thể bật/tắt đơn hàng này (kiểm tra đã gán khách và chọn đủ thời tiết chưa).'),
    });
  }
}));

// ============================================================================
// WEATHER BUFF ORDER CONFIGURATION (ASSIGN/CLEAR CUSTOMER SLOT + SET WEATHERS)
// Strictly enforces ownership and locks price_package_id so paid price never drifts!
// ============================================================================
function resolveEditableWeatherOrder(req, res) {
  const user = req.user;
  const isAdmin = user.role === 'admin';
  const remoteId = String(req.params.remoteId || '').trim();
  if (!/^\d+$/.test(remoteId)) {
    res.status(400).json({ success: false, message: 'Mã đơn Buff Thời Tiết không hợp lệ.' });
    return null;
  }
  const lo = db.localOrders.find((o) => o.category === 'weather_buff' && String(o.remoteOrderId) === remoteId) || null;
  if (!isAdmin && (!lo || lo.placedBy?.id !== user.id)) {
    res.status(403).json({ success: false, message: 'Bạn chỉ có thể chỉnh sửa đơn Buff Thời Tiết do chính bạn tạo.' });
    return null;
  }
  if (lo && (lo.status === 'cancelled' || lo.status === 'completed' || lo.requiresReview || lo.weatherDeletePending)) {
    res.status(409).json({ success: false, message: 'Đơn đã hoàn thành, đã hủy hoặc đang chờ đối soát; không thể chỉnh sửa.' });
    return null;
  }
  return { user, isAdmin, remoteId, lo };
}

function applyWeatherRemoteUpdate(lo, remoteData) {
  if (!lo || !remoteData) return;
  lo.status = remoteData.status || lo.status;
  lo.isActive = remoteData.is_active ?? lo.isActive;
  lo.totalCnt = remoteData.package_quantity ?? lo.totalCnt;
  lo.completedCnt = remoteData.completed_cnt ?? lo.completedCnt;
  lo.weather = normalizeWeatherMeta(remoteData, lo.weather);
  lo.summary = formatWeatherOrderSummary(lo.weather, lo.summary);
  const assignedCust = lo.weather.slots.find(s => s.customer)?.customer || null;
  lo.customer = assignedCust
    ? {
        customerId: assignedCust.id,
        gameProfileId: lo.customer?.gameProfileId || null,
        nickname: assignedCust.nickname || `Khách #${assignedCust.id}`,
        suid: assignedCust.suid || '',
      }
    : { customerId: null, gameProfileId: null, nickname: 'Chưa gán khách', suid: '' };
}

app.put('/api/orders/weather_buff/:remoteId/slots/:slotIndex', requireAuth, financialGuard, limitInteractive, orderMutation(async (req, res) => {
  try {
    const ctx = resolveEditableWeatherOrder(req, res);
    if (!ctx) return;
    const slotIndex = Number(req.params.slotIndex);
    const maxSlots = Math.max(1, Math.min(4, Number(ctx.lo?.weather?.customerCount || 1)));
    if (!Number.isSafeInteger(slotIndex) || slotIndex < 0 || slotIndex >= maxSlots) {
      return res.status(400).json({ success: false, message: 'Vị trí khách hàng (slot) không hợp lệ.' });
    }
    const customerId = Number(req.body?.customer_id);
    if (!Number.isSafeInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng tìm và chọn khách hàng hợp lệ.' });
    }
    const selection = chosenCustomers.get(`${ctx.user.id}:${customerId}`);
    if (!ctx.isAdmin && (!selection || selection.until <= Date.now())) {
      return res.status(403).json({ success: false, message: 'Vui lòng tìm và chọn lại nhân vật khách hàng bằng tài khoản của bạn.' });
    }
    const r = await hnApiCall(`/api/weather-buff-orders/${encodeURIComponent(ctx.remoteId)}/slots/${slotIndex}`, 'PUT', {
      customer_id: customerId,
    });
    if (!r?.success) {
      return res.status(400).json({ success: false, message: publicError(req, new Error(r?.message || ''), 'Không thể gán khách hàng vào đơn này.') });
    }
    orderCache = { previous: orderCache.result || orderCache.previous };
    if (ctx.lo) {
      applyWeatherRemoteUpdate(ctx.lo, r.data);
      req.needsSave = true;
    }
    req.auditDetails = { remoteOrderId: ctx.remoteId, slotIndex, customerId };
    res.json({
      success: true,
      message: 'Đã gán khách hàng vào đơn Buff Thời Tiết thành công!',
      order: ctx.lo ? publicOrder(ctx.lo, ctx.isAdmin) : undefined,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: publicError(req, err, 'Không thể gán khách hàng vào đơn Buff Thời Tiết.'),
    });
  }
}));

app.delete('/api/orders/weather_buff/:remoteId/slots/:slotIndex', requireAuth, financialGuard, limitInteractive, orderMutation(async (req, res) => {
  try {
    const ctx = resolveEditableWeatherOrder(req, res);
    if (!ctx) return;
    const slotIndex = Number(req.params.slotIndex);
    const maxSlots = Math.max(1, Math.min(4, Number(ctx.lo?.weather?.customerCount || 1)));
    if (!Number.isSafeInteger(slotIndex) || slotIndex < 0 || slotIndex >= maxSlots) {
      return res.status(400).json({ success: false, message: 'Vị trí khách hàng (slot) không hợp lệ.' });
    }
    if (ctx.lo?.weather?.remoteRef) {
      return res.status(400).json({ success: false, message: 'Đơn đã từng chạy — hãy dùng nút "Đổi khách" để thay trực tiếp khách mới.' });
    }
    const r = await hnApiCall(`/api/weather-buff-orders/${encodeURIComponent(ctx.remoteId)}/slots/${slotIndex}`, 'DELETE');
    if (!r?.success) {
      return res.status(400).json({ success: false, message: publicError(req, new Error(r?.message || ''), 'Không thể gỡ khách hàng khỏi đơn này.') });
    }
    orderCache = { previous: orderCache.result || orderCache.previous };
    if (ctx.lo) {
      applyWeatherRemoteUpdate(ctx.lo, r.data);
      req.needsSave = true;
    }
    req.auditDetails = { remoteOrderId: ctx.remoteId, slotIndex, cleared: true };
    res.json({
      success: true,
      message: 'Đã gỡ khách hàng khỏi đơn Buff Thời Tiết.',
      order: ctx.lo ? publicOrder(ctx.lo, ctx.isAdmin) : undefined,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: publicError(req, err, 'Không thể gỡ khách hàng khỏi đơn Buff Thời Tiết.'),
    });
  }
}));

app.put('/api/orders/weather_buff/:remoteId/weathers', requireAuth, financialGuard, limitInteractive, orderMutation(async (req, res) => {
  try {
    const ctx = resolveEditableWeatherOrder(req, res);
    if (!ctx) return;
    const inputLines = req.body?.weathers;
    if (!Array.isArray(inputLines) || inputLines.length === 0 || inputLines.length > 25) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất 1 loại thời tiết hợp lệ.' });
    }

    // Lock price_package_id to the originally paid package so CTV cannot change order cost after payment!
    let fixedPackageId = Number(ctx.lo?.weather?.pricePackageId || 0);
    let packageQty = Number(ctx.lo?.weather?.packageQuantity || ctx.lo?.totalCnt || 0);
    if (!fixedPackageId) {
      const remote = await loadRemoteOrders(false);
      const wbList = [
        ...(Array.isArray(remote?.pages?.[9]?.data?.data) ? remote.pages[9].data.data : []),
        ...(Array.isArray(remote?.pages?.[10]?.data?.data) ? remote.pages[10].data.data : []),
      ];
      const match = wbList.find(o => String(o.id) === ctx.remoteId);
      if (match) {
        fixedPackageId = Number(match.price_package_id || 0);
        packageQty = Number(match.package_quantity || packageQty || 0);
      }
    }
    if (!fixedPackageId) {
      return res.status(400).json({ success: false, message: 'Không xác định được gói gốc của đơn. Hãy làm mới danh sách đơn rồi thử lại.' });
    }

    const cleanLines = [];
    let totalQty = 0;
    for (const line of inputLines) {
      const wtId = Number(line?.weather_type_id);
      const qty = Number(line?.quantity);
      const lineId = line?.id == null ? null : Number(line.id);
      if (!Number.isSafeInteger(wtId) || wtId <= 0 || !Number.isSafeInteger(qty) || qty <= 0 || qty > 10000) {
        return res.status(400).json({ success: false, message: 'Loại thời tiết hoặc số lượng không hợp lệ.' });
      }
      if (lineId !== null && (!Number.isSafeInteger(lineId) || lineId <= 0)) {
        return res.status(400).json({ success: false, message: 'Mã dòng thời tiết không hợp lệ.' });
      }
      totalQty += qty;
      cleanLines.push({ id: lineId, weather_type_id: wtId, quantity: qty });
    }
    if (packageQty > 0 && totalQty > packageQty) {
      return res.status(400).json({
        success: false,
        message: `Tổng số lần thời tiết (${totalQty}) không được vượt quá gói đã mua (${packageQty} lần).`,
      });
    }

    const r = await hnApiCall(`/api/weather-buff-orders/${encodeURIComponent(ctx.remoteId)}/weathers`, 'PUT', {
      weathers: cleanLines,
      price_package_id: fixedPackageId,
    });
    if (!r?.success) {
      return res.status(400).json({ success: false, message: publicError(req, new Error(r?.message || ''), 'Không thể lưu cấu hình thời tiết cho đơn này.') });
    }
    orderCache = { previous: orderCache.result || orderCache.previous };
    if (ctx.lo) {
      applyWeatherRemoteUpdate(ctx.lo, r.data);
      req.needsSave = true;
    }
    req.auditDetails = { remoteOrderId: ctx.remoteId, totalQty, lineCount: cleanLines.length };
    res.json({
      success: true,
      message: 'Đã lưu cấu hình thời tiết thành công!',
      order: ctx.lo ? publicOrder(ctx.lo, ctx.isAdmin) : undefined,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: publicError(req, err, 'Không thể lưu cấu hình thời tiết (phần đã chạy xong không được giảm hoặc xóa).'),
    });
  }
}));

// Share / Tracking Link for Weather Buff Order (White-label public link)
app.post('/api/orders/weather_buff/:remoteId/share-link', requireAuth, limitInteractive, asyncRoute(async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.role === 'admin';
    const remoteId = String(req.params.remoteId || '').trim();
    if (!/^\d+$/.test(remoteId)) {
      return res.status(400).json({ success: false, message: 'Mã đơn Buff Thời Tiết không hợp lệ.' });
    }
    const lo = db.localOrders.find((o) => o.category === 'weather_buff' && String(o.remoteOrderId) === remoteId) || null;
    if (!isAdmin && (!lo || lo.placedBy?.id !== user.id)) {
      return res.status(403).json({ success: false, message: 'Bạn chỉ có thể lấy link theo dõi cho đơn do chính bạn tạo.' });
    }
    if (lo?.status === 'cancelled') {
      return res.status(409).json({ success: false, message: 'Đơn đã hủy; không thể tạo link theo dõi.' });
    }
    const r = await hnApiCall(`/api/weather-buff-orders/${encodeURIComponent(remoteId)}/share-link`, 'POST');
    const url = buildSafeWeatherTrackUrl(r?.data?.url, r?.data?.token || lo?.weather?.publicToken);
    if (!r?.success || !url) {
      return res.status(400).json({ success: false, message: 'Không thể tạo link theo dõi cho đơn này.' });
    }
    if (lo) {
      lo.weather = normalizeWeatherMeta({ public_token: r.data?.token, track_url: url }, lo.weather);
      req.needsSave = true;
    }
    res.json({ success: true, url, token: r.data?.token || lo?.weather?.publicToken || null });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: publicError(req, err, 'Không thể lấy link theo dõi cho đơn Buff Thời Tiết.'),
    });
  }
}));

function emptyWeatherOrder(row) {
  const zero = n => n === 0 || n === '0';
  return row?.status === 'pending' && (row.is_active === false || zero(row.is_active))
    && zero(row.completed_cnt) && zero(row.sending_cnt) && zero(row.failed_cnt)
    && !row.completed_at && !row.deleted_at && !row.remote_ref && !row.remote_order_id
    && !row.casting && !row.casting_weather_id && !row.casting_started_at
    && Array.isArray(row.weathers) && row.weathers.length === 0
    && Array.isArray(row.slots) && row.slots.every(slot => slot && !slot.customer_id && !slot.customer);
}

async function findSourceWeatherOrder(id, group) {
  const list = await hnApiCall(`/api/weather-buff-orders?status_group=${group}&search=${id}&per_page=100`);
  if (list?.success !== true || !Array.isArray(list.data?.data)) throw new Error('Chưa đọc được trạng thái đơn tại nguồn.');
  const match = list.data.data.find(o => String(o.id) === id);
  if (!match && list.data.data.length !== Number(list.data.total)) throw new Error('Chưa xác minh hết kết quả tại nguồn.');
  return match;
}

async function deleteEmptyWeatherOrder(req, res, order) {
  const admin = req.user.role === 'admin';
  const reject = (status, message) => res.status(status).json({ success: false, message });
  if (!order || order.placedBy?.role !== 'ctv' || (!admin && order.placedBy.id !== req.user.id)) {
    return reject(403, 'Bạn chỉ có thể xóa đơn Buff Thời Tiết của mình.');
  }
  const unlockAt = Date.parse(order.createdAt) + 15000;
  if (!Number.isFinite(unlockAt) || Date.now() < unlockAt) return reject(409, 'Có thể xóa đơn sau 15 giây kể từ khi tạo.');
  if (order.requiresReview || order.refundPending || order.refundedAmount || (!order.weatherDeletePending && order.status !== 'pending')) {
    return reject(409, 'Trạng thái hiện tại của đơn không cho phép hoàn toàn bộ tiền.');
  }
  const owner = db.users.find(u => u.id === order.placedBy.id);
  const amount = order.sellPrice;
  const refundKey = `cancel:${order.id}`;
  const canRefund = () => db.localOrders.includes(order) && db.users.includes(owner) && validMoney(amount, false)
    && validMoney(owner?.balance) && validMoney(owner.balance + amount) && !db.transactions.some(t => t.refundKey === refundKey);
  if (!canRefund()) return reject(409, 'Vui lòng đối soát giá đặt đơn và ví nhận trước khi xóa.');
  const id = encodeURIComponent(order.remoteOrderId);
  const row = await findSourceWeatherOrder(id, 'active');
  req.auditDetails = { category: order.category, remoteOrderId: order.remoteOrderId, userId: owner.id };
  const reconciling = admin && order.weatherDeletePending && req.body?.confirmed_deleted === true;
  if (reconciling && !emptyWeatherOrder(row) && (row || await findSourceWeatherOrder(id, 'completed'))) {
    delete order.weatherDeletePending;
    orderCache = {};
    return reject(409, 'Đơn vẫn tồn tại và đã thay đổi tại nguồn. Đã đóng yêu cầu xóa và giữ nguyên ví CTV.');
  }
  if (!reconciling || row) {
    if (!emptyWeatherOrder(row)) return reject(409, order.weatherDeletePending
      ? 'Yêu cầu xóa cần admin kiểm tra tại nguồn để đối soát.' : 'Chỉ có thể xóa đơn chưa chạy, chưa gán khách và chưa chọn thời tiết.');
    if (!canRefund()) return reject(409, 'Ví hoặc đơn đã thay đổi. Vui lòng làm mới.');
    order.weatherDeletePending = true;
    await saveDb(db);
    try {
      const result = await hnApiCall(`/api/weather-buff-orders/${id}`, 'DELETE', { deletion_note: 'CTV hủy đơn Buff Thời Tiết trống' });
      if (result?.success !== true) throw new Error('Thiếu xác nhận xóa.');
    } catch (error) {
      if (error.data?.success === false && error.status < 500 && error.status !== 404) {
        delete order.weatherDeletePending;
        return reject(409, 'Nguồn từ chối xóa đơn. Ví CTV chưa thay đổi.');
      }
      return reject(503, 'Chưa xác nhận được kết quả xóa. Vui lòng nhờ admin kiểm tra tại nguồn để đối soát ví.');
    }
  }
  if (!canRefund()) return reject(409, 'Cần admin đối soát ví để ghi nhận tiền hoàn.');
  owner.balance += amount;
  db.transactions.unshift({ id: crypto.randomUUID(), refundKey, userId: owner.id, userName: owner.name,
    type: 'order_refund', amount, balanceAfter: owner.balance, note: `Hoàn tiền xóa đơn Buff Thời Tiết #${order.remoteOrderId}`, createdAt: new Date().toISOString() });
  db.localOrders.splice(db.localOrders.indexOf(order), 1);
  orderCache = {};
  Object.assign(req.auditDetails, { refundedAmount: amount, balanceAfter: owner.balance });
  res.json({ success: true, refundedAmount: amount, message: `Đã xóa đơn #${order.remoteOrderId} và hoàn ${amount.toLocaleString('vi-VN')}đ vào ví CTV.` });
}

app.delete('/api/orders/:category/:remoteId', requireAuth, financialGuard, limitInteractive, orderMutation(async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.role === 'admin';
    if (!isAdmin && req.params.category !== 'weather_buff') {
      return res.status(403).json({
        success: false,
        message: 'CTV không có quyền xóa hoặc hủy đơn hàng. Vui lòng liên hệ Admin nếu cần hỗ trợ.',
      });
    }
    const { category, remoteId } = req.params;
    const idx = db.localOrders.findIndex((o) => o.category === category && String(o.remoteOrderId) === String(remoteId));

    const meta = CATEGORY_METADATA[category];
    if (!Object.hasOwn(CATEGORY_METADATA, category)) {
      return res.status(400).json({ success: false, message: 'Danh mục đơn không hợp lệ.' });
    }
    const lo = idx >= 0 ? db.localOrders[idx] : null;
    if (!isAdmin || lo?.weatherDeletePending) return await deleteEmptyWeatherOrder(req, res, lo);
    const alreadyCancelled = lo?.status === 'cancelled';

    // Delete at upstream source FIRST (skip only if order was already cancelled at source earlier)
    if (!alreadyCancelled) {
      const r = await hnApiCall(`${meta.apiOrderPath}/${encodeURIComponent(remoteId)}`, 'DELETE', {
        deletion_note: req.body?.deletion_note || 'Xóa đơn từ ZnStudio',
      });
      if (r && r.success === false) {
        return res.status(400).json({
          success: false,
          message: publicError(req, new Error(r.message || ''), 'Nguồn từ chối xóa đơn hàng này.'),
        });
      }
    }
    orderCache = { previous: orderCache.result || orderCache.previous };

    let refundedAmount = 0;
    let ownerName = '';
    let ownerBalanceAfter = null;

    if (lo) {
      const totalCnt = Number(lo.totalCnt || 0);
      const completedCnt = Math.max(0, Number(lo.completedCnt || 0));
      const isCompleted = lo.status === 'completed' || (totalCnt > 0 && completedCnt >= totalCnt);
      const alreadyRefunded = Math.max(0, Number(lo.refundedAmount || 0));
      const remainingSell = Math.max(0, Number(lo.sellPrice || 0) - alreadyRefunded);

      if (lo.placedBy?.role === 'ctv' && !isCompleted && remainingSell > 0) {
        const computedRefund = completedCnt <= 0
          ? remainingSell
          : totalCnt > 0
          ? Math.min(remainingSell, Math.floor((Number(lo.sellPrice || 0) * Math.max(0, totalCnt - completedCnt)) / totalCnt))
          : 0;

        const refundKey = `cancel:${lo.id}`;
        const owner = db.users.find((u) => u.id === lo.placedBy.id);
        if (computedRefund > 0 && owner && validMoney(owner.balance + computedRefund) && !db.transactions.some((t) => t.refundKey === refundKey)) {
          owner.balance += computedRefund;
          refundedAmount = computedRefund;
          ownerName = owner.name;
          ownerBalanceAfter = owner.balance;
          db.transactions.unshift({
            id: crypto.randomUUID(),
            refundKey,
            userId: owner.id,
            userName: owner.name,
            type: 'order_refund',
            amount: computedRefund,
            balanceAfter: owner.balance,
            note: `Hoàn tiền hủy đơn ${lo.categoryName || lo.category} #${lo.remoteOrderId}: ${lo.summary || ''}`.trim(),
            createdAt: new Date().toISOString(),
          });
        }
      }

      // Remove cancelled/deleted order completely from localOrders so it does not clutter UI or database
      const currentIdx = db.localOrders.findIndex((o) => o.id === lo.id);
      if (currentIdx >= 0) db.localOrders.splice(currentIdx, 1);

      req.auditDetails = {
        userId: lo.placedBy?.id,
        category,
        remoteOrderId: lo.remoteOrderId,
        refundedAmount,
        balanceAfter: ownerBalanceAfter,
      };
      req.needsSave = true;
    }

    const msg = refundedAmount > 0
      ? `Đã hủy & xóa đơn #${remoteId} thành công! Đã hoàn ${refundedAmount.toLocaleString('vi-VN')}đ về ví CTV ${ownerName} (Số dư mới: ${ownerBalanceAfter.toLocaleString('vi-VN')}đ).`
      : lo?.placedBy?.role === 'ctv' && lo.status === 'completed'
      ? `Đã xóa đơn #${remoteId} đã hoàn thành khỏi hệ thống (không hoàn tiền vì đơn đã giao đủ).`
      : `Đã hủy & xóa đơn #${remoteId} khỏi hệ thống.`;

    res.json({
      success: true,
      refundedAmount,
      message: msg,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: publicError(req, err, 'Không thể xóa đơn hàng (chỉ xóa được đơn chưa chạy hoặc đã hoàn thành).'),
    });
  }
}));

// ============================================================================
// WEEKLY SETTLEMENTS & TRANSACTION LEDGER
// ============================================================================
function walletTotalsByUser() {
  const totals = new Map();
  for (const tx of db.transactions) {
    const row = totals.get(tx.userId) || { totalTopup: 0, totalSpent: 0, held: 0, deducted: 0 };
    const amount = Number(tx.amount);
    if (tx.type === 'admin_topup') row.totalTopup += amount;
    if (tx.type === 'order_debit' || tx.type === 'order_refund') row.totalSpent -= amount;
    if (tx.type === 'order_hold' || tx.type === 'order_release') row.held -= amount;
    if (tx.type === 'admin_deduct') row.deducted -= amount;
    totals.set(tx.userId, row);
  }
  return totals;
}

function listLimit(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : 20;
}

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
        localOrders: req.query.limit === undefined ? db.localOrders : undefined,
        transactionCount: db.transactions.length,
        transactions: db.transactions.slice(0, listLimit(req.query.limit)),
      });
    } else {
      const myOrders = db.localOrders.filter((o) => o.status !== 'cancelled' && o.placedBy?.id === user.id);
      const myTrx = db.transactions.filter((t) => t.userId === user.id);
      const totalSpent = walletTotalsByUser().get(user.id)?.totalSpent || 0;
      res.json({
        success: true,
        mode: 'ctv',
        weekStart,
        summary: {
          orderCount: myOrders.length,
          totalSpent,
          currentBalance: user.balance,
        },
        orders: req.query.limit === undefined ? myOrders.map(order => publicOrder({ ...order, note: null }, false)) : undefined,
        transactionCount: myTrx.length,
        transactions: myTrx.slice(0, listLimit(req.query.limit)),
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
app.use('/api/admin', (req, res, next) => req.method === 'GET' ? next() : financialGuard(req, res, next));

app.get('/api/admin/monitor', asyncRoute(async (req, res) => {
  const settlement = await hnApiCall(`/api/seller-settlements?week_start=${getCurrentMondayStr()}`, 'GET', null, true, 5000).catch(() => null);
  const rawSpent = settlement?.data?.weekly_limit?.spent;
  const spent = typeof rawSpent === 'string' && /^\d+$/.test(rawSpent) ? Number(rawSpent) : rawSpent;
  const wallets = walletTotalsByUser();
  const orderStatsByCtv = new Map();
  for (const o of db.localOrders) {
    const uid = o.placedBy?.id;
    if (!uid) continue;
    const st = orderStatsByCtv.get(uid) || { orderCount: 0, totalSell: 0, totalProfit: 0, lastOrderAt: null };
    st.orderCount += 1;
    if (o.status !== 'cancelled') {
      st.totalSell += Number(o.sellPrice || 0);
      st.totalProfit += Number(o.markupAmount || 0);
    }
    if (!st.lastOrderAt || String(o.createdAt || '') > st.lastOrderAt) st.lastOrderAt = o.createdAt || null;
    orderStatsByCtv.set(uid, st);
  }
  const ctvs = db.users
    .filter(u => u.role === 'ctv')
    .map(u => {
      const base = sanitizeUser(u);
      const st = orderStatsByCtv.get(u.id) || { orderCount: 0, totalSell: 0, totalProfit: 0, lastOrderAt: null };
      return { ...base, ...st, totalTopup: wallets.get(u.id)?.totalTopup || 0, totalSpent: wallets.get(u.id)?.totalSpent || 0 };
    });
  const walletTotals = { totalTopup: 0, totalSpent: 0, balance: 0 };
  for (const ctv of ctvs) {
    walletTotals.totalTopup += ctv.totalTopup;
    walletTotals.totalSpent += ctv.totalSpent;
    walletTotals.balance += Number(ctv.balance ?? 0);
  }
  res.json({ success: true, storageHealthy,
    walletTotals,
    adminPayable: Number.isSafeInteger(spent) && spent >= 0 && Number.isSafeInteger(spent + walletTotals.balance) ? spent + walletTotals.balance : null,
    ctvCount: ctvs.length,
    ctvs: ctvs.slice(0, listLimit(req.query.ctvs)),
    intents: req.query.summary === '1' ? undefined : db.orderIntents.filter(i => ['processing', 'uncertain'].includes(i.status) || i.requiresReview).slice(0, 200),
    eventCount: Math.min(50, db.auditLog.length),
    events: db.auditLog.slice(0, Math.min(50, listLimit(req.query.events))),
  });
}));

app.get('/api/admin/monitor/ctv/:id', (req, res) => {
  const ctv = db.users.find(u => u.id === req.params.id && u.role === 'ctv');
  if (!ctv) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản CTV này.' });
  }
  const ctvOrders = db.localOrders
    .filter(o => o.placedBy?.id === ctv.id)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  let totalSell = 0;
  let totalCost = 0;
  let totalProfit = 0;
  let completedCount = 0;
  let runningCount = 0;
  let cancelledCount = 0;
  for (const o of ctvOrders) {
    if (o.status === 'cancelled') {
      cancelledCount += 1;
    } else {
      totalSell += Number(o.sellPrice || 0);
      totalCost += Number(o.costPrice || 0);
      totalProfit += Number(o.markupAmount || 0);
      if (o.status === 'completed') completedCount += 1;
      else runningCount += 1;
    }
  }

  const ctvTransactions = db.transactions.filter(t => t.userId === ctv.id);
  const wallet = walletTotalsByUser().get(ctv.id) || { totalTopup: 0, totalSpent: 0, held: 0, deducted: 0 };
  const debitRows = ctvTransactions.filter(t => t.type === 'order_debit');
  const debits = new Map(debitRows.map(t => [t.id, -Number(t.amount)]));
  // Early orders have no intent ID. Only link an unambiguous timestamp, amount and description.
  const claimed = new Set(ctvOrders.map(o => o.intentId).filter(Boolean));
  const legacyKey = (date, price) => JSON.stringify([date, Number(price)]);
  const oldOrders = Map.groupBy(ctvOrders.filter(o => !o.intentId), o => legacyKey(o.createdAt, o.sellPrice));
  const oldDebits = Map.groupBy(debitRows.filter(t => !claimed.has(t.id)), t => legacyKey(t.createdAt, -t.amount));
  for (const [key, orders] of oldOrders) {
    const matches = oldDebits.get(key);
    if (orders.length === 1 && matches?.length === 1 && orders[0].summary && matches[0].note?.endsWith(orders[0].summary)) {
      debits.set(orders[0].id, -Number(matches[0].amount));
    }
  }
  const ctvEvents = db.auditLog.filter(e => e.actorId === ctv.id || e.details?.userId === ctv.id).slice(0, 50);
  const query = String(req.query.q || '').trim().toLowerCase();
  const filtered = ctvOrders.filter(o => (!req.query.category || req.query.category === 'all' || o.category === req.query.category)
    && (!query || [o.id, o.remoteOrderId, o.summary, o.customer?.nickname, o.customer?.suid].some(v => String(v ?? '').toLowerCase().includes(query))));

  res.json({
    success: true,
    ctv: sanitizeUser(ctv),
    summary: {
      balance: Number(ctv.balance || 0),
      orderCount: ctvOrders.length,
      completedCount,
      runningCount,
      cancelledCount,
      totalSell,
      totalCost,
      totalProfit,
      ...wallet,
      unaccountedBalance: Number(ctv.balance || 0) - (wallet.totalTopup - wallet.totalSpent - wallet.held - wallet.deducted),
      lastOrderAt: ctvOrders[0]?.createdAt || null,
    },
    filteredCount: filtered.length,
    transactionCount: ctvTransactions.length,
    eventCount: ctvEvents.length,
    orders: filtered.slice(0, listLimit(req.query.orders)).map(o => ({
      id: o.id,
      remoteOrderId: o.remoteOrderId,
      category: o.category,
      categoryName: CATEGORY_METADATA[o.category]?.menuLabel || o.categoryName || o.category,
      summary: o.summary,
      customer: o.customer || null,
      debit: debits.get(o.intentId || o.id) ?? null,
      refundedAmount: Number(o.refundedAmount || 0),
      sellPrice: Number(o.sellPrice || 0),
      costPrice: Number(o.costPrice || 0),
      markupAmount: Number(o.markupAmount || 0),
      status: o.status || 'pending',
      isActive: !!o.isActive,
      totalCnt: Number(o.totalCnt || 0),
      completedCnt: Number(o.completedCnt || 0),
      trackUrl: o.weather?.trackUrl || null,
      createdAt: o.createdAt,
    })),
    transactions: ctvTransactions.slice(0, listLimit(req.query.transactions)),
    events: ctvEvents.slice(0, listLimit(req.query.events)),
  });
});

app.post('/api/admin/intents/:id/acknowledge', asyncRoute(async (req, res) => {
  const intent = db.orderIntents.find(i => i.id === req.params.id);
  const { note, confirmed } = req.body || {};
  if (!intent?.requiresReview || confirmed !== true || typeof note !== 'string' || note.trim().length < 10 || note.length > 500) {
    return res.status(400).json({ success: false, message: 'Cần đơn có cảnh báo, ghi chú và xác nhận đã kiểm tra chi phí tại nguồn.' });
  }
  intent.requiresReview = false;
  intent.reviewNote = note.trim();
  intent.reviewedBy = req.user.id;
  intent.reviewedAt = new Date().toISOString();
  const order = db.localOrders.find(o => o.intentId === intent.id);
  if (order) order.requiresReview = false;
  req.auditDetails = { intentId: intent.id, note: intent.reviewNote };
  req.needsSave = true;
  res.json({ success: true, message: 'Đã ghi nhận chi phí nguồn. Không tự điều chỉnh thêm tiền ví CTV.' });
}));

app.post('/api/admin/intents/:id/reconcile', asyncRoute(async (req, res) => {
  const intent = db.orderIntents.find(i => i.id === req.params.id);
  const { resolution, note, remoteOrderId, actualCost, confirmed } = req.body || {};
  if (!intent || intent.status !== 'uncertain') return res.status(409).json({ success: false, message: 'Yêu cầu không còn chờ đối soát.' });
  if (confirmed !== true || typeof note !== 'string' || note.trim().length < 10 || note.length > 500) {
    return res.status(400).json({ success: false, message: 'Cần xác nhận đã kiểm tra nguồn và ghi chú đối soát ít nhất 10 ký tự.' });
  }
  if (resolution === 'not_created') {
    releaseIntent(intent, `Admin xác nhận nguồn chưa tạo đơn: ${note.trim()}`);
    intent.status = 'rejected';
    intent.responseStatus = 400;
    intent.response = { success: false, message: 'Admin đã đối soát: nguồn chưa tạo đơn, khoản giữ tiền đã được trả lại.' };
  } else if (resolution === 'created') {
    if (!Number.isSafeInteger(remoteOrderId) || remoteOrderId <= 0 || !validMoney(actualCost) ||
        db.localOrders.some(o => o.category === intent.category && Number(o.remoteOrderId) === remoteOrderId)) {
      return res.status(400).json({ success: false, message: 'Mã đơn/chi phí nguồn không hợp lệ hoặc đơn đã được liên kết.' });
    }
    const owner = db.users.find(u => u.id === intent.userId);
    if (!owner) return res.status(409).json({ success: false, message: 'Tài khoản đặt đơn không còn tồn tại.' });
    const order = { id: `ZNP-${crypto.randomUUID()}`, intentId: intent.id, remoteOrderId,
      category: intent.category, categoryName: CATEGORY_METADATA[intent.category].menuLabel,
      summary: intent.summary, customer: intent.customer, costPrice: actualCost,
      sellPrice: intent.sellPrice, markupAmount: intent.sellPrice - actualCost,
      placedBy: { id: owner.id, name: owner.name, username: owner.username, role: owner.role },
      status: 'pending', isActive: true, createdAt: intent.createdAt, note: note.trim() };
    db.localOrders.unshift(order);
    const debit = db.transactions.find(t => t.id === intent.id);
    if (debit) { debit.type = 'order_debit'; debit.note = `Đối soát đơn nguồn #${remoteOrderId}`; }
    intent.status = 'completed';
    intent.remoteOrderId = remoteOrderId;
    intent.response = { success: true, message: 'Đơn đã được admin đối soát.', order: publicOrder(order, owner.role === 'admin'), userBalance: owner.balance };
  } else return res.status(400).json({ success: false, message: 'Kết quả đối soát không hợp lệ.' });
  intent.reviewedBy = req.user.id;
  intent.reviewedAt = new Date().toISOString();
  intent.reviewNote = note.trim();
  req.auditDetails = { intentId: intent.id, resolution, note: intent.reviewNote };
  req.needsSave = true;
  res.json({ success: true, message: 'Đã lưu kết quả đối soát.' });
}));

app.post('/api/admin/orders/:id/refund', asyncRoute(async (req, res) => {
  const order = db.localOrders.find(o => o.id === req.params.id);
  const { amount, sourceRefund, note, confirmed, idempotency_key } = req.body || {};
  if (!order || order.status !== 'cancelled' || order.placedBy?.role !== 'ctv') return res.status(409).json({ success: false, message: 'Chỉ hoàn ví cho đơn CTV đã hủy tại nguồn.' });
  if (typeof idempotency_key !== 'string' || !/^[\w-]{16,80}$/.test(idempotency_key)) return res.status(400).json({ success: false, message: 'Thiếu mã chống hoàn tiền trùng.' });
  if (db.transactions.some(t => t.refundKey === idempotency_key)) return res.status(409).json({ success: false, message: 'Yêu cầu hoàn tiền này đã được xử lý.' });
  const sourceTotal = sourceRefund;
  const refundedTotal = Number(order.refundedAmount || 0) + amount;
  const refundLimit = validMoney(sourceTotal) && validMoney(order.sellPrice) && validMoney(order.costPrice)
    ? order.costPrice > 0 ? Number(BigInt(order.sellPrice) * BigInt(sourceTotal) / BigInt(order.costPrice)) : order.sellPrice
    : -1;
  if (confirmed !== true || typeof note !== 'string' || note.trim().length < 10 || note.length > 500 ||
      !validMoney(amount, false) || !validMoney(sourceRefund) || sourceTotal > order.costPrice || sourceTotal < Number(order.sourceRefunded || 0) ||
      refundedTotal > order.sellPrice || refundedTotal > refundLimit) {
    return res.status(400).json({ success: false, message: 'Số hoàn không được vượt phần đã đối soát nguồn, giá trị đơn hoặc số chưa hoàn; cần ghi chú và xác nhận.' });
  }
  const owner = db.users.find(u => u.id === order.placedBy.id);
  if (!owner || !validMoney(owner.balance + amount)) return res.status(409).json({ success: false, message: 'Số dư tài khoản nhận không hợp lệ.' });
  owner.balance += amount;
  order.sourceRefunded = sourceTotal;
  order.refundedAmount = refundedTotal;
  order.refundPending = refundedTotal < order.sellPrice;
  if (!order.refundPending) {
    const idx = db.localOrders.findIndex(o => o.id === order.id);
    if (idx >= 0) db.localOrders.splice(idx, 1);
  }
  db.transactions.unshift({ id: crypto.randomUUID(), refundKey: idempotency_key, userId: owner.id, userName: owner.name,
    type: 'order_refund', amount, balanceAfter: owner.balance, note: `Hoàn đơn #${order.remoteOrderId}: ${note.trim()}`, createdAt: new Date().toISOString() });
  req.auditDetails = { orderId: order.id, userId: owner.id, amount, sourceRefund, note: note.trim() };
  req.needsSave = true;
  res.json({ success: true, message: !order.refundPending ? 'Đã hoàn đủ tiền về ví CTV và dọn sạch đơn đã hủy.' : 'Đã hoàn ví theo kết quả đối soát; đã ghi nhật ký.' });
}));

app.put('/api/admin/password', asyncRoute(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || !(await verifyPasswordAsync(currentPassword, req.user.password))) {
    return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không chính xác.' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 128) {
    return res.status(400).json({ success: false, message: 'Mật khẩu mới cần từ 12 đến 128 ký tự.' });
  }
  if (await verifyPasswordAsync(newPassword, req.user.password)) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn mật khẩu mới khác mật khẩu hiện tại.' });
  }
  req.user.password = await hashPasswordAsync(newPassword);
  for (const [token, session] of Object.entries(db.sessions)) {
    const userId = typeof session === 'string' ? session : session.userId;
    if (userId === req.user.id) delete db.sessions[token];
  }
  req.needsSave = true;
  res.json({ success: true, message: 'Đã đổi mật khẩu. Vui lòng đăng nhập lại bằng mật khẩu mới.' });
}));

let upstreamCheckPending = false;
app.get('/api/admin/overview', requireAdmin, async (req, res) => {
  try {
    if (!upstreamStatus.lastCheckedAt) {
      await hnApiCall('/api/settings?keys=is_send_task');
    } else if (!upstreamCheckPending && Date.now() - Date.parse(upstreamStatus.lastCheckedAt) > 60000) {
      upstreamCheckPending = true;
      hnApiCall('/api/settings?keys=is_send_task').catch(() => {}).finally(() => { upstreamCheckPending = false; });
    }
  } catch {}

  const wallets = walletTotalsByUser();
  const ctvList = db.users
    .filter((u) => u.role === 'ctv')
    .map((u) => {
      const ctvOrders = db.localOrders.filter((o) => o.placedBy?.id === u.id);
      const totalSpent = wallets.get(u.id)?.totalSpent || 0;
      const totalProfit = ctvOrders.reduce((s, o) => s + Number(o.sellPrice || 0) - Number(o.refundedAmount || 0) - Number(o.costPrice || 0) + Number(o.sourceRefunded || 0), 0);
      return {
        ...sanitizeUser(u),
        totalOrders: ctvOrders.length,
        totalSpent,
        totalProfit,
      };
    });

  const totalLocalOrders = db.localOrders.length;
  const totalRevenue = db.localOrders.reduce((s, o) => s + Number(o.sellPrice || 0) - Number(o.refundedAmount || 0), 0);
  const totalCost = db.localOrders.reduce((s, o) => s + Number(o.costPrice || 0) - Number(o.sourceRefunded || 0), 0);
  const totalProfit = totalRevenue - totalCost;
  const totalCtvBalance = ctvList.reduce((s, u) => s + Number(u.balance || 0), 0);

  res.json({
    success: true,
    storage: {
      mode: postgres ? 'postgresql' : 'json',
      persistent: Boolean(postgres || process.env.DATA_DIR),
      isRender: process.env.RENDER === 'true',
      healthy: storageHealthy,
    },
    settings: {
      brandName: db.settings.brandName,
      maintenanceMode: isMaintenanceActive(),
      clientUpdateVersion: Number(db.settings.clientUpdateVersion || 0),
      defaultMarkup: db.settings.defaultMarkup,
      defaultFruitUnitMarkup: db.settings.defaultFruitUnitMarkup ?? 40,
      categoryMarkups: db.settings.categoryMarkups,
      categoryMarkupModes: db.settings.categoryMarkupModes,
      categoryMarkupPercents: db.settings.categoryMarkupPercents,
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
      source: {
        email: db.settings.hoanNguyen.email,
        ...upstreamStatus,
        lastLoginAt: db.settings.hoanNguyen.lastLoginAt,
      },
    },
    stats: {
      totalLocalOrders,
      totalRevenue,
      totalCost,
      totalProfit,
      totalCtvCount: ctvList.length,
      totalCtvBalance,
      totalTransactions: db.transactions.length,
    },
    ctvs: ctvList,
    transactions: db.transactions.slice(0, 80),
  });
});

// Toggle System Maintenance Mode (ADMIN ONLY — blocks all CTVs with maintenance screen while Admin retains full access)
app.post('/api/admin/maintenance', requireAdmin, asyncRoute(async (req, res) => {
  const nextState = typeof req.body?.enabled === 'boolean' ? req.body.enabled : !isMaintenanceActive();
  db.settings.maintenanceMode = nextState;
  req.auditDetails = { maintenanceMode: nextState };
  req.needsSave = true;
  res.json({
    success: true,
    maintenanceMode: nextState,
    message: nextState
      ? 'Đã BẬT chế độ bảo trì — tất cả CTV đang đăng nhập sẽ thấy "Hệ thống Zn đang bảo trì".'
      : 'Đã TẮT chế độ bảo trì — các tài khoản CTV có thể sử dụng lại bình thường.',
  });
}));

// Notify all logged-in CTVs that a new Zn update is available (click banner to F5 reload)
app.post('/api/admin/notify-update', requireAdmin, asyncRoute(async (req, res) => {
  const prev = Number(db.settings.clientUpdateVersion || 0);
  const nextVer = Math.max(prev + 1, Date.now());
  db.settings.clientUpdateVersion = nextVer;
  req.auditDetails = { clientUpdateVersion: nextVer };
  req.needsSave = true;
  res.json({
    success: true,
    updateVersion: nextVer,
    message: 'Đã gửi thông báo "Có cập nhật từ Zn, vui lòng bấm vào dòng này" tới toàn bộ CTV!',
  });
}));

// Admin Backup Export & Import (Safe snapshot for migration / disaster recovery)
app.get('/api/admin/backup/export', requireAdmin, (req, res) => {
  const safeSettings = structuredClone(db.settings);
  if (safeSettings.hoanNguyen) {
    safeSettings.hoanNguyen.password = '';
    safeSettings.hoanNguyen.token = '';
  }
  const snapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: safeSettings,
    users: db.users,
    localOrders: db.localOrders,
    transactions: db.transactions,
    orderIntents: db.orderIntents,
    auditLog: db.auditLog,
  };
  res.setHeader('Content-Disposition', `attachment; filename="znstudio-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ success: true, backup: snapshot });
});

app.post('/api/admin/backup/import', requireAdmin, express.json({ limit: '2mb' }), asyncRoute(async (req, res) => {
  const raw = req.body?.backup || req.body;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.users) || !raw.users.some(u => u && u.role === 'admin' && u.id && u.username && u.password)) {
    return res.status(400).json({ success: false, message: 'Tệp sao lưu không hợp lệ hoặc thiếu tài khoản quản trị viên.' });
  }
  const arrays = ['localOrders', 'transactions', 'orderIntents', 'auditLog'];
  for (const name of arrays) {
    if (raw[name] !== undefined && !Array.isArray(raw[name])) {
      return res.status(400).json({ success: false, message: `Trường ${name} trong tệp sao lưu không hợp lệ.` });
    }
  }
  for (const u of raw.users) {
    if (!u || typeof u !== 'object' || typeof u.id !== 'string' || typeof u.username !== 'string' || !['admin', 'ctv'].includes(u.role) || !validMoney(Number(u.balance ?? 0))) {
      return res.status(400).json({ success: false, message: 'Danh sách tài khoản trong tệp sao lưu không hợp lệ.' });
    }
  }

  const currentHn = structuredClone(db.settings.hoanNguyen);
  const currentSessions = structuredClone(db.sessions);
  const candidate = {
    settings: {
      ...(raw.settings && typeof raw.settings === 'object' ? raw.settings : {}),
      hoanNguyen: {
        ...(raw.settings?.hoanNguyen || {}),
        email: currentHn.email || raw.settings?.hoanNguyen?.email || '',
        password: currentHn.password || '',
        token: currentHn.token || '',
        user: currentHn.user || null,
        lastLoginAt: currentHn.lastLoginAt || null,
      },
    },
    users: structuredClone(raw.users),
    sessions: currentSessions,
    localOrders: structuredClone(raw.localOrders || []),
    transactions: structuredClone(raw.transactions || []),
    orderIntents: structuredClone(raw.orderIntents || []),
    auditLog: structuredClone(raw.auditLog || []).slice(0, 5000),
  };

  let normalized;
  try {
    normalized = normalizeDb(candidate).data;
  } catch (err) {
    return res.status(400).json({ success: false, message: `Không thể khôi phục tệp sao lưu: ${err.message}` });
  }

  // Keep only sessions whose user still exists and is unlocked in the restored DB.
  for (const [tok, sess] of Object.entries(normalized.sessions)) {
    const owner = normalized.users.find(u => u.id === sess?.userId && !u.isLocked);
    if (!owner) delete normalized.sessions[tok];
  }

  Object.assign(db, normalized);
  settingsVersion += 1;
  catalogResponseCache.clear();
  orderCache = {};
  pruneWeekHistory(vietnamWeekStart());
  req.auditDetails = { restoredUsers: db.users.length, restoredOrders: db.localOrders.length, restoredTransactions: db.transactions.length };
  req.needsSave = true;
  res.json({
    success: true,
    message: `Đã khôi phục thành công ${db.users.filter(u => u.role === 'ctv').length} tài khoản CTV, ${db.localOrders.length} đơn hàng và ${db.transactions.length} giao dịch!`,
  });
}));

app.put('/api/admin/settings', requireAdmin, asyncRoute(async (req, res) => {
  try {
    const {
      defaultMarkup,
      defaultFruitUnitMarkup,
      categoryMarkups,
      categoryMarkupModes,
      categoryMarkupPercents,
      packagePriceOverrides,
      fruitUnitPrices,
      fruitMutationPrices,
      resetCategoryOverrides,
      hoanNguyenEmail,
      hoanNguyenPassword,
      sourceEmail,
      sourcePassword,
    } = req.body || {};
    const upstreamEmail = sourceEmail !== undefined ? sourceEmail : hoanNguyenEmail;
    const upstreamPassword = sourcePassword !== undefined ? sourcePassword : hoanNguyenPassword;

    const catKeyPattern = /^(fruit_coin|fruit_by_fruit|buff_tim|buff_sao|guestbook|farm_gift|mail_gift|weather_buff)$/;
    for (const value of [defaultMarkup, defaultFruitUnitMarkup]) {
      if (value !== undefined && !validMoney(value)) throw new Error('Mức cộng giá phải là số nguyên không âm và hữu hạn.');
    }
    if (categoryMarkupModes !== undefined) {
      if (!categoryMarkupModes || typeof categoryMarkupModes !== 'object' || Array.isArray(categoryMarkupModes)) {
        throw new Error('Chế độ tính giá danh mục không hợp lệ.');
      }
      for (const [key, mode] of Object.entries(categoryMarkupModes)) {
        if (!catKeyPattern.test(key) || !['fixed', 'percent'].includes(mode)) {
          throw new Error('Khóa hoặc chế độ tính giá (VNĐ / %) không hợp lệ.');
        }
      }
    }
    if (categoryMarkupPercents !== undefined) {
      if (!categoryMarkupPercents || typeof categoryMarkupPercents !== 'object' || Array.isArray(categoryMarkupPercents)) {
        throw new Error('Bảng phần trăm danh mục không hợp lệ.');
      }
      for (const [key, pct] of Object.entries(categoryMarkupPercents)) {
        if (!catKeyPattern.test(key) || !validPercent(pct)) {
          throw new Error('Phần trăm cộng giá phải nằm trong khoảng 0 đến 500%.');
        }
      }
    }
    if (resetCategoryOverrides !== undefined) {
      if (!Array.isArray(resetCategoryOverrides) || !resetCategoryOverrides.every(k => typeof k === 'string' && catKeyPattern.test(k))) {
        throw new Error('Danh sách đặt lại giá danh mục không hợp lệ.');
      }
    }
    for (const [label, values, keyPattern] of [
      ['categoryMarkups', categoryMarkups, catKeyPattern],
      ['packagePriceOverrides', packagePriceOverrides, /^(fruit_coin|buff_tim|buff_sao|guestbook|farm_gift|mail_gift|weather_buff):[1-9]\d*$/],
      ['fruitUnitPrices', fruitUnitPrices, /^[1-9]\d*$/],
      ['fruitMutationPrices', fruitMutationPrices, /^[1-9]\d*:(?:[1-9]|1\d)$/],
    ]) {
      if (values !== undefined && (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length > 5000)) throw new Error(`Bảng ${label} không hợp lệ.`);
      for (const [key, value] of Object.entries(values || {})) {
        if (!keyPattern.test(key) || (value !== null && value !== '' && !validMoney(value))) throw new Error(`Khóa hoặc số tiền trong ${label} không hợp lệ.`);
        if (label === 'categoryMarkups' && !validMoney(value)) throw new Error('Mức cộng danh mục không hợp lệ.');
      }
    }
    if (upstreamEmail !== undefined && (typeof upstreamEmail !== 'string' || upstreamEmail.length > 254)) throw new Error('Email nguồn không hợp lệ.');
    if (upstreamPassword !== undefined && (typeof upstreamPassword !== 'string' || upstreamPassword.length > 128)) throw new Error('Mật khẩu nguồn không hợp lệ.');

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
    if (categoryMarkupModes && typeof categoryMarkupModes === 'object') {
      db.settings.categoryMarkupModes = db.settings.categoryMarkupModes || {};
      for (const [k, v] of Object.entries(categoryMarkupModes)) {
        db.settings.categoryMarkupModes[k] = v;
      }
    }
    if (categoryMarkupPercents && typeof categoryMarkupPercents === 'object') {
      db.settings.categoryMarkupPercents = db.settings.categoryMarkupPercents || {};
      for (const [k, v] of Object.entries(categoryMarkupPercents)) {
        db.settings.categoryMarkupPercents[k] = Math.round(Number(v) * 100) / 100;
      }
    }
    if (Array.isArray(resetCategoryOverrides)) {
      for (const catKey of resetCategoryOverrides) {
        if (catKey === 'fruit_by_fruit') {
          db.settings.fruitUnitPrices = {};
          db.settings.fruitMutationPrices = {};
        } else {
          for (const pkgKey of Object.keys(db.settings.packagePriceOverrides || {})) {
            if (pkgKey.startsWith(`${catKey}:`)) delete db.settings.packagePriceOverrides[pkgKey];
          }
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
    if (upstreamEmail && upstreamEmail.trim() !== db.settings.hoanNguyen.email) {
      db.settings.hoanNguyen.email = upstreamEmail.trim();
      needRelogin = true;
    }
    if (upstreamPassword && upstreamPassword.trim() !== '') {
      db.settings.hoanNguyen.password = upstreamPassword;
      needRelogin = true;
    }

    settingsVersion += 1;
    catalogResponseCache.clear();
    if (needRelogin) {
      db.settings.hoanNguyen.token = '';
      orderCache = {};
      catalogCache = { timestamp: 0, raw: null };
      await saveDb(db);
      await loginToHoanNguyen(true);
      await fetchRawCatalogFromHoanNguyen(true);
    } else {
      req.needsSave = true;
    }

    res.json({
      success: true,
      message: 'Đã lưu toàn bộ bảng giá CTV và cấu hình hệ thống thành công!',
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: publicError(req, err, 'Lỗi khi lưu cấu hình.'),
    });
  }
}));

async function handleReconnectSource(req, res) {
  try {
    await loginToHoanNguyen(true);
    await fetchRawCatalogFromHoanNguyen(true);
    res.json({
      success: true,
      message: 'Đã kết nối lại và đồng bộ dữ liệu mới nhất từ hệ thống nguồn!',
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
      message: publicError(req, err, 'Không thể kết nối tới hệ thống nguồn.'),
    });
  }
}
app.post('/api/admin/hoannguyen/reconnect', requireAdmin, handleReconnectSource);
app.post('/api/admin/source/reconnect', requireAdmin, handleReconnectSource);

// Create CTV Account
app.post('/api/admin/ctv', requireAdmin, asyncRoute(async (req, res) => {
  const { name, username, email, password, phone, balance } = req.body || {};
  const cleanUsername = String(username || '').trim().toLowerCase();
  const cleanEmail = String(email || `${cleanUsername}@znstudio.vn`).trim().toLowerCase();

  if (typeof name !== 'string' || !name.trim() || name.length > 100 || !/^[a-z0-9_.-]{3,50}$/.test(cleanUsername) ||
      typeof password !== 'string' || password.length < 12 || password.length > 128 || cleanEmail.length > 254 || String(phone || '').length > 30) {
    return res.status(400).json({
      success: false,
      message: 'Tên đăng nhập cần 3–50 ký tự hợp lệ, tên tối đa 100 ký tự; mật khẩu cần 12–128 ký tự.',
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

  const initBalance = balance === undefined ? 0 : balance;
  if (!validMoney(initBalance)) return res.status(400).json({ success: false, message: 'Số dư khởi tạo phải là số nguyên không âm và hữu hạn.' });
  const newCtv = {
    id: `usr_ctv_${crypto.randomUUID()}`,
    username: cleanUsername,
    email: cleanEmail,
    password: await hashPasswordAsync(String(password)),
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
      id: crypto.randomUUID(),
      userId: newCtv.id,
      userName: newCtv.name,
      type: 'admin_topup',
      amount: initBalance,
      balanceAfter: initBalance,
      note: 'Số dư khởi tạo khi mở tài khoản CTV',
      createdAt: new Date().toISOString(),
    });
  }
  req.needsSave = true;

  res.json({
    success: true,
    message: `Đã tạo tài khoản CTV "${newCtv.name}" (${newCtv.username}) thành công!`,
    ctv: sanitizeUser(newCtv),
  });
}));

// Update CTV Account
app.put('/api/admin/ctv/:id', requireAdmin, asyncRoute(async (req, res) => {
  const ctv = db.users.find((u) => u.id === req.params.id && u.role === 'ctv');
  if (!ctv) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản CTV.' });
  }

  const { name, email, phone, password, isLocked } = req.body || {};
  if ((password !== undefined && (typeof password !== 'string' || password.length < 12 || password.length > 128)) ||
      (isLocked !== undefined && typeof isLocked !== 'boolean') ||
      (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 100)) ||
      (email !== undefined && (typeof email !== 'string' || email.length > 254 || db.users.some(u => u.id !== ctv.id && u.email?.toLowerCase() === email.trim().toLowerCase()))) ||
      (phone !== undefined && (typeof phone !== 'string' || phone.length > 30))) {
    return res.status(400).json({ success: false, message: 'Thông tin cập nhật không hợp lệ, email bị trùng hoặc mật khẩu chưa đủ 12 ký tự.' });
  }
  if (name !== undefined) ctv.name = String(name).trim();
  if (email !== undefined) ctv.email = String(email).trim().toLowerCase();
  if (phone !== undefined) ctv.phone = String(phone).trim();
  if (password !== undefined && String(password).trim() !== '') {
    ctv.password = await hashPasswordAsync(password);
  }
  if (isLocked !== undefined) ctv.isLocked = !!isLocked;
  if (password !== undefined || isLocked === true) {
    for (const [token, session] of Object.entries(db.sessions)) if (session.userId === ctv.id) delete db.sessions[token];
  }
  req.auditDetails = { userId: ctv.id, passwordReset: password !== undefined, isLocked: ctv.isLocked };

  req.needsSave = true;
  res.json({
    success: true,
    message: `Đã cập nhật tài khoản CTV "${ctv.name}".`,
    ctv: sanitizeUser(ctv),
  });
}));

// Top-up / Deduct CTV Balance
app.post('/api/admin/ctv/:id/balance', requireAdmin, asyncRoute(async (req, res) => {
  const ctv = db.users.find((u) => u.id === req.params.id && u.role === 'ctv');
  if (!ctv) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản CTV.' });
  }

  const amount = req.body?.amount;
  const adjustmentKey = req.body?.idempotency_key;
  if (typeof adjustmentKey !== 'string' || !/^[\w-]{16,80}$/.test(adjustmentKey)) return res.status(400).json({ success: false, message: 'Thiếu mã chống điều chỉnh ví trùng.' });
  if (db.transactions.some(t => t.adjustmentKey === adjustmentKey)) return res.status(409).json({ success: false, message: 'Yêu cầu điều chỉnh ví đã được xử lý.' });
  const note = String(req.body?.note || 'Admin điều chỉnh số dư').trim();
  if (!validMoney(ctv.balance) || !Number.isSafeInteger(amount) || amount === 0 || !validMoney(ctv.balance + amount) || note.length > 500) {
    return res.status(400).json({ success: false, message: 'Số tiền phải là số nguyên khác 0, không làm ví âm hoặc vượt giới hạn.' });
  }

  ctv.balance += amount;
  db.transactions.unshift({
    id: crypto.randomUUID(),
    adjustmentKey,
    userId: ctv.id,
    userName: ctv.name,
    type: amount > 0 ? 'admin_topup' : 'admin_deduct',
    amount,
    balanceAfter: ctv.balance,
    note,
    createdAt: new Date().toISOString(),
  });
  req.auditDetails = { userId: ctv.id, amount, balanceAfter: ctv.balance, note };
  req.needsSave = true;

  res.json({
    success: true,
    message: `Đã ${amount > 0 ? 'nạp' : 'trừ'} ${Math.abs(amount).toLocaleString('vi-VN')}đ cho CTV ${
      ctv.name
    }. Số dư mới: ${ctv.balance.toLocaleString('vi-VN')}đ`,
    ctv: sanitizeUser(ctv),
  });
}));

// Delete CTV Account
app.delete('/api/admin/ctv/:id', requireAdmin, asyncRoute(async (req, res) => {
  const idx = db.users.findIndex((u) => u.id === req.params.id && u.role === 'ctv');
  if (idx < 0) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản CTV.' });
  }
  const [removed] = db.users.splice(idx, 1);
  for (const [token, session] of Object.entries(db.sessions)) {
    const uid = typeof session === 'string' ? session : session?.userId;
    if (uid === removed.id) delete db.sessions[token];
  }
  req.auditDetails = {
    userId: removed.id,
    username: removed.username,
    name: removed.name,
    balanceAfter: removed.balance,
  };
  req.needsSave = true;
  res.json({
    success: true,
    message: `Đã xóa tài khoản CTV "${removed.name}" (${removed.username}) khỏi hệ thống.`,
  });
}));

// SPA Fallback
app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'API không tồn tại.' }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(err.status === 503 ? 503 : 400).json({ success: false, message: err.status === 503 ? err.message : 'Yêu cầu không hợp lệ. Vui lòng kiểm tra lại dữ liệu.' });
});
app.get('*', (req, res) => {
  if (serveCachedStatic(req, res, 'index.html')) return;
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const httpServer = app.listen(PORT, HOST, async () => {
  function scheduleWeekCleanup() {
    const timer = setTimeout(() => {
      rollWeekIfNeeded().catch(error => console.error('Weekly history cleanup:', error.message)).finally(scheduleWeekCleanup);
    }, vietnamWeekStart() + WEEK_MS - Date.now() + 1);
    timer.unref?.();
  }
  scheduleWeekCleanup();
  ensureProtectedAssets();
  console.log(`ZnStudio Server running at http://localhost:${PORT} (storage: ${postgres ? 'postgresql' : 'json'})`);
  try {
    await hnApiCall('/api/settings?keys=is_send_task');
    console.log('HoanNguyen API verified via HTTPS.');
    // Pre-warm catalog cache in background so first login/page load is instant.
    fetchRawCatalogFromHoanNguyen(true).then(() => {
      console.log('HoanNguyen catalog pre-warmed.');
    }).catch(() => {});
  } catch (err) {
    console.warn('Initial HoanNguyen login warning:', err.message);
  }
  // Background sync & hygiene: 1 min when Admin active, 10 min when CTV active + prune stale sessions/intents.
  const refreshTimer = setInterval(() => {
    const now = Date.now();
    // Clean expired sessions so memory & DB stay lean over months
    for (const [tok, sess] of Object.entries(db.sessions)) {
      if (!sess || now - Number(sess.createdAt || 0) > SESSION_TTL_MS) delete db.sessions[tok];
    }
    // Prune ancient settled orderIntents (>30 days when >2000 entries); never touch uncertain/processing/requiresReview
    if (db.orderIntents.length > 2000) {
      const cutoff = now - 30 * 24 * 60 * 60 * 1000;
      db.orderIntents = db.orderIntents.filter(
        i => i.status === 'processing' || i.status === 'uncertain' || i.requiresReview || Date.parse(i.createdAt || '') >= cutoff
      );
    }
    if (catalogPromise) return;
    const age = now - catalogCache.timestamp;
    const adminActive = now - lastAdminActivityAt <= 3 * 60 * 1000;
    const ctvActive = now - lastCtvActivityAt <= 15 * 60 * 1000;
    if (adminActive && age >= ADMIN_CATALOG_FRESH_MS) {
      fetchRawCatalogFromHoanNguyen(true).catch(() => {});
    } else if (ctvActive && age >= CTV_CATALOG_FRESH_MS) {
      fetchRawCatalogFromHoanNguyen(true, CTV_CATALOG_FRESH_MS, { includeAdminWeeklyLimit: false }).catch(() => {});
    }
  }, 30000);
  if (typeof refreshTimer.unref === 'function') refreshTimer.unref();
});
// Defend against Slowloris / slow-body / hanging proxy connections
if (httpServer && typeof httpServer === 'object') {
  httpServer.headersTimeout = 10000;
  httpServer.requestTimeout = 30000;
  httpServer.keepAliveTimeout = 65000;
}
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason?.message || reason);
});
