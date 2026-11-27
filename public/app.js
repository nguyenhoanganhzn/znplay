// ============================================================================
// ZNSTUDIO — SELLER & CTV SYSTEM (AUROS ABYSSAL TERMINAL)
// ============================================================================

import { createToolViews } from './tools.js';
import { backupPricingCategories, mountBackup } from './backup.js';

const DEFAULT_APP_VERSIONS = [
  {
    version: 'v2.4.auros',
    date: '25/11/2026',
    highlights: [
      'Nâng cấp giao diện Auros Abyssal Terminal và bộ biểu tượng SVG hiện đại.',
      'Bổ sung hiển thị phiên bản hệ thống và nhật ký 3 bản cập nhật gần nhất.',
      'Chuẩn hóa đồng bộ trạng thái đơn hàng trực tiếp trên Server Zn.',
    ],
  },
  {
    version: 'v2.3.stable',
    date: '20/11/2026',
    highlights: [
      'Thêm nút xem nhanh hồ sơ khách hàng và hạn mức nhận trái cây trong ngày.',
      'Tối ưu hiển thị hộp thoại và bảng dữ liệu mượt mà trên điện thoại.',
    ],
  },
  {
    version: 'v2.2.core',
    date: '15/11/2026',
    highlights: [
      'Cập nhật tiến độ chạy đơn tự động theo danh mục đang mở.',
      'Tăng tốc tải danh mục và bảo vệ chống gửi trùng đơn hàng.',
    ],
  },
];

const ZN_ICON_PATHS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C9.8 3 12 8 12 8s2.2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8"/><path d="M8 13h5"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
  fruit: '<path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"/><path d="M10 2c1 .5 2 2 2 5"/>',
  wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  tag: '<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  server: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
  orders: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h6"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  external: '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  sparkles: '<path d="m12 3-1.91 5.81a2 2 0 0 1-1.28 1.28L3 12l5.81 1.91a2 2 0 0 1 1.28 1.28L12 21l1.91-5.81a2 2 0 0 1 1.28-1.28L21 12l-5.81-1.91a2 2 0 0 1-1.28-1.28Z"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="2" y1="14" x2="6" y2="14"/><line x1="10" y1="8" x2="14" y2="8"/><line x1="18" y1="16" x2="22" y2="16"/>',
  git: '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  barChart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
};

function znIcon(name, size = 15) {
  const path = ZN_ICON_PATHS[name] || ZN_ICON_PATHS.activity;
  return `<svg class="zn-icon" width="${size}" height="${size}" style="width:${size}px;height:${size}px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

const state = {
  token: sessionStorage.getItem('znplay_token') || '',
  user: null,
  appVersions: DEFAULT_APP_VERSIONS.slice(),
  catalogData: null,
  catalogWarning: '',
  ordersWarning: '',
  loadingCatalog: false,
  loadingOrders: false,
  lastOrdersSig: '',
  lastCatalogSig: '',
  lastOrdersSyncAt: 0,
  remoteSummaries: {},

  // Active Sidebar View
  currentView: 'fruit_coin', // default to 'fruit_coin' (Trái cây) or 'dashboard'

  // Filters on Order Pages
  orderSearch: '',
  orderActiveFilter: 'all', // 'all' | '1' | '0'
  orderProgressFilter: 'all', // 'all' | 'running' | 'completed'

  // Orders & Admin Data
  orders: [],
  customerSnapshotCache: {},
  listLimits: {},
  adminOverview: null,
  adminMonitor: null,
  adminPricingTab: 'categories', // 'categories' | 'packages' | 'fruits'
  adminPkgCatFilter: 'all',
  adminFruitFilter: 'all', // 'all' | 'custom'
  adminFruitSearch: '',

  // Modal Create Order State
  modalOrder: {
    category: 'fruit_coin',
    fruitOrderType: 'by_coin', // 'by_coin' | 'by_fruit'
    customer: null, // { customerId, gameProfileId, nickname, suid, region, photoUrl }
    customerTab: 'ingame', // 'ingame' | 'roleid' | 'saved'

    coin_price_package_id: null,
    min_coin_filter: 400000,

    fruit_item_id: 1,
    fruit_total_cnt: 10,
    fruit_variant_mode: 'regular', // 'regular' | 'specify'
    fruit_mutation_list: [],
    fruit_preview_price: 0,
    fruit_preview_admin: null,

    price_package_id: null,
    guest_book_message: '',
    gift_id: null,
    gift_plant_id: null,
    mail_message: 'Cảm ơn quý khách',
  },
};
localStorage.removeItem('znplay_token');

const { renderIdentityToolsHtml, bindIdentityToolsEvents, loadAdminMonitor, renderAdminMonitorHtml, bindAdminMonitorEvents } =
  createToolViews({ state, apiFetch, pageLimit, moreButton, renderLocalPages, escapeHtml, showToast, copyTextToClipboard, formatVnd, formatNum, formatDateVi, renderCurrentView, loadOrders, znIcon });

function syncAppVersionsState(list) {
  if (Array.isArray(list) && list.length > 0) {
    state.appVersions = list.slice(0, 3);
  }
  const curVer = state.appVersions?.[0]?.version || 'v2.4.auros';
  const label = `Version ${curVer}`;
  if (typeof document !== 'undefined') {
    const sideEl = document.getElementById('sidebarVersionText');
    if (sideEl) sideEl.textContent = label;
    const gateEl = document.getElementById('gateVersionText');
    if (gateEl) gateEl.textContent = label;
  }
}

async function openVersionChangelogModal() {
  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  box.className = 'modal-box';
  title.textContent = 'Nhật ký cập nhật phiên bản ZnStudio';

  const paintChangelog = () => {
    const list = (state.appVersions || DEFAULT_APP_VERSIONS).slice(0, 3);
    const isAdmin = state.user?.role === 'admin';
    body.innerHTML = `
      <div style="font-size:12.5px;color:var(--color-silver-mist);">
        Tổng hợp <strong>${list.length} phiên bản gần nhất</strong> của hệ thống ZnStudio:
      </div>
      <div class="version-changelog-list">
        ${list.map((item, idx) => `
          <div class="version-release-card ${idx === 0 ? 'is-latest' : ''}">
            <div class="version-release-head">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span class="version-release-code">Version ${escapeHtml(item.version)}</span>
                ${idx === 0 ? '<span class="badge-tag green">Phiên bản hiện tại</span>' : `<span class="badge-tag">Bản trước #${idx + 1}</span>`}
              </div>
              ${item.date ? `<span style="font-size:11.5px;color:var(--color-silver-mist);">${escapeHtml(item.date)}</span>` : ''}
            </div>
            <ul class="version-release-list">
              ${(item.highlights || []).map(h => `<li>${escapeHtml(h)}</li>`).join('')}
            </ul>
          </div>
        `).join('')}
      </div>
      <div class="action-row align-end" style="padding-top:4px;">
        ${isAdmin ? `<button type="button" class="btn-frost" id="btnJumpEditVersions">${znIcon('edit', 13)} <span>Chỉnh sửa phiên bản</span></button>` : ''}
        <button type="button" class="btn-violet" id="btnCloseVersionModal">Đóng</button>
      </div>
    `;
    body.querySelector('#btnCloseVersionModal')?.addEventListener('click', () => {
      overlay.style.display = 'none';
    });
    body.querySelector('#btnJumpEditVersions')?.addEventListener('click', () => {
      overlay.style.display = 'none';
      if (state.currentView !== 'admin_ctv') {
        switchView('admin_ctv');
      }
      setTimeout(() => {
        document.getElementById('adminVersionManagerPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    });
  };

  paintChangelog();
  overlay.style.display = 'flex';

  try {
    const p = await fetch('/api/ping', { headers: { Accept: 'application/json' } }).then(r => r.json()).catch(() => null);
    if (p?.appVersions && overlay.style.display !== 'none') {
      syncAppVersionsState(p.appVersions);
      paintChangelog();
    }
  } catch { }
}

function pageLimit(key) {
  return state.listLimits[key] || 20;
}

function moreButton(key, count, columns = 0, shown = pageLimit(key)) {
  if (!(count > shown)) return '';
  const button = `<button type="button" class="btn-frost list-more" data-list-more="${escapeHtml(key)}" data-shown="${shown}">Xem thêm ${Math.min(count - shown, 20)} <span>(${shown}/${count})</span></button>`;
  return columns ? `<tr><td colspan="${columns}">${button}</td></tr>` : button;
}

// Lists inside dialogs use their own paging state so expanding a list preserves the form.
function renderLocalPages(host, items, paint) {
  let shown = 20;
  function draw() {
    paint(items.slice(0, shown));
    if (shown >= items.length) return;
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'btn-frost list-more';
    more.textContent = `Xem thêm ${Math.min(20, items.length - shown)} (${shown}/${items.length})`;
    more.addEventListener('click', () => { shown += 20; draw(); });
    host.append(more);
  }
  draw();
}

function createRequestKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

const VIEW_TITLES = {
  dashboard: 'Bảng điều khiển tổng quan',
  farm_gift: 'Đơn quà nông trại',
  mail_gift: 'Đơn quà thư',
  guestbook: 'Đơn bài viết lưu bút',
  buff_tim: 'Đơn Buff Tim',
  buff_sao: 'Đơn Buff Sao',
  weather_buff: 'Đơn Buff Thời Tiết',
  fruit_coin: 'Đơn Trái cây & Xu nông trại',
  weekly_settlements: 'Đối soát tuần & Lịch sử số dư',
  order_history: 'Lịch sử đơn hàng',
  identity_tools: 'Trích xuất ID Game / Tên nhân vật',
  backup: 'Nguồn dự phòng',
  admin_monitor: 'Quản trị: Giám sát hoạt động & đối soát CTV',
  admin_pricing: 'Quản trị: Tùy chỉnh Giá từng Sản phẩm & Danh mục',
  admin_ctv: 'Quản trị: Quản lý Tài khoản CTV đặt đơn',
  admin_system: 'Quản trị: Cấu hình kết nối Server Zn',
};

const ORDER_VIEWS = [
  'farm_gift',
  'mail_gift',
  'guestbook',
  'buff_tim',
  'buff_sao',
  'weather_buff',
  'fruit_coin',
];

// ============================================================================
// UTILITIES
// ============================================================================
function formatVnd(amount) {
  const n = Number(amount || 0);
  if (!Number.isFinite(n)) return '0đ';
  return `${Math.round(n).toLocaleString('vi-VN')}đ`;
}

function formatCompactVnd(amount) {
  const n = Number(amount || 0);
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return `${n}đ`;
}

function formatNum(num) {
  const n = Number(num || 0);
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('vi-VN');
}

function formatDateVi(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateTimeSecVi(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || '00';
  return `${get('hour')}:${get('minute')}:${get('second')} ${get('day')}/${get('month')}/${get('year')}`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast-item';
  el.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button type="button" class="btn-frost" style="padding:3px 8px;font-size:11px;">Đóng</button>
  `;
  el.querySelector('button').addEventListener('click', () => el.remove());
  container.appendChild(el);
  setTimeout(() => {
    if (el.parentNode) el.remove();
  }, duration);
}

async function apiFetch(url, method = 'GET', body = null, timeoutMs = 0) {
  const requestToken = state.token;
  const headers = { 'Accept': 'application/json' };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  const opts = { method, headers };
  if (body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let controller = null;
  let timer = null;
  if (timeoutMs > 0 && typeof AbortController !== 'undefined') {
    controller = new AbortController();
    opts.signal = controller.signal;
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw Object.assign(new Error('Đồng bộ bảng giá quá thời gian (quá 6.5 giây). Vui lòng bấm Thử lại.'), { code: 'TIMEOUT', status: 504 });
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
  const data = await res.json().catch(() => null);
  if (requestToken && state.token !== requestToken) {
    throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng thử lại.');
  }
  if (res.status === 401 && requestToken && state.token === requestToken) {
    clearAuthState();
    updateShellAuthUI();
  }
  if (res.status === 503 && (data?.code === 'MAINTENANCE' || data?.maintenance) && state.token && state.user?.role !== 'admin') {
    setCtvMaintenanceOverlay(true, data?.message || 'Hệ thống Zn đang bảo trì');
  }
  if (!data || typeof data !== 'object') throw new Error('Máy chủ chưa trả về dữ liệu. Vui lòng thử lại.');
  if (!res.ok && !data.needs_confirmation) {
    throw Object.assign(new Error(data.message || `Lỗi kết nối (${res.status})`), { code: data.code, status: res.status });
  }
  return data;
}

function setCtvMaintenanceOverlay(active, message = 'Hệ thống Zn đang bảo trì') {
  if (state.user?.role === 'admin') active = false;
  state.maintenanceLocked = Boolean(active);
  if (typeof document === 'undefined' || !document.body) return;
  let el = document.getElementById('znMaintenanceOverlay');
  if (!active) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = 'znMaintenanceOverlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(1,22,21,0.94);backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:center;padding:24px;';
    el.innerHTML = `
      <div style="max-width:440px;width:100%;background:var(--color-liquid-kelp);border:1px solid rgba(203,255,252,0.22);border-radius:16px;padding:30px 26px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px;">
        <img src="/logo.jpg" alt="ZnStudio" class="brand-logo-img brand-logo-lg" />
        <span class="badge-tag amber" style="font-size:12px;">${znIcon('shield', 13)} <span>ĐANG BẢO TRÌ</span></span>
        <h2 id="znMaintenanceTitle" style="margin:0;color:#fff;font-size:22px;font-weight:500;letter-spacing:-0.02em;">${escapeHtml(message)}</h2>
        <p style="margin:0;color:var(--color-moon-mist);font-size:13.5px;line-height:1.6;">
          Hệ thống đang được quản trị viên bảo trì để cập nhật. Trang sẽ tự động mở lại ngay khi hoàn tất.
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:6px;">
          <button type="button" class="btn-violet" id="btnRetryMaintenanceCheck">${znIcon('refresh', 14)} <span>Kiểm tra lại</span></button>
          <button type="button" class="btn-frost" id="btnLogoutFromMaintenance">Đăng xuất</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    el.querySelector('#btnRetryMaintenanceCheck')?.addEventListener('click', async (ev) => {
      const b = ev.currentTarget;
      b.disabled = true;
      b.textContent = 'Đang kiểm tra...';
      try {
        const p = await fetch('/api/ping', { headers: { Accept: 'application/json' } }).then(r => r.json()).catch(() => null);
        if (p?.appVersions) syncAppVersionsState(p.appVersions);
        if (p && !p.maintenance) {
          setCtvMaintenanceOverlay(false);
          if (handleCtvUpdateVersion(p.updateVersion, { isCtvConfirmed: true })) return;
          await initAuth();
          if (state.user) await loadInitialAppData();
          return;
        }
        showToast('Hệ thống Zn vẫn đang bảo trì. Vui lòng chờ thêm ít phút.');
      } finally {
        if (document.getElementById('znMaintenanceOverlay')) {
          b.disabled = false;
          b.innerHTML = `${znIcon('refresh', 14)} <span>Kiểm tra lại</span>`;
        }
      }
    });
    el.querySelector('#btnLogoutFromMaintenance')?.addEventListener('click', () => {
      logout();
    });
  } else {
    const titleEl = el.querySelector('#znMaintenanceTitle');
    if (titleEl) titleEl.textContent = message;
  }
}

const CTV_UPDATE_VER_KEY = 'znplay_ctv_update_ver';
const CTV_UPDATED_NOTICE_KEY = 'znplay_ctv_updated_notice';
let pendingCtvReload = false;

function readStoredCtvUpdateVer() {
  try {
    const raw = localStorage.getItem(CTV_UPDATE_VER_KEY);
    if (raw === null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

function writeStoredCtvUpdateVer(ver) {
  try {
    localStorage.setItem(CTV_UPDATE_VER_KEY, String(Number(ver || 0)));
  } catch { }
}

function clearStoredCtvUpdateState() {
  try {
    localStorage.removeItem(CTV_UPDATE_VER_KEY);
    localStorage.removeItem(CTV_UPDATED_NOTICE_KEY);
  } catch { }
}

function showCtvUpdatedNotice(message = 'Zn đã tự động cập nhật phiên bản mới') {
  if (state.user?.role === 'admin') return;
  if (typeof document === 'undefined' || !document.body) return;
  const existing = document.getElementById('znCtvUpdatedNotice');
  if (existing) existing.remove();
  const bar = document.createElement('div');
  bar.id = 'znCtvUpdatedNotice';
  bar.setAttribute('role', 'status');
  bar.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99998;background:var(--color-liquid-kelp);color:var(--color-liquid-mist);border:1px solid rgba(203,255,252,0.45);border-radius:6px;padding:10px 18px;font-size:13.5px;font-weight:500;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 24px);text-align:center;';
  const text = document.createElement('span');
  text.textContent = message;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.innerHTML = znIcon('close', 12);
  closeBtn.setAttribute('aria-label', 'Đóng thông báo');
  closeBtn.style.cssText = 'background:rgba(255,255,255,0.18);color:#fff;border:none;border-radius:999px;width:22px;height:22px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;';
  closeBtn.addEventListener('click', () => bar.remove());
  bar.appendChild(text);
  bar.appendChild(closeBtn);
  document.body.appendChild(bar);
  setTimeout(() => {
    if (bar.parentNode) bar.remove();
  }, 7000);
}

function showCtvUpdatedNoticeIfPending() {
  if (state.user?.role === 'admin') {
    clearStoredCtvUpdateState();
    return;
  }
  let shouldShow = false;
  try {
    if (localStorage.getItem(CTV_UPDATED_NOTICE_KEY) === '1') {
      localStorage.removeItem(CTV_UPDATED_NOTICE_KEY);
      shouldShow = true;
    }
  } catch { }
  if (shouldShow) {
    showCtvUpdatedNotice('Zn đã tự động cập nhật phiên bản mới');
  }
}

function triggerCtvAutoReload(nextVer) {
  if (pendingCtvReload) return true;
  pendingCtvReload = true;
  state.seenUpdateVersion = nextVer;
  writeStoredCtvUpdateVer(nextVer);
  try {
    localStorage.setItem(CTV_UPDATED_NOTICE_KEY, '1');
    sessionStorage.removeItem('znplay_catalog_cache');
  } catch { }
  if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
    window.location.reload();
  }
  return true;
}

function handleCtvUpdateVersion(remoteVer, { isCtvConfirmed = false } = {}) {
  const ver = Number(remoteVer || 0);
  if (!Number.isFinite(ver) || ver < 0) return false;
  if (state.user?.role === 'admin') {
    clearStoredCtvUpdateState();
    return false;
  }
  const storedVer = readStoredCtvUpdateVer();
  const knownVer = state.seenUpdateVersion != null
    ? (storedVer != null ? Math.min(state.seenUpdateVersion, storedVer) : state.seenUpdateVersion)
    : storedVer;

  if (knownVer != null && ver > knownVer) {
    if (state.maintenanceLocked) return false;
    return triggerCtvAutoReload(ver);
  }

  if (isCtvConfirmed) {
    state.seenUpdateVersion = ver;
    if (storedVer == null || ver > storedVer) {
      writeStoredCtvUpdateVer(ver);
    }
  } else if (storedVer != null) {
    state.seenUpdateVersion = ver;
  }
  return false;
}

function setCtvUpdateBanner(visible) {
  if (typeof document === 'undefined' || !document.body) return;
  const old = document.getElementById('znCtvUpdateBanner');
  if (old) old.remove();
  if (!visible) {
    const notice = document.getElementById('znCtvUpdatedNotice');
    if (notice) notice.remove();
  }
}

// ============================================================================
// AUTHENTICATION & SESSION GATE
// ============================================================================
function clearAuthState() {
  state.token = '';
  state.user = null;
  state.catalogData = null;
  state.catalogWarning = '';
  state.ordersWarning = '';
  state.loadingCatalog = false;
  state.loadingOrders = false;
  state.lastOrdersSig = '';
  state.lastCatalogSig = '';
  state.lastOrdersSyncAt = 0;
  state.lastScopeSyncAt = {};
  state.remoteSummaries = {};
  state.orders = [];
  state.customerSnapshotCache = {};
  state.orderPage = null;
  state.listLimits = {};
  state.adminOverview = null;
  state.adminMonitor = null;
  state.adminMonitorCtvId = null;
  state.adminMonitorCtvDetail = null;
  state.adminMonitorCtvTab = 'orders';
  state.adminMonitorCtvOrderSearch = '';
  state.adminMonitorCtvCatFilter = 'all';
  setCtvMaintenanceOverlay(false);
  setCtvUpdateBanner(false);
  state.seenUpdateVersion = null;
  state.currentView = 'fruit_coin';
  state.modalOrder.customer = null;
  state.modalOrder.fruit_preview_admin = null;
  localStorage.removeItem('znplay_token');
  sessionStorage.removeItem('znplay_token');
  sessionStorage.removeItem('znplay_catalog_cache');
  const container = document.getElementById('mainViewContainer');
  if (container) container.innerHTML = '';
  const modal = document.getElementById('appModalOverlay');
  if (modal) modal.style.display = 'none';
  const modalBody = document.getElementById('appModalBody');
  if (modalBody) modalBody.innerHTML = '';
  const adminSection = document.getElementById('sidebarAdminSection');
  if (adminSection) adminSection.style.display = 'none';
}

function hydrateCachedCatalog() {
  // Always load fresh prices from server RAM (<5ms) so CTV never sees outdated prices after Admin edits.
  return false;
}

function saveCachedCatalog(data) {
  if (!state.user || !data) return;
  try {
    sessionStorage.setItem('znplay_catalog_cache', JSON.stringify({
      userId: state.user.id,
      role: state.user.role,
      cachedAt: Date.now(),
      data,
    }));
  } catch { }
}

function isUserTypingOrModalOpen() {
  const modal = document.getElementById('appModalOverlay');
  if (modal && modal.style.display !== 'none') return true;
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return true;
  return false;
}

async function loadInitialAppData() {
  if (!state.user) return;
  hydrateCachedCatalog();
  renderCurrentView();
  const catTask = loadCatalog(false).then(() => {
    if (state.user && !isUserTypingOrModalOpen()) renderCurrentView();
  });
  const ordTask = loadOrders(false).then(() => {
    if (state.user && !isUserTypingOrModalOpen()) renderCurrentView();
  });
  await Promise.all([catTask, ordTask]);
}

async function initAuth() {
  const requestToken = state.token;
  if (state.token) {
    try {
      const r = await apiFetch('/api/auth/me');
      if (r.appVersions) syncAppVersionsState(r.appVersions);
      if (r.success && r.user) {
        state.user = r.user;
        if (r.user.role === 'admin') {
          clearStoredCtvUpdateState();
        } else if (r.updateVersion !== undefined) {
          if (handleCtvUpdateVersion(r.updateVersion, { isCtvConfirmed: true })) return;
        }
        updateShellAuthUI();
        return;
      }
    } catch (err) {
      if (state.token !== requestToken) return;
      if (err.code === 'MAINTENANCE') {
        setCtvMaintenanceOverlay(true, err.message || 'Hệ thống Zn đang bảo trì');
        return;
      }
      if (err.status !== 401) {
        const message = document.getElementById('gateLoginError');
        message.textContent = 'Chưa kiểm tra được phiên đăng nhập. Tải lại trang khi kết nối ổn định.';
        message.style.display = 'block';
        updateShellAuthUI();
        return;
      }
    }
  }
  clearAuthState();
  updateShellAuthUI();
}

async function loginWithCredentials(identifier, password) {
  const r = await apiFetch('/api/auth/login', 'POST', { identifier, password });
  if (r.appVersions) syncAppVersionsState(r.appVersions);
  if (r.success && r.token) {
    clearAuthState();
    state.token = r.token;
    state.user = r.user;
    if (r.user?.role === 'admin') {
      clearStoredCtvUpdateState();
    } else if (r.updateVersion !== undefined) {
      sessionStorage.setItem('znplay_token', r.token);
      if (handleCtvUpdateVersion(r.updateVersion, { isCtvConfirmed: true })) return;
    }
    sessionStorage.setItem('znplay_token', r.token);
    const passwordInput = document.getElementById('gateLoginPw');
    if (passwordInput) passwordInput.value = '';
    showToast(`Chào mừng ${r.user.name}!`);
    updateShellAuthUI();
    await loadInitialAppData();
  }
}

async function logout() {
  const logoutRequest = apiFetch('/api/auth/logout', 'POST');
  clearAuthState();
  updateShellAuthUI();
  try {
    await logoutRequest;
  } catch { }
}

function updateShellAuthUI() {
  const gate = document.getElementById('authGateScreen');
  const shell = document.getElementById('appShell');

  if (!state.user) {
    if (gate) gate.style.display = 'flex';
    if (shell) shell.style.display = 'none';
    return;
  }

  if (gate) gate.style.display = 'none';
  if (shell) shell.style.display = 'flex';

  const isAdmin = state.user.role === 'admin';
  const roleBadge = document.getElementById('sidebarRoleBadge');
  const adminSec = document.getElementById('sidebarAdminSection');
  const userBadge = document.getElementById('topUserNameBadge');
  const walletPill = document.getElementById('topWalletPill');
  const walletText = document.getElementById('topWalletText');

  syncAppVersionsState(state.appVersions);

  if (roleBadge) {
    roleBadge.textContent = isAdmin ? 'QUẢN TRỊ' : 'CTV';
    roleBadge.className = `badge-tag ${isAdmin ? 'violet' : 'green'}`;
  }
  // CTV NEVER sees the Admin menu section!
  if (adminSec) {
    adminSec.style.display = isAdmin ? 'flex' : 'none';
  }
  if (userBadge) {
    userBadge.textContent = state.user.name;
  }

  if (walletPill && walletText) {
    if (isAdmin) {
      const wl = state.catalogData?.weeklyLimit;
      if (wl) {
        walletPill.className = 'wallet-pill-box';
        walletText.innerHTML = `Đã dùng: <strong style="color:var(--color-lavender-phosphor);">${formatCompactVnd(wl.spent)}</strong> · Hạn mức: <strong style="color:var(--color-aurora-gradient);">${formatCompactVnd(wl.limit)}</strong>`;
      } else {
        walletPill.className = 'wallet-pill-box';
        walletText.innerHTML = `Quyền: <strong style="color:var(--color-aurora-gradient);">Quản trị viên</strong>`;
      }
    } else {
      const bal = Number(state.user.balance || 0);
      const backupBal = Number(state.user.backupBalance || 0);
      walletPill.className = `wallet-pill-box ${bal <= 0 && backupBal <= 0 ? 'is-empty' : ''}`;
      walletText.innerHTML = `<span class="wallet-pill-seg">Ví CTV: <strong style="color:${bal > 0 ? 'var(--color-lavender-phosphor)' : '#fda4af'};">${formatVnd(bal)}</strong></span><span class="wallet-pill-sep">·</span><span class="wallet-pill-seg">Ví Nguồn DP: <strong style="color:${backupBal > 0 ? 'var(--color-aurora-gradient)' : '#fda4af'};">${formatVnd(backupBal)}</strong></span>`;
    }
  }
}

// ============================================================================
// LOAD CATALOG, SYSTEM STATUS DOTS & FLASH SALE MARQUEE
// ============================================================================
function applyCatalogSideEffects(r) {
  const st = r?.systemStatus || {};
  const updateDot = (id, working) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('is-loading');
    el.classList.toggle('is-off', !working);
    el.title = working ? 'Đang hoạt động' : 'Không hoạt động';
  };
  updateDot('dot_farm_gift', st.farm_gift);
  updateDot('dot_mail_gift', st.mail_gift);
  updateDot('dot_guestbook', st.guestbook);
  updateDot('dot_buff_tim', st.buff_tim);
  updateDot('dot_buff_sao', st.buff_sao);
  updateDot('dot_weather_buff', st.weather_buff);
  updateDot('dot_fruit_coin', st.fruit_coin);

  updateShellAuthUI();
}

function expandCompactFruitMutations(data, fallbackMutations = null) {
  const fruits = data?.catalog?.fruit_by_fruit;
  const mutMeta = data?.mutations || fallbackMutations || {};
  if (!Array.isArray(fruits)) return;
  for (const f of fruits) {
    if (Array.isArray(f.mp) && !Array.isArray(f.mutation_prices)) {
      f.mutation_prices = f.mp.map(([mk, price]) => {
        const meta = mutMeta[mk] || mutMeta[String(mk)] || {};
        return {
          mutation_key: Number(mk),
          mutation_name: meta.name || `Đột biến #${mk}`,
          mutation_abbr: meta.abbr || '',
          mutation_color: meta.color || '#a78bfa',
          unit_price: Number(price || 0),
        };
      });
      delete f.mp;
    }
  }
}

async function loadCatalog(forceRefresh = false, scope = '', timeoutMs = 0) {
  if (!state.user) return false;
  const requestToken = state.token;
  state.loadingCatalog = true;
  try {
    const qs = new URLSearchParams();
    if (forceRefresh) qs.set('refresh', '1');
    if (scope) qs.set('scope', scope);
    if (state.user.role !== 'admin') qs.set('compact', '1');
    const url = `/api/catalog${qs.toString() ? `?${qs.toString()}` : ''}`;
    const r = await apiFetch(url, 'GET', null, timeoutMs);
    if (!r.success || state.token !== requestToken) return false;

    const prev = state.catalogData;
    const merged = r.partialScope && prev
      ? {
        ...prev,
        syncedAt: r.syncedAt || prev.syncedAt,
        pricingVersion: r.pricingVersion ?? prev.pricingVersion,
        systemStatus: r.systemStatus || prev.systemStatus,
        serverSettings: r.serverSettings || prev.serverSettings,
        coinStock: r.coinStock !== undefined ? r.coinStock : prev.coinStock,
        coinTiers: r.coinTiers !== undefined ? r.coinTiers : prev.coinTiers,
        mutations: r.mutations || prev.mutations,
        catalog: {
          ...(prev.catalog || {}),
          ...(r.catalog || {}),
        },
      }
      : r;

    expandCompactFruitMutations(merged, prev?.mutations);

    const sig = JSON.stringify({
      pv: merged.pricingVersion,
      s: merged.systemStatus,
      wl: merged.weeklyLimit,
      fc: (merged.catalog?.fruit_coin || []).map(p => [p.id, p.total_price, p.is_on_sale, p.sale?.slots_remaining]),
      fb: (merged.catalog?.fruit_by_fruit || []).map(f => [f.id, f.unit_price, f.stock_quantity]),
      bt: (merged.catalog?.buff_tim || []).map(p => [p.id, p.total_price, p.is_on_sale, p.sale?.slots_remaining]),
      bs: (merged.catalog?.buff_sao || []).map(p => [p.id, p.total_price]),
      gb: (merged.catalog?.guestbook || []).map(p => [p.id, p.total_price]),
      wb: (merged.catalog?.weather_buff || []).map(p => [p.id, p.total_price, p.is_on_sale, p.sale?.slots_remaining]),
      fg: (merged.catalog?.farm_gift || []).map(g => [g.id, (g.packages || []).map(p => [p.id, p.total_price])]),
      mg: (merged.catalog?.mail_gift || []).map(g => [g.id, (g.packages || []).map(p => [p.id, p.total_price])]),
      cs: merged.coinStock?.quantity,
    });
    const changed = sig !== state.lastCatalogSig || !state.catalogData;
    state.lastCatalogSig = sig;
    state.catalogData = merged;
    state.catalogWarning = '';
    if (!state.lastScopeSyncAt) state.lastScopeSyncAt = {};
    if (scope) state.lastScopeSyncAt[scope] = Date.now();
    else state.lastScopeSyncAt.all = Date.now();
    saveCachedCatalog(merged);
    applyCatalogSideEffects(merged);
    return changed;
  } catch (err) {
    if (state.token === requestToken) {
      state.catalogWarning = err?.code === 'TIMEOUT'
        ? err.message
        : 'Chưa đồng bộ được bảng giá từ Server Zn. Bấm Làm mới dữ liệu để thử lại.';
    }
    return false;
  } finally {
    if (state.token === requestToken) state.loadingCatalog = false;
  }
}

// ============================================================================
// LOAD ORDERS & ADMIN OVERVIEW
// ============================================================================
let orderRequest = 0;
function hasRunningOrdersInView() {
  if (!state.user) return false;
  if (!ORDER_VIEWS.includes(state.currentView) && state.currentView !== 'order_history' && state.currentView !== 'dashboard') {
    return false;
  }
  return (state.orders || []).some(
    (o) => o && o.isActive && !String(o.category || '').startsWith('backup_') && !['completed', 'cancelled', 'canceled', 'failed'].includes(String(o.status || '').toLowerCase()) && !o.requiresReview
  );
}

function renderCurrentViewPreservingScroll() {
  const container = document.getElementById('mainViewContainer');
  const prevScrollX = container?.querySelector?.('.table-wrap')?.scrollLeft || 0;
  renderCurrentView();
  if (prevScrollX > 0) {
    const nextWrap = document.getElementById('mainViewContainer')?.querySelector?.('.table-wrap');
    if (nextWrap) nextWrap.scrollLeft = prevScrollX;
  }
}

async function loadOrders(forceRefresh = false, { live = false } = {}) {
  if (!state.user) return false;
  const requestToken = state.token;
  const version = ++orderRequest;
  const view = state.currentView;
  const category = ORDER_VIEWS.includes(view) ? (view === 'fruit_coin' ? 'fruit_all' : view) : 'all';
  const current = () => version === orderRequest && state.token === requestToken && view === state.currentView;
  state.loadingOrders = true;
  try {
    const filter = ORDER_VIEWS.includes(view);
    const query = `category=${category}&limit=${pageLimit('orderList')}&q=${encodeURIComponent(state.orderSearch)}&active=${filter ? state.orderActiveFilter : 'all'}&progress=${filter ? state.orderProgressFilter : 'all'}${live ? '&live=1' : ''}`;
    const r = await apiFetch(`/api/orders?${query}${forceRefresh ? '&refresh=1' : ''}`);
    if (r.success && current()) {
      state.lastOrdersSyncAt = Date.now();
      state.orderClockOffset = (r.serverTime ?? Date.now()) - Date.now();
      const nextOrders = r.orders || [];
      const sig = JSON.stringify([nextOrders, r.page, r.partial, r.remoteSummaries]);
      const changed = sig !== state.lastOrdersSig || !state.orderPage || Boolean(state.ordersWarning);
      state.orderPage = r.page || null;
      state.lastOrdersSig = sig;
      state.orders = nextOrders;
      state.remoteSummaries = r.remoteSummaries || {};
      state.ordersWarning = r.partial ? 'Một phần danh sách đơn chưa đồng bộ được với Server Zn.' : '';
      const activeCount = state.orderPage?.activeCount ?? state.orders.filter((o) => o.status !== 'completed' && o.isActive).length;
      const badge = document.getElementById('sidebarActiveOrdersCount');
      if (badge) badge.textContent = String(activeCount);
      return changed;
    }
  } catch (err) {
    if (current()) { state.ordersWarning = 'Chưa cập nhật được danh sách đơn.'; return true; }
  } finally {
    if (version === orderRequest) state.loadingOrders = false;
  }
  return false;
}

async function loadAdminOverview() {
  if (!state.user || state.user.role !== 'admin') return;
  const requestToken = state.token;
  try {
    const r = await apiFetch('/api/admin/overview');
    if (r.success && state.token === requestToken && state.user?.role === 'admin') {
      state.adminOverview = r;
      if (r.settings?.appVersions) syncAppVersionsState(r.settings.appVersions);
    }
  } catch (err) {
    console.error('Error loading admin overview:', err);
  }
}

// ============================================================================
// VIEW ROUTER & RENDERER
// ============================================================================
function setMobileMenuOpen(open) {
  document.getElementById('appSidebar')?.classList.toggle('is-open', open);
  document.getElementById('sidebarBackdrop')?.classList.toggle('is-open', open);
  const toggle = document.getElementById('btnToggleMobileSidebar');
  if (toggle) toggle.ariaExpanded = String(open);
}

function switchView(viewKey) {
  if (!state.user) return;
  if (!Object.hasOwn(VIEW_TITLES, viewKey) || (viewKey.startsWith('admin_') && state.user.role !== 'admin')) {
    viewKey = 'fruit_coin';
  }
  if (state.currentView !== viewKey) {
    state.listLimits = {};
    state.orderPage = null;
    state.orders = [];
  }
  state.currentView = viewKey;
  document.querySelectorAll('.sidebar-item[data-view]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.view === viewKey);
  });
  const titleEl = document.getElementById('topNavbarViewTitle');
  if (titleEl) {
    titleEl.textContent = VIEW_TITLES[viewKey] || 'ZnStudio';
  }
  setMobileMenuOpen(false);

  if (['admin_ctv', 'admin_system', 'admin_pricing'].includes(viewKey) && !state.adminOverview) {
    const container = document.getElementById('mainViewContainer');
    container.textContent = 'Đang tải dữ liệu quản trị…';
    loadAdminOverview().then(() => {
      if (state.currentView !== viewKey || state.user?.role !== 'admin') return;
      if (state.adminOverview) renderCurrentView();
      else container.textContent = 'Chưa tải được dữ liệu quản trị. Chọn lại mục này để thử lại.';
    });
    return;
  }
  renderCurrentView();
  if (viewKey === 'admin_monitor') loadAdminMonitor();
  if (viewKey === 'admin_pricing' && state.user?.role === 'admin') {
    Promise.all([loadCatalog(false, '', 6500), loadAdminOverview()]).then(([catChanged]) => {
      if (state.currentView === 'admin_pricing' && !isUserTypingOrModalOpen() && catChanged) {
        renderCurrentView();
      }
    });
  }
  if (ORDER_VIEWS.includes(viewKey)) {
    const scope = viewKey === 'fruit_coin' ? 'fruit_all' : viewKey;
    loadCatalog(false, scope, 6500).then(changed => {
      if (changed && state.currentView === viewKey && !isUserTypingOrModalOpen()) renderCurrentView();
    });
  }
  if (ORDER_VIEWS.includes(viewKey) || ['order_history', 'dashboard'].includes(viewKey)) {
    loadOrders().then(changed => { if (changed && state.currentView === viewKey) renderCurrentView(); });
  }
}

function renderCurrentView() {
  const container = document.getElementById('mainViewContainer');
  if (!container || !state.user) return;
  if (state.currentView.startsWith('admin_') && state.user.role !== 'admin') {
    switchView('fruit_coin');
    return;
  }

  const view = state.currentView;

  // Show zero-balance warning banner at top of page if CTV has 0đ
  const isCtvZeroBalance = state.user.role !== 'admin' && Number(state.user.balance || 0) <= 0;
  const zeroBannerHtml = isCtvZeroBalance
    ? `
      <div class="glass-panel" style="background:rgba(136,19,55,0.22);box-shadow:rgba(253,164,175,0.35) 0 0 0 1px inset;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-weight:500;color:#fda4af;font-size:14px;display:flex;align-items:center;gap:7px;">${znIcon('alert', 16)} <span>Tài khoản CTV của bạn chưa có số dư (0đ)</span></div>
          <div style="font-size:12px;color:var(--color-moon-mist);margin-top:2px;">
            Bạn vẫn có thể dùng công cụ tra cứu. Để đặt đơn, cần có đủ số dư và hệ thống lưu trữ ví an toàn. Liên hệ Admin khi cần nạp ví.
          </div>
        </div>
        <span class="badge-tag red">Cần nạp ví để thao tác</span>
      </div>
    `
    : '';

  if (ORDER_VIEWS.includes(view)) {
    container.innerHTML = zeroBannerHtml + renderOrderCategoryPageHtml(view);
    bindOrderCategoryPageEvents(view);
  } else if (view === 'dashboard') {
    container.innerHTML = zeroBannerHtml + renderDashboardOverviewHtml();
    bindDashboardEvents();
  } else if (view === 'weekly_settlements') {
    container.innerHTML = zeroBannerHtml + `<div class="glass-panel">Đang tải dữ liệu đối soát tuần...</div>`;
    renderWeeklySettlementsView(container, zeroBannerHtml);
  } else if (view === 'order_history') {
    container.innerHTML = zeroBannerHtml + renderOrderHistoryHtml();
    bindOrderHistoryEvents();
  } else if (view === 'backup') {
    mountBackup(container, { apiFetch, state, escapeHtml, formatVnd, formatDateVi, updateShellAuthUI, showToast, copyTextToClipboard });
  } else if (view === 'identity_tools') {
    if (container.querySelector('#identityForm')) return;
    container.innerHTML = renderIdentityToolsHtml();
    bindIdentityToolsEvents();
  } else if (view === 'admin_monitor' && state.user.role === 'admin') {
    container.innerHTML = renderAdminMonitorHtml();
    bindAdminMonitorEvents();
  } else if (view === 'admin_pricing' && state.user.role === 'admin') {
    container.innerHTML = renderAdminPricingPageHtml();
    bindAdminPricingEvents();
  } else if (view === 'admin_ctv' && state.user.role === 'admin') {
    container.innerHTML = renderAdminCtvPageHtml();
    bindAdminCtvEvents();
  } else if (view === 'admin_system' && state.user.role === 'admin') {
    container.innerHTML = renderAdminSystemPageHtml();
    bindAdminSystemEvents();
  }
}

// ============================================================================
// 1. RENDER ORDER CATEGORY PAGE (MATCHES SCREENSHOT 1 EXACTLY)
// ============================================================================
function renderOrderCategoryPageHtml(catKey) {
  const r = state.catalogData;
  const isWorking = !!(r?.systemStatus?.[catKey]);
  const rates = r?.processingRates || {};

  const rateKeyMap = {
    farm_gift: 'farm_gift_order',
    mail_gift: 'mail_gift_order',
    guestbook: 'guest_book_order',
    buff_tim: 'buff_tim_order',
    buff_sao: 'buff_sao_order',
    weather_buff: 'weather_buff_order',
    fruit_coin: 'fruit_order',
  };
  const rateObj = rates[rateKeyMap[catKey]] || { assigned_rate: 0, completed_rate: 0, cooldown_second: 180 };

  // Filter orders belonging to this category
  const catOrders = state.orders.filter((o) =>
    catKey === 'fruit_coin'
      ? o.category === 'fruit_coin' || o.category === 'fruit_by_fruit'
      : o.category === catKey
  );

  // Admin uses Server Zn live summary totals when available so numbers match 100%.
  const remSum = state.orderPage?.categoryStats || (state.user?.role === 'admin' ? state.remoteSummaries?.[catKey] : null);

  const totalOrders = remSum ? Number(remSum.total_orders ?? catOrders.length) : catOrders.length;
  const completedOrders = remSum ? Number(remSum.completed_orders ?? 0) : catOrders.filter((o) => o.status === 'completed').length;
  const activeOrdersCount = remSum ? Number(remSum.active_orders ?? 0) : catOrders.filter((o) => o.status !== 'completed' && o.isActive).length;
  const inactiveOrdersCount = remSum ? Number(remSum.inactive_orders ?? 0) : catOrders.filter((o) => o.status !== 'completed' && !o.isActive).length;

  const totalUnits = remSum ? Number(remSum.total_units ?? 0) : catOrders.reduce((s, o) => s + Number(o.totalCnt || 0), 0);
  const completedUnits = remSum ? Number(remSum.completed_units ?? 0) : catOrders.reduce((s, o) => s + Number(o.completedCnt || 0), 0);
  const activeRemainingUnits = remSum
    ? Number(remSum.active_units ?? 0)
    : catOrders
      .filter((o) => o.status !== 'completed' && o.isActive)
      .reduce((s, o) => s + Math.max(0, Number(o.totalCnt || 0) - Number(o.completedCnt || 0)), 0);
  const pausedRemainingUnits = remSum
    ? Number(remSum.inactive_units ?? 0)
    : catOrders
      .filter((o) => o.status !== 'completed' && !o.isActive)
      .reduce((s, o) => s + Math.max(0, Number(o.totalCnt || 0) - Number(o.completedCnt || 0)), 0);

  const syncedTimeText = r?.syncedAt
    ? new Date(r.syncedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';

  const unitLabelMap = {
    farm_gift: 'quà',
    mail_gift: 'thư',
    guestbook: 'bài viết',
    buff_tim: 'tim',
    buff_sao: 'sao',
    weather_buff: 'lần',
    fruit_coin: 'trái / xu',
  };
  const unitName = unitLabelMap[catKey] || 'đơn vị';

  // Extra footer buttons inside Stats Panel (Kho trái cây / Kho xu / Bảng giá)
  let footerButtonsHtml = '';
  if (catKey === 'fruit_coin') {
    footerButtonsHtml = `
      <div class="cat-footer-actions">
        <button type="button" class="btn-frost" id="btnViewFruitWarehouse">${znIcon('package', 14)} <span>Xem kho trái cây</span></button>
        <button type="button" class="btn-frost" id="btnViewCoinWarehouse">${znIcon('coins', 14)} <span>Xem kho xu</span></button>
        <button type="button" class="btn-frost" id="btnViewCategoryPrices">${znIcon('tag', 14)} <span>Xem bảng giá gói xu</span></button>
      </div>
    `;
  } else if (['buff_tim', 'buff_sao', 'guestbook', 'mail_gift', 'farm_gift', 'weather_buff'].includes(catKey)) {
    footerButtonsHtml = `
      <div class="cat-footer-actions">
        <button type="button" class="btn-frost" id="btnViewCategoryPrices">${znIcon('tag', 14)} <span>Xem bảng giá ${escapeHtml(VIEW_TITLES[catKey])}</span></button>
      </div>
    `;
  }

  return `
    ${[state.catalogWarning, state.ordersWarning].filter(Boolean).map(msg => `<p role="status" class="tool-warning">${escapeHtml(msg)}</p>`).join('')}
    <div class="glass-panel">
      <div class="panel-title-row">
        <div class="panel-title-left">
          <span class="panel-title-text">${escapeHtml(VIEW_TITLES[catKey])}</span>
          <span class="system-status-chip ${!r ? '' : isWorking ? 'is-working' : 'is-not-working'}">
            ● ${state.catalogWarning ? 'Chưa đồng bộ' : !r ? 'Đang kiểm tra...' : isWorking ? 'Đang hoạt động' : 'Không hoạt động'}
          </span>
          ${syncedTimeText ? `<span style="font-size:11px;color:var(--color-fog-veil);">Đồng bộ: ${escapeHtml(syncedTimeText)}</span>` : ''}
        </div>
        <button type="button" class="btn-frost" id="btnRefreshCatPage" style="font-size:12px;">
          ${znIcon('refresh', 13)} <span>Làm mới dữ liệu</span>
        </button>
      </div>

      <div class="stats-three-grid">
        <div class="stat-subcard">
          <div class="stat-subcard-head">
            <div class="stat-icon-box blue">${znIcon('orders', 16)}</div>
            <span>Đơn hàng</span>
          </div>
          <div class="stat-main-metric">
            <span>Đã hoàn thành:</span>
            <strong>${completedOrders}</strong>
            <span>/ ${totalOrders}</span>
          </div>
          <hr class="stat-divider" />
          <div class="stat-meta-row">
            <span><span style="color:#5eead4;">● Đang bật</span> <strong>${activeOrdersCount}</strong></span>
            <span><span style="color:#fda4af;">○ Đang tắt</span> <strong>${inactiveOrdersCount}</strong></span>
          </div>
        </div>

        <div class="stat-subcard">
          <div class="stat-subcard-head">
            <div class="stat-icon-box amber">${znIcon('layers', 16)}</div>
            <span>Tiến độ ${escapeHtml(unitName)}</span>
          </div>
          <div class="stat-main-metric">
            <span>Đã gửi thành công:</span>
            <strong>${formatNum(completedUnits)}</strong>
            <span>/ ${formatNum(totalUnits)}</span>
          </div>
          <hr class="stat-divider" />
          <div class="stat-meta-row">
            <span><span style="color:#5eead4;">↗ Đang chạy</span> <strong>${formatNum(activeRemainingUnits)}</strong></span>
            <span><span style="color:#fda4af;">— Tạm dừng</span> <strong>${formatNum(pausedRemainingUnits)}</strong></span>
          </div>
        </div>

        <div class="stat-subcard">
          <div class="stat-subcard-head">
            <div class="stat-icon-box violet">${znIcon('zap', 16)}</div>
            <span>Tốc độ xử lý</span>
          </div>
          <div class="stat-meta-row">
            <span style="display:inline-flex;align-items:center;gap:5px;">${znIcon('activity', 13)} <span>Tốc độ gửi:</span></span>
            <strong style="color:#fff;">${Number(rateObj.assigned_rate || 0).toFixed(1)} ${escapeHtml(unitName)}/phút</strong>
          </div>
          <div class="stat-meta-row">
            <span style="display:inline-flex;align-items:center;gap:5px;">${znIcon('check', 13)} <span>Thành công:</span></span>
            <strong style="color:#5eead4;">${Number(rateObj.completed_rate || 0).toFixed(1)} ${escapeHtml(unitName)}/phút</strong>
          </div>
          <div class="stat-meta-row">
            <span style="display:inline-flex;align-items:center;gap:5px;">${znIcon('clock', 13)} <span>Chờ sau lỗi:</span></span>
            <strong style="color:#fff;">${rateObj.cooldown_second ?? 180} giây</strong>
          </div>
        </div>
      </div>

      ${footerButtonsHtml}
    </div>

    ${catKey === 'weather_buff'
      ? `
      <div class="glass-panel" style="padding:14px 18px;border-left:3px solid var(--color-aurora-gradient);">
        <div style="font-size:13px;font-weight:500;color:var(--color-liquid-mist);margin-bottom:6px;display:flex;align-items:center;gap:6px;">${znIcon('info', 15)} <span>Lưu ý quy tắc Buff Thời Tiết:</span></div>
        <ul style="margin:0;padding-left:18px;font-size:12.5px;color:var(--color-moon-mist);line-height:1.7;">
          <li><strong>Bước 1:</strong> Bấm <strong>+ Thêm Đơn Hàng</strong> để mua gói số lần thời tiết trước (chưa cần chọn khách khi tạo gói).</li>
          <li><strong>Bước 2:</strong> Sau khi tạo đơn, chọn khách và ít nhất một thời tiết để chạy đơn, hoặc bấm <strong>Sao chép liên kết</strong> gửi liên kết công khai cho khách tự xem &amp; chỉnh.</li>
          <li>Sau khi bật đơn vẫn đổi được khách. Khách mới nhận phần thời tiết còn lại. Phần thời tiết đã chạy xong thì không đổi được.</li>
          <li>Đơn chưa hoàn thành, <strong>tạo quá 3 tiếng thì không xóa được</strong> (chỉ hỗ trợ xóa đơn trống chưa gán khách, chưa chọn thời tiết trong vòng 3 tiếng kể từ lúc tạo).</li>
          <li style="color:#fde68a;font-weight:500;">Hãy cân nhắc trước khi lên đơn vì Quản trị viên chỉ hỗ trợ hoàn trong trường hợp trục trặc do hệ thống.</li>
        </ul>
      </div>
    `
      : ''
    }

    <div class="glass-panel">
      <div class="panel-title-row">
        <div class="panel-title-left">
          <span class="panel-title-text">Quản lý đơn hàng</span>
          ${catOrders.some((o) => o.isActive && !['completed', 'cancelled', 'canceled'].includes(String(o.status || '').toLowerCase()))
      ? `<span class="live-sync-pill" title="Tự động cập nhật tiến độ đơn đang chạy mỗi 12 giây"><span class="live-sync-dot"></span>Tự động cập nhật tiến độ</span>`
      : ''
    }
        </div>
        <button type="button" class="btn-violet" id="btnOpenAddOrderModal">
          ${znIcon('plus', 14)} <span>Thêm Đơn Hàng</span>
        </button>
      </div>

      <div class="filters-grid">
        <div>
          <input
            type="text"
            id="catOrderSearchInput"
            class="input-box"
            placeholder="Tìm kiếm theo tên, SUID, mã đơn..."
            value="${escapeHtml(state.orderSearch)}"
          />
        </div>
        <div>
          <select id="catOrderActiveSelect" class="input-box">
            <option value="all" ${state.orderActiveFilter === 'all' ? 'selected' : ''}>Lọc theo trạng thái: Tất cả</option>
            <option value="1" ${state.orderActiveFilter === '1' ? 'selected' : ''}>Đang bật</option>
            <option value="0" ${state.orderActiveFilter === '0' ? 'selected' : ''}>Đang tắt</option>
          </select>
        </div>
        <div>
          <select id="catOrderProgressSelect" class="input-box">
            <option value="all" ${state.orderProgressFilter === 'all' ? 'selected' : ''}>Lọc theo tiến trình: Tất cả</option>
            <option value="running" ${state.orderProgressFilter === 'running' ? 'selected' : ''}>Đang chạy</option>
            <option value="completed" ${state.orderProgressFilter === 'completed' ? 'selected' : ''}>Đã hoàn thành</option>
          </select>
        </div>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>KHÁCH HÀNG</th>
              <th>${catKey === 'weather_buff' ? 'GÓI / THỜI TIẾT' : 'GÓI / VẬT PHẨM'}</th>
              <th>SỐ LƯỢNG</th>
              <th>GIÁ</th>
              ${catKey === 'weather_buff' ? '' : '<th>TIẾN ĐỘ</th>'}
              <th>TRẠNG THÁI</th>
              <th>BẬT/TẮT</th>
              <th>TẠO LÚC</th>
              ${catKey === 'weather_buff' ? '<th>LIÊN KẾT / THAO TÁC</th>' : '<th>THAO TÁC</th>'}
            </tr>
          </thead>
          <tbody id="catOrdersTbody">
            ${renderCatOrdersTbodyHtml(catKey)}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function getFilteredCatOrders(catKey) {
  const catOrders = state.orders.filter((o) =>
    catKey === 'fruit_coin'
      ? o.category === 'fruit_coin' || o.category === 'fruit_by_fruit'
      : o.category === catKey
  );
  const q = state.orderSearch.trim().toLowerCase();
  return catOrders.filter((o) => {
    if (state.orderActiveFilter === '1' && !o.isActive) return false;
    if (state.orderActiveFilter === '0' && o.isActive) return false;
    if (state.orderProgressFilter === 'running' && ['completed', 'cancelled'].includes(o.status)) return false;
    if (state.orderProgressFilter === 'completed' && o.status !== 'completed') return false;
    if (q) {
      const matchName = String(o.customer?.nickname || '').toLowerCase().includes(q);
      const matchSuid = String(o.customer?.suid || '').toLowerCase().includes(q);
      const matchId = String(o.remoteOrderId || o.id).toLowerCase().includes(q);
      const matchLink = String(o.weather?.trackUrl || '').toLowerCase().includes(q);
      if (!matchName && !matchSuid && !matchId && !matchLink) return false;
    }
    return true;
  });
}

function renderCatOrdersTbodyHtml(catKey) {
  const filteredOrders = state.orderPage ? state.orders : getFilteredCatOrders(catKey);
  const colSpan = catKey === 'weather_buff' ? 8 : 9;
  if (filteredOrders.length === 0) {
    return `
      <tr>
        <td colspan="${colSpan}" style="text-align:center;padding:32px;color:var(--color-fog-veil);">
          ${state.loadingOrders ? '<span class="loading-inline"><span class="loading-dot"></span>Đang đồng bộ danh sách đơn hàng...</span>' : 'Không có dữ liệu'}
        </td>
      </tr>
    `;
  }
  return filteredOrders.slice(0, pageLimit('orderList')).map(o => renderOrderTableRowHtml(o)).join('')
    + moreButton('orderList', state.orderPage?.filteredCount ?? filteredOrders.length, colSpan, Math.min(filteredOrders.length, pageLimit('orderList')));
}

function renderOrderStatusBadge(o) {
  const st = String(o.status || '').trim().toLowerCase();
  if (st === 'cancelled' || st === 'canceled') return '<span class="badge-tag red">Đã hủy</span>';
  if (st === 'completed' || st === 'done' || st === 'finished') return '<span class="badge-tag green">Hoàn thành</span>';
  if (st === 'failed' || st === 'error') return '<span class="badge-tag red">Lỗi đơn</span>';
  if (st === 'paused' || st === 'stopped' || st === 'inactive') return '<span class="badge-tag amber">Tạm dừng</span>';
  if (st === 'pending') return '<span class="badge-tag amber">Chờ xử lý</span>';
  if (st === 'queued' || st === 'waiting') return '<span class="badge-tag amber">Đang chờ</span>';
  if (st === 'assigned' || st === 'processing' || st === 'running' || st === 'in_progress' || st === 'sending') {
    return o.isActive === false
      ? '<span class="badge-tag amber">Tạm dừng</span>'
      : '<span class="badge-tag violet">Đang chạy</span>';
  }
  return o.isActive === false
    ? '<span class="badge-tag amber">Tạm dừng</span>'
    : '<span class="badge-tag violet">Đang xử lý</span>';
}

function formatOnlineStatusVi(status) {
  const raw = String(status || '').trim();
  if (!raw) return '';
  const low = raw.toLowerCase();
  if (low === 'online') return 'Đang trực tuyến';
  if (low === 'offline') return 'Ngoại tuyến';
  return raw;
}

function renderOrderTableRowHtml(o, { inHistory = false } = {}) {
  const isAdmin = state.user?.role === 'admin';
  if (o.category?.startsWith('backup_')) {
    const bTotal = Math.max(0, Number(o.totalCnt || 0));
    const bDone = Math.max(0, Number(o.completedCnt || 0));
    const bPct = bTotal > 0 ? Math.min(100, Math.round((bDone / bTotal) * 100)) : 0;
    const bUnit = o.backupProgress?.unit || 'đơn';
    const bSt = String(o.backupStatus || o.status || '').toLowerCase();
    const bTone = bSt === 'done' || bSt === 'completed' ? 'green' : bSt === 'failed' || bSt === 'cancelled' ? 'red' : ['running', 'preparing', 'queued', 'friending'].includes(bSt) ? 'violet' : 'amber';
    const bProgressHtml = bTotal > 0
      ? `<div class="progress-cell" title="Đã chạy ${formatNum(bDone)} / ${formatNum(bTotal)} ${escapeHtml(bUnit)}">
          <span class="progress-pct ${bPct >= 100 ? 'is-done' : ''}">${bPct}%</span>
          <div class="progress-track"><div class="progress-fill ${bPct >= 100 ? 'is-done' : ''}" style="width:${bPct}%"></div></div>
        </div><div class="tool-note">${formatNum(bDone)}/${formatNum(bTotal)} ${escapeHtml(bUnit)}</div>`
      : '—';
    return `<tr><td><strong>${escapeHtml(o.customer?.nickname || '')}</strong><div class="tool-note">#${escapeHtml(o.remoteOrderId)}</div></td>
      <td>${escapeHtml(o.categoryName)}<div class="tool-note">${escapeHtml(o.summary)}</div></td><td>${bTotal > 0 ? `${formatNum(bTotal)} ${escapeHtml(bUnit)}` : '1 đơn'}</td>
      <td>${formatVnd(o.sellPrice)}</td><td>${bProgressHtml}</td><td><span class="badge-tag ${bTone}">${escapeHtml(o.statusText || 'Chờ cập nhật')}</span></td><td>—</td>
      <td>${formatDateVi(o.createdAt)}</td><td><div class="order-row-actions">${o.backupTrackUrl ? `<a href="${escapeHtml(o.backupTrackUrl)}" target="_blank" rel="noopener noreferrer" class="btn-frost backup-track-link">Mở link theo dõi</a>` : ''}<button type="button" class="btn-frost" data-open-backup>Mở nguồn dự phòng</button></div></td></tr>`;
  }
  const pct =
    o.totalCnt > 0
      ? Math.min(100, Math.round((Number(o.completedCnt || 0) / Number(o.totalCnt)) * 100))
      : 0;

  const statusBadge = renderOrderStatusBadge(o);

  // Admin sees cost & profit tooltip; CTV ONLY sees o.sellPrice!
  const adminNote =
    isAdmin && o.costPrice !== undefined && o.markupAmount > 0
      ? `<div style="font-size:10px;color:#4ade80;">Lãi: +${formatVnd(o.markupAmount)}</div>`
      : '';

  const isWeather = o.category === 'weather_buff';
  const canEditWeather = isWeather && o.remoteOrderId && !['completed', 'cancelled'].includes(o.status) && !o.requiresReview && !o.weatherDeletePending;
  const wbSlots = isWeather ? (o.weather?.slots || []) : [];
  const wbHasCust = isWeather ? wbSlots.some(s => s.customer_id || s.customer) || Boolean(o.customer?.customerId) : true;
  const wbLines = isWeather ? (o.weather?.weathers || []) : [];
  const wbTotalQty = wbLines.reduce((s, w) => s + Number(w.quantity || 0), 0);
  const wbPkgQty = Number(o.weather?.packageQuantity || o.totalCnt || 0);
  const wbReadyToRun = !isWeather || (wbHasCust && wbTotalQty > 0 && (wbPkgQty <= 0 || wbTotalQty <= wbPkgQty));

  const customerCellHtml = isWeather
    ? `
      <div style="display:flex;flex-direction:column;gap:4px;">
        ${wbHasCust
      ? `<div style="font-weight:500;color:#fff;">${escapeHtml(o.customer?.nickname || '—')}</div>
               <div style="font-size:11px;color:var(--color-fog-veil);">#${escapeHtml(o.remoteOrderId || o.id)} · SUID: ${escapeHtml(o.customer?.suid || '—')}</div>`
      : `<div><span class="badge-tag amber">${znIcon('alert', 12)} <span>Chưa gán khách</span></span></div>
               <div style="font-size:11px;color:var(--color-fog-veil);">Đơn #${escapeHtml(o.remoteOrderId || o.id)}</div>`
    }
        ${canEditWeather
      ? `<div><button type="button" class="${wbHasCust ? 'btn-frost' : 'btn-violet'}" style="padding:3px 9px;font-size:11px;" data-weather-slot-order="${escapeHtml(o.remoteOrderId)}">${wbHasCust ? `${znIcon('edit', 12)} <span>Đổi khách</span>` : `${znIcon('user', 12)} <span>Gán khách</span>`}</button></div>`
      : ''
    }
      </div>
    `
    : `
      <div style="font-weight:500;color:#fff;">${escapeHtml(o.customer?.nickname || '—')}</div>
      <div style="font-size:11px;color:var(--color-fog-veil);">
        #${escapeHtml(o.remoteOrderId || o.id)} · SUID: ${escapeHtml(o.customer?.suid || '—')}
      </div>
    `;

  const packageCellHtml = isWeather
    ? `
      <div style="display:flex;flex-direction:column;gap:5px;">
        ${wbLines.length > 0
      ? `<div style="display:flex;flex-wrap:wrap;gap:4px;">
                ${wbLines
        .map(
          (w) => `
                  <span class="badge-tag" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;">
                    ${w.icon ? `<img src="${escapeHtml(w.icon)}" alt="" style="width:14px;height:14px;object-fit:contain;" />` : znIcon('cloud', 12)}
                    ${escapeHtml(w.name)}: <strong>${formatNum(w.completed_cnt || 0)}/${formatNum(w.quantity || 0)}</strong>
                  </span>
                `
        )
        .join('')}
              </div>`
      : `<div><span class="badge-tag amber">${znIcon('alert', 12)} <span>Chưa chọn thời tiết</span></span> <span style="font-size:11px;color:var(--color-fog-veil);">(Gói ${formatNum(wbPkgQty)} lần)</span></div>`
    }
        ${canEditWeather
      ? `<div><button type="button" class="${wbLines.length > 0 ? 'btn-frost' : 'btn-violet'}" style="padding:3px 9px;font-size:11px;" data-weather-config-order="${escapeHtml(o.remoteOrderId)}">${wbLines.length > 0 ? `${znIcon('edit', 12)} <span>Sửa thời tiết</span>` : `${znIcon('cloud', 12)} <span>Chọn thời tiết</span>`}</button></div>`
      : ''
    }
      </div>
    `
    : `<span class="badge-tag order-summary-badge">${escapeHtml(o.summary)}</span>`;

  const wbTrackUrl = isWeather ? String(o.weather?.trackUrl || '') : '';
  const eyeIconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeBtnHtml = o.remoteOrderId
    ? `<button type="button" class="btn-frost btn-eye-view" data-view-order-customer="${escapeHtml(o.remoteOrderId)}" data-order-cat="${escapeHtml(o.category)}" title="Xem thông tin khách lúc lên đơn" aria-label="Xem thông tin khách lúc lên đơn">${eyeIconSvg}</button>`
    : '';
  const lastCellHtml = isWeather
    ? `
      <td>
        <div style="display:flex;flex-direction:column;gap:5px;min-width:146px;">
          ${o.remoteOrderId && o.status !== 'cancelled'
      ? `
                <div style="display:flex;align-items:center;gap:5px;">
                  ${eyeBtnHtml}
                  <button type="button" class="btn-violet" style="padding:5px 10px;font-size:11px;white-space:nowrap;" data-copy-weather-link="${escapeHtml(o.remoteOrderId)}" data-track-url="${escapeHtml(wbTrackUrl)}">
                    ${znIcon('copy', 12)} <span>Sao chép liên kết</span>
                  </button>
                  ${wbTrackUrl
        ? `<a href="${escapeHtml(wbTrackUrl)}" target="_blank" rel="noopener noreferrer" class="btn-frost" style="padding:5px 8px;font-size:11px;text-decoration:none;white-space:nowrap;" title="Mở liên kết theo dõi">${znIcon('external', 13)}</a>`
        : ''
      }
                </div>
                ${wbTrackUrl
        ? `<div style="font-size:10px;color:var(--color-fog-veil);max-width:165px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(wbTrackUrl)}">${escapeHtml(wbTrackUrl.replace(/^https?:\/\//, ''))}</div>`
        : ''
      }
              `
      : (eyeBtnHtml || '—')
    }
          ${isAdmin && o.remoteOrderId && o.status !== 'cancelled'
      ? `<div><button type="button" class="btn-frost" style="padding:3px 8px;font-size:10px;color:#fda4af;white-space:nowrap;" data-delete-order="${escapeHtml(o.remoteOrderId)}" data-order-cat="weather_buff">${o.weatherDeletePending ? 'Đối soát xóa đơn' : 'Hủy trên Server Zn'}</button></div>`
      : o.weatherDeletePending ? '<span class="tool-note">Chờ đối soát xóa đơn</span>'
        : Number.isFinite(o.weatherDeleteAt) ? `<div><button type="button" class="btn-frost" style="white-space:nowrap;" data-delete-order="${escapeHtml(o.remoteOrderId)}" data-order-cat="weather_buff" data-unlock-at="${o.weatherDeleteAt}" ${Number.isFinite(o.weatherDeleteUntil) ? `data-expire-at="${o.weatherDeleteUntil}"` : ''} disabled>Xóa đơn</button></div>` : ''
    }
        </div>
      </td>
    `
    : isAdmin
      ? `
      <td>
        <div class="order-row-actions">
          ${eyeBtnHtml}
          ${o.remoteOrderId && o.status !== 'cancelled'
        ? `<button type="button" class="btn-frost" style="padding:4px 10px;font-size:11px;color:#fda4af;white-space:nowrap;" data-delete-order="${escapeHtml(o.remoteOrderId)}" data-order-cat="${escapeHtml(o.category)}">Hủy trên Server Zn</button>`
        : ''
      }
          ${!eyeBtnHtml && (!o.remoteOrderId || o.status === 'cancelled') ? '—' : ''}
        </div>
      </td>
    `
      : `
      <td>
        <div class="order-row-actions">
          ${eyeBtnHtml || '—'}
        </div>
      </td>
    `;

  return `
    <tr>
      <td>${customerCellHtml}${isAdmin && o.placedBy ? `<div class="tool-note">${o.source && o.source !== 'znplay' ? 'Server Zn' : o.placedBy.role === 'ctv' ? 'CTV' : 'Quản trị'} · ${escapeHtml(o.placedBy.name)}</div>` : ''}</td>
      <td>${packageCellHtml}</td>
      <td style="white-space:nowrap;"><strong>${formatNum(o.totalCnt || 0)}</strong></td>
      <td style="white-space:nowrap;">
        <div style="font-weight:500;color:var(--color-lavender-phosphor);font-variant-numeric:tabular-nums;">${formatVnd(o.sellPrice)}</div>
        ${adminNote}
      </td>
      ${isWeather && !inHistory
      ? ''
      : `
            <td>
              <div class="progress-cell" title="Đã hoàn thành ${formatNum(o.completedCnt || 0)} / ${formatNum(o.totalCnt || 0)}">
                <span class="progress-pct ${pct >= 100 ? 'is-done' : ''}">${pct}%</span>
                <div class="progress-track"><div class="progress-fill ${pct >= 100 ? 'is-done' : ''}" style="width:${pct}%"></div></div>
              </div>
            </td>
          `
    }
      <td>${statusBadge}</td>
      <td>
        ${o.remoteOrderId && !['completed', 'cancelled'].includes(o.status) && !o.requiresReview && !o.weatherDeletePending
      ? `<button type="button" class="switch-btn ${o.isActive ? 'is-on' : ''}" role="switch" aria-checked="${Boolean(o.isActive)}" data-toggle-order="${escapeHtml(o.remoteOrderId)}" data-order-cat="${escapeHtml(o.category)}" title="${!wbReadyToRun && !o.isActive ? 'Cần gán khách và chọn thời tiết trước khi bật' : 'Bật/Tắt đơn'}"></button>`
      : '—'
    }
      </td>
      <td style="font-size:12px;color:var(--color-fog-veil);white-space:nowrap;">
        ${formatDateVi(o.createdAt)}
      </td>
      ${lastCellHtml}
    </tr>
  `;
}

let catFilterTimer = null;
function bindOrderCategoryPageEvents(catKey) {
  document.getElementById('btnRefreshCatPage')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnRefreshCatPage');
    if (btn) { btn.disabled = true; btn.textContent = '↻ Đang tải...'; }
    showToast('Đang đồng bộ dữ liệu mới nhất...');
    const scope = catKey === 'fruit_coin' ? 'fruit_all' : catKey;
    await Promise.all([loadCatalog(true, scope, 6500), loadOrders(true)]);
    if (state.currentView === catKey && !isUserTypingOrModalOpen()) renderCurrentView();
  });

  document.getElementById('btnOpenAddOrderModal')?.addEventListener('click', () => {
    openCreateOrderModal(catKey);
  });

  document.getElementById('btnViewFruitWarehouse')?.addEventListener('click', openFruitWarehouseModal);
  document.getElementById('btnViewCoinWarehouse')?.addEventListener('click', openCoinWarehouseModal);
  document.getElementById('btnViewCategoryPrices')?.addEventListener('click', () => {
    openCategoryPriceListModal(catKey);
  });

  const updateTbodyOnly = async () => {
    state.listLimits.orderList = 20;
    await loadOrders();
    if (state.currentView !== catKey) return;
    const tbody = document.getElementById('catOrdersTbody');
    if (!tbody) return;
    tbody.innerHTML = renderCatOrdersTbodyHtml(catKey);
    bindOrderRowActionButtons();
  };

  const searchIn = document.getElementById('catOrderSearchInput');
  searchIn?.addEventListener('input', (e) => {
    state.orderSearch = e.target.value;
    if (catFilterTimer && typeof clearTimeout === 'function') clearTimeout(catFilterTimer);
    catFilterTimer = setTimeout(updateTbodyOnly, 220);
  });

  document.getElementById('catOrderActiveSelect')?.addEventListener('change', (e) => {
    state.orderActiveFilter = e.target.value;
    updateTbodyOnly();
  });

  document.getElementById('catOrderProgressSelect')?.addEventListener('change', (e) => {
    state.orderProgressFilter = e.target.value;
    updateTbodyOnly();
  });

  bindOrderRowActionButtons();
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { }
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { }
  ta.remove();
  return ok;
}

function bindOrderRowActionButtons() {
  document.querySelectorAll('[data-open-backup]').forEach((btn) => {
    btn.addEventListener('click', () => switchView('backup'));
  });

  document.querySelectorAll('[data-view-order-customer]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const remId = btn.dataset.viewOrderCustomer;
      const cat = btn.dataset.orderCat;
      if (remId && cat) openOrderCustomerSnapshotModal(cat, remId);
    });
  });

  document.querySelectorAll('[data-toggle-order]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const remId = btn.dataset.toggleOrder;
      const cat = btn.dataset.orderCat;
      btn.disabled = true;
      try {
        const res = await apiFetch(`/api/orders/${cat}/${remId}/toggle-active`, 'PUT');
        showToast(res.message || 'Đã cập nhật trạng thái đơn hàng');
        await loadOrders(true);
        renderCurrentView();
      } catch (err) {
        showToast(`Lỗi: ${err.message}`);
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-weather-slot-order]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const remId = btn.dataset.weatherSlotOrder;
      const ord = state.orders.find((o) => o.category === 'weather_buff' && String(o.remoteOrderId) === String(remId));
      if (ord) openWeatherSlotModal(ord);
    });
  });

  document.querySelectorAll('[data-weather-config-order]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const remId = btn.dataset.weatherConfigOrder;
      const ord = state.orders.find((o) => o.category === 'weather_buff' && String(o.remoteOrderId) === String(remId));
      if (ord) openWeatherConfigModal(ord);
    });
  });

  document.querySelectorAll('[data-copy-weather-link]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const remId = btn.dataset.copyWeatherLink;
      let url = String(btn.dataset.trackUrl || '').trim();
      const origHtml = btn.innerHTML;
      btn.disabled = true;
      try {
        if (!url) {
          btn.textContent = 'Đang lấy liên kết...';
          const res = await apiFetch(`/api/orders/weather_buff/${encodeURIComponent(remId)}/share-link`, 'POST');
          url = String(res?.url || '').trim();
          if (!url) throw new Error('Không lấy được liên kết theo dõi.');
          btn.dataset.trackUrl = url;
          const ord = state.orders.find((o) => o.category === 'weather_buff' && String(o.remoteOrderId) === String(remId));
          if (ord) {
            ord.weather = { ...(ord.weather || {}), trackUrl: url };
          }
        }
        const copied = await copyTextToClipboard(url);
        if (copied) {
          showToast('Đã sao chép liên kết theo dõi thời tiết!');
          btn.innerHTML = `${znIcon('check', 12)} <span>Đã sao chép</span>`;
          setTimeout(() => { btn.innerHTML = origHtml; btn.disabled = false; }, 1600);
        } else {
          window.prompt('Sao chép liên kết theo dõi thời tiết:', url);
          btn.innerHTML = origHtml;
          btn.disabled = false;
        }
      } catch (err) {
        showToast(err.message || 'Không sao chép được liên kết.');
        btn.innerHTML = origHtml;
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-delete-order]').forEach((btn) => {
    const expireAt = btn.hasAttribute('data-expire-at') ? Number(btn.dataset.expireAt) : NaN;
    const isExpired = () => Number.isFinite(expireAt) && (Date.now() + (state.orderClockOffset || 0)) >= expireAt;
    if (btn.hasAttribute('data-unlock-at')) {
      const tick = () => {
        if (!btn.isConnected) return;
        if (isExpired()) {
          (btn.parentElement || btn).remove();
          return;
        }
        const nowServer = Date.now() + (state.orderClockOffset || 0);
        const left = Math.ceil((Number(btn.dataset.unlockAt) - nowServer) / 1000);
        btn.disabled = left > 0;
        btn.textContent = left > 0 ? `Xóa sau ${left} giây` : 'Xóa đơn';
        if (left > 0) {
          setTimeout(tick, 1000);
        } else if (Number.isFinite(expireAt)) {
          const msUntilExpire = expireAt - nowServer;
          if (msUntilExpire <= 0) (btn.parentElement || btn).remove();
          else if (msUntilExpire <= 2147483647) setTimeout(tick, Math.min(msUntilExpire + 200, 60000));
        }
      };
      tick();
    }
    btn.addEventListener('click', async () => {
      if (isExpired()) {
        showToast('Đơn chưa hoàn thành, tạo quá 3 tiếng thì không xóa được.');
        (btn.parentElement || btn).remove();
        return;
      }
      const remId = btn.dataset.deleteOrder;
      const cat = btn.dataset.orderCat;
      const ord = state.orders.find((o) => o.category === cat && String(o.remoteOrderId) === String(remId));
      let confirmMsg = `Hủy & xóa đơn #${remId} trên Server Zn?`;
      if (state.user?.role === 'ctv') {
        confirmMsg = `Xóa đơn Buff Thời Tiết #${remId} và hoàn ${formatVnd(ord?.sellPrice)} vào ví của bạn?`;
      } else if (ord?.weatherDeletePending) {
        confirmMsg = `Đã kiểm tra trên Server Zn đơn #${remId} chưa chạy và đã xóa hoặc vẫn trống? Xác nhận để hoàn ${formatVnd(ord.sellPrice)} vào ví CTV sau khi kiểm tra lại.`;
      } else if (ord?.placedBy?.role === 'ctv') {
        if (ord.status === 'completed') {
          confirmMsg = `Xóa đơn #${remId} đã hoàn thành khỏi hệ thống? (Đơn đã giao đủ nên không hoàn tiền ví CTV.)`;
        } else if (Number(ord.completedCnt || 0) > 0 && Number(ord.totalCnt || 0) > 0) {
          confirmMsg = `Hủy & xóa đơn #${remId} trên Server Zn (đã chạy ${ord.completedCnt}/${ord.totalCnt})? Hệ thống sẽ xóa đơn và tự động hoàn phần chưa chạy vào ví CTV "${ord.placedBy.name}".`;
        } else {
          confirmMsg = `Hủy & xóa đơn #${remId} trên Server Zn? Sau khi xóa thành công, đơn sẽ mất khỏi bảng và tự động hoàn lại ${formatVnd(ord.sellPrice)} vào ví CTV "${ord.placedBy.name}".`;
        }
      }
      if (!confirm(confirmMsg)) return;
      btn.disabled = true;
      try {
        const res = await apiFetch(`/api/orders/${cat}/${remId}`, 'DELETE', {
          deletion_note: 'Xóa đơn từ ZnStudio',
          confirmed_deleted: state.user?.role === 'admin' && !!ord?.weatherDeletePending,
        });
        showToast(res.message || 'Đã hủy & xóa đơn hàng');
        await Promise.all([loadOrders(true), initAuth()]);
        renderCurrentView();
      } catch (err) {
        showToast(`Không thể xóa: ${err.message}`);
        await loadOrders(true);
        renderCurrentView();
      }
    });
  });
}

function renderSyncLoadingHtml(message = 'Đang cập nhật bảng giá từ Zn...', sub = 'Đang đồng bộ trạng thái hoạt động và giá gốc mới nhất từ hệ thống để đảm bảo chính xác tuyệt đối.') {
  return `
    <div class="sync-loading-screen">
      <div class="sync-spinner-ring" aria-hidden="true"></div>
      <div class="sync-loading-title">${escapeHtml(message)}</div>
      <div class="sync-loading-sub">${escapeHtml(sub)}</div>
    </div>
  `;
}

let customerSnapshotModalSeq = 0;
let lastSnapshotForceAt = 0;
async function openOrderCustomerSnapshotModal(cat, remoteOrderId, { force = false } = {}) {
  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  const cacheKey = `${cat}:${remoteOrderId}`;
  const isFruit = cat === 'fruit_coin' || cat === 'fruit_by_fruit';
  const mySeq = ++customerSnapshotModalSeq;

  box.className = 'modal-box';
  title.textContent = `Thông tin đơn #${remoteOrderId}`;
  overlay.style.display = 'flex';

  const renderSnapshot = (data) => {
    const p = data.profile;
    const cust = data.customer || {};
    const ord = data.order || {};
    const quota = data.dailyFruitQuota;
    const displayName = p?.nickname || cust.nickname || 'Chưa gán khách';
    const regionText = p?.region || '';

    let quotaBadgeHtml = '';
    if (isFruit && quota) {
      if (quota.limit > 0) {
        const ratio = quota.used / quota.limit;
        const tone = ratio >= 1 ? 'is-full' : ratio >= 0.8 ? 'is-warn' : 'is-ok';
        quotaBadgeHtml = `<span class="snapshot-quota-pill ${tone}">${formatNum(quota.used)} / ${formatNum(quota.limit)}</span>`;
      } else {
        quotaBadgeHtml = `<span class="snapshot-quota-pill is-ok">${formatNum(quota.used)} · Không giới hạn trái trong ngày</span>`;
      }
    }

    const avatarFallbackSvg = '<svg viewBox="0 0 64 64" width="52" height="52" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="#c8cbd2"/><circle cx="32" cy="24" r="11" fill="#e6e8ec"/><path d="M14 54c3-10 10-15 18-15s15 5 18 15" fill="#e6e8ec"/></svg>';

    body.innerHTML = `
      <div class="customer-snapshot-card">
        <div class="snapshot-card-label">Thông tin khách lúc lên đơn</div>
        ${p
        ? `
          <div class="snapshot-profile-head">
            <div class="snapshot-avatar-wrap">
              ${p.photoUrl
          ? `<img src="${escapeHtml(p.photoUrl)}" alt="${escapeHtml(displayName)}" class="snapshot-avatar-img" referrerpolicy="no-referrer" />`
          : ''
        }
              <div class="snapshot-avatar-fallback" ${p.photoUrl ? 'style="display:none;"' : ''}>${avatarFallbackSvg}</div>
              <span class="snapshot-level-badge" title="Cấp độ thành tích">${formatNum(p.achievementLevel || 0)}</span>
            </div>
            <div class="snapshot-profile-meta">
              <div class="snapshot-nickname">${escapeHtml(displayName)}</div>
              <div class="snapshot-tags-row">
                ${regionText ? `<span class="snapshot-region-pill">${escapeHtml(regionText)}</span>` : ''}
                ${p.onlineStatus ? `<span class="snapshot-region-pill">${escapeHtml(formatOnlineStatusVi(p.onlineStatus))}</span>` : ''}
              </div>
            </div>
          </div>

          <div class="snapshot-stats-row">
            <span class="snapshot-stat-item" title="Lượt thích (Tim)"><span style="color:#fda4af;">${znIcon('heart', 14)}</span> <strong>${formatNum(p.userLikes || 0)}</strong></span>
            <span class="snapshot-stat-item" title="Sao nhà"><span style="color:#fde68a;">${znIcon('star', 14)}</span> <strong>${formatNum(p.homeLikes || 0)}</strong></span>
            <span class="snapshot-stat-item" title="Lượt ghé thăm nhà"><span style="color:var(--color-aurora-gradient);">${znIcon('home', 14)}</span> <strong>${formatNum(p.totalHomeVisitCount || 0)}</strong></span>
            <span class="snapshot-stat-item" title="Người theo dõi"><span style="color:var(--color-lavender-phosphor);">${znIcon('users', 14)}</span> <strong>${formatNum(p.followerCount || 0)}</strong></span>
          </div>

          <div class="snapshot-captured-line">
            Chụp thông tin lúc: <strong>${escapeHtml(formatDateTimeSecVi(p.capturedAt || ord.createdAt))}</strong>
          </div>
        `
        : `
          <div class="snapshot-empty-profile">
            <div style="font-weight:600;color:#fff;">${escapeHtml(displayName)}</div>
            <div style="font-size:12.5px;color:var(--color-fog-veil);margin-top:4px;">Đơn này chưa lưu thông tin khách (đơn cũ hoặc chưa gán khách).</div>
          </div>
        `
      }

        ${isFruit
        ? `
          <div class="snapshot-fruit-quota">
            <span class="snapshot-quota-label">Trái đã nhận hôm nay</span>
            ${quota ? quotaBadgeHtml : '<span class="snapshot-region-pill">Chưa có dữ liệu hôm nay</span>'}
            <span class="snapshot-quota-reset">Đặt lại lúc 07:00 giờ Việt Nam</span>
          </div>
        `
        : ''
      }
      </div>

      <div class="snapshot-order-meta">
        <div><span>Mã đơn:</span> <strong>#${escapeHtml(ord.remoteOrderId || remoteOrderId)}</strong></div>
        ${cust.suid ? `<div><span>SUID:</span> <strong>${escapeHtml(cust.suid)}</strong></div>` : ''}
        ${ord.summary ? `<div><span>Nội dung:</span> <strong>${escapeHtml(ord.summary)}</strong></div>` : ''}
        ${ord.totalCnt > 0 ? `<div><span>Tiến độ:</span> <strong>${formatNum(ord.completedCnt || 0)} / ${formatNum(ord.totalCnt)}</strong></div>` : ''}
      </div>

      <div class="action-row align-end">
        <button type="button" class="btn-frost" id="btnRefreshOrderSnapshot" style="font-size:12px;">${znIcon('refresh', 13)} <span>Cập nhật mới</span></button>
        <button type="button" class="btn-violet" id="btnCloseOrderSnapshot" style="font-size:12px;">Đóng</button>
      </div>
    `;

    const img = body.querySelector('.snapshot-avatar-img');
    if (img) {
      img.addEventListener('error', () => {
        img.style.display = 'none';
        const fb = body.querySelector('.snapshot-avatar-fallback');
        if (fb) fb.style.display = 'flex';
      });
    }

    body.querySelector('#btnCloseOrderSnapshot')?.addEventListener('click', () => {
      overlay.style.display = 'none';
    });

    const refreshBtn = body.querySelector('#btnRefreshOrderSnapshot');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        const waitLeft = Math.ceil((10000 - (Date.now() - lastSnapshotForceAt)) / 1000);
        if (state.user?.role !== 'admin' && waitLeft > 0) {
          showToast(`Vui lòng đợi ${waitLeft} giây trước khi làm mới lại.`);
          return;
        }
        lastSnapshotForceAt = Date.now();
        openOrderCustomerSnapshotModal(cat, remoteOrderId, { force: true });
      });
    }
  };

  // Client-side 30s cache so re-opening the same eye icon is instant (0 network requests!)
  const cached = state.customerSnapshotCache?.[cacheKey];
  if (!force && cached && Date.now() - cached.at < 30000) {
    renderSnapshot(cached.data);
    return;
  }

  body.innerHTML = renderSyncLoadingHtml(
    'Đang lấy thông tin khách hàng...',
    isFruit
      ? 'Đang tải hồ sơ khách lúc lên đơn và số trái đã nhận hôm nay.'
      : 'Đang tải hồ sơ khách lúc lên đơn từ hệ thống.'
  );

  try {
    const qs = force ? '?refresh=1' : '';
    const r = await apiFetch(`/api/orders/${encodeURIComponent(cat)}/${encodeURIComponent(remoteOrderId)}/customer-snapshot${qs}`, 'GET', null, 8000);
    if (mySeq !== customerSnapshotModalSeq || overlay.style.display === 'none' || !state.user) return;
    if (!state.customerSnapshotCache) state.customerSnapshotCache = {};
    const keys = Object.keys(state.customerSnapshotCache);
    if (keys.length >= 60) delete state.customerSnapshotCache[keys[0]];
    state.customerSnapshotCache[cacheKey] = { at: Date.now(), data: r };
    renderSnapshot(r);
  } catch (err) {
    if (mySeq !== customerSnapshotModalSeq || overlay.style.display === 'none') return;
    body.innerHTML = `
      <div class="sync-loading-screen" style="padding:24px 12px;">
        <div style="color:#fda4af;">${znIcon('alert', 28)}</div>
        <div class="sync-loading-title" style="color:#fda4af;">Chưa tải được thông tin khách hàng</div>
        <div class="sync-loading-sub">${escapeHtml(err.message || 'Vui lòng thử lại sau ít giây.')}</div>
        <button type="button" class="btn-violet" id="btnRetryOrderSnapshot">${znIcon('refresh', 14)} <span>Thử lại</span></button>
      </div>
    `;
    body.querySelector('#btnRetryOrderSnapshot')?.addEventListener('click', () => {
      openOrderCustomerSnapshotModal(cat, remoteOrderId, { force: false });
    });
  }
}

// ============================================================================
// 2. MODAL: + THÊM ĐƠN HÀNG (CREATE ORDER DIALOG — LIVE SYNC BEFORE ORDER!)
// ============================================================================
let createOrderModalSeq = 0;
async function openCreateOrderModal(catKey, presetOptions = null) {
  state.listLimits.modalPackages = 20;
  // Check CTV wallet balance first!
  if (state.user.role !== 'admin' && Number(state.user.balance || 0) <= 0) {
    showToast('Số dư ví CTV của bạn là 0đ. Vui lòng nạp tiền vào ví trước khi tạo đơn!');
    return;
  }

  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  const mySeq = ++createOrderModalSeq;
  box.className = 'modal-box';
  title.textContent = `+ Thêm mới: ${VIEW_TITLES[catKey] || 'Đơn hàng'}`;
  body.innerHTML = renderSyncLoadingHtml('Đang cập nhật bảng giá từ Zn...');
  overlay.style.display = 'flex';

  // ALWAYS sync ONLY the exact category being opened (2-3 tiny API calls, < 2s typical, hard 6.5s ceiling < 7s!)
  const targetScope =
    presetOptions?.category === 'fruit_by_fruit' || presetOptions?.fruitOrderType === 'by_fruit'
      ? 'fruit_by_fruit'
      : catKey;
  await loadCatalog(true, targetScope, 6500);
  if (mySeq !== createOrderModalSeq || overlay.style.display === 'none' || !state.user) return;

  const r = state.catalogData;
  if (!r || state.catalogWarning) {
    body.innerHTML = `
      <div class="sync-loading-screen" style="padding:28px 16px;">
        <div style="color:#fda4af;">${znIcon('alert', 30)}</div>
        <div class="sync-loading-title" style="color:#fda4af;">Không thể cập nhật bảng giá mới nhất từ Server Zn</div>
        <div class="sync-loading-sub">${escapeHtml(state.catalogWarning || 'Server Zn tạm thời không phản hồi. Để tránh sai giá, vui lòng thử cập nhật lại trước khi đặt đơn.')}</div>
        <button type="button" class="btn-violet" id="btnRetryModalCatalogSync">${znIcon('refresh', 14)} <span>Thử cập nhật lại</span></button>
      </div>
    `;
    body.querySelector('#btnRetryModalCatalogSync')?.addEventListener('click', () => openCreateOrderModal(catKey, presetOptions));
    return;
  }

  state.modalOrder.category = presetOptions?.category || (catKey === 'fruit_coin' ? 'fruit_coin' : catKey);
  state.modalOrder.requestKey = null;
  state.modalOrder.requestSignature = null;
  state.modalOrder.quotedPrice = 0;
  state.modalOrder.fruitOrderType = presetOptions?.fruitOrderType || 'by_coin';
  if (presetOptions?.fruit_item_id) state.modalOrder.fruit_item_id = Number(presetOptions.fruit_item_id);

  const cat = r.catalog || {};
  if (cat.fruit_coin?.length && !cat.fruit_coin.some(p => Number(p.id) === Number(state.modalOrder.coin_price_package_id))) {
    state.modalOrder.coin_price_package_id = cat.fruit_coin[0].id;
  }
  if (cat.buff_tim?.length && catKey === 'buff_tim') {
    state.modalOrder.price_package_id = cat.buff_tim[0].id;
  } else if (cat.buff_sao?.length && catKey === 'buff_sao') {
    state.modalOrder.price_package_id = cat.buff_sao[0].id;
  } else if (cat.guestbook?.length && catKey === 'guestbook') {
    state.modalOrder.price_package_id = cat.guestbook[0].id;
  } else if (cat.weather_buff?.length && catKey === 'weather_buff') {
    state.modalOrder.price_package_id = cat.weather_buff[0].id;
  } else if (catKey === 'mail_gift' && cat.mail_gift?.length) {
    state.modalOrder.gift_id = cat.mail_gift[0].id;
    state.modalOrder.gift_plant_id = cat.mail_gift[0].packages?.[0]?.id || null;
  } else if (catKey === 'farm_gift' && cat.farm_gift?.length) {
    state.modalOrder.gift_id = cat.farm_gift[0].id;
    state.modalOrder.gift_plant_id = cat.farm_gift[0].packages?.[0]?.id || null;
  }

  renderCreateOrderModalBody();
  if (state.modalOrder.category === 'fruit_by_fruit') triggerModalFruitPreview();
}

function renderCreateOrderModalBody() {
  const body = document.getElementById('appModalBody');
  const r = state.catalogData;
  if (!body || !r) return;

  const catKey = state.modalOrder.category;
  const isWorking = !!(r.systemStatus?.[catKey]);
  const cust = state.modalOrder.customer;

  // Build Category Specific Form Controls
  let categoryFormHtml = '';
  const catalog = r.catalog || {};

  if (catKey === 'fruit_coin' || catKey === 'fruit_by_fruit') {
    const isByCoin = state.modalOrder.fruitOrderType === 'by_coin';
    const coinPkgs = catalog.fruit_coin || [];
    const tiers = r.coinTiers || [];
    const fruits = catalog.fruit_by_fruit || [];
    const curFruit = fruits.find((f) => Number(f.id) === Number(state.modalOrder.fruit_item_id)) || fruits[0];
    const availMuts = curFruit?.mutation_prices || [];

    categoryFormHtml = `
      <div>
        <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Hình thức đặt đơn Trái cây:</label>
        <div class="order-mode-options">
          <button type="button" class="btn-frost ${isByCoin ? 'is-active' : ''}" id="modalTabByCoin" style="flex:1;">
            ${znIcon('coins', 14)} <span>Gửi Xu Nông Trại (Theo Gói)</span>
          </button>
          <button type="button" class="btn-frost ${!isByCoin ? 'is-active' : ''}" id="modalTabByFruit" style="flex:1;">
            ${znIcon('fruit', 14)} <span>Gửi Trái Cây (Theo Số Lượng &amp; Đột Biến)</span>
          </button>
        </div>
      </div>

      ${isByCoin
        ? `
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Chọn gói số lượng Xu:</label>
          <div class="pkg-picker-list">
            ${coinPkgs.slice(0, pageLimit('modalPackages'))
          .map((p) => {
            const isSel = Number(state.modalOrder.coin_price_package_id) === Number(p.id);
            const tObj = p.prices_by_tier?.[state.modalOrder.min_coin_filter] || p;
            return `
                  <button type="button" aria-pressed="${isSel}" class="pkg-picker-card ${isSel ? 'is-selected' : ''}" data-modal-coin-pkg="${p.id}">
                    <span style="display:flex;justify-content:space-between;align-items:center;">
                      <strong style="color:#fff;font-size:14px;">${formatNum(p.coin_quantity || p.quantity)} Xu</strong>
                      ${p.is_on_sale ? `<span class="badge-tag amber">Giảm giá</span>` : ''}
                    </span>
                    <span style="display:flex;align-items:baseline;gap:8px;">
                      <span style="font-weight:700;color:#5eead4;font-size:15px;">${formatVnd(tObj.total_price)}</span>
                      ${p.is_on_sale ? `<span style="text-decoration:line-through;font-size:11px;color:var(--color-fog-veil);">${formatVnd(tObj.original_price)}</span>` : ''}
                    </span>
                  </button>
                `;
          })
          .join('')}${moreButton('modalPackages', coinPkgs.length)}
          </div>
        </div>
        <div style="min-width:0;max-width:100%;">
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Lọc giá trị trái tối thiểu:</label>
          <select id="modalCoinTierSelect" class="input-box">
            ${tiers
          .map(
            (t) => `
              <option value="${t.min_coin}" ${Number(state.modalOrder.min_coin_filter) === Number(t.min_coin) ? 'selected' : ''}>
                Trái ≥ ${formatNum(t.min_coin)} Xu ${t.markup_percent > 0 ? `(+${t.markup_percent}%)` : '(Mặc định)'} · Kho: ${formatNum(t.quantity)} Xu
              </option>
            `
          )
          .join('')}
          </select>
        </div>
      `
        : `
        <div class="fruit-order-fields">
          <div>
            <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Chọn loại trái cây (${fruits.length} loại):</label>
            <select id="modalFruitItemSelect" class="input-box">
              ${fruits
          .map(
            (f) => `
                <option value="${f.id}" ${Number(f.id) === Number(curFruit?.id) ? 'selected' : ''}>
                  ${escapeHtml(f.name)} — Đơn giá: ${formatVnd(f.unit_price)}/trái (Kho: ${formatNum(f.stock_quantity)})
                </option>
              `
          )
          .join('')}
            </select>
          </div>
          <div>
            <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Số lượng trái:</label>
            <input type="number" id="modalFruitQtyInput" class="input-box" min="1" max="1500" value="${state.modalOrder.fruit_total_cnt}" />
          </div>
        </div>

        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Chế độ đột biến:</label>
          <div class="order-mode-options">
            <button type="button" class="btn-frost ${state.modalOrder.fruit_variant_mode === 'regular' ? 'is-active' : ''}" id="modalFruitModeReg" style="flex:1;">
              Chỉ trái thường
            </button>
            <button type="button" class="btn-frost ${state.modalOrder.fruit_variant_mode === 'specify' ? 'is-active' : ''}" id="modalFruitModeSpec" style="flex:1;">
              Chọn hệ đột biến (${state.modalOrder.fruit_mutation_list.length})
            </button>
          </div>
        </div>

        ${state.modalOrder.fruit_variant_mode === 'specify'
          ? `
          <div class="mutation-grid">
            ${availMuts
            .map((m) => {
              const isSel = state.modalOrder.fruit_mutation_list.includes(Number(m.mutation_key));
              return `
                  <button type="button" class="mutation-tile ${isSel ? 'is-selected' : ''}" data-modal-mut="${m.mutation_key}">
                    <span style="display:inline-flex;align-items:center;gap:6px;">
                      <span style="width:8px;height:8px;border-radius:999px;background:${m.mutation_color};"></span>
                      <span>${escapeHtml(m.mutation_name)}</span>
                    </span>
                    <span style="font-size:11px;color:#fbbf24;">${formatVnd(m.unit_price)}</span>
                  </button>
                `;
            })
            .join('')}
          </div>
        `
          : ''
        }
      `
      }
    `;
  } else if (catKey === 'buff_tim' || catKey === 'buff_sao' || catKey === 'guestbook' || catKey === 'weather_buff') {
    const pkgs = catalog[catKey] || [];
    const unitTxt = catKey === 'buff_tim' ? 'Tim' : catKey === 'buff_sao' ? 'Sao' : catKey === 'weather_buff' ? 'Lần' : 'Bài viết';

    categoryFormHtml = `
      <div>
        <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Chọn gói số lượng${catKey === 'weather_buff' ? ' (Buff Thời Tiết)' : ''}:</label>
        ${pkgs.length === 0
        ? `<div style="padding:14px;background:rgba(228,109,76,0.14);border-radius:8px;color:#fca5a5;">Hiện chưa có gói giá đang mở cho danh mục này.</div>`
        : `
          <div class="pkg-picker-list">
            ${pkgs.slice(0, pageLimit('modalPackages'))
          .map((p) => {
            const isSel = Number(state.modalOrder.price_package_id) === Number(p.id);
            return `
                  <button type="button" aria-pressed="${isSel}" class="pkg-picker-card ${isSel ? 'is-selected' : ''}" data-modal-std-pkg="${p.id}">
                    <span style="display:flex;justify-content:space-between;align-items:center;">
                      <strong style="color:#fff;font-size:14px;">${catKey === 'weather_buff' ? `${znIcon('cloud', 14)} ` : ''}${formatNum(p.quantity)} ${unitTxt}</strong>
                      ${p.is_on_sale && p.sale ? `<span class="badge-tag amber">Còn ${p.sale.slots_remaining} suất</span>` : ''}
                    </span>
                    <span style="display:flex;align-items:baseline;gap:8px;">
                      <span style="font-weight:700;color:#5eead4;font-size:15px;">${formatVnd(p.total_price)}</span>
                      ${p.is_on_sale ? `<span style="text-decoration:line-through;font-size:11px;color:var(--color-fog-veil);">${formatVnd(p.original_price)}</span>` : ''}
                    </span>
                  </button>
                `;
          })
          .join('')}${moreButton('modalPackages', pkgs.length)}
          </div>
        `
      }
      </div>
      ${catKey === 'guestbook'
        ? `
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Nội dung bài viết lưu bút (*):</label>
          <input type="text" id="modalGuestbookMsgInput" class="input-box" maxlength="100" value="${escapeHtml(state.modalOrder.guest_book_message)}" placeholder="Nhập lời nhắn lưu bút..." />
        </div>
      `
        : ''
      }
    `;
  } else if (catKey === 'farm_gift' || catKey === 'mail_gift') {
    const gifts = catalog[catKey] || [];
    if (gifts.length === 0) {
      categoryFormHtml = `
        <div style="padding:16px;background:rgba(228,109,76,0.14);border-radius:10px;color:#fca5a5;">
          Hiện tại danh mục <strong>${escapeHtml(VIEW_TITLES[catKey])}</strong> không có vật phẩm nào đang mở bán trên máy chủ.
        </div>
      `;
    } else {
      const curGift = gifts.find((g) => Number(g.id) === Number(state.modalOrder.gift_id)) || gifts[0];
      const pkgs = curGift?.packages || [];
      categoryFormHtml = `
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Chọn quà tặng:</label>
          <select id="modalGiftSelect" class="input-box">
            ${gifts
          .map(
            (g) => `<option value="${g.id}" ${Number(g.id) === Number(curGift?.id) ? 'selected' : ''}>${escapeHtml(g.name)}</option>`
          )
          .join('')}
          </select>
        </div>
        <div class="pkg-picker-list">
          ${pkgs.slice(0, pageLimit('modalPackages'))
          .map((p) => {
            const isSel = Number(state.modalOrder.gift_plant_id) === Number(p.id);
            return `
                <div class="pkg-picker-card ${isSel ? 'is-selected' : ''}" data-modal-gift-pkg="${p.id}">
                  <strong style="color:#fff;">Số lượng: ${formatNum(p.quantity)}</strong>
                  <span style="font-weight:700;color:#5eead4;">${formatVnd(p.total_price)}</span>
                </div>
              `;
          })
          .join('')}${moreButton('modalPackages', pkgs.length)}
        </div>
      `;
    }
  } else {
    categoryFormHtml = `
      <div style="padding:16px;background:rgba(228,109,76,0.14);border-radius:10px;color:#fca5a5;">
        Danh mục này hiện đang tạm ngưng nhận đơn mới.
      </div>
    `;
  }

  body.innerHTML = `
    ${!isWorking
      ? `
      <div style="padding:12px 14px;background:rgba(136,19,55,0.25);border-radius:8px;color:#fda4af;font-size:13px;display:flex;align-items:center;gap:8px;">
        ${znIcon('alert', 16)} <span>Hệ thống chạy đơn <strong>${escapeHtml(VIEW_TITLES[catKey])}</strong> hiện đang ở trạng thái <strong>Không hoạt động</strong> trên Server Zn.</span>
      </div>
    `
      : ''
    }

    ${catKey === 'weather_buff'
      ? `
      <div style="padding:11px 14px;background:var(--color-liquid-deep);border-radius:10px;border:1px solid rgba(203,255,252,0.2);color:var(--color-liquid-mist);font-size:12.5px;line-height:1.55;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">${znIcon('cloud', 15)} <strong>Quy tắc Buff Thời Tiết:</strong></div>
        Chọn gói số lần và bấm <strong>Xác Nhận</strong> để tạo đơn trước (chưa cần chọn khách ngay lúc này). Sau khi tạo xong, bấm <strong>Gán khách</strong> và <strong>Chọn thời tiết</strong> trên bảng đơn rồi bật chạy!
        <div style="margin-top:6px;color:#fde68a;font-weight:500;">Lưu ý: Đơn chưa hoàn thành, tạo quá 3 tiếng thì không xóa được. Hãy cân nhắc trước khi lên đơn vì Quản trị viên chỉ hỗ trợ hoàn trong trường hợp trục trặc do hệ thống.</div>
      </div>
    `
      : `
      <div style="background:var(--color-liquid-deep);padding:14px;border-radius:12px;box-shadow:var(--shadow-subtle);display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <strong style="color:#fff;font-size:13px;">1. Chọn khách hàng Play Together</strong>
          <div class="action-row">
            <button type="button" class="btn-frost ${state.modalOrder.customerTab === 'ingame' ? 'is-active' : ''}" data-mcust-tab="ingame" style="padding:4px 10px;font-size:11px;">
              Tìm theo Tên (Trong Game)
            </button>
            <button type="button" class="btn-frost ${state.modalOrder.customerTab === 'roleid' ? 'is-active' : ''}" data-mcust-tab="roleid" style="padding:4px 10px;font-size:11px;">
              Theo mã ID nhân vật
            </button>
            ${state.user.role === 'admin' ? `<button type="button" class="btn-frost ${state.modalOrder.customerTab === 'saved' ? 'is-active' : ''}" data-mcust-tab="saved" style="padding:4px 10px;font-size:11px;">
              Khách đã lưu
            </button>` : ''}
          </div>
        </div>

        ${cust
        ? `
          <div class="detail-row" style="display:flex;align-items:center;justify-content:space-between;background:rgba(0,130,124,0.22);padding:10px 14px;border-radius:8px;box-shadow:rgba(203,255,252,0.38) 0 0 0 1px inset;">
            <div>
              <div style="font-weight:600;color:#fff;font-size:14px;display:inline-flex;align-items:center;gap:6px;">${znIcon('check', 14)} <span>${escapeHtml(cust.nickname)}</span></div>
              <div style="font-size:11px;color:var(--color-moon-mist);">SUID: ${escapeHtml(cust.suid || '—')} ${cust.region ? `· ${escapeHtml(cust.region)}` : ''}</div>
            </div>
            <button type="button" class="btn-frost" id="btnModalClearCust" style="padding:4px 10px;font-size:11px;">Đổi khách</button>
          </div>
        `
        : `
          <div class="inline-search-row">
            <input
              type="text"
              id="modalCustSearchInput"
              class="input-box"
              placeholder="${state.modalOrder.customerTab === 'ingame'
          ? 'Nhập tên nhân vật cần tìm trong game...'
          : state.modalOrder.customerTab === 'roleid'
            ? 'Nhập mã ID nhân vật (XXXX-XXXX-XXXX)...'
            : 'Nhập tên hoặc SUID khách quen...'
        }"
            />
            <button type="button" class="btn-violet" id="btnModalSearchCust">Tìm</button>
          </div>
          <div id="modalCustSearchStatus" style="font-size:12px;color:var(--color-fog-veil);"></div>
          <div id="modalCustSearchResults" style="display:flex;flex-direction:column;gap:6px;max-height:190px;overflow-y:auto;overflow-x:hidden;"></div>
        `
      }
      </div>
    `
    }

    <div style="display:flex;flex-direction:column;gap:12px;min-width:0;max-width:100%;">
      ${categoryFormHtml}
    </div>

    <div style="background:var(--color-liquid-deep);padding:14px 16px;border-radius:10px;box-shadow:var(--shadow-subtle);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;min-width:0;max-width:100%;">
      <div>
        <div style="font-size:12px;color:var(--color-moon-mist);">Tổng tiền thanh toán:</div>
        <div style="font-size:22px;font-weight:500;letter-spacing:-0.025em;color:var(--color-lavender-phosphor);font-variant-numeric:tabular-nums;" id="modalTotalPriceText">0đ</div>
      </div>
      <div class="action-row order-submit-actions">
        <button type="button" class="btn-frost" id="btnModalCancel" style="white-space:nowrap;">Hủy</button>
        <button type="button" class="btn-violet" id="btnModalSaveOrder" ${!isWorking ? 'disabled' : ''}>
          ${catKey === 'weather_buff' ? 'Xác Nhận Tạo Gói →' : 'Lưu & Chạy Đơn Hàng →'}
        </button>
      </div>
    </div>
  `;

  bindCreateOrderModalEvents();
  updateCreateOrderModalPrice();
}

function bindCreateOrderModalEvents() {
  const body = document.getElementById('appModalBody');
  if (!body) return;

  body.querySelectorAll('[data-mcust-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.modalOrder.customerTab = btn.dataset.mcustTab;
      renderCreateOrderModalBody();
      if (state.modalOrder.customerTab === 'saved') {
        runModalCustomerSearch();
      }
    });
  });

  body.querySelector('#btnModalClearCust')?.addEventListener('click', () => {
    state.modalOrder.customer = null;
    renderCreateOrderModalBody();
  });

  body.querySelector('#btnModalSearchCust')?.addEventListener('click', runModalCustomerSearch);
  body.querySelector('#modalCustSearchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runModalCustomerSearch();
    }
  });

  // Fruit Order Type Tabs (by_coin vs by_fruit) — ALWAYS sync live under 6.5s so prices are 100% up-to-date
  body.querySelector('#modalTabByCoin')?.addEventListener('click', async () => {
    if (state.modalOrder.fruitOrderType === 'by_coin') return;
    state.modalOrder.fruitOrderType = 'by_coin';
    state.modalOrder.category = 'fruit_coin';
    body.innerHTML = renderSyncLoadingHtml('Đang cập nhật bảng giá Xu từ Zn...', 'Đang lấy gói xu & giá mới nhất.');
    await loadCatalog(true, 'fruit_coin', 6500);
    const overlay = document.getElementById('appModalOverlay');
    if (!overlay || overlay.style.display === 'none' || state.modalOrder.fruitOrderType !== 'by_coin') return;
    renderCreateOrderModalBody();
  });
  body.querySelector('#modalTabByFruit')?.addEventListener('click', async () => {
    if (state.modalOrder.fruitOrderType === 'by_fruit') return;
    state.modalOrder.fruitOrderType = 'by_fruit';
    state.modalOrder.category = 'fruit_by_fruit';
    body.innerHTML = renderSyncLoadingHtml('Đang cập nhật bảng giá Trái cây từ Zn...', 'Đang lấy tồn kho & đơn giá trái cây mới nhất.');
    await loadCatalog(true, 'fruit_by_fruit', 6500);
    const overlay = document.getElementById('appModalOverlay');
    if (!overlay || overlay.style.display === 'none' || state.modalOrder.fruitOrderType !== 'by_fruit') return;
    renderCreateOrderModalBody();
    triggerModalFruitPreview();
  });

  // Coin Package & Tier selection
  body.querySelectorAll('[data-modal-coin-pkg]').forEach((card) => {
    card.addEventListener('click', () => {
      state.modalOrder.coin_price_package_id = Number(card.dataset.modalCoinPkg);
      renderCreateOrderModalBody();
    });
  });
  body.querySelector('#modalCoinTierSelect')?.addEventListener('change', (e) => {
    state.modalOrder.min_coin_filter = Number(e.target.value);
    renderCreateOrderModalBody();
  });

  // By Fruit controls
  body.querySelector('#modalFruitItemSelect')?.addEventListener('change', (e) => {
    state.modalOrder.fruit_item_id = Number(e.target.value);
    state.modalOrder.fruit_mutation_list = [];
    renderCreateOrderModalBody();
    triggerModalFruitPreview();
  });
  body.querySelector('#modalFruitQtyInput')?.addEventListener('input', (e) => {
    state.modalOrder.fruit_total_cnt = Math.max(1, Number(e.target.value || 1));
    triggerModalFruitPreview();
  });
  body.querySelector('#modalFruitModeReg')?.addEventListener('click', () => {
    state.modalOrder.fruit_variant_mode = 'regular';
    state.modalOrder.fruit_mutation_list = [];
    renderCreateOrderModalBody();
    triggerModalFruitPreview();
  });
  body.querySelector('#modalFruitModeSpec')?.addEventListener('click', () => {
    state.modalOrder.fruit_variant_mode = 'specify';
    renderCreateOrderModalBody();
    triggerModalFruitPreview();
  });
  body.querySelectorAll('[data-modal-mut]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = Number(btn.dataset.modalMut);
      const idx = state.modalOrder.fruit_mutation_list.indexOf(k);
      if (idx >= 0) state.modalOrder.fruit_mutation_list.splice(idx, 1);
      else state.modalOrder.fruit_mutation_list.push(k);
      renderCreateOrderModalBody();
      triggerModalFruitPreview();
    });
  });

  // Standard packages (Buff Tim, Buff Sao, Guestbook)
  body.querySelectorAll('[data-modal-std-pkg]').forEach((card) => {
    card.addEventListener('click', () => {
      state.modalOrder.price_package_id = Number(card.dataset.modalStdPkg);
      renderCreateOrderModalBody();
    });
  });
  body.querySelector('#modalGuestbookMsgInput')?.addEventListener('input', (e) => {
    state.modalOrder.guest_book_message = e.target.value;
  });

  // Gift packages
  body.querySelector('#modalGiftSelect')?.addEventListener('change', (e) => {
    const gid = Number(e.target.value);
    state.modalOrder.gift_id = gid;
    const gList = state.catalogData?.catalog?.[state.modalOrder.category] || [];
    const gObj = gList.find((x) => Number(x.id) === gid);
    state.modalOrder.gift_plant_id = gObj?.packages?.[0]?.id || null;
    renderCreateOrderModalBody();
  });
  body.querySelectorAll('[data-modal-gift-pkg]').forEach((card) => {
    card.addEventListener('click', () => {
      state.modalOrder.gift_plant_id = Number(card.dataset.modalGiftPkg);
      renderCreateOrderModalBody();
    });
  });

  body.querySelector('#btnModalCancel')?.addEventListener('click', () => {
    document.getElementById('appModalOverlay').style.display = 'none';
  });
  body.querySelector('#btnModalSaveOrder')?.addEventListener('click', () => {
    submitModalOrder(false);
  });
}

function estimateFruitOrderPriceLocally(fruitItem, qty, muts) {
  if (!fruitItem) return 0;
  const base = Number(fruitItem.unit_price || 0);
  const cleanQty = Math.max(1, Math.floor(Number(qty || 1)));
  if (!muts || muts.length === 0) return cleanQty * base;
  let sumMut = 0;
  for (const mk of muts) {
    const m = (fruitItem.mutation_prices || []).find(x => Number(x.mutation_key) === Number(mk));
    sumMut += m ? Number(m.unit_price || base) : base;
  }
  const combined = Math.max(base, sumMut - (muts.length - 1) * base);
  return cleanQty * combined;
}

let modalPreviewTimer = null;
function triggerModalFruitPreview() {
  if (modalPreviewTimer && typeof clearTimeout === 'function') clearTimeout(modalPreviewTimer);
  state.modalOrder.fruit_preview_price = 0;
  state.modalOrder.quotedPrice = 0;
  const muts = state.modalOrder.fruit_variant_mode === 'specify' ? state.modalOrder.fruit_mutation_list : [];
  const signature = JSON.stringify([state.modalOrder.fruit_item_id, state.modalOrder.fruit_total_cnt, state.modalOrder.fruit_variant_mode, state.modalOrder.fruit_mutation_list]);
  const priceEl = document.getElementById('modalTotalPriceText');
  const fi = (state.catalogData?.catalog?.fruit_by_fruit || []).find(f => Number(f.id) === Number(state.modalOrder.fruit_item_id));
  const localEst = estimateFruitOrderPriceLocally(fi, state.modalOrder.fruit_total_cnt, muts);
  if (priceEl) priceEl.textContent = localEst > 0 ? `~${formatVnd(localEst)}` : 'Đang tính...';

  modalPreviewTimer = setTimeout(async () => {
    try {
      const r = await apiFetch('/api/catalog/preview-fruit', 'POST', {
        fruit_item_id: state.modalOrder.fruit_item_id,
        total_cnt: state.modalOrder.fruit_total_cnt,
        mutation_list: muts,
      });
      const currentSignature = JSON.stringify([state.modalOrder.fruit_item_id, state.modalOrder.fruit_total_cnt, state.modalOrder.fruit_variant_mode, state.modalOrder.fruit_mutation_list]);
      if (r.success && r.data && signature === currentSignature) {
        state.modalOrder.fruit_preview_price = r.data.total_price;
        state.modalOrder.fruit_preview_admin = r.data._admin || null;
        updateCreateOrderModalPrice();
      }
    } catch {
      if (priceEl) priceEl.textContent = 'Lỗi tính giá';
    }
  }, 150);
}

function updateCreateOrderModalPrice() {
  const priceEl = document.getElementById('modalTotalPriceText');
  if (!priceEl || !state.catalogData) return;

  const cat = state.modalOrder.category;
  const catalog = state.catalogData.catalog || {};
  let price = 0;

  if (cat === 'fruit_coin') {
    const pkg = (catalog.fruit_coin || []).find(
      (p) => Number(p.id) === Number(state.modalOrder.coin_price_package_id)
    );
    const tObj = pkg?.prices_by_tier?.[state.modalOrder.min_coin_filter] || pkg;
    price = tObj?.total_price || 0;
  } else if (cat === 'fruit_by_fruit') {
    price = state.modalOrder.fruit_preview_price || 0;
  } else if (cat === 'buff_tim' || cat === 'buff_sao' || cat === 'guestbook' || cat === 'weather_buff') {
    const pkg = (catalog[cat] || []).find((p) => Number(p.id) === Number(state.modalOrder.price_package_id));
    price = pkg?.total_price || 0;
  } else if (cat === 'farm_gift' || cat === 'mail_gift') {
    const gObj = (catalog[cat] || []).find((g) => Number(g.id) === Number(state.modalOrder.gift_id));
    const pObj = (gObj?.packages || []).find((p) => Number(p.id) === Number(state.modalOrder.gift_plant_id));
    price = pObj?.total_price || 0;
  }

  priceEl.textContent = formatVnd(price);
  state.modalOrder.quotedPrice = Number(price);
}

async function runModalCustomerSearch() {
  const input = document.getElementById('modalCustSearchInput');
  const statusEl = document.getElementById('modalCustSearchStatus');
  const resultsEl = document.getElementById('modalCustSearchResults');
  if (!statusEl || !resultsEl) return;

  const q = String(input?.value || '').trim();
  const mode = state.modalOrder.customerTab;

  if (mode === 'ingame') {
    if (!q) {
      showToast('Vui lòng nhập tên nhân vật cần tìm.');
      return;
    }
    statusEl.textContent = 'Đang kết nối Server Zn tìm nhân vật...';
    resultsEl.innerHTML = '';
    try {
      const r = await apiFetch('/api/customer/search-ingame', 'POST', { nickname: q });
      const list = r.profiles || [];
      statusEl.textContent = `Tìm thấy ${list.length} kết quả:`;
      renderLocalPages(resultsEl, list, visible => {
        resultsEl.innerHTML = visible
          .map(
            (p, i) => `
            <div class="detail-row" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:8px;">
              <div>
                <strong style="color:#fff;">${escapeHtml(p.Nickname)}</strong>
                <span class="badge-tag violet" style="margin-left:6px;">${escapeHtml(p.RegionName || p.Region || 'VN')}</span>
                <div style="font-size:11px;color:var(--color-fog-veil);">SUID: ${escapeHtml(p.suid)}${p.Online_Status ? ` · ${escapeHtml(formatOnlineStatusVi(p.Online_Status))}` : ''}</div>
              </div>
              <button type="button" class="btn-violet" style="padding:5px 12px;font-size:11px;" data-pick-ingame="${i}">Chọn</button>
            </div>
          `
          )
          .join('');

        resultsEl.querySelectorAll('[data-pick-ingame]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const prof = list[Number(btn.dataset.pickIngame)];
            btn.disabled = true;
            btn.textContent = 'Đang lưu...';
            try {
              const sel = await apiFetch('/api/customer/select-ingame', 'POST', { profile: prof });
              if (sel.success && sel.customer) {
                state.modalOrder.customer = sel.customer;
                renderCreateOrderModalBody();
              }
            } catch (err) {
              showToast(err.message);
              btn.disabled = false;
              btn.textContent = 'Chọn';
            }
          });
        });
      });
    } catch (err) {
      statusEl.textContent = `Lỗi: ${err.message}`;
    }
  } else if (mode === 'roleid') {
    if (!q) {
      showToast('Vui lòng nhập mã ID nhân vật.');
      return;
    }
    statusEl.textContent = 'Đang kiểm tra mã ID nhân vật...';
    try {
      const r = await apiFetch('/api/customer/resolve-role-id', 'POST', { role_id: q });
      if (r.success && r.customer) {
        state.modalOrder.customer = r.customer;
        renderCreateOrderModalBody();
      }
    } catch (err) {
      statusEl.textContent = `Lỗi: ${err.message}`;
    }
  } else if (mode === 'saved') {
    statusEl.textContent = 'Đang tải danh sách khách hàng...';
    try {
      const r = await apiFetch(`/api/customer/saved?q=${encodeURIComponent(q)}`);
      const list = r.customers || [];
      statusEl.textContent = `Hiển thị ${list.length} khách hàng:`;
      renderLocalPages(resultsEl, list, visible => {
        resultsEl.innerHTML = visible
          .map(
            (c) => `
            <div class="detail-row" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:8px;">
              <div>
                <strong style="color:#fff;">${escapeHtml(c.nickname || `Khách #${c.id}`)}</strong>
                <div style="font-size:11px;color:var(--color-fog-veil);">SUID: ${escapeHtml(c.suid || '—')}</div>
              </div>
              <button type="button" class="btn-violet" style="padding:5px 12px;font-size:11px;" data-pick-saved="${c.id}">Chọn</button>
            </div>
          `
          )
          .join('');

        resultsEl.querySelectorAll('[data-pick-saved]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
              const det = await apiFetch(`/api/customer/saved/${btn.dataset.pickSaved}`);
              if (det.success && det.customer) {
                state.modalOrder.customer = det.customer;
                renderCreateOrderModalBody();
              }
            } catch (err) {
              showToast(err.message);
              btn.disabled = false;
            }
          });
        });
      });
    } catch (err) {
      statusEl.textContent = `Lỗi: ${err.message}`;
    }
  }
}

async function submitModalOrder(confirmDuplicate = false) {
  const m = state.modalOrder;
  const isWeather = m.category === 'weather_buff';
  if (!isWeather && !m.customer?.customerId) {
    showToast('Vui lòng tìm và chọn khách hàng trước khi lưu đơn!');
    return;
  }
  if (!Number.isSafeInteger(m.quotedPrice) || m.quotedPrice <= 0) {
    showToast('Vui lòng đợi giá hợp lệ trước khi đặt đơn.');
    return;
  }

  const payload = {
    category: m.category,
    customer_id: isWeather ? null : m.customer.customerId,
    game_profile_id: isWeather ? null : m.customer.gameProfileId,
    customer_snapshot: isWeather ? null : m.customer,
    confirm_duplicate_customer: confirmDuplicate,
    expected_price: m.quotedPrice,
  };

  if (m.category === 'fruit_coin') {
    payload.coin_price_package_id = m.coin_price_package_id;
    payload.min_coin_filter = m.min_coin_filter;
  } else if (m.category === 'fruit_by_fruit') {
    payload.fruit_item_id = m.fruit_item_id;
    payload.total_cnt = m.fruit_total_cnt;
    payload.variant_mode = 'select';
    payload.mutation_list = m.fruit_variant_mode === 'specify' ? m.fruit_mutation_list : [];
  } else if (m.category === 'buff_tim' || m.category === 'buff_sao' || m.category === 'guestbook' || m.category === 'weather_buff') {
    payload.price_package_id = m.price_package_id;
    payload.expect_sale = true;
    if (m.category === 'guestbook') {
      payload.guest_book_message = m.guest_book_message;
    }
  } else if (m.category === 'farm_gift' || m.category === 'mail_gift') {
    payload.gift_id = m.gift_id;
    payload.gift_plant_id = m.gift_plant_id;
    payload.message = m.mail_message;
    payload.expect_sale = true;
  }

  const btn = document.getElementById('btnModalSaveOrder');
  const signature = JSON.stringify(payload);
  if (m.requestSignature !== signature) {
    m.requestSignature = signature;
    m.requestKey = createRequestKey();
  }
  payload.idempotency_key = m.requestKey;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang xác thực giá & gửi đơn...';
  }

  try {
    const r = await apiFetch('/api/orders/place', 'POST', payload);
    if (r.needs_confirmation && r.code === 'duplicate_customer') {
      if (
        confirm(
          `Khách hàng "${m.customer.nickname}" hiện đang có đơn hàng đang chạy. Bạn có chắc chắn muốn tạo thêm đơn mới không?`
        )
      ) {
        await submitModalOrder(true);
      } else if (btn) {
        btn.disabled = false;
        btn.textContent = isWeather ? 'Xác Nhận Tạo Gói →' : 'Lưu & Chạy Đơn Hàng →';
      }
      return;
    }

    if (r.success) {
      showToast(r.message || 'Tạo đơn hàng thành công!');
      if (r.userBalance !== undefined && state.user) {
        state.user.balance = r.userBalance;
        if (r.userBackupBalance !== undefined) state.user.backupBalance = r.userBackupBalance;
        updateShellAuthUI();
      }
      const wbUrl = isWeather ? r.order?.weather?.trackUrl : '';
      if (isWeather && wbUrl) {
        const title = document.getElementById('appModalTitle');
        const body = document.getElementById('appModalBody');
        if (title) title.textContent = `Đã tạo đơn Buff Thời Tiết #${r.order?.remoteOrderId || ''}`;
        if (body) {
          body.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:12px;">
              <div style="font-size:13px;color:var(--color-moon-mist);line-height:1.6;">
                Đơn gói <strong>${formatNum(r.order?.totalCnt || 0)} lần</strong> đã tạo thành công! Gửi liên kết theo dõi bên dưới cho khách tự chọn nhân vật &amp; thời tiết, hoặc chỉnh trực tiếp trên bảng đơn:
              </div>
              <div class="inline-search-row">
                <input type="text" class="input-box" id="createdWbLinkInput" readonly value="${escapeHtml(wbUrl)}" />
                <button type="button" class="btn-violet" id="btnCopyCreatedWbLink" style="white-space:nowrap;">${znIcon('copy', 13)} <span>Sao chép liên kết</span></button>
              </div>
              <div class="action-row align-end">
                <a href="${escapeHtml(wbUrl)}" target="_blank" rel="noopener noreferrer" class="btn-frost" style="text-decoration:none;">${znIcon('external', 13)} <span>Mở liên kết</span></a>
                <button type="button" class="btn-violet" id="btnDoneCreatedWb">Xong</button>
              </div>
            </div>
          `;
          body.querySelector('#btnCopyCreatedWbLink')?.addEventListener('click', async (ev) => {
            const ok = await copyTextToClipboard(wbUrl);
            if (ok) {
              showToast('Đã sao chép liên kết theo dõi thời tiết!');
              ev.currentTarget.innerHTML = `${znIcon('check', 13)} <span>Đã sao chép</span>`;
            }
          });
          body.querySelector('#btnDoneCreatedWb')?.addEventListener('click', () => {
            document.getElementById('appModalOverlay').style.display = 'none';
          });
        }
      } else {
        document.getElementById('appModalOverlay').style.display = 'none';
      }
      await loadOrders(true);
      renderCurrentView();
    }
  } catch (err) {
    showToast(err.message);
    if (err.code === 'PRICE_CHANGED') {
      await loadCatalog(true, m.category, 6500);
      if (m.category === 'fruit_by_fruit') triggerModalFruitPreview();
      else renderCreateOrderModalBody();
    }
    if (err.code === 'ORDER_REVIEW_REQUIRED') {
      const current = await apiFetch('/api/auth/me').catch(() => null);
      if (current?.user) { state.user = current.user; updateShellAuthUI(); }
      if (btn) { btn.disabled = true; btn.textContent = 'Chờ admin đối soát'; }
    } else if (btn) {
      btn.disabled = false;
      btn.textContent = isWeather ? 'Xác Nhận Tạo Gói →' : 'Lưu & Chạy Đơn Hàng →';
    }
  }
}

// ============================================================================
// 2B. WEATHER BUFF MODALS: ASSIGN/CHANGE CUSTOMER SLOT & CONFIGURE WEATHERS
// ============================================================================
function openWeatherSlotModal(order) {
  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  let tab = 'ingame';
  const remId = order.remoteOrderId;
  const hasCust = Boolean(order.customer?.customerId || order.weather?.slots?.some(s => s.customer_id || s.customer));
  const canClear = hasCust && !order.weather?.remoteRef && !order.isActive && Number(order.completedCnt || 0) === 0;

  box.className = 'modal-box';
  title.textContent = `${hasCust ? 'Đổi khách hàng' : 'Gán khách hàng'} — Đơn Buff Thời Tiết #${remId}`;

  const renderSlotBody = () => {
    body.innerHTML = `
      ${hasCust
        ? `
        <div class="detail-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;background:rgba(0,130,124,0.2);border-radius:10px;border:1px solid rgba(203,255,252,0.3);">
          <div>
            <div style="font-size:11px;color:var(--color-moon-mist);">Khách hiện tại:</div>
            <div style="font-weight:600;color:#fff;">${escapeHtml(order.customer?.nickname || '—')} <span style="font-weight:400;font-size:11px;color:var(--color-fog-veil);">(SUID: ${escapeHtml(order.customer?.suid || '—')})</span></div>
          </div>
          ${canClear ? `<button type="button" class="btn-frost" id="btnWbClearSlot" style="color:#fca5a5;font-size:11px;padding:5px 10px;">${znIcon('trash', 12)} <span>Gỡ khách</span></button>` : ''}
        </div>
      `
        : ''
      }
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" class="btn-frost ${tab === 'ingame' ? 'is-active' : ''}" data-wb-cust-tab="ingame" style="padding:5px 11px;font-size:12px;">Tìm theo Tên (Trong Game)</button>
        <button type="button" class="btn-frost ${tab === 'roleid' ? 'is-active' : ''}" data-wb-cust-tab="roleid" style="padding:5px 11px;font-size:12px;">Theo mã ID nhân vật</button>
        ${state.user?.role === 'admin' ? `<button type="button" class="btn-frost ${tab === 'saved' ? 'is-active' : ''}" data-wb-cust-tab="saved" style="padding:5px 11px;font-size:12px;">Khách đã lưu</button>` : ''}
      </div>
      <div class="inline-search-row">
        <input type="text" id="wbCustSearchInput" class="input-box" placeholder="${tab === 'ingame' ? 'Nhập tên nhân vật trong game...' : tab === 'roleid' ? 'Nhập mã ID nhân vật (XXXX-XXXX-XXXX)...' : 'Nhập tên hoặc SUID khách quen...'}" />
        <button type="button" class="btn-violet" id="btnWbCustSearch">Tìm</button>
      </div>
      <div id="wbCustSearchStatus" style="font-size:12px;color:var(--color-fog-veil);"></div>
      <div id="wbCustSearchResults" style="display:flex;flex-direction:column;gap:6px;max-height:240px;overflow-y:auto;overflow-x:hidden;"></div>
    `;

    const assignCustomerId = async (customerId) => {
      const stEl = body.querySelector('#wbCustSearchStatus');
      if (stEl) stEl.textContent = 'Đang gán khách vào đơn Buff Thời Tiết...';
      try {
        const res = await apiFetch(`/api/orders/weather_buff/${encodeURIComponent(remId)}/slots/0`, 'PUT', {
          customer_id: Number(customerId),
        });
        showToast(res.message || 'Đã gán khách hàng thành công!');
        overlay.style.display = 'none';
        await loadOrders(true);
        renderCurrentView();
      } catch (err) {
        showToast(err.message);
        if (stEl) stEl.textContent = `Lỗi: ${err.message}`;
      }
    };

    const runSearch = async () => {
      const q = String(body.querySelector('#wbCustSearchInput')?.value || '').trim();
      const stEl = body.querySelector('#wbCustSearchStatus');
      const resEl = body.querySelector('#wbCustSearchResults');
      if (!stEl || !resEl) return;

      if (tab === 'ingame') {
        if (!q) { showToast('Vui lòng nhập tên nhân vật cần tìm.'); return; }
        stEl.textContent = 'Đang tìm nhân vật trong game...';
        resEl.innerHTML = '';
        try {
          const r = await apiFetch('/api/customer/search-ingame', 'POST', { nickname: q });
          const list = r.profiles || [];
          stEl.textContent = `Tìm thấy ${list.length} nhân vật:`;
          renderLocalPages(resEl, list, visible => {
            resEl.innerHTML = visible.map((p, i) => `
              <div class="detail-row" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:8px;">
                <div>
                  <strong style="color:#fff;">${escapeHtml(p.Nickname)}</strong>
                  <span class="badge-tag violet" style="margin-left:6px;">${escapeHtml(p.RegionName || p.Region || 'VN')}</span>
                  <div style="font-size:11px;color:var(--color-fog-veil);">SUID: ${escapeHtml(p.suid)}${p.Online_Status ? ` · ${escapeHtml(formatOnlineStatusVi(p.Online_Status))}` : ''}</div>
                </div>
                <button type="button" class="btn-violet" style="padding:5px 12px;font-size:11px;" data-wb-pick-ingame="${i}">Gán khách</button>
              </div>
            `).join('');
            resEl.querySelectorAll('[data-wb-pick-ingame]').forEach((b) => {
              b.addEventListener('click', async () => {
                const prof = list[Number(b.dataset.wbPickIngame)];
                b.disabled = true;
                b.textContent = 'Đang gán...';
                try {
                  const sel = await apiFetch('/api/customer/select-ingame', 'POST', { profile: prof });
                  if (sel.success && sel.customer?.customerId) {
                    await assignCustomerId(sel.customer.customerId);
                  }
                } catch (err) {
                  showToast(err.message);
                  b.disabled = false;
                  b.textContent = 'Gán khách';
                }
              });
            });
          });
        } catch (err) {
          stEl.textContent = `Lỗi: ${err.message}`;
        }
      } else if (tab === 'roleid') {
        if (!q) { showToast('Vui lòng nhập mã ID nhân vật.'); return; }
        stEl.textContent = 'Đang kiểm tra mã ID nhân vật...';
        try {
          const r = await apiFetch('/api/customer/resolve-role-id', 'POST', { role_id: q });
          if (r.success && r.customer?.customerId) {
            await assignCustomerId(r.customer.customerId);
          }
        } catch (err) {
          stEl.textContent = `Lỗi: ${err.message}`;
        }
      } else if (tab === 'saved') {
        stEl.textContent = 'Đang tải danh sách khách hàng...';
        try {
          const r = await apiFetch(`/api/customer/saved?q=${encodeURIComponent(q)}`);
          const list = r.customers || [];
          stEl.textContent = `Hiển thị ${list.length} khách hàng:`;
          renderLocalPages(resEl, list, visible => {
            resEl.innerHTML = visible.map((c) => `
              <div class="detail-row" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:8px;">
                <div>
                  <strong style="color:#fff;">${escapeHtml(c.nickname || `Khách #${c.id}`)}</strong>
                  <div style="font-size:11px;color:var(--color-fog-veil);">SUID: ${escapeHtml(c.suid || '—')}</div>
                </div>
                <button type="button" class="btn-violet" style="padding:5px 12px;font-size:11px;" data-wb-pick-saved="${c.id}">Gán khách</button>
              </div>
            `).join('');
            resEl.querySelectorAll('[data-wb-pick-saved]').forEach((b) => {
              b.addEventListener('click', async () => {
                b.disabled = true;
                b.textContent = 'Đang gán...';
                await assignCustomerId(Number(b.dataset.wbPickSaved));
              });
            });
          });
        } catch (err) {
          stEl.textContent = `Lỗi: ${err.message}`;
        }
      }
    };

    body.querySelectorAll('[data-wb-cust-tab]').forEach((b) => {
      b.addEventListener('click', () => {
        tab = b.dataset.wbCustTab;
        renderSlotBody();
        if (tab === 'saved') runSearch();
      });
    });
    body.querySelector('#btnWbCustSearch')?.addEventListener('click', runSearch);
    body.querySelector('#wbCustSearchInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
    });
    body.querySelector('#btnWbClearSlot')?.addEventListener('click', async () => {
      if (!confirm('Gỡ khách hàng khỏi đơn Buff Thời Tiết này?')) return;
      try {
        const res = await apiFetch(`/api/orders/weather_buff/${encodeURIComponent(remId)}/slots/0`, 'DELETE');
        showToast(res.message || 'Đã gỡ khách hàng khỏi đơn.');
        overlay.style.display = 'none';
        await loadOrders(true);
        renderCurrentView();
      } catch (err) {
        showToast(err.message);
      }
    });
  };

  overlay.style.display = 'flex';
  renderSlotBody();
}

async function openWeatherConfigModal(order) {
  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  const remId = order.remoteOrderId;
  box.className = 'modal-box';
  title.textContent = `Chọn loại thời tiết — Đơn #${remId}`;
  overlay.style.display = 'flex';

  if (!Array.isArray(state.catalogData?.catalog?.weather_buff_types) || state.catalogData.catalog.weather_buff_types.length === 0) {
    body.innerHTML = renderSyncLoadingHtml('Đang tải danh sách thời tiết từ Server Zn...', 'Đang đồng bộ các loại thời tiết đang hỗ trợ.');
    await loadCatalog(true, 'weather_buff', 6500);
    if (overlay.style.display === 'none') return;
  }

  const activeTypes = state.catalogData?.catalog?.weather_buff_types || [];
  if (activeTypes.length === 0) {
    body.innerHTML = `<div style="padding:16px;color:#fca5a5;">Không tải được danh sách loại thời tiết. Vui lòng thử làm mới dữ liệu.</div>`;
    return;
  }

  const pkgQty = Math.max(1, Number(order.weather?.packageQuantity || order.totalCnt || 1));
  const isLockedMode = Boolean(
    order.isActive ||
    order.weather?.remoteRef ||
    order.status === 'assigned' ||
    order.status === 'completed' ||
    (order.weather?.weathers || []).some(w => Number(w.completed_cnt || 0) > 0) ||
    order.weather?.casting
  );

  // Build draft rows following Server Zn's split rule for partially completed weather lines
  let seq = 1;
  const draft = [];
  for (const w of (order.weather?.weathers || [])) {
    const qty = Math.max(1, Number(w.quantity || 1));
    const done = Math.max(0, Number(w.completed_cnt || 0));
    if (isLockedMode && done > 0 && done < qty) {
      draft.push({ key: `d-${seq++}`, id: w.id || null, weather_type_id: w.weather_type_id, name: w.name, icon: w.icon, quantity: done, completed_cnt: done, locked: true });
      draft.push({ key: `d-${seq++}`, id: null, weather_type_id: w.weather_type_id, name: w.name, icon: w.icon, quantity: qty - done, completed_cnt: 0, locked: false });
    } else {
      draft.push({ key: `d-${seq++}`, id: w.id || null, weather_type_id: w.weather_type_id, name: w.name, icon: w.icon, quantity: Math.max(qty, done), completed_cnt: done, locked: done > 0 });
    }
  }

  let selectedTypeId = activeTypes[0].id;
  let addQty = Math.max(1, pkgQty - draft.reduce((s, d) => s + d.quantity, 0));

  const renderConfigBody = () => {
    const totalUsed = draft.reduce((s, d) => s + Number(d.quantity || 0), 0);
    const remaining = Math.max(0, pkgQty - totalUsed);
    const isOver = totalUsed > pkgQty;
    if (addQty > remaining && remaining > 0) addQty = remaining;

    body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:10px 14px;border-radius:10px;background:${isOver ? 'rgba(239,68,68,0.16)' : 'rgba(16,185,129,0.12)'};border:1px solid ${isOver ? 'rgba(248,113,113,0.4)' : 'rgba(52,211,153,0.3)'};">
        <div style="font-size:13px;color:#fff;">
          Gói đã mua: <strong>${formatNum(pkgQty)} lần</strong> · Đã chọn: <strong style="color:${isOver ? '#fca5a5' : '#4ade80'};">${formatNum(totalUsed)}</strong> / ${formatNum(pkgQty)}
        </div>
        <div style="font-size:12px;color:${isOver ? '#fca5a5' : 'var(--color-moon-mist)'};">
          ${isOver ? `Vượt gói ${formatNum(totalUsed - pkgQty)} lần!` : `Còn trống: ${formatNum(remaining)} lần`}
        </div>
      </div>

      <div style="background:rgba(255,255,255,0.03);padding:12px;border-radius:10px;display:flex;flex-direction:column;gap:10px;">
        <div style="font-size:12px;color:var(--color-moon-mist);font-weight:600;">Thêm loại thời tiết vào danh sách chạy:</div>
        <div class="weather-add-fields">
          <select id="wbTypeSelect" class="input-box">
            ${activeTypes.map(t => `<option value="${t.id}" ${Number(t.id) === Number(selectedTypeId) ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
          </select>
          <input type="number" id="wbAddQtyInput" class="input-box" min="1" max="${Math.max(1, remaining)}" value="${Math.max(1, addQty)}" />
          <button type="button" class="btn-violet" id="btnWbAddLine" ${remaining <= 0 ? 'disabled' : ''}>+ Thêm</button>
        </div>
        ${remaining > 0
        ? `<div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${[1, 5, 10, 50].filter(n => n <= remaining).map(n => `<button type="button" class="btn-frost" style="padding:3px 9px;font-size:11px;" data-wb-quick-qty="${n}">${n} lần</button>`).join('')}
                <button type="button" class="btn-frost" style="padding:3px 9px;font-size:11px;color:#5eead4;" data-wb-quick-qty="${remaining}">Điền hết (${formatNum(remaining)} lần)</button>
              </div>`
        : ''
      }
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;max-height:240px;overflow-y:auto;">
        ${draft.length === 0
        ? `<div style="text-align:center;padding:20px;color:var(--color-fog-veil);font-size:12.5px;">Chưa chọn loại thời tiết nào. Hãy chọn loại thời tiết và bấm <strong>+ Thêm</strong> ở trên.</div>`
        : draft.map((line, idx) => `
              <div class="detail-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;background:rgba(255,255,255,0.04);border-radius:9px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  ${line.icon ? `<img src="${escapeHtml(line.icon)}" alt="" style="width:22px;height:22px;object-fit:contain;" />` : `<span style="color:var(--color-aurora-gradient);display:inline-flex;">${znIcon('cloud', 18)}</span>`}
                  <div>
                    <div style="font-weight:600;color:#fff;font-size:13px;">${escapeHtml(line.name)}</div>
                    ${line.locked ? `<div style="font-size:11px;color:#4ade80;">Đã chạy ${formatNum(line.completed_cnt)} lần (Cố định)</div>` : ''}
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                  ${line.locked
            ? `<span class="badge-tag green">${formatNum(line.quantity)} lần</span>`
            : `
                        <input type="number" class="input-box" style="width:82px;padding:5px 8px;text-align:center;" min="1" max="${pkgQty}" value="${line.quantity}" data-wb-line-qty="${idx}" />
                        <button type="button" class="btn-frost" style="padding:4px 8px;font-size:11px;color:#fca5a5;" data-wb-line-del="${idx}" aria-label="Xóa dòng">${znIcon('close', 13)}</button>
                      `
          }
                </div>
              </div>
            `).join('')
      }
      </div>

      <div class="action-row align-end" style="padding-top:6px;">
        <button type="button" class="btn-frost" id="btnWbCancelConfig">Hủy</button>
        <button type="button" class="btn-violet" id="btnWbSaveConfig" ${draft.length === 0 || isOver ? 'disabled' : ''}>${znIcon('save', 14)} <span>Lưu cấu hình thời tiết</span></button>
      </div>
    `;

    body.querySelector('#wbTypeSelect')?.addEventListener('change', (e) => {
      selectedTypeId = Number(e.target.value);
    });
    body.querySelector('#wbAddQtyInput')?.addEventListener('input', (e) => {
      addQty = Math.max(1, Math.floor(Number(e.target.value || 1)));
    });
    body.querySelectorAll('[data-wb-quick-qty]').forEach((b) => {
      b.addEventListener('click', () => {
        addQty = Number(b.dataset.wbQuickQty);
        const inp = body.querySelector('#wbAddQtyInput');
        if (inp) inp.value = String(addQty);
      });
    });
    body.querySelector('#btnWbAddLine')?.addEventListener('click', () => {
      const t = activeTypes.find(x => Number(x.id) === Number(selectedTypeId));
      const qty = Math.max(1, Math.floor(Number(body.querySelector('#wbAddQtyInput')?.value || addQty || 1)));
      if (!t || qty <= 0 || qty > remaining) {
        showToast(`Số lượng thêm vượt mức còn trống (${remaining} lần).`);
        return;
      }
      const existing = draft.find(d => !d.locked && Number(d.weather_type_id) === Number(t.id));
      if (existing) {
        existing.quantity += qty;
      } else {
        draft.push({ key: `d-${seq++}`, id: null, weather_type_id: t.id, name: t.name, icon: t.icon, quantity: qty, completed_cnt: 0, locked: false });
      }
      addQty = Math.max(1, pkgQty - draft.reduce((s, d) => s + d.quantity, 0));
      renderConfigBody();
    });
    body.querySelectorAll('[data-wb-line-qty]').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        const idx = Number(inp.dataset.wbLineQty);
        if (!draft[idx] || draft[idx].locked) return;
        draft[idx].quantity = Math.max(1, Math.floor(Number(e.target.value || 1)));
        renderConfigBody();
      });
    });
    body.querySelectorAll('[data-wb-line-del]').forEach((b) => {
      b.addEventListener('click', () => {
        const idx = Number(b.dataset.wbLineDel);
        if (!draft[idx] || draft[idx].locked) return;
        draft.splice(idx, 1);
        renderConfigBody();
      });
    });
    body.querySelector('#btnWbCancelConfig')?.addEventListener('click', () => {
      overlay.style.display = 'none';
    });
    body.querySelector('#btnWbSaveConfig')?.addEventListener('click', async () => {
      const saveBtn = body.querySelector('#btnWbSaveConfig');
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Đang lưu...'; }
      try {
        const res = await apiFetch(`/api/orders/weather_buff/${encodeURIComponent(remId)}/weathers`, 'PUT', {
          weathers: draft.map(d => ({
            id: d.id,
            weather_type_id: Number(d.weather_type_id),
            quantity: Number(d.quantity),
          })),
        });
        showToast(res.message || 'Đã lưu cấu hình thời tiết!');
        overlay.style.display = 'none';
        await loadOrders(true);
        renderCurrentView();
      } catch (err) {
        showToast(err.message);
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = `${znIcon('save', 14)} <span>Lưu cấu hình thời tiết</span>`; }
      }
    });
  };

  renderConfigBody();
}

// ============================================================================
// 3. MODALS: FRUIT WAREHOUSE, COIN WAREHOUSE, CATEGORY PRICE LIST
// ============================================================================
async function openFruitWarehouseModal() {
  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  box.className = 'modal-box wide';
  title.textContent = 'Kho Trái Cây Trực Tuyến';
  body.innerHTML = renderSyncLoadingHtml('Đang cập nhật bảng giá từ Server Zn...', 'Đang lấy tồn kho & đơn giá trái cây mới nhất từ hệ thống.');
  overlay.style.display = 'flex';

  await loadCatalog(true, 'fruit_by_fruit', 6500);
  if (overlay.style.display === 'none' || !state.catalogData) return;

  const fruits = (state.catalogData.catalog?.fruit_by_fruit || [])
    .slice()
    .sort((a, b) => b.stock_quantity - a.stock_quantity);

  body.innerHTML = `
    <input type="text" id="whFruitFilterInput" class="input-box" placeholder="Tìm tên trái cây trong kho (${fruits.length} loại)..." />
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,155px),1fr));gap:10px;max-height:420px;overflow-y:auto;padding:2px;" id="whFruitGrid"></div>
  `;

  const grid = body.querySelector('#whFruitGrid');
  const renderList = (q = '') => {
    const cq = q.trim().toLowerCase();
    const list = cq ? fruits.filter((f) => f.name.toLowerCase().includes(cq)) : fruits;
    renderLocalPages(grid, list, visible => {
      grid.innerHTML = visible
        .map(
          (f) => `
          <div class="pkg-picker-card" data-wh-fruit="${f.id}">
            <div style="display:flex;align-items:center;gap:10px;">
              ${f.icon ? `<img src="${escapeHtml(f.icon)}" loading="lazy" decoding="async" style="width:36px;height:36px;object-fit:contain;" alt="" />` : `<span class="dashboard-cat-icon">${znIcon('fruit', 18)}</span>`}
              <div>
                <div style="font-weight:600;color:#fff;font-size:13px;">${escapeHtml(f.name)}</div>
                <div style="font-size:11px;color:#4ade80;">Tồn kho: ${formatNum(f.stock_quantity)}</div>
                <div style="font-size:11px;color:#fbbf24;">Giá: ${formatVnd(f.unit_price)}/trái</div>
              </div>
            </div>
          </div>
        `
        )
        .join('');

      grid.querySelectorAll('[data-wh-fruit]').forEach((card) => {
        card.addEventListener('click', () => {
          openCreateOrderModal('fruit_coin', {
            fruitOrderType: 'by_fruit',
            category: 'fruit_by_fruit',
            fruit_item_id: Number(card.dataset.whFruit),
          });
        });
      });
    });
  };

  renderList('');
  let whTimer = null;
  body.querySelector('#whFruitFilterInput')?.addEventListener('input', (e) => {
    const val = e.target.value;
    if (whTimer && typeof clearTimeout === 'function') clearTimeout(whTimer);
    whTimer = setTimeout(() => renderList(val), 80);
  });
}

async function openCoinWarehouseModal() {
  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  box.className = 'modal-box';
  title.textContent = 'Kho Xu Nông Trại Trực Tuyến';
  body.innerHTML = renderSyncLoadingHtml('Đang cập nhật bảng giá từ Server Zn...', 'Đang đồng bộ trữ lượng Kho Xu mới nhất từ hệ thống.');
  overlay.style.display = 'flex';

  await loadCatalog(true, 'fruit_coin', 6500);
  if (overlay.style.display === 'none' || !state.catalogData) return;

  const coin = state.catalogData.coinStock || {};
  const tiers = state.catalogData.coinTiers || [];

  renderLocalPages(body, tiers, visible => {
    body.innerHTML = `
      <div style="background:rgba(38,150,132,0.16);padding:16px;border-radius:12px;box-shadow:var(--shadow-subtle);">
        <div style="font-size:12px;color:var(--color-moon-mist);">Tổng trữ lượng Xu sẵn sàng giao:</div>
        <div style="font-size:26px;font-weight:700;color:#4ade80;margin-top:4px;">${formatNum(coin.quantity || 0)} Xu</div>
        <div style="font-size:12px;color:var(--color-fog-veil);margin-top:4px;">Tốc độ sản xuất ước tính: ~${formatNum(coin.estimated_per_hour || 0)} Xu/giờ</div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Phân khúc giá trái</th>
              <th>Phụ phí chọn lọc</th>
              <th>Trữ lượng khả dụng</th>
            </tr>
          </thead>
          <tbody>
            ${visible
        .map(
          (t) => `
              <tr>
                <td>Trái từ <strong>${formatNum(t.min_coin)} Xu</strong> trở lên</td>
                <td><span class="badge-tag ${t.markup_percent > 0 ? 'amber' : 'green'}">+${t.markup_percent}%</span></td>
                <td><strong>${formatNum(t.quantity)} Xu</strong></td>
              </tr>
            `
        )
        .join('')}
          </tbody>
        </table>
      </div>
    `;
  });
}

async function openCategoryPriceListModal(catKey) {
  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  box.className = 'modal-box';
  title.textContent = `Bảng giá: ${VIEW_TITLES[catKey] || catKey}`;
  body.innerHTML = renderSyncLoadingHtml('Đang cập nhật bảng giá từ Server Zn...');
  overlay.style.display = 'flex';

  await loadCatalog(true, catKey, 6500);
  if (overlay.style.display === 'none' || !state.catalogData) return;

  const items = state.catalogData.catalog?.[catKey] || [];
  const isGiftCat = catKey === 'farm_gift' || catKey === 'mail_gift';

  if (!items.length) {
    body.innerHTML = `<div style="color:var(--color-fog-veil);padding:16px 0;">Hiện chưa có gói giá nào đang mở bán cho danh mục này.</div>`;
  } else {
    const units = { fruit_coin: 'Xu', buff_tim: 'Tim', buff_sao: 'Sao', guestbook: 'Bài viết', weather_buff: 'Lần' };
    const rows = isGiftCat ? items.flatMap(g => (g.packages || []).map(pkg => ({ ...pkg, giftName: g.name }))) : items;
    renderLocalPages(body, rows, visible => {
      body.innerHTML = `<div class="pkg-picker-list">${visible.map(pkg => `<div class="pkg-picker-card">
        <strong>${escapeHtml(pkg.giftName || 'Gói')} · ${formatNum(pkg.quantity || pkg.coin_quantity)} ${units[catKey] || ''}</strong>
        <div>${formatVnd(pkg.total_price)} ${pkg.is_on_sale && pkg.original_price > pkg.total_price ? `<del>${formatVnd(pkg.original_price)}</del>` : ''}</div>
        ${pkg.is_on_sale && pkg.sale ? `<span class="badge-tag amber">Giảm giá · còn ${formatNum(pkg.sale.slots_remaining)} suất</span>` : ''}
      </div>`).join('')}</div>`;
    });
  }
  overlay.style.display = 'flex';
}

// ============================================================================
// 4. BẢNG ĐIỀU KHIỂN (DASHBOARD OVERVIEW)
// ============================================================================
function renderDashboardOverviewHtml() {
  const r = state.catalogData;
  const st = r?.systemStatus || {};
  const coinQty = r?.coinStock?.quantity || 0;
  const totalFruits = (r?.catalog?.fruit_by_fruit || []).reduce((s, f) => s + Number(f.stock_quantity || 0), 0);
  const activeOrders = state.orderPage?.activeCount ?? state.orders.filter((o) => o.status !== 'completed' && o.isActive).length;

  const catCards = [
    { key: 'farm_gift', icon: 'gift', name: 'Quà nông trại', working: st.farm_gift },
    { key: 'mail_gift', icon: 'mail', name: 'Quà thư', working: st.mail_gift },
    { key: 'guestbook', icon: 'message', name: 'Bài viết', working: st.guestbook },
    { key: 'buff_tim', icon: 'heart', name: 'Buff Tim', working: st.buff_tim },
    { key: 'buff_sao', icon: 'star', name: 'Buff Sao', working: st.buff_sao },
    { key: 'weather_buff', icon: 'cloud', name: 'Buff Thời Tiết', working: st.weather_buff },
    { key: 'fruit_coin', icon: 'coins', name: 'Trái cây & Xu', working: st.fruit_coin },
  ];

  return `
    <div class="stats-three-grid">
      <div class="glass-panel">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--color-moon-mist);">Trữ lượng Kho Xu Nông Trại</div>
        <div style="font-size:28px;font-weight:500;letter-spacing:-0.03em;line-height:1.1;color:var(--color-lavender-phosphor);margin-top:8px;font-variant-numeric:tabular-nums;">${formatNum(coinQty)} Xu</div>
        <div style="font-size:12px;color:var(--color-fog-veil);margin-top:6px;">Kho trái cây: ${formatNum(totalFruits)} trái sẵn sàng</div>
      </div>

      <div class="glass-panel">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--color-moon-mist);">Đơn hàng đang chạy</div>
        <div style="font-size:28px;font-weight:500;letter-spacing:-0.03em;line-height:1.1;color:var(--color-platinum);margin-top:8px;font-variant-numeric:tabular-nums;">${activeOrders} đơn đang bật</div>
        <div style="font-size:12px;color:var(--color-fog-veil);margin-top:6px;">Tổng số đơn: ${state.orderPage?.totalCount ?? state.orders.length} đơn</div>
      </div>

      <div class="glass-panel">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--color-moon-mist);">${state.user.role === 'admin' ? 'Trạng thái Quản trị Admin' : 'Số dư 2 ví CTV của bạn'}</div>
        <div style="font-size:28px;font-weight:500;letter-spacing:-0.03em;line-height:1.1;color:var(--color-lavender-phosphor);margin-top:8px;font-variant-numeric:tabular-nums;">
          ${state.user.role === 'admin' ? 'Đã đồng bộ API' : formatVnd(state.user.balance)}
        </div>
        <div style="font-size:12px;color:var(--color-fog-veil);margin-top:6px;">
          ${state.user.role === 'admin'
            ? 'Bấm mục Quản trị bên trái để chỉnh giá CTV'
            : `Ví Nguồn DP: <strong style="color:var(--color-aurora-gradient);">${formatVnd(state.user.backupBalance || 0)}</strong> · Dùng riêng cho đơn Nguồn dự phòng`}
        </div>
      </div>
    </div>

    <div class="glass-panel">
      <div class="panel-title-row">
        <span class="panel-title-text">Danh mục Chạy Đơn (Đồng bộ trạng thái thực tế)</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:12px;">
        ${catCards
      .map(
        (c) => `
          <button type="button" class="stat-subcard dashboard-category" data-dash-goto="${c.key}">
            <span style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <span class="dashboard-cat-title">
                <span class="dashboard-cat-icon">${znIcon(c.icon, 16)}</span>
                <span>${escapeHtml(c.name)}</span>
              </span>
              <span class="system-status-chip ${c.working ? 'is-working' : 'is-not-working'}" style="font-size:11px;padding:2px 8px;">
                ● ${c.working ? 'Hoạt động' : 'Tạm ngưng'}
              </span>
            </span>
            <span style="display:flex;justify-content:flex-end;margin-top:6px;">
              <span class="btn-frost" style="padding:5px 12px;font-size:11px;">Mở danh mục →</span>
            </span>
          </button>
        `
      )
      .join('')}
      </div>
    </div>
  `;
}

function bindDashboardEvents() {
  document.querySelectorAll('[data-dash-goto]').forEach((card) => {
    card.addEventListener('click', () => {
      switchView(card.dataset.dashGoto);
    });
  });
}

// ============================================================================
// 5. ĐỐI SOÁT TUẦN & LỊCH SỬ ĐƠN HÀNG & KHÁCH HÀNG
// ============================================================================
async function renderWeeklySettlementsView(container, zeroBannerHtml) {
  try {
    const r = await apiFetch(`/api/settlements?limit=${pageLimit('settlements')}`);
    if (state.currentView !== 'weekly_settlements') return;
    const isAdmin = state.user.role === 'admin';
    const trxList = r.transactions || [];

    let summaryHtml = '';
    if (isAdmin) {
      const wl = (r.znSettlement || r.hnSettlement)?.weekly_limit;
      summaryHtml = !wl ? '<p class="tool-warning">Chưa có dữ liệu hạn mức tuần từ Server Zn.</p>' : `
        <div class="stats-three-grid">
          <div class="stat-subcard">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--color-moon-mist);">Hạn mức tuần Server Zn</div>
            <div style="font-size:24px;font-weight:500;letter-spacing:-0.025em;color:var(--color-platinum);font-variant-numeric:tabular-nums;">${formatVnd(wl.limit)}</div>
          </div>
          <div class="stat-subcard">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--color-moon-mist);">Đã sử dụng trong tuần</div>
            <div style="font-size:24px;font-weight:500;letter-spacing:-0.025em;color:var(--color-lavender-phosphor);font-variant-numeric:tabular-nums;">${formatVnd(wl.spent)}</div>
          </div>
          <div class="stat-subcard">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--color-moon-mist);">Hạn mức còn lại</div>
            <div style="font-size:24px;font-weight:500;letter-spacing:-0.025em;color:var(--color-aurora-gradient);font-variant-numeric:tabular-nums;">${formatVnd(wl.remaining)}</div>
          </div>
        </div>
      `;
    } else {
      const s = r.summary || { orderCount: 0, totalSpent: 0, mainSpent: 0, backupSpent: 0, currentBalance: state.user.balance, backupBalance: state.user.backupBalance || 0 };
      summaryHtml = `
        <div class="stats-three-grid monitor-wallet-grid is-four">
          <div class="stat-subcard monitor-wallet-card">
            <div class="tool-note monitor-wallet-label">Số dư Ví CTV (bình thường)</div>
            <strong class="wallet-value">${formatVnd(s.currentBalance)}</strong>
            <span class="tool-note monitor-wallet-sub">Đã dùng Server Zn: ${formatVnd(s.mainSpent ?? s.totalSpent ?? 0)}</span>
          </div>
          <div class="stat-subcard monitor-wallet-card is-backup-card">
            <div class="tool-note monitor-wallet-label">Số dư Ví Nguồn DP</div>
            <strong class="wallet-value">${formatVnd(s.backupBalance ?? state.user.backupBalance ?? 0)}</strong>
            <span class="tool-note monitor-wallet-sub">Đã dùng Nguồn DP: ${formatVnd(s.backupSpent || 0)}</span>
          </div>
          <div class="stat-subcard monitor-wallet-card">
            <div class="tool-note monitor-wallet-label">Tổng đơn đã đặt</div>
            <strong class="wallet-value" style="color:var(--color-platinum);">${s.orderCount} đơn</strong>
          </div>
          <div class="stat-subcard monitor-wallet-card">
            <div class="tool-note monitor-wallet-label">Tổng tiền đã thanh toán</div>
            <strong class="wallet-value" style="color:var(--color-aurora-gradient);">${formatVnd(s.totalSpent)}</strong>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      ${zeroBannerHtml}
      <div class="glass-panel">
        <div class="panel-title-row">
          <span class="panel-title-text"><span class="panel-title-icon">${znIcon('wallet', 16)}</span><span>Đối soát tuần &amp; Biến động số dư (${escapeHtml(r.weekStart || '')})</span></span>
        </div>
        ${summaryHtml}
      </div>

      <div class="glass-panel">
        <div class="panel-title-row">
          <span class="panel-title-text">Lịch sử giao dịch & Trừ ví</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>MÃ GD</th>
                <th>TÀI KHOẢN</th>
                <th>SỐ TIỀN</th>
                <th>SỐ DƯ SAU GD</th>
                <th>NỘI DUNG</th>
                <th>THỜI GIAN</th>
              </tr>
            </thead>
            <tbody>
              ${trxList.length === 0
        ? `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--color-fog-veil);">Chưa có giao dịch nào.</td></tr>`
        : trxList
          .map(
            (t) => `
                    <tr>
                      <td><strong>${escapeHtml(t.id)}</strong></td>
                      <td>${escapeHtml(t.userName)}</td>
                      <td style="font-weight:700;color:${t.amount >= 0 ? '#4ade80' : '#fca5a5'};">
                        ${t.amount >= 0 ? `+${formatVnd(t.amount)}` : formatVnd(t.amount)}
                      </td>
                      <td>${formatVnd(t.balanceAfter)}</td>
                      <td>
                        ${t.wallet === 'backup' || t.source === 'backup' ? '<span class="badge-tag green" style="margin-right:6px;font-size:10px;">Ví Nguồn DP</span>' : ''}
                        ${escapeHtml(t.note)}
                      </td>
                      <td>${formatDateVi(t.createdAt)}</td>
                    </tr>
                  `
          )
          .join('')
      }
            </tbody>
          </table>
        </div>
        ${moreButton('settlements', r.transactionCount, 0, trxList.length)}
      </div>
    `;
  } catch (err) {
    if (state.currentView !== 'weekly_settlements' || !state.user) return;
    container.innerHTML = `<div class="glass-panel">Lỗi tải đối soát: ${escapeHtml(err.message)}</div>`;
  }
}

function renderOrderHistoryHtml() {
  return `
    ${state.ordersWarning ? `<p class="tool-warning" role="status">${escapeHtml(state.ordersWarning)}</p>` : ''}
    <div class="glass-panel">
      <div class="panel-title-row">
        <span class="panel-title-text"><span class="panel-title-icon">${znIcon('file', 16)}</span><span>Toàn bộ Lịch sử đơn hàng (${state.orderPage?.totalCount ?? state.orders.length} đơn)</span></span>
        <input type="text" id="histSearchInput" class="input-box" style="max-width:280px;" placeholder="Tìm tên khách, mã đơn, SUID..." value="${escapeHtml(state.orderSearch)}" />
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>KHÁCH HÀNG</th>
              <th>GÓI / VẬT PHẨM</th>
              <th>SỐ LƯỢNG</th>
              <th>GIÁ</th>
              <th>TIẾN ĐỘ</th>
              <th>TRẠNG THÁI</th>
              <th>BẬT/TẮT</th>
              <th>TẠO LÚC</th>
              <th>THAO TÁC</th>
            </tr>
          </thead>
          <tbody id="histOrdersTbody">
            ${renderOrderHistoryTbodyHtml()}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderOrderHistoryTbodyHtml() {
  const q = state.orderSearch.trim().toLowerCase();
  const list = state.orderPage ? state.orders : state.orders.filter((o) => {
    if (!q) return true;
    return (
      String(o.customer?.nickname || '').toLowerCase().includes(q) ||
      String(o.customer?.suid || '').toLowerCase().includes(q) ||
      String(o.remoteOrderId || o.id).toLowerCase().includes(q) ||
      String(o.summary || '').toLowerCase().includes(q) ||
      String(o.categoryName || '').toLowerCase().includes(q)
    );
  });
  if (list.length === 0) {
    return `<tr><td colspan="9" style="text-align:center;padding:28px;color:var(--color-fog-veil);">${state.loadingOrders ? '<span class="loading-inline"><span class="loading-dot"></span>Đang đồng bộ lịch sử đơn...</span>' : 'Không có dữ liệu'}</td></tr>`;
  }
  return list.slice(0, pageLimit('orderList')).map(o => renderOrderTableRowHtml(o, { inHistory: true })).join('')
    + moreButton('orderList', state.orderPage?.filteredCount ?? list.length, 9, Math.min(list.length, pageLimit('orderList')));
}

let histFilterTimer = null;
function bindOrderHistoryEvents() {
  const input = document.getElementById('histSearchInput');
  input?.addEventListener('input', (e) => {
    state.orderSearch = e.target.value;
    if (histFilterTimer && typeof clearTimeout === 'function') clearTimeout(histFilterTimer);
    histFilterTimer = setTimeout(async () => {
      state.listLimits.orderList = 20;
      await loadOrders();
      if (state.currentView !== 'order_history') return;
      const tbody = document.getElementById('histOrdersTbody');
      if (!tbody) return;
      tbody.innerHTML = renderOrderHistoryTbodyHtml();
      bindOrderRowActionButtons();
    }, 220);
  });
  bindOrderRowActionButtons();
}


// ============================================================================
// 6. ADMIN PAGE: TÙY CHỈNH GIÁ TỪNG DANH MỤC, GÓI & SẢN PHẨM (VNĐ + %)
// ============================================================================
const PRICING_CATEGORIES = [
  { key: 'fruit_coin', icon: 'coins', label: '01. Gói Xu Nông Trại', unitHint: 'đơn', stepFixed: 1000, presetsFixed: [2000, 3000, 5000, 10000] },
  { key: 'fruit_by_fruit', icon: 'fruit', label: '02. Trái cây lẻ & 19 Đột biến', unitHint: 'trái', isFruitUnit: true, stepFixed: 10, presetsFixed: [20, 40, 50, 100] },
  { key: 'buff_tim', icon: 'heart', label: '03. Gói Buff Tim', unitHint: 'đơn', stepFixed: 1000, presetsFixed: [2000, 3000, 5000, 10000] },
  { key: 'buff_sao', icon: 'star', label: '04. Gói Buff Sao', unitHint: 'đơn', stepFixed: 1000, presetsFixed: [2000, 5000, 10000, 20000] },
  { key: 'guestbook', icon: 'message', label: '05. Gói Bài viết lưu bút', unitHint: 'đơn', stepFixed: 1000, presetsFixed: [2000, 5000, 10000] },
  { key: 'mail_gift', icon: 'mail', label: '06. Gói Quà thư', unitHint: 'đơn', stepFixed: 1000, presetsFixed: [2000, 5000, 10000] },
  { key: 'farm_gift', icon: 'gift', label: '07. Gói Quà nông trại', unitHint: 'đơn', stepFixed: 1000, presetsFixed: [2000, 5000, 10000] },
  { key: 'weather_buff', icon: 'cloud', label: '08. Gói Buff Thời Tiết', unitHint: 'đơn', stepFixed: 1000, presetsFixed: [2000, 5000, 10000] },
  ...backupPricingCategories,
];

function computePreviewSell(cost, mode, fixedVal, pctVal) {
  const c = Math.max(0, Number(cost || 0));
  if (mode === 'percent') {
    const p = Math.max(0, Math.min(500, Number(pctVal || 0)));
    return Math.max(c, Math.round(c * (100 + p) / 100));
  }
  return Math.max(c, Math.round(c + Math.max(0, Number(fixedVal || 0))));
}

function getCategorySampleItem(catKey, catalog) {
  if (!catalog) return null;
  if (catKey === 'fruit_by_fruit') {
    const f = (catalog.fruit_by_fruit || [])[0];
    if (!f) return null;
    return { name: `${f.name} (1 trái)`, cost: f._admin?.cost_unit_price ?? f.unit_price };
  }
  if (catKey === 'farm_gift' || catKey === 'mail_gift') {
    const g = (catalog[catKey] || [])[0];
    const p = g?.packages?.[0];
    if (!g || !p) return null;
    return { name: `${g.name} × ${formatNum(p.quantity)}`, cost: p._admin?.cost_effective ?? p.total_price };
  }
  const p = (catalog[catKey] || [])[0];
  if (!p) return null;
  const uMap = { fruit_coin: 'Xu', buff_tim: 'Tim', buff_sao: 'Sao', guestbook: 'Bài viết', weather_buff: 'Lần' };
  return { name: `Gói ${formatNum(p.quantity || p.coin_quantity)} ${uMap[catKey] || ''}`, cost: p._admin?.cost_effective ?? p.total_price };
}

function getAllAdminFixedPackages(r) {
  const fixedPackages = [];
  const pushPkgs = (arr, catKey, catLabel, unitLabel) => {
    for (const p of arr || []) {
      fixedPackages.push({
        key: `${catKey}:${p.id}`,
        catKey,
        catLabel,
        id: p.id,
        name: `Gói ${formatNum(p.quantity || p.coin_quantity)} ${unitLabel}`,
        isOnSale: !!p.is_on_sale,
        costPrice: p._admin?.cost_effective ?? p.total_price,
        costOriginal: p._admin?.cost_original ?? p._admin?.cost_effective ?? p.total_price,
        sellPrice: p.total_price,
        profit: p._admin?.profit ?? 0,
        hasOverride: p._admin?.has_custom_override ?? false,
        customOverride: p._admin?.custom_override || null,
      });
    }
  };
  pushPkgs(r?.catalog?.fruit_coin, 'fruit_coin', 'Xu Nông Trại', 'Xu');
  pushPkgs(r?.catalog?.buff_tim, 'buff_tim', 'Buff Tim', 'Tim');
  pushPkgs(r?.catalog?.buff_sao, 'buff_sao', 'Buff Sao', 'Sao');
  pushPkgs(r?.catalog?.guestbook, 'guestbook', 'Bài Viết', 'Bài viết');
  pushPkgs(r?.catalog?.weather_buff, 'weather_buff', 'Buff Thời Tiết', 'Lần');
  for (const [catKey, catLabel] of [['farm_gift', 'Quà nông trại'], ['mail_gift', 'Quà thư']]) {
    for (const g of r?.catalog?.[catKey] || []) {
      for (const p of g.packages || []) {
        fixedPackages.push({
          key: `${catKey}:${p.id}`,
          catKey,
          catLabel,
          id: p.id,
          name: `${g.name} × ${formatNum(p.quantity)}`,
          isOnSale: !!p.is_on_sale,
          costPrice: p._admin?.cost_effective ?? p.total_price,
          costOriginal: p._admin?.cost_original ?? p._admin?.cost_effective ?? p.total_price,
          sellPrice: p.total_price,
          profit: p._admin?.profit ?? 0,
          hasOverride: p._admin?.has_custom_override ?? false,
          customOverride: p._admin?.custom_override || null,
        });
      }
    }
  }
  return fixedPackages;
}

const FEATURED_PER_PKG_CATS = new Set(['fruit_coin', 'buff_tim', 'buff_sao']);

function countCategoryOverrides(catKey, adm) {
  if (catKey === 'fruit_by_fruit') {
    return Object.keys(adm?.settings?.fruitUnitPrices || {}).length;
  }
  const keys = new Set();
  for (const k of Object.keys(adm?.settings?.packagePriceOverrides || {})) {
    if (k.startsWith(`${catKey}:`)) keys.add(k);
  }
  for (const k of Object.keys(adm?.settings?.packageMarkupOverrides || {})) {
    if (k.startsWith(`${catKey}:`)) keys.add(k);
  }
  return keys.size;
}

function getPackageEditorInitial(p, cm, modes, percents) {
  if (p.customOverride?.type === 'markup') {
    return { mode: p.customOverride.mode === 'percent' ? 'percent' : 'fixed', value: Number(p.customOverride.value ?? 0) };
  }
  if (p.customOverride?.type === 'price' || p.hasOverride) {
    return { mode: 'price', value: Number(p.customOverride?.value ?? p.sellPrice ?? 0) };
  }
  const catMode = modes[p.catKey] === 'percent' ? 'percent' : 'fixed';
  return {
    mode: catMode,
    value: catMode === 'percent' ? Number(percents[p.catKey] ?? 0) : Number(cm[p.catKey] ?? 5000),
  };
}

function computePackagePreview(cost, mode, rawValue) {
  const c = Math.max(0, Number(cost || 0));
  const val = Number(rawValue);
  if (!Number.isFinite(val) || val < 0) return { sell: c, profit: 0, pct: 0 };
  let sell;
  if (mode === 'percent') {
    const pct = Math.min(500, val);
    sell = Math.max(c, Math.round(c * (100 + pct) / 100));
  } else if (mode === 'price') {
    sell = Math.max(c, Math.round(val));
  } else {
    sell = Math.max(c, Math.round(c + val));
  }
  const profit = sell - c;
  const pct = c > 0 ? Math.round((profit / c) * 1000) / 10 : 0;
  return { sell, profit, pct };
}

function formatPackageRuleSubtitle(p, cm, modes, percents) {
  if (p.customOverride?.type === 'markup') {
    const label = p.customOverride.mode === 'percent'
      ? `+${p.customOverride.value}% riêng`
      : `+${formatVnd(p.customOverride.value)} riêng`;
    return { custom: true, text: `Chỉnh riêng (${label}) · bỏ qua quy tắc chung` };
  }
  if (p.hasOverride) {
    return { custom: true, text: `Giá bán cố định riêng (${formatVnd(p.sellPrice)}) · bỏ qua quy tắc chung` };
  }
  const ruleText = modes[p.catKey] === 'percent'
    ? `+${percents[p.catKey] ?? 0}%`
    : `+${formatVnd(cm[p.catKey] ?? 5000)}`;
  return { custom: false, text: `Theo quy tắc chung (${ruleText})` };
}

function renderPackagePricingRowHtml(p, { cm, modes, percents, showCategoryCol = true, idPrefix = 'admPkg' }) {
  const init = getPackageEditorInitial(p, cm, modes, percents);
  const sub = formatPackageRuleSubtitle(p, cm, modes, percents);
  const preview = computePackagePreview(p.costPrice, init.mode, init.value);
  const safeId = `${idPrefix}_${p.key.replace(':', '_')}`;
  const unitLabel = init.mode === 'percent' ? '%' : init.mode === 'price' ? 'đ bán' : 'đ cộng thêm';
  const step = init.mode === 'percent' ? '0.5' : '1000';
  const maxAttr = init.mode === 'percent' ? 'max="500"' : '';
  return `
    <tr data-pkg-row="${p.key}" data-cost="${p.costPrice}" data-mode="${init.mode}" data-has-override="${p.hasOverride ? '1' : '0'}" class="${p.hasOverride ? 'is-custom-pkg-row' : ''}">
      ${showCategoryCol ? `<td><span class="badge-tag violet">${escapeHtml(p.catLabel)}</span></td>` : ''}
      <td>
        <strong style="color:#fff;">${escapeHtml(p.name)}</strong>
        ${p.isOnSale ? `<span class="badge-tag amber" style="margin-left:6px;">Giảm giá</span>` : ''}
        <div style="font-size:11px;color:${sub.custom ? '#fbbf24' : '#5eead4'};margin-top:3px;display:inline-flex;align-items:center;gap:4px;">
          ${sub.custom ? znIcon('lock', 11) : ''}<span>${escapeHtml(sub.text)}</span>
        </div>
      </td>
      <td style="white-space:nowrap;">
        <strong>${formatVnd(p.costPrice)}</strong>
        ${p.isOnSale && p.costOriginal > p.costPrice ? `<div style="font-size:11px;text-decoration:line-through;color:var(--color-fog-veil);">${formatVnd(p.costOriginal)}</div>` : ''}
      </td>
      <td style="min-width:240px;">
        <div class="pkg-custom-editor">
          <div class="pricing-mode-switch pkg-mode-switch">
            <button type="button" class="pricing-mode-btn ${init.mode === 'fixed' ? 'is-active' : ''}" data-pkg-mode-btn="${p.key}" data-mode="fixed">+VNĐ</button>
            <button type="button" class="pricing-mode-btn ${init.mode === 'percent' ? 'is-active' : ''}" data-pkg-mode-btn="${p.key}" data-mode="percent">+%</button>
            <button type="button" class="pricing-mode-btn ${init.mode === 'price' ? 'is-active' : ''}" data-pkg-mode-btn="${p.key}" data-mode="price">Giá bán</button>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <input
              type="number"
              class="input-box adm-pkg-override-input"
              data-pkg-key="${p.key}"
              data-cost="${p.costPrice}"
              data-has-override="${p.hasOverride ? '1' : '0'}"
              value="${init.value}"
              step="${step}"
              min="0"
              ${maxAttr}
              style="min-width:110px;padding:6px 10px;"
            />
            <span class="pkg-mode-unit" style="font-size:11px;color:var(--color-moon-mist);white-space:nowrap;">${unitLabel}</span>
          </div>
        </div>
      </td>
      <td style="white-space:nowrap;">
        <div id="${safeId}_sell" style="font-weight:700;color:#5eead4;font-size:13.5px;">${formatVnd(preview.sell)}</div>
        <span class="badge-tag ${preview.profit >= 0 ? 'green' : 'red'}" id="${safeId}_profit" style="margin-top:3px;">
          ${preview.profit >= 0 ? `+${formatVnd(preview.profit)}` : formatVnd(preview.profit)} (${preview.pct >= 0 ? `+${preview.pct}%` : `${preview.pct}%`})
        </span>
      </td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="btn-violet" style="padding:5px 11px;font-size:11.5px;" data-save-pkg-row="${p.key}">${znIcon('check', 12)} <span>Lưu riêng</span></button>
          ${p.hasOverride ? `<button type="button" class="btn-frost" style="padding:5px 9px;font-size:11px;" data-reset-pkg-override="${p.key}" title="Gỡ giá riêng để chạy theo quy tắc chung của danh mục">${znIcon('refresh', 11)} <span>Quy tắc chung</span></button>` : ''}
        </div>
      </td>
    </tr>
  `;
}

function renderAdminPricingPageHtml() {
  const r = state.catalogData;
  const adm = state.adminOverview;
  const fruits = r?.catalog?.fruit_by_fruit || [];
  const defaultFruitMarkup = adm?.settings?.defaultFruitUnitMarkup ?? 40;
  const cm = adm?.settings?.categoryMarkups || {};
  const modes = adm?.settings?.categoryMarkupModes || {};
  const percents = adm?.settings?.categoryMarkupPercents || {};
  const pkgOverrides = adm?.settings?.packagePriceOverrides || {};
  const fruitOverrides = adm?.settings?.fruitUnitPrices || {};
  const sysStatus = r?.systemStatus || {};

  const fixedPackages = getAllAdminFixedPackages(r);
  const filteredPackages = state.adminPkgCatFilter === 'all'
    ? fixedPackages
    : fixedPackages.filter((p) => p.catKey === state.adminPkgCatFilter);

  const qFruit = state.adminFruitSearch.trim().toLowerCase();
  const filteredFruits = fruits.filter((f) => {
    if (state.adminFruitFilter === 'custom' && !f._admin?.has_custom_override) return false;
    if (qFruit && !f.name.toLowerCase().includes(qFruit)) return false;
    return true;
  });

  const fruitMode = modes.fruit_by_fruit === 'percent' ? 'percent' : 'fixed';
  const fruitPercent = Number(percents.fruit_by_fruit ?? 0);
  const syncedText = r?.syncedAt
    ? new Date(r.syncedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Chưa đồng bộ';

  const pkgCatCounts = { all: fixedPackages.length };
  for (const p of fixedPackages) pkgCatCounts[p.catKey] = (pkgCatCounts[p.catKey] || 0) + 1;

  return `
    <div class="glass-panel">
      <div class="panel-title-row">
        <div>
          <span class="panel-title-text"><span class="panel-title-icon">${znIcon('tag', 16)}</span><span>Tùy chỉnh Giá bán CTV cho từng Danh mục &amp; Sản phẩm</span></span>
          <div style="font-size:12px;color:var(--color-fog-veil);margin-top:4px;">
            Đồng bộ Server Zn lúc <strong style="color:#5eead4;">${escapeHtml(syncedText)}</strong> · Hỗ trợ chỉnh <strong>+VNĐ (thủ công)</strong> hoặc <strong>+% (phần trăm)</strong> cho từng danh mục và từng gói riêng lẻ.
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn-frost" id="btnRefreshAdminPricing">${znIcon('refresh', 13)} <span>Làm mới giá Server Zn</span></button>
          <button type="button" class="btn-violet" id="btnSaveAllAdminPricing">
            ${znIcon('save', 14)} <span>Cập nhật tất cả thay đổi</span>
          </button>
        </div>
      </div>

      <!-- Sub-navigation tabs -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;">
        <button type="button" class="btn-frost ${state.adminPricingTab === 'categories' ? 'is-active' : ''}" data-adm-ptab="categories">
          ${znIcon('sliders', 14)} <span>Chỉnh giá từng danh mục · ${PRICING_CATEGORIES.length} danh mục</span>
        </button>
        <button type="button" class="btn-frost ${state.adminPricingTab === 'packages' ? 'is-active' : ''}" data-adm-ptab="packages">
          ${znIcon('package', 14)} <span>2. Chỉnh từng Gói cố định (${fixedPackages.length} gói)</span>
        </button>
        <button type="button" class="btn-frost ${state.adminPricingTab === 'fruits' ? 'is-active' : ''}" data-adm-ptab="fruits">
          ${znIcon('fruit', 14)} <span>3. Chỉnh từng loại Trái cây &amp; 19 Đột biến (${fruits.length} loại)</span>
        </button>
      </div>

      ${state.adminPricingTab === 'categories'
      ? `
        <div class="pricing-cat-grid">
          ${PRICING_CATEGORIES.map((cat) => {
        const mode = modes[cat.key] === 'percent' ? 'percent' : 'fixed';
        const fixedVal = cat.isFruitUnit ? defaultFruitMarkup : Number(cm[cat.key] ?? adm?.settings?.defaultMarkup ?? 5000);
        const pctVal = Number(percents[cat.key] ?? 0);
        const orderFeeVal = Number(cm.fruit_by_fruit ?? 0);
        const isWorking = !!sysStatus[cat.key];
        const overrideCount = countCategoryOverrides(cat.key, adm);
        const catPkgCount = cat.isFruitUnit ? fruits.length : (pkgCatCounts[cat.key] || 0);
        const showPerPkgBtn = !cat.isFruitUnit && (FEATURED_PER_PKG_CATS.has(cat.key) || catPkgCount > 0);
        const sample = getCategorySampleItem(cat.key, r?.catalog);
        const sampleSell = sample ? computePreviewSell(sample.cost, mode, fixedVal, pctVal) : 0;
        const sampleProfit = sample ? sampleSell - sample.cost : 0;

        return `
              <div class="pricing-cat-card" data-cat-card="${cat.key}">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                  <strong style="color:#fff;font-size:14px;display:inline-flex;align-items:center;gap:8px;"><span class="dashboard-cat-icon" style="width:28px;height:28px;">${znIcon(cat.icon, 14)}</span><span>${escapeHtml(cat.label)}</span></strong>
                  ${cat.key.startsWith('backup_') ? '' : `<span class="system-status-chip ${isWorking ? 'is-working' : 'is-not-working'}" style="font-size:11px;padding:2px 8px;">
                    ● ${isWorking ? 'Hoạt động' : 'Tạm ngưng'}
                  </span>`}
                </div>

                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                  <div class="pricing-mode-switch">
                    <button type="button" class="pricing-mode-btn ${mode === 'fixed' ? 'is-active' : ''}" data-cat-mode-btn="${cat.key}" data-mode="fixed">+VNĐ thủ công</button>
                    <button type="button" class="pricing-mode-btn ${mode === 'percent' ? 'is-active' : ''}" data-cat-mode-btn="${cat.key}" data-mode="percent">+% Phần trăm</button>
                  </div>
                  ${overrideCount > 0 ? `<span class="badge-tag amber" style="display:inline-flex;align-items:center;gap:4px;">${znIcon('lock', 11)} <span>${overrideCount} gói chỉnh riêng</span></span>` : `<span class="badge-tag green">Tự động</span>`}
                </div>

                <div data-cat-fixed-wrap="${cat.key}" style="display:${mode === 'fixed' ? 'flex' : 'none'};flex-direction:column;gap:8px;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <input type="number" id="admCatFixed_${cat.key}" class="input-box adm-cat-fixed-input" data-cat-key="${cat.key}" value="${fixedVal}" step="${cat.stepFixed}" min="0" />
                    <span style="font-size:12px;color:var(--color-moon-mist);white-space:nowrap;">đ / ${cat.unitHint}</span>
                  </div>
                  <div class="pricing-preset-row">
                    ${cat.presetsFixed.map((v) => `<button type="button" class="pricing-preset-chip" data-preset-cat="${cat.key}" data-preset-mode="fixed" data-preset-val="${v}">+${formatVnd(v)}</button>`).join('')}
                  </div>
                </div>

                <div data-cat-percent-wrap="${cat.key}" style="display:${mode === 'percent' ? 'flex' : 'none'};flex-direction:column;gap:8px;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <input type="number" id="admCatPct_${cat.key}" class="input-box adm-cat-pct-input" data-cat-key="${cat.key}" value="${pctVal}" step="1" min="0" max="500" />
                    <span style="font-size:12px;color:var(--color-moon-mist);white-space:nowrap;">% trên giá gốc</span>
                  </div>
                  <div class="pricing-preset-row">
                    ${[5, 10, 15, 20, 30, 50].map((v) => `<button type="button" class="pricing-preset-chip" data-preset-cat="${cat.key}" data-preset-mode="percent" data-preset-val="${v}">+${v}%</button>`).join('')}
                  </div>
                </div>

                ${cat.isFruitUnit
            ? `
                  <div style="display:flex;align-items:center;gap:8px;padding-top:4px;border-top:1px solid rgba(186,215,247,0.08);">
                    <label style="font-size:11.5px;color:var(--color-fog-veil);white-space:nowrap;" for="admCatFruitOrderFee">Phí cố định / đơn:</label>
                    <input type="number" id="admCatFruitOrderFee" class="input-box" style="max-width:120px;padding:6px 10px;" value="${orderFeeVal}" step="1000" min="0" />
                    <span style="font-size:11.5px;color:var(--color-fog-veil);">đ</span>
                  </div>
                `
            : ''
          }

                <div class="pricing-preview-line" id="admCatPreview_${cat.key}" data-sample-name="${escapeHtml(sample?.name || '')}" data-sample-cost="${sample?.cost || 0}">
                  ${sample
            ? `VD: <strong>${escapeHtml(sample.name)}</strong> · gốc ${formatVnd(sample.cost)} → bán CTV <strong style="color:#5eead4;">${formatVnd(sampleSell)}</strong> <span style="color:#4ade80;">(+${formatVnd(sampleProfit)})</span>`
            : cat.key.startsWith('backup_') ? 'Mức cộng được tính một lần trên báo giá của cả đơn.' : `Hiện Server Zn chưa mở gói mẫu cho danh mục này; mức cộng sẽ tự áp dụng ngay khi mở bán.`
          }
                </div>

                ${showPerPkgBtn
            ? `
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding-top:2px;">
                    <button type="button" class="btn-frost pricing-cat-subpkg-btn" data-open-cat-pkgs="${cat.key}" style="width:100%;justify-content:space-between;">
                      <span style="display:inline-flex;align-items:center;gap:6px;">${znIcon('package', 14)} <span>Chỉnh từng gói riêng (${catPkgCount} gói)</span></span>
                      <span style="font-size:11px;color:${overrideCount > 0 ? '#fde68a' : 'var(--color-aurora-gradient)'};">${overrideCount > 0 ? `${overrideCount} đã chỉnh riêng →` : 'Mở danh sách →'}</span>
                    </button>
                  </div>
                `
            : ''
          }

                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding-top:6px;border-top:1px solid rgba(186,215,247,0.08);flex-wrap:wrap;">
                  ${overrideCount > 0
            ? `<span style="font-size:11.5px;color:#fbbf24;display:inline-flex;align-items:center;gap:4px;" title="Khi bấm Cập nhật quy tắc chung, các gói đã chỉnh riêng vẫn giữ nguyên giá riêng">${znIcon('lock', 12)} <span>Giữ nguyên ${overrideCount} gói chỉnh riêng</span></span>`
            : `<span style="font-size:11px;color:var(--color-fog-veil);">Áp dụng chung toàn danh mục</span>`
          }
                  <div style="display:flex;gap:6px;align-items:center;">
                    ${overrideCount > 0 ? `<button type="button" class="btn-frost" style="padding:5px 8px;font-size:11px;" data-reset-cat-overrides="${cat.key}">${znIcon('refresh', 11)} <span>Gỡ giá riêng</span></button>` : ''}
                    <button type="button" class="btn-violet" style="padding:6px 14px;font-size:12px;" data-save-single-cat="${cat.key}" data-override-count="${overrideCount}">
                      ${znIcon('check', 13)} <span>Cập nhật</span>
                    </button>
                  </div>
                </div>
              </div>
            `;
      }).join('')}
        </div>

        <div style="display:flex;justify-content:flex-end;margin-top:16px;">
          <button type="button" class="btn-violet" id="btnSaveAllCatsBottom">${znIcon('save', 14)} <span>Cập nhật tất cả danh mục</span></button>
        </div>
      `
      : state.adminPricingTab === 'packages'
        ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
          ${[
          ['all', null, 'Tất cả'],
          ['fruit_coin', 'coins', 'Xu Nông Trại'],
          ['buff_tim', 'heart', 'Buff Tim'],
          ['buff_sao', 'star', 'Buff Sao'],
          ['guestbook', 'message', 'Bài Viết'],
          ['weather_buff', 'cloud', 'Buff Thời Tiết'],
          ['farm_gift', 'gift', 'Quà nông trại'],
          ['mail_gift', 'mail', 'Quà thư'],
        ]
          .map(
            ([k, iconKey, label]) => `
            <button type="button" class="btn-frost ${state.adminPkgCatFilter === k ? 'is-active' : ''}" style="padding:6px 12px;font-size:12px;" data-adm-pkg-filter="${k}">
              ${iconKey ? `${znIcon(iconKey, 13)} ` : ''}<span>${label} (${pkgCatCounts[k] || 0})</span>
            </button>
          `
          )
          .join('')}
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>DANH MỤC</th>
                <th>TÊN GÓI DỊCH VỤ</th>
                <th>GIÁ GỐC SERVER ZN</th>
                <th>CHỈNH CỘNG RIÊNG (+VNĐ / +% / GIÁ BÁN)</th>
                <th>GIÁ BÁN CTV &amp; LÃI</th>
                <th>CẬP NHẬT</th>
              </tr>
            </thead>
            <tbody>
              ${filteredPackages.length === 0
          ? `<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--color-fog-veil);">Hiện Server Zn chưa mở gói nào cho danh mục này.</td></tr>`
          : filteredPackages.slice(0, pageLimit('pricePackages'))
            .map((p) => renderPackagePricingRowHtml(p, { cm, modes, percents, showCategoryCol: true, idPrefix: 'admPkg' }))
            .join('')
        }
              ${moreButton('pricePackages', filteredPackages.length, 6)}
            </tbody>
          </table>
        </div>
      `
        : `
        <div style="background:var(--color-liquid-deep);box-shadow:var(--shadow-subtle);padding:14px 16px;border-radius:10px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="font-size:13px;color:#fff;font-weight:600;">Mức chung cho trái chưa chỉnh riêng:</span>
            <div class="pricing-mode-switch">
              <button type="button" class="pricing-mode-btn ${fruitMode === 'fixed' ? 'is-active' : ''}" id="btnFruitBarModeFixed">+VNĐ/trái</button>
              <button type="button" class="pricing-mode-btn ${fruitMode === 'percent' ? 'is-active' : ''}" id="btnFruitBarModePct">+%</button>
            </div>
            <input type="number" id="admFruitGeneralValInput" class="input-box" style="width:110px;" value="${fruitMode === 'percent' ? fruitPercent : defaultFruitMarkup}" step="${fruitMode === 'percent' ? 1 : 10}" min="0" max="${fruitMode === 'percent' ? 500 : 1000000}" />
            <span id="admFruitGeneralUnit" style="font-size:12px;color:var(--color-moon-mist);">${fruitMode === 'percent' ? '%' : 'đ / trái'}</span>
            ${Object.keys(fruitOverrides).length > 0
          ? `<label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#fbbf24;cursor:pointer;">
                    <input type="checkbox" id="admFruitApplyAllOverrides" />
                    <span>Ghi đè luôn ${Object.keys(fruitOverrides).length} trái đang đặt giá riêng</span>
                  </label>`
          : ''
        }
            <button type="button" class="btn-violet" id="btnSaveFruitGeneral" style="padding:7px 14px;font-size:12px;">${znIcon('check', 13)} <span>Cập nhật mức chung</span></button>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <select id="admFruitFilterSelect" class="input-box" style="width:auto;">
              <option value="all" ${state.adminFruitFilter === 'all' ? 'selected' : ''}>Tất cả (${fruits.length})</option>
              <option value="custom" ${state.adminFruitFilter === 'custom' ? 'selected' : ''}>Đang đặt giá riêng (${Object.keys(fruitOverrides).length})</option>
            </select>
            <input type="text" id="admFruitSearchInput" class="input-box" style="width:230px;" placeholder="Tìm trái cây: Nhân sâm..." value="${escapeHtml(state.adminFruitSearch)}" />
          </div>
        </div>

        <div class="table-wrap" style="max-height:540px;overflow-y:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>TRÁI CÂY</th>
                <th>TỒN KHO</th>
                <th>GIÁ GỐC SERVER ZN</th>
                <th>GIÁ BÁN CHO CTV (VNĐ)</th>
                <th>LÃI ADMIN / TRÁI</th>
                <th>CẬP NHẬT / 19 ĐỘT BIẾN</th>
              </tr>
            </thead>
            <tbody id="admFruitTbody">
              ${renderAdminFruitRowsHtml(filteredFruits)}
            </tbody>
          </table>
        </div>
      `
    }
    </div>
  `;
}

function renderAdminFruitRowsHtml(fruits) {
  const adm = state.adminOverview;
  const fruitMode = adm?.settings?.categoryMarkupModes?.fruit_by_fruit === 'percent' ? 'percent' : 'fixed';
  const fruitPct = Number(adm?.settings?.categoryMarkupPercents?.fruit_by_fruit ?? 0);
  const defMk = Number(adm?.settings?.defaultFruitUnitMarkup ?? 40);

  if (fruits.length === 0) {
    return `<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--color-fog-veil);">Không tìm thấy trái cây phù hợp.</td></tr>`;
  }

  return fruits.slice(0, pageLimit('priceFruits'))
    .map((f) => {
      const cost = f._admin?.cost_unit_price ?? 0;
      const sell = f.unit_price;
      const profit = sell - cost;
      const pctProf = cost > 0 ? Math.round((profit / cost) * 100) : 0;
      const hasOverride = !!f._admin?.has_custom_override;
      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:10px;">
              ${f.icon ? `<img src="${escapeHtml(f.icon)}" loading="lazy" decoding="async" style="width:30px;height:30px;object-fit:contain;" alt="" />` : `<span class="dashboard-cat-icon" style="width:30px;height:30px;">${znIcon('fruit', 15)}</span>`}
              <div>
                <strong style="color:#fff;">${escapeHtml(f.name)}</strong>
                <div style="font-size:10.5px;color:${hasOverride ? '#fbbf24' : '#5eead4'};">
                  ${hasOverride ? 'Giá cố định riêng' : fruitMode === 'percent' ? `Tự động (+${fruitPct}%)` : `Tự động (+${formatVnd(defMk)})`}
                </div>
              </div>
            </div>
          </td>
          <td>${formatNum(f.stock_quantity)} trái</td>
          <td><strong style="color:var(--color-moon-mist);">${formatVnd(cost)}</strong></td>
          <td style="min-width:140px;max-width:170px;">
            <input
              type="number"
              class="input-box adm-fruit-unit-input"
              data-fruit-id="${f.id}"
              data-cost="${cost}"
              data-has-override="${hasOverride ? '1' : '0'}"
              value="${sell}"
              step="10"
              min="0"
            />
          </td>
          <td>
            <span class="badge-tag ${profit >= 0 ? 'green' : 'red'}" id="admFruitProfit_${f.id}">
              ${profit >= 0 ? `+${formatVnd(profit)}` : formatVnd(profit)} (${pctProf >= 0 ? `+${pctProf}%` : `${pctProf}%`})
            </span>
          </td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" class="btn-violet" style="padding:5px 10px;font-size:11px;" data-save-fruit-row="${f.id}">${znIcon('check', 12)} <span>Cập nhật</span></button>
              ${hasOverride ? `<button type="button" class="btn-frost" style="padding:5px 8px;font-size:11px;" data-reset-fruit-override="${f.id}">${znIcon('refresh', 11)} <span>Tự động</span></button>` : ''}
              <button type="button" class="btn-frost" style="padding:5px 9px;font-size:11px;" data-open-mut-pricing="${f.id}">
                19 đột biến
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('') + moreButton('priceFruits', fruits.length, 6);
}

async function savePricingSettingsAndReload(payload, successMsg) {
  const r = await apiFetch('/api/admin/settings', 'PUT', payload);
  showToast(successMsg || r.message || 'Đã cập nhật bảng giá thành công!');
  await Promise.all([loadCatalog(false, '', 6500), loadAdminOverview()]);
  renderCurrentView();
}

function bindAdminFruitRowEvents(scope = document) {
  scope.querySelectorAll('.adm-fruit-unit-input').forEach((inp) => {
    inp.addEventListener('input', () => {
      inp.dataset.dirty = '1';
      const fid = inp.dataset.fruitId;
      const cost = Number(inp.dataset.cost || 0);
      const sell = Number(inp.value || 0);
      const prof = sell - cost;
      const pctProf = cost > 0 ? Math.round((prof / cost) * 100) : 0;
      const badge = document.getElementById(`admFruitProfit_${fid}`);
      if (badge) {
        badge.textContent = `${prof >= 0 ? `+${formatVnd(prof)}` : formatVnd(prof)} (${pctProf >= 0 ? `+${pctProf}%` : `${pctProf}%`})`;
        badge.className = `badge-tag ${prof >= 0 ? 'green' : 'red'}`;
      }
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.querySelector(`[data-save-fruit-row="${inp.dataset.fruitId}"]`)?.click();
      }
    });
  });

  scope.querySelectorAll('[data-save-fruit-row]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const fid = btn.dataset.saveFruitRow;
      const inp = document.querySelector(`.adm-fruit-unit-input[data-fruit-id="${fid}"]`);
      if (!inp) return;
      const val = Number(inp.value);
      const cost = Number(inp.dataset.cost || 0);
      if (!Number.isFinite(val) || val < 0) {
        showToast('Giá bán phải là số nguyên không âm.');
        return;
      }
      if (val < cost) {
        showToast(`Lưu ý: Giá nhập (${formatVnd(val)}) thấp hơn giá gốc (${formatVnd(cost)}) — hệ thống tự giữ tối thiểu bằng giá gốc.`);
      }
      btn.disabled = true;
      btn.textContent = 'Đang lưu...';
      try {
        await savePricingSettingsAndReload({ fruitUnitPrices: { [fid]: Math.round(val) } }, 'Đã cập nhật giá bán trái cây!');
      } catch (err) {
        showToast(`Lỗi: ${err.message}`);
        btn.disabled = false;
        btn.innerHTML = `${znIcon('check', 12)} <span>Cập nhật</span>`;
      }
    });
  });

  scope.querySelectorAll('[data-reset-fruit-override]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const fid = btn.dataset.resetFruitOverride;
      btn.disabled = true;
      try {
        await savePricingSettingsAndReload({ fruitUnitPrices: { [fid]: null } }, 'Đã đưa giá trái cây về chế độ tự động!');
      } catch (err) {
        showToast(`Lỗi: ${err.message}`);
        btn.disabled = false;
      }
    });
  });

  scope.querySelectorAll('[data-open-mut-pricing]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openAdminMutationPricingModal(Number(btn.dataset.openMutPricing));
    });
  });
}

function updateCategoryCardPreview(catKey) {
  const card = document.querySelector(`[data-cat-card="${catKey}"]`);
  const previewEl = document.getElementById(`admCatPreview_${catKey}`);
  if (!card || !previewEl) return;
  const sampleName = previewEl.dataset.sampleName;
  const sampleCost = Number(previewEl.dataset.sampleCost || 0);
  if (!sampleName) return;
  const activeModeBtn = card.querySelector('.pricing-mode-btn.is-active');
  const mode = activeModeBtn?.dataset.mode === 'percent' ? 'percent' : 'fixed';
  const fixedVal = Number(document.getElementById(`admCatFixed_${catKey}`)?.value || 0);
  const pctVal = Number(document.getElementById(`admCatPct_${catKey}`)?.value || 0);
  const sell = computePreviewSell(sampleCost, mode, fixedVal, pctVal);
  const profit = sell - sampleCost;
  previewEl.innerHTML = `VD: <strong>${escapeHtml(sampleName)}</strong> · gốc ${formatVnd(sampleCost)} → bán CTV <strong style="color:#5eead4;">${formatVnd(sell)}</strong> <span style="color:#4ade80;">(+${formatVnd(profit)})</span>`;
}

function buildCategoryPayload(catKey) {
  const card = document.querySelector(`[data-cat-card="${catKey}"]`);
  if (!card) return null;
  const mode = card.querySelector('.pricing-mode-btn.is-active')?.dataset.mode === 'percent' ? 'percent' : 'fixed';
  const fixedVal = Math.max(0, Math.round(Number(document.getElementById(`admCatFixed_${catKey}`)?.value || 0)));
  const pctVal = Math.max(0, Math.min(500, Number(document.getElementById(`admCatPct_${catKey}`)?.value || 0)));
  const payload = {
    categoryMarkupModes: { [catKey]: mode },
    categoryMarkupPercents: { [catKey]: pctVal },
  };
  if (catKey === 'fruit_by_fruit') {
    payload.defaultFruitUnitMarkup = fixedVal;
    const feeEl = document.getElementById('admCatFruitOrderFee');
    if (feeEl) payload.categoryMarkups = { fruit_by_fruit: Math.max(0, Math.round(Number(feeEl.value || 0))) };
  } else {
    payload.categoryMarkups = { [catKey]: fixedVal };
  }
  // Never reset per-package custom overrides when updating the general category rule.
  return payload;
}

function collectPackageRowPayload(row) {
  const key = row?.dataset?.pkgKey || row?.dataset?.pkgRow;
  const mode = row?.dataset?.mode || 'fixed';
  const inp = row?.querySelector('.adm-pkg-override-input');
  if (!key || !inp) return { error: 'Không tìm thấy dữ liệu gói.' };
  const val = Number(inp.value);
  const cost = Number(row.dataset.cost || inp.dataset.cost || 0);
  if (inp.value === '' || !Number.isFinite(val)) {
    return { error: 'Vui lòng nhập số hợp lệ.' };
  }
  if (mode === 'price') {
    if (val <= 0) return { error: 'Giá bán cố định phải lớn hơn 0đ (hoặc bấm ↺ Quy tắc chung).' };
    return {
      key,
      warnBelowCost: val < cost ? { val, cost } : null,
      packagePriceOverrides: { [key]: Math.round(val) },
    };
  }
  if (mode === 'percent') {
    if (val < 0 || val > 500) return { error: 'Phần trăm cộng riêng phải nằm trong khoảng 0 đến 500%.' };
    return {
      key,
      packageMarkupOverrides: { [key]: { mode: 'percent', value: Math.round(val * 100) / 100 } },
    };
  }
  if (val < 0) return { error: 'Số tiền cộng riêng phải lớn hơn hoặc bằng 0đ.' };
  return {
    key,
    packageMarkupOverrides: { [key]: { mode: 'fixed', value: Math.round(val) } },
  };
}

let admFruitSearchTimer = null;
function bindPackageRows(scope = document, { idPrefix = 'admPkg', onSaved = null } = {}) {
  const updateRowPreview = (row) => {
    const key = row.dataset.pkgRow;
    const cost = Number(row.dataset.cost || 0);
    const mode = row.dataset.mode || 'fixed';
    const inp = row.querySelector('.adm-pkg-override-input');
    const preview = computePackagePreview(cost, mode, inp?.value ?? 0);
    const safeId = `${idPrefix}_${key.replace(':', '_')}`;
    const sellEl = row.querySelector(`#${safeId}_sell`) || document.getElementById(`${safeId}_sell`);
    const profEl = row.querySelector(`#${safeId}_profit`) || document.getElementById(`${safeId}_profit`);
    if (sellEl) sellEl.textContent = formatVnd(preview.sell);
    if (profEl) {
      profEl.textContent = `${preview.profit >= 0 ? `+${formatVnd(preview.profit)}` : formatVnd(preview.profit)} (${preview.pct >= 0 ? `+${preview.pct}%` : `${preview.pct}%`})`;
      profEl.className = `badge-tag ${preview.profit >= 0 ? 'green' : 'red'}`;
    }
  };

  scope.querySelectorAll('[data-pkg-mode-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('tr[data-pkg-row]');
      if (!row) return;
      const nextMode = btn.dataset.mode;
      const prevMode = row.dataset.mode || 'fixed';
      if (nextMode === prevMode) return;
      const cost = Number(row.dataset.cost || 0);
      const inp = row.querySelector('.adm-pkg-override-input');
      const prevPreview = computePackagePreview(cost, prevMode, inp?.value ?? 0);
      row.dataset.mode = nextMode;
      row.querySelectorAll('[data-pkg-mode-btn]').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === nextMode));
      if (inp) {
        if (nextMode === 'percent') {
          inp.value = cost > 0 ? Math.max(0, Math.min(500, Math.round((prevPreview.profit / cost) * 1000) / 10)) : 0;
          inp.step = '0.5';
          inp.max = '500';
        } else if (nextMode === 'price') {
          inp.value = prevPreview.sell;
          inp.step = '1000';
          inp.removeAttribute('max');
        } else {
          inp.value = Math.max(0, prevPreview.profit);
          inp.step = '1000';
          inp.removeAttribute('max');
        }
        inp.dataset.dirty = '1';
      }
      const unitEl = row.querySelector('.pkg-mode-unit');
      if (unitEl) {
        unitEl.textContent = nextMode === 'percent' ? '%' : nextMode === 'price' ? 'đ bán' : 'đ cộng thêm';
      }
      updateRowPreview(row);
    });
  });

  scope.querySelectorAll('.adm-pkg-override-input').forEach((inp) => {
    inp.addEventListener('input', () => {
      inp.dataset.dirty = '1';
      const row = inp.closest('tr[data-pkg-row]');
      if (row) updateRowPreview(row);
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const row = inp.closest('tr[data-pkg-row]');
        row?.querySelector('[data-save-pkg-row]')?.click();
      }
    });
  });

  scope.querySelectorAll('[data-save-pkg-row]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('tr[data-pkg-row]');
      const built = collectPackageRowPayload(row);
      if (built.error) {
        showToast(built.error);
        return;
      }
      if (built.warnBelowCost) {
        showToast(`Lưu ý: Giá nhập (${formatVnd(built.warnBelowCost.val)}) thấp hơn giá gốc (${formatVnd(built.warnBelowCost.cost)}) — hệ thống tự giữ tối thiểu bằng giá gốc.`);
      }
      const payload = {};
      if (built.packagePriceOverrides) payload.packagePriceOverrides = built.packagePriceOverrides;
      if (built.packageMarkupOverrides) payload.packageMarkupOverrides = built.packageMarkupOverrides;
      btn.disabled = true;
      btn.textContent = 'Đang lưu...';
      try {
        await savePricingSettingsAndReload(payload, 'Đã lưu giá riêng cho gói này! (Không bị ảnh hưởng khi sửa quy tắc chung)');
        if (onSaved) onSaved();
      } catch (err) {
        showToast(`Lỗi: ${err.message}`);
        btn.disabled = false;
        btn.innerHTML = `${znIcon('check', 12)} <span>Lưu riêng</span>`;
      }
    });
  });

  scope.querySelectorAll('[data-reset-pkg-override]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.resetPkgOverride;
      btn.disabled = true;
      try {
        await savePricingSettingsAndReload(
          { packagePriceOverrides: { [key]: null }, packageMarkupOverrides: { [key]: null } },
          'Đã đưa gói về quy tắc chung của danh mục!'
        );
        if (onSaved) onSaved();
      } catch (err) {
        showToast(`Lỗi: ${err.message}`);
        btn.disabled = false;
      }
    });
  });
}

function openCategoryPackagePricingModal(catKey) {
  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  const catMeta = PRICING_CATEGORIES.find((c) => c.key === catKey);
  const adm = state.adminOverview;
  const cm = adm?.settings?.categoryMarkups || {};
  const modes = adm?.settings?.categoryMarkupModes || {};
  const percents = adm?.settings?.categoryMarkupPercents || {};
  const allPkgs = getAllAdminFixedPackages(state.catalogData).filter((p) => p.catKey === catKey);
  const catRuleText = modes[catKey] === 'percent'
    ? `+${percents[catKey] ?? 0}% trên giá gốc`
    : `+${formatVnd(cm[catKey] ?? 5000)} / đơn`;
  const customCount = allPkgs.filter((p) => p.hasOverride).length;

  box.className = 'modal-box wide';
  title.textContent = `Chỉnh từng gói riêng — ${catMeta?.label || catKey}`;

  body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;background:var(--color-liquid-deep);padding:12px 14px;border-radius:10px;border:1px solid rgba(203,255,252,0.18);">
      <div style="font-size:12.5px;color:var(--color-moon-mist);line-height:1.55;">
        <div>Quy tắc chung hiện tại của danh mục: <strong style="color:#5eead4;">${escapeHtml(catRuleText)}</strong> · Đang chỉnh riêng: <strong style="color:#fbbf24;">${customCount}/${allPkgs.length} gói</strong></div>
        <div style="font-size:11.5px;color:var(--color-fog-veil);">Gói nào đã bấm <strong>Lưu riêng</strong> sẽ không áp dụng quy tắc chung khi bạn cập nhật danh mục, cho đến khi bạn sửa lại hoặc bấm <strong>Quy tắc chung</strong>.</div>
      </div>
      ${allPkgs.length > 0 ? `<button type="button" class="btn-violet" id="btnSaveAllModalCatPkgs" style="padding:7px 14px;font-size:12px;">${znIcon('save', 13)} <span>Lưu tất cả gói đã sửa</span></button>` : ''}
    </div>
    ${allPkgs.length === 0
      ? `<div style="text-align:center;padding:30px;color:var(--color-fog-veil);">Hiện Server Zn chưa mở gói nào cho danh mục này.</div>`
      : `
      <div class="table-wrap" style="max-height:60vh;overflow-y:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>TÊN GÓI</th>
              <th>GIÁ GỐC SERVER ZN</th>
              <th>CHỈNH CỘNG RIÊNG (+VNĐ / +% / GIÁ BÁN)</th>
              <th>GIÁ BÁN CTV &amp; LÃI</th>
              <th>THAO TÁC</th>
            </tr>
          </thead>
          <tbody id="modalCatPkgsTbody">
            ${allPkgs.map((p) => renderPackagePricingRowHtml(p, { cm, modes, percents, showCategoryCol: false, idPrefix: 'modalPkg' })).join('')}
          </tbody>
        </table>
      </div>
    `
    }
  `;

  overlay.style.display = 'flex';
  bindPackageRows(body, {
    idPrefix: 'modalPkg',
    onSaved: () => openCategoryPackagePricingModal(catKey),
  });

  body.querySelector('#btnSaveAllModalCatPkgs')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const dirtyRows = [...body.querySelectorAll('tr[data-pkg-row]')].filter((row) =>
      row.querySelector('.adm-pkg-override-input[data-dirty="1"]')
    );
    if (dirtyRows.length === 0) {
      showToast('Chưa có gói nào thay đổi. Hãy nhập mức cộng riêng rồi bấm Lưu.');
      return;
    }
    const packagePriceOverrides = {};
    const packageMarkupOverrides = {};
    for (const row of dirtyRows) {
      const built = collectPackageRowPayload(row);
      if (built.error) {
        showToast(built.error);
        return;
      }
      if (built.packagePriceOverrides) Object.assign(packagePriceOverrides, built.packagePriceOverrides);
      if (built.packageMarkupOverrides) Object.assign(packageMarkupOverrides, built.packageMarkupOverrides);
    }
    const payload = {};
    if (Object.keys(packagePriceOverrides).length > 0) payload.packagePriceOverrides = packagePriceOverrides;
    if (Object.keys(packageMarkupOverrides).length > 0) payload.packageMarkupOverrides = packageMarkupOverrides;
    btn.disabled = true;
    btn.textContent = 'Đang lưu...';
    try {
      await savePricingSettingsAndReload(payload, `Đã lưu giá riêng cho ${dirtyRows.length} gói thành công!`);
      openCategoryPackagePricingModal(catKey);
    } catch (err) {
      showToast(`Lỗi: ${err.message}`);
      btn.disabled = false;
      btn.innerHTML = `${znIcon('save', 13)} <span>Lưu tất cả gói đã sửa</span>`;
    }
  });
}

function bindAdminPricingEvents() {
  document.getElementById('btnRefreshAdminPricing')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnRefreshAdminPricing');
    if (btn) { btn.disabled = true; btn.textContent = 'Đang tải...'; }
    showToast('Đang tải giá gốc mới nhất từ Server Zn...');
    await Promise.all([loadCatalog(true, '', 6500), loadAdminOverview()]);
    if (state.currentView === 'admin_pricing' && !isUserTypingOrModalOpen()) renderCurrentView();
  });

  document.querySelectorAll('[data-adm-ptab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.adminPricingTab = btn.dataset.admPtab;
      renderCurrentView();
    });
  });

  // --- TAB 1: CATEGORY PRICING (FIXED VNĐ + PERCENT %) ---
  document.querySelectorAll('[data-cat-mode-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const catKey = btn.dataset.catModeBtn;
      const mode = btn.dataset.mode;
      const card = document.querySelector(`[data-cat-card="${catKey}"]`);
      if (!card) return;
      card.querySelectorAll('[data-cat-mode-btn]').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode));
      const fWrap = card.querySelector(`[data-cat-fixed-wrap="${catKey}"]`);
      const pWrap = card.querySelector(`[data-cat-percent-wrap="${catKey}"]`);
      if (fWrap) fWrap.style.display = mode === 'fixed' ? 'flex' : 'none';
      if (pWrap) pWrap.style.display = mode === 'percent' ? 'flex' : 'none';
      updateCategoryCardPreview(catKey);
    });
  });

  document.querySelectorAll('[data-preset-cat]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const catKey = chip.dataset.presetCat;
      const mode = chip.dataset.presetMode;
      const val = chip.dataset.presetVal;
      const inp = document.getElementById(mode === 'percent' ? `admCatPct_${catKey}` : `admCatFixed_${catKey}`);
      if (inp) {
        inp.value = val;
        updateCategoryCardPreview(catKey);
      }
    });
  });

  document.querySelectorAll('.adm-cat-fixed-input, .adm-cat-pct-input').forEach((inp) => {
    inp.addEventListener('input', () => updateCategoryCardPreview(inp.dataset.catKey));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.querySelector(`[data-save-single-cat="${inp.dataset.catKey}"]`)?.click();
      }
    });
  });

  document.querySelectorAll('[data-open-cat-pkgs]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const catKey = btn.dataset.openCatPkgs;
      openCategoryPackagePricingModal(catKey);
      const changed = await loadCatalog(true, catKey, 6500);
      const overlay = document.getElementById('appModalOverlay');
      if (changed && overlay && overlay.style.display !== 'none' && !document.querySelector('#modalCatPkgsTbody .adm-pkg-override-input[data-dirty="1"]')) {
        openCategoryPackagePricingModal(catKey);
      }
    });
  });

  document.querySelectorAll('[data-save-single-cat]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const catKey = btn.dataset.saveSingleCat;
      const ovrCount = Number(btn.dataset.overrideCount || 0);
      const payload = buildCategoryPayload(catKey);
      if (!payload) return;
      btn.disabled = true;
      btn.textContent = 'Đang lưu...';
      try {
        const msg = ovrCount > 0
          ? `Đã cập nhật quy tắc chung danh mục (giữ nguyên ${ovrCount} gói đã chỉnh riêng)!`
          : 'Đã cập nhật giá danh mục thành công!';
        await savePricingSettingsAndReload(payload, msg);
      } catch (err) {
        showToast(`Lỗi: ${err.message}`);
        btn.disabled = false;
        btn.innerHTML = `${znIcon('check', 12)} <span>Cập nhật</span>`;
      }
    });
  });

  document.querySelectorAll('[data-reset-cat-overrides]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const catKey = btn.dataset.resetCatOverrides;
      if (!confirm('Gỡ toàn bộ giá cố định riêng của danh mục này để chạy theo cấu hình tự động?')) return;
      btn.disabled = true;
      try {
        await savePricingSettingsAndReload({ resetCategoryOverrides: [catKey] }, 'Đã gỡ toàn bộ giá riêng của danh mục!');
      } catch (err) {
        showToast(`Lỗi: ${err.message}`);
        btn.disabled = false;
      }
    });
  });

  const saveAllCategories = async (triggerBtn) => {
    const categoryMarkups = {};
    const categoryMarkupModes = {};
    const categoryMarkupPercents = {};
    const resetCategoryOverrides = [];
    let defaultFruitUnitMarkup;
    for (const cat of PRICING_CATEGORIES) {
      const sub = buildCategoryPayload(cat.key);
      if (!sub) continue;
      Object.assign(categoryMarkupModes, sub.categoryMarkupModes);
      Object.assign(categoryMarkupPercents, sub.categoryMarkupPercents);
      if (sub.categoryMarkups) Object.assign(categoryMarkups, sub.categoryMarkups);
      if (sub.defaultFruitUnitMarkup !== undefined) defaultFruitUnitMarkup = sub.defaultFruitUnitMarkup;
      if (sub.resetCategoryOverrides?.length) resetCategoryOverrides.push(...sub.resetCategoryOverrides);
    }
    if (triggerBtn) { triggerBtn.disabled = true; triggerBtn.textContent = 'Đang cập nhật...'; }
    try {
      const body = { categoryMarkups, categoryMarkupModes, categoryMarkupPercents, defaultFruitUnitMarkup };
      if (resetCategoryOverrides.length > 0) body.resetCategoryOverrides = resetCategoryOverrides;
      await savePricingSettingsAndReload(
        body,
        'Đã cập nhật giá cho toàn bộ danh mục!'
      );
    } catch (err) {
      showToast(`Lỗi: ${err.message}`);
      if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.innerHTML = `${znIcon('save', 14)} <span>Cập nhật tất cả danh mục</span>`; }
    }
  };
  document.getElementById('btnSaveAllCatsBottom')?.addEventListener('click', (e) => saveAllCategories(e.currentTarget));

  // --- TAB 2: FIXED PACKAGES ---
  document.querySelectorAll('[data-adm-pkg-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.listLimits.pricePackages = 20;
      state.adminPkgCatFilter = btn.dataset.admPkgFilter;
      renderCurrentView();
    });
  });

  bindPackageRows();

  // --- TAB 3: FRUITS ---
  let activeFruitBarMode = state.adminOverview?.settings?.categoryMarkupModes?.fruit_by_fruit === 'percent' ? 'percent' : 'fixed';
  const switchFruitBarMode = (mode) => {
    activeFruitBarMode = mode;
    document.getElementById('btnFruitBarModeFixed')?.classList.toggle('is-active', mode === 'fixed');
    document.getElementById('btnFruitBarModePct')?.classList.toggle('is-active', mode === 'percent');
    const inp = document.getElementById('admFruitGeneralValInput');
    const unitEl = document.getElementById('admFruitGeneralUnit');
    if (inp) {
      inp.value = mode === 'percent'
        ? Number(state.adminOverview?.settings?.categoryMarkupPercents?.fruit_by_fruit ?? 0)
        : Number(state.adminOverview?.settings?.defaultFruitUnitMarkup ?? 40);
      inp.step = mode === 'percent' ? '1' : '10';
    }
    if (unitEl) unitEl.textContent = mode === 'percent' ? '%' : 'đ / trái';
  };
  document.getElementById('btnFruitBarModeFixed')?.addEventListener('click', () => switchFruitBarMode('fixed'));
  document.getElementById('btnFruitBarModePct')?.addEventListener('click', () => switchFruitBarMode('percent'));
  document.getElementById('btnSaveFruitGeneral')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const val = Number(document.getElementById('admFruitGeneralValInput')?.value || 0);
    const payload = { categoryMarkupModes: { fruit_by_fruit: activeFruitBarMode } };
    if (activeFruitBarMode === 'percent') payload.categoryMarkupPercents = { fruit_by_fruit: Math.max(0, Math.min(500, val)) };
    else payload.defaultFruitUnitMarkup = Math.max(0, Math.round(val));
    const applyAllOvr = document.getElementById('admFruitApplyAllOverrides');
    if (applyAllOvr && applyAllOvr.checked) {
      payload.resetCategoryOverrides = ['fruit_by_fruit'];
    }
    btn.disabled = true;
    btn.textContent = 'Đang lưu...';
    try {
      await savePricingSettingsAndReload(payload, 'Đã cập nhật mức cộng chung cho tất cả trái cây!');
    } catch (err) {
      showToast(`Lỗi: ${err.message}`);
      btn.disabled = false;
      btn.innerHTML = `${znIcon('check', 13)} <span>Cập nhật mức chung</span>`;
    }
  });

  document.getElementById('admFruitFilterSelect')?.addEventListener('change', (e) => {
    state.listLimits.priceFruits = 20;
    state.adminFruitFilter = e.target.value;
    renderCurrentView();
  });

  const searchIn = document.getElementById('admFruitSearchInput');
  searchIn?.addEventListener('input', (e) => {
    state.listLimits.priceFruits = 20;
    state.adminFruitSearch = e.target.value;
    if (admFruitSearchTimer && typeof clearTimeout === 'function') clearTimeout(admFruitSearchTimer);
    admFruitSearchTimer = setTimeout(() => {
      const tbody = document.getElementById('admFruitTbody');
      if (!tbody) return;
      const fruits = state.catalogData?.catalog?.fruit_by_fruit || [];
      const q = state.adminFruitSearch.trim().toLowerCase();
      const filtered = fruits.filter((f) => {
        if (state.adminFruitFilter === 'custom' && !f._admin?.has_custom_override) return false;
        if (q && !f.name.toLowerCase().includes(q)) return false;
        return true;
      });
      tbody.innerHTML = renderAdminFruitRowsHtml(filtered);
      bindAdminFruitRowEvents();
    }, 80);
  });

  bindAdminFruitRowEvents();

  // --- TOP MASTER SAVE BUTTON (Works across ALL 3 tabs!) ---
  document.getElementById('btnSaveAllAdminPricing')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (state.adminPricingTab === 'categories') {
      await saveAllCategories(btn);
      return;
    }

    const payload = {};
    if (state.adminPricingTab === 'fruits') {
      const genInput = document.getElementById('admFruitGeneralValInput');
      if (genInput) {
        const val = Number(genInput.value || 0);
        payload.categoryMarkupModes = { fruit_by_fruit: activeFruitBarMode };
        if (activeFruitBarMode === 'percent') payload.categoryMarkupPercents = { fruit_by_fruit: Math.max(0, Math.min(500, val)) };
        else payload.defaultFruitUnitMarkup = Math.max(0, Math.round(val));
      }
      const fruitUnitPrices = {};
      document.querySelectorAll('.adm-fruit-unit-input[data-dirty="1"]').forEach((inp) => {
        fruitUnitPrices[inp.dataset.fruitId] = inp.value === '' ? null : Math.round(Number(inp.value));
      });
      if (Object.keys(fruitUnitPrices).length > 0) {
        payload.fruitUnitPrices = fruitUnitPrices;
      } else if (document.getElementById('admFruitApplyAllOverrides')?.checked) {
        payload.resetCategoryOverrides = ['fruit_by_fruit'];
      }
    } else if (state.adminPricingTab === 'packages') {
      const packagePriceOverrides = {};
      const packageMarkupOverrides = {};
      const dirtyRows = [...document.querySelectorAll('tr[data-pkg-row]')].filter((row) =>
        row.querySelector('.adm-pkg-override-input[data-dirty="1"]')
      );
      for (const row of dirtyRows) {
        const built = collectPackageRowPayload(row);
        if (built.error) {
          showToast(built.error);
          return;
        }
        if (built.packagePriceOverrides) Object.assign(packagePriceOverrides, built.packagePriceOverrides);
        if (built.packageMarkupOverrides) Object.assign(packageMarkupOverrides, built.packageMarkupOverrides);
      }
      if (Object.keys(packagePriceOverrides).length > 0) payload.packagePriceOverrides = packagePriceOverrides;
      if (Object.keys(packageMarkupOverrides).length > 0) payload.packageMarkupOverrides = packageMarkupOverrides;
    }

    if (Object.keys(payload).length === 0) {
      showToast('Chưa có thay đổi giá nào cần lưu.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Đang lưu...';
    try {
      await savePricingSettingsAndReload(payload, 'Đã cập nhật toàn bộ thay đổi bảng giá!');
    } catch (err) {
      showToast(`Lỗi: ${err.message}`);
      btn.disabled = false;
      btn.innerHTML = `${znIcon('save', 14)} <span>Cập nhật tất cả thay đổi</span>`;
    }
  });
}

function openAdminMutationPricingModal(fruitId) {
  const f = (state.catalogData?.catalog?.fruit_by_fruit || []).find((x) => Number(x.id) === Number(fruitId));
  if (!f) return;

  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  box.className = 'modal-box wide';
  title.textContent = `Chỉnh giá 19 Hệ Đột Biến: ${f.name}`;
  const muts = f.mutation_prices || [];

  body.innerHTML = `
    <div style="background:var(--color-liquid-deep);box-shadow:var(--shadow-subtle);padding:12px 14px;border-radius:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="font-size:12px;color:#fff;font-weight:600;">Áp nhanh cả 19 hệ:</span>
        <input type="number" id="mutBulkPctInput" class="input-box" style="width:90px;padding:6px 8px;" placeholder="%" value="20" min="0" max="500" />
        <button type="button" class="btn-frost" id="btnApplyMutBulkPct" style="padding:6px 10px;font-size:12px;">Áp dụng +%</button>
        <input type="number" id="mutBulkVndInput" class="input-box" style="width:110px;padding:6px 8px;" placeholder="VNĐ" value="500" step="100" min="0" />
        <button type="button" class="btn-frost" id="btnApplyMutBulkVnd" style="padding:6px 10px;font-size:12px;">Áp dụng +VNĐ</button>
      </div>
      <button type="button" class="btn-frost" id="btnResetAllMutAuto" style="padding:6px 10px;font-size:11.5px;color:#fca5a5;">↺ Đặt lại tất cả về tự động</button>
    </div>

    <div class="table-wrap" style="max-height:400px;overflow-y:auto;">
      <table class="data-table">
        <thead>
          <tr>
            <th>HỆ ĐỘT BIẾN</th>
            <th>GIÁ GỐC SERVER ZN</th>
            <th>GIÁ BÁN CHO CTV (VNĐ)</th>
            <th>LÃI / TRÁI</th>
          </tr>
        </thead>
        <tbody>
          ${muts
      .map((m) => {
        const cost = m._admin?.cost_unit_price ?? m.unit_price;
        const prof = m.unit_price - cost;
        const pctProf = cost > 0 ? Math.round((prof / cost) * 100) : 0;
        const hasOvr = !!m._admin?.has_custom_override;
        return `
            <tr>
              <td>
                <span style="display:inline-flex;align-items:center;gap:6px;">
                  <span style="width:10px;height:10px;border-radius:999px;background:${m.mutation_color};"></span>
                  <strong style="color:#fff;">${escapeHtml(m.mutation_name)}</strong>
                </span>
                <div style="font-size:10px;color:${hasOvr ? '#fbbf24' : '#5eead4'};margin-top:2px;">${hasOvr ? 'Giá cố định riêng' : 'Tự động'}</div>
              </td>
              <td>${formatVnd(cost)}</td>
              <td style="max-width:170px;">
                <input
                  type="number"
                  class="input-box adm-mut-price-input"
                  data-mut-key="${f.id}:${m.mutation_key}"
                  data-cost="${cost}"
                  value="${m.unit_price}"
                  step="100"
                  min="0"
                />
              </td>
              <td>
                <span class="badge-tag ${prof >= 0 ? 'green' : 'red'}" id="admMutProf_${f.id}_${m.mutation_key}">
                  ${prof >= 0 ? `+${formatVnd(prof)}` : formatVnd(prof)} (${pctProf >= 0 ? `+${pctProf}%` : `${pctProf}%`})
                </span>
              </td>
            </tr>
          `;
      })
      .join('')}
        </tbody>
      </table>
    </div>
    <div class="action-row align-end">
      <button type="button" class="btn-frost" id="btnCloseMutModal">Đóng</button>
      <button type="button" class="btn-violet" id="btnSaveMutPrices">${znIcon('check', 14)} <span>Cập nhật giá đột biến</span></button>
    </div>
  `;

  const updateMutRowBadge = (inp) => {
    const cost = Number(inp.dataset.cost || 0);
    const sell = Number(inp.value || 0);
    const prof = sell - cost;
    const pctProf = cost > 0 ? Math.round((prof / cost) * 100) : 0;
    const badge = document.getElementById(`admMutProf_${inp.dataset.mutKey.replace(':', '_')}`);
    if (badge) {
      badge.textContent = `${prof >= 0 ? `+${formatVnd(prof)}` : formatVnd(prof)} (${pctProf >= 0 ? `+${pctProf}%` : `${pctProf}%`})`;
      badge.className = `badge-tag ${prof >= 0 ? 'green' : 'red'}`;
    }
  };

  body.querySelectorAll('.adm-mut-price-input').forEach((inp) => {
    inp.addEventListener('input', () => {
      inp.dataset.dirty = '1';
      updateMutRowBadge(inp);
    });
  });

  body.querySelector('#btnApplyMutBulkPct')?.addEventListener('click', () => {
    const pct = Math.max(0, Math.min(500, Number(body.querySelector('#mutBulkPctInput')?.value || 0)));
    body.querySelectorAll('.adm-mut-price-input').forEach((inp) => {
      const cost = Number(inp.dataset.cost || 0);
      inp.value = Math.round(cost * (100 + pct) / 100);
      inp.dataset.dirty = '1';
      updateMutRowBadge(inp);
    });
    showToast(`Đã điền thử +${pct}% cho cả 19 hệ — bấm "Cập nhật giá đột biến" để lưu.`);
  });

  body.querySelector('#btnApplyMutBulkVnd')?.addEventListener('click', () => {
    const add = Math.max(0, Math.round(Number(body.querySelector('#mutBulkVndInput')?.value || 0)));
    body.querySelectorAll('.adm-mut-price-input').forEach((inp) => {
      const cost = Number(inp.dataset.cost || 0);
      inp.value = cost + add;
      inp.dataset.dirty = '1';
      updateMutRowBadge(inp);
    });
    showToast(`Đã điền thử +${formatVnd(add)} cho cả 19 hệ — bấm "Cập nhật giá đột biến" để lưu.`);
  });

  body.querySelector('#btnResetAllMutAuto')?.addEventListener('click', async () => {
    const fruitMutationPrices = {};
    body.querySelectorAll('.adm-mut-price-input').forEach((inp) => {
      fruitMutationPrices[inp.dataset.mutKey] = null;
    });
    try {
      overlay.style.display = 'none';
      await savePricingSettingsAndReload({ fruitMutationPrices }, `Đã đưa 19 hệ đột biến của ${f.name} về tự động!`);
    } catch (err) {
      showToast(err.message);
    }
  });

  body.querySelector('#btnCloseMutModal')?.addEventListener('click', () => {
    overlay.style.display = 'none';
  });

  body.querySelector('#btnSaveMutPrices')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const fruitMutationPrices = {};
    body.querySelectorAll('.adm-mut-price-input[data-dirty="1"]').forEach((inp) => {
      fruitMutationPrices[inp.dataset.mutKey] = inp.value === '' ? null : Math.round(Number(inp.value));
    });
    if (Object.keys(fruitMutationPrices).length === 0) {
      showToast('Chưa có thay đổi giá đột biến nào cần lưu.');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Đang lưu...';
    try {
      overlay.style.display = 'none';
      await savePricingSettingsAndReload({ fruitMutationPrices }, `Đã cập nhật giá đột biến cho ${f.name}!`);
    } catch (err) {
      showToast(err.message);
      btn.disabled = false;
      btn.innerHTML = `${znIcon('check', 14)} <span>Cập nhật giá đột biến</span>`;
    }
  });

  overlay.style.display = 'flex';
}

// ============================================================================
// 7. ADMIN PAGE: QUẢN LÝ TÀI KHOẢN CTV & CẤU HÌNH HỆ THỐNG
// ============================================================================
function renderAdminCtvPageHtml() {
  const ctvs = state.adminOverview?.ctvs || [];
  const stats = state.adminOverview?.stats || {};
  const storage = state.adminOverview?.storage || {};
  const isMaintenance = Boolean(state.adminOverview?.settings?.maintenanceMode);
  const versions = (state.adminOverview?.settings?.appVersions || state.appVersions || DEFAULT_APP_VERSIONS).slice(0, 3);
  const versionSlots = [0, 1, 2].map((idx) => versions[idx] || { version: '', date: '', highlights: [] });

  const ephemeralBanner = storage.isRender && !storage.persistent
    ? `
      <div class="tool-warning" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <span style="display:inline-flex;align-items:center;gap:7px;">${znIcon('alert', 16)} <span>Đang chạy trên ổ tạm Render Free (chưa gắn PostgreSQL miễn phí). Tài khoản CTV và số dư sẽ bị mất khi Render tắt/redeploy — hãy gắn <strong>Neon PostgreSQL miễn phí</strong> trong mục <strong>Cấu hình Server Zn</strong>.</span></span>
        <button type="button" class="btn-frost" id="btnGotoStorageSetup" style="font-size:12px;">Xem hướng dẫn gắn DB miễn phí →</button>
      </div>
    `
    : '';

  const maintenanceBanner = `
    <div class="glass-panel" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;border:1px solid ${isMaintenance ? 'rgba(253,164,175,0.45)' : 'rgba(203,255,252,0.18)'};background:${isMaintenance ? 'rgba(136,19,55,0.22)' : 'var(--color-liquid-kelp)'};">
      <div style="display:flex;flex-direction:column;gap:4px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <strong style="color:#fff;font-size:15px;display:inline-flex;align-items:center;gap:7px;">${znIcon('shield', 16)} <span>Chế độ Bảo trì CTV</span></strong>
          <span class="badge-tag ${isMaintenance ? 'red' : 'green'}">${isMaintenance ? '● ĐANG BẢO TRÌ' : '● Đang hoạt động'}</span>
        </div>
        <div style="font-size:12.5px;color:var(--color-moon-mist);">
          ${isMaintenance
      ? 'Toàn bộ tài khoản CTV đang đăng nhập hiện đang thấy màn hình <strong>"Hệ thống Zn đang bảo trì"</strong> và tạm khóa đặt đơn. Tài khoản Admin vẫn truy cập bình thường.'
      : 'Khi bật nút <strong>Bảo trì</strong>, CTV đang đăng nhập sẽ thấy <strong>"Hệ thống Zn đang bảo trì"</strong>. Nút <strong>Cập nhật cho CTV</strong> sẽ tự động tải lại trang cho toàn bộ CTV (CTV đang ngoại tuyến sẽ tự tải lại ở lần vào trình duyệt kế tiếp).'
    }
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <button type="button" class="btn-violet" id="btnNotifyCtvUpdate" style="padding:9px 16px;font-size:13px;font-weight:700;">
          ${znIcon('refresh', 14)} <span>Cập nhật cho CTV</span>
        </button>
        <button type="button" class="${isMaintenance ? 'btn-violet' : 'btn-frost'}" id="btnToggleMaintenanceMode" style="padding:9px 18px;font-size:13px;font-weight:700;${isMaintenance ? '' : 'border-color:rgba(251,191,36,0.5);color:#fbbf24;'}">
          ${isMaintenance ? `${znIcon('check', 14)} <span>Tắt bảo trì (Mở lại cho CTV)</span>` : `${znIcon('shield', 14)} <span>Bảo trì</span>`}
        </button>
      </div>
    </div>
  `;

  const versionManagerPanel = `
    <div class="glass-panel" id="adminVersionManagerPanel">
      <div class="panel-title-row">
        <div>
          <span class="panel-title-text"><span class="panel-title-icon">${znIcon('git', 16)}</span><span>Quản lý Phiên bản &amp; Nhật ký cập nhật ZnStudio</span></span>
          <div style="font-size:12px;color:var(--color-fog-veil);margin-top:4px;">
            Hiển thị <strong>Version vx.x.chữ</strong> ngay dưới thương hiệu <strong>ZnStudio</strong> cho cả CTV và Admin. Khi nhấn vào phiên bản sẽ mở danh sách <strong>3 phiên bản gần nhất</strong>.
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn-frost" id="btnPreviewVersionModal" style="font-size:12px;">
            ${znIcon('sparkles', 13)} <span>Xem trước hộp thoại CTV</span>
          </button>
          <button type="button" class="btn-frost" id="btnShiftNewVersion" style="font-size:12px;" title="Đẩy phiên bản hiện tại xuống bản #2 để nhập bản mới">
            ${znIcon('plus', 13)} <span>Phát hành bản mới</span>
          </button>
        </div>
      </div>

      <form id="adminVersionEditorForm" style="display:flex;flex-direction:column;gap:14px;">
        <div class="admin-version-editor-grid">
          ${versionSlots
      .map(
        (item, idx) => `
            <div class="admin-version-slot ${idx === 0 ? 'is-current' : ''}">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <strong style="color:#fff;font-size:13px;">${idx === 0 ? 'Phiên bản #1 (Đang hiển thị)' : `Phiên bản gần nhất #${idx + 1}`}</strong>
                <span class="badge-tag ${idx === 0 ? 'green' : ''}">${idx === 0 ? 'Bắt buộc' : 'Tùy chọn'}</span>
              </div>
              <div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,0.9fr);gap:8px;">
                <div>
                  <label style="font-size:11.5px;color:var(--color-moon-mist);display:block;margin-bottom:4px;" for="admVerCode_${idx}">Mã phiên bản (vx.x.chữ)</label>
                  <input type="text" id="admVerCode_${idx}" class="input-box" placeholder="VD: v2.4.auros" value="${escapeHtml(item.version || '')}" ${idx === 0 ? 'required' : ''} />
                </div>
                <div>
                  <label style="font-size:11.5px;color:var(--color-moon-mist);display:block;margin-bottom:4px;" for="admVerDate_${idx}">Ngày phát hành</label>
                  <input type="text" id="admVerDate_${idx}" class="input-box" placeholder="DD/MM/YYYY" value="${escapeHtml(item.date || '')}" />
                </div>
              </div>
              <div>
                <label style="font-size:11.5px;color:var(--color-moon-mist);display:block;margin-bottom:4px;" for="admVerNotes_${idx}">Nội dung có gì mới (mỗi dòng 1 mục)</label>
                <textarea id="admVerNotes_${idx}" class="input-box admin-version-textarea" placeholder="Nhập mỗi điểm mới trên một dòng...">${escapeHtml((item.highlights || []).join('\n'))}</textarea>
              </div>
            </div>
          `
      )
      .join('')}
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
          <span style="font-size:11.5px;color:var(--color-fog-veil);">
            Định dạng hợp lệ: <code>vx.x.chữ</code> (ví dụ: <code>v2.4.auros</code>, <code>v2.5.stable</code>, <code>v3.0.pro</code> — x là số, phần sau là chữ).
          </span>
          <button type="submit" class="btn-violet" id="btnSaveAppVersions">
            ${znIcon('save', 14)} <span>Lưu phiên bản &amp; Nhật ký</span>
          </button>
        </div>
      </form>
    </div>
  `;

  return `
    ${ephemeralBanner}
    ${maintenanceBanner}
    ${versionManagerPanel}
    <div class="stats-three-grid">
      <div class="glass-panel">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--color-moon-mist);">Tổng số tài khoản CTV</div>
        <div style="font-size:28px;font-weight:500;letter-spacing:-0.03em;color:var(--color-platinum);margin-top:6px;font-variant-numeric:tabular-nums;">${ctvs.length} CTV</div>
      </div>
      <div class="glass-panel">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--color-moon-mist);">Tổng doanh thu CTV đặt đơn</div>
        <div style="font-size:28px;font-weight:500;letter-spacing:-0.03em;color:var(--color-lavender-phosphor);margin-top:6px;font-variant-numeric:tabular-nums;">${formatVnd(stats.totalRevenue || 0)}</div>
      </div>
      <div class="glass-panel">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--color-moon-mist);">Tổng lợi nhuận chênh lệch Admin</div>
        <div style="font-size:28px;font-weight:500;letter-spacing:-0.03em;color:var(--color-aurora-gradient);margin-top:6px;font-variant-numeric:tabular-nums;">+${formatVnd(stats.totalProfit || 0)}</div>
      </div>
    </div>

    <div class="glass-panel">
      <div class="panel-title-row">
        <span class="panel-title-text">+ Tạo Tài Khoản Mới Cho CTV Đặt Đơn</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;align-items:end;">
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:4px;">Họ tên / Biệt danh CTV (*)</label>
          <input type="text" id="newCtvName" class="input-box" placeholder="VD: CTV Hoàng Nam" />
        </div>
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:4px;">Tên đăng nhập (*)</label>
          <input type="text" id="newCtvUsername" class="input-box" placeholder="VD: ctvnam01" />
        </div>
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:4px;">Mật khẩu (*)</label>
          <input type="password" id="newCtvPassword" class="input-box" autocomplete="new-password" minlength="12" maxlength="128" placeholder="Mật khẩu riêng, tối thiểu 12 ký tự" />
        </div>
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:4px;">SĐT / Zalo</label>
          <input type="text" id="newCtvPhone" class="input-box" placeholder="09xxxxxxxx" />
        </div>
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:4px;">Số dư Ví CTV nạp sẵn (VNĐ)</label>
          <input type="number" id="newCtvBalance" class="input-box" value="0" step="50000" min="0" />
        </div>
        <div>
          <label style="font-size:12px;color:var(--color-aurora-gradient);display:block;margin-bottom:4px;">Số dư Ví Nguồn DP nạp sẵn (VNĐ)</label>
          <input type="number" id="newCtvBackupBalance" class="input-box" value="0" step="50000" min="0" />
        </div>
        <div>
          <button type="button" class="btn-violet" id="btnCreateCtvSubmit" style="width:100%;">
            + Tạo Tài Khoản CTV
          </button>
        </div>
      </div>
    </div>

    <div class="glass-panel">
      <div class="panel-title-row">
        <span class="panel-title-text">Danh sách Cộng tác viên (2 ví tách biệt: Ví CTV đặt đơn Server Zn · Ví Nguồn DP đặt đơn Nguồn dự phòng)</span>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>TÊN CTV</th>
              <th>TÊN ĐĂNG NHẬP / EMAIL</th>
              <th>VÍ CTV (BÌNH THƯỜNG)</th>
              <th>VÍ NGUỒN DP</th>
              <th>SỐ ĐƠN / DOANH SỐ</th>
              <th>TRẠNG THÁI</th>
              <th>THAO TÁC</th>
            </tr>
          </thead>
          <tbody>
            ${ctvs.slice(0, pageLimit('accounts'))
      .map(
        (u) => {
          const mainBal = Number(u.balance || 0);
          const dpBal = Number(u.backupBalance || 0);
          const statusCls = u.isLocked ? 'red' : (mainBal > 0 || dpBal > 0) ? 'green' : 'amber';
          const statusLabel = u.isLocked
            ? 'Đã khóa'
            : mainBal > 0 && dpBal > 0
            ? 'Đủ điều kiện cả 2 nguồn'
            : mainBal > 0
            ? 'Đặt được Server Zn'
            : dpBal > 0
            ? 'Đặt được Nguồn DP'
            : 'Cả 2 ví 0đ (Tạm chặn)';
          return `
              <tr>
                <td><strong style="color:#fff;">${escapeHtml(u.name)}</strong><div style="font-size:11px;color:var(--color-fog-veil);">SĐT: ${escapeHtml(u.phone || '—')}</div></td>
                <td><strong>${escapeHtml(u.username)}</strong><div style="font-size:11px;color:var(--color-fog-veil);">${escapeHtml(u.email)}</div></td>
                <td>
                  <strong style="font-size:15px;color:${mainBal > 0 ? '#4ade80' : '#fca5a5'};font-variant-numeric:tabular-nums;">${formatVnd(mainBal)}</strong>
                  <div style="font-size:11px;color:var(--color-fog-veil);">Đã dùng: ${formatVnd(u.mainSpent ?? u.totalSpent ?? 0)}</div>
                </td>
                <td>
                  <strong style="font-size:15px;color:${dpBal > 0 ? 'var(--color-aurora-gradient)' : '#fca5a5'};font-variant-numeric:tabular-nums;">${formatVnd(dpBal)}</strong>
                  <div style="font-size:11px;color:var(--color-fog-veil);">Đã dùng: ${formatVnd(u.backupSpent || 0)}</div>
                </td>
                <td>
                  <div><strong>${u.totalOrders || 0} đơn</strong> · Tổng: ${formatVnd(u.totalSpent || 0)}</div>
                  <div style="font-size:11px;color:#4ade80;">Lãi Admin: +${formatVnd(u.totalProfit || 0)}</div>
                </td>
                <td>
                  <span class="badge-tag ${statusCls}">
                    ${statusLabel}
                  </span>
                </td>
                <td>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button type="button" class="btn-violet" style="padding:4px 10px;font-size:11px;" data-topup-ctv="${u.id}" data-wallet="main" data-ctv-name="${escapeHtml(u.name)}">
                      + Nạp / Trừ Ví CTV
                    </button>
                    <button type="button" class="btn-frost btn-backup-wallet" style="padding:4px 10px;font-size:11px;" data-topup-ctv="${u.id}" data-wallet="backup" data-ctv-name="${escapeHtml(u.name)}">
                      + Nạp / Trừ Ví Nguồn DP
                    </button>
                    <button type="button" class="btn-frost" style="padding:4px 10px;font-size:11px;" data-lock-ctv="${u.id}" data-locked="${u.isLocked ? '1' : '0'}">
                      ${u.isLocked ? 'Mở khóa' : 'Khóa'}
                    </button>
                    <button type="button" class="btn-frost" style="padding:4px 10px;font-size:11px;color:#fca5a5;" data-del-ctv="${u.id}" data-ctv-name="${escapeHtml(u.name)}">
                      Xóa tài khoản
                    </button>
                    <button type="button" class="btn-frost" style="padding:4px 10px;font-size:11px;" data-reset-ctv="${u.id}">Đổi mật khẩu</button>
                  </div>
                </td>
              </tr>
            `;
        }
      )
      .join('')}
            ${moreButton('accounts', ctvs.length, 7)}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openResetCtvPasswordModal(ctvId) {
  const overlay = document.getElementById('appModalOverlay');
  const body = document.getElementById('appModalBody');
  document.getElementById('appModalBox').className = 'modal-box';
  document.getElementById('appModalTitle').textContent = 'Đổi mật khẩu CTV';
  body.innerHTML = `<form id="resetCtvForm" class="tool-form tool-form-column"><p class="tool-note">Sau khi đổi mật khẩu, tất cả phiên của CTV sẽ bị thu hồi.</p><label>Mật khẩu mới<input type="password" class="input-box" name="password" autocomplete="new-password" minlength="12" maxlength="128" required /></label><label>Nhập lại mật khẩu<input type="password" class="input-box" name="confirmation" autocomplete="new-password" minlength="12" maxlength="128" required /></label><button type="submit" class="btn-violet">Đổi mật khẩu</button></form>`;
  overlay.style.display = 'flex';
  body.querySelector('#resetCtvForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    if (submit.disabled) return;
    if (form.elements.password.value !== form.elements.confirmation.value) { showToast('Mật khẩu nhập lại chưa khớp.'); return; }
    submit.disabled = true;
    try {
      const result = await apiFetch(`/api/admin/ctv/${encodeURIComponent(ctvId)}`, 'PUT', { password: form.elements.password.value });
      overlay.style.display = 'none'; body.innerHTML = ''; showToast(result.message);
    } catch (error) { showToast(error.message); }
    finally { submit.disabled = false; }
  });
}

function bindAdminCtvEvents() {
  document.getElementById('btnGotoStorageSetup')?.addEventListener('click', () => {
    switchView('admin_system');
  });
  document.getElementById('btnPreviewVersionModal')?.addEventListener('click', () => {
    openVersionChangelogModal();
  });
  document.getElementById('btnShiftNewVersion')?.addEventListener('click', () => {
    const readSlot = (i) => ({
      version: document.getElementById(`admVerCode_${i}`)?.value || '',
      date: document.getElementById(`admVerDate_${i}`)?.value || '',
      notes: document.getElementById(`admVerNotes_${i}`)?.value || '',
    });
    const writeSlot = (i, data) => {
      const c = document.getElementById(`admVerCode_${i}`);
      const d = document.getElementById(`admVerDate_${i}`);
      const n = document.getElementById(`admVerNotes_${i}`);
      if (c) c.value = data.version;
      if (d) d.value = data.date;
      if (n) n.value = data.notes;
    };
    const slot0 = readSlot(0);
    const slot1 = readSlot(1);
    const todayStr = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date());
    writeSlot(2, slot1);
    writeSlot(1, slot0);
    writeSlot(0, { version: '', date: todayStr, notes: '' });
    document.getElementById('admVerCode_0')?.focus();
    showToast('Đã đẩy phiên bản cũ xuống danh sách. Hãy nhập mã vx.x.chữ và nội dung bản mới rồi bấm Lưu.');
  });
  document.getElementById('adminVersionEditorForm')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = document.getElementById('btnSaveAppVersions');
    if (btn?.disabled) return;
    const versionRegex = /^v\d+\.\d+\.[a-zA-Z][a-zA-Z0-9_-]{0,23}$/;
    const appVersions = [];
    for (let i = 0; i < 3; i++) {
      const rawVer = String(document.getElementById(`admVerCode_${i}`)?.value || '').trim();
      const rawDate = String(document.getElementById(`admVerDate_${i}`)?.value || '').trim();
      const rawNotes = String(document.getElementById(`admVerNotes_${i}`)?.value || '').trim();
      if (!rawVer && !rawNotes) {
        if (i === 0) {
          showToast('Vui lòng nhập phiên bản #1 (phiên bản hiện tại).');
          return;
        }
        continue;
      }
      const normVer = /^[vV]/.test(rawVer) ? `v${rawVer.slice(1)}` : `v${rawVer}`;
      if (!versionRegex.test(normVer)) {
        showToast(`Mã phiên bản #${i + 1} không đúng định dạng vx.x.chữ (VD: v2.4.auros).`);
        document.getElementById(`admVerCode_${i}`)?.focus();
        return;
      }
      const highlights = rawNotes
        .split(/\r?\n/)
        .map((line) => line.replace(/^[-•*]\s*/, '').trim())
        .filter(Boolean);
      if (!highlights.length) {
        showToast(`Vui lòng nhập ít nhất 1 dòng nội dung có gì mới cho ${normVer}.`);
        document.getElementById(`admVerNotes_${i}`)?.focus();
        return;
      }
      appVersions.push({ version: normVer, date: rawDate, highlights });
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Đang lưu...';
    }
    try {
      const r = await apiFetch('/api/admin/app-versions', 'PUT', { appVersions });
      if (r.appVersions) {
        syncAppVersionsState(r.appVersions);
        if (state.adminOverview?.settings) state.adminOverview.settings.appVersions = r.appVersions;
      }
      showToast(r.message || 'Đã cập nhật phiên bản hệ thống!');
      renderCurrentView();
    } catch (err) {
      showToast(err.message);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `${znIcon('save', 14)} <span>Lưu phiên bản &amp; Nhật ký</span>`;
      }
    }
  });
  document.getElementById('btnNotifyCtvUpdate')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    const oldHtml = btn.innerHTML;
    btn.textContent = 'Đang gửi...';
    try {
      const r = await apiFetch('/api/admin/notify-update', 'POST');
      showToast(r.message || 'Đã gửi thông báo cập nhật cho CTV!');
    } catch (err) {
      showToast(err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
    }
  });
  document.getElementById('btnToggleMaintenanceMode')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const currentlyOn = Boolean(state.adminOverview?.settings?.maintenanceMode);
    const nextEnabled = !currentlyOn;
    const confirmText = nextEnabled
      ? 'Bật chế độ Bảo trì?\n\nTất cả các tài khoản CTV đang đăng nhập sẽ hiển thị "Hệ thống Zn đang bảo trì" và tạm khóa đặt đơn. Tài khoản Admin vẫn truy cập bình thường.'
      : 'Tắt chế độ Bảo trì và mở lại hệ thống cho toàn bộ CTV?';
    if (!confirm(confirmText)) return;
    btn.disabled = true;
    try {
      const r = await apiFetch('/api/admin/maintenance', 'POST', { enabled: nextEnabled });
      showToast(r.message);
      await loadAdminOverview();
      renderCurrentView();
    } catch (err) {
      showToast(err.message);
      btn.disabled = false;
    }
  });
  document.getElementById('btnCreateCtvSubmit')?.addEventListener('click', async () => {
    const name = document.getElementById('newCtvName')?.value || '';
    const username = document.getElementById('newCtvUsername')?.value || '';
    const password = document.getElementById('newCtvPassword')?.value || '';
    const phone = document.getElementById('newCtvPhone')?.value || '';
    const balance = Number(document.getElementById('newCtvBalance')?.value || 0);
    const backupBalance = Number(document.getElementById('newCtvBackupBalance')?.value || 0);

    try {
      const r = await apiFetch('/api/admin/ctv', 'POST', { name, username, password, phone, balance, backupBalance });
      showToast(r.message);
      await loadAdminOverview();
      renderCurrentView();
    } catch (err) {
      showToast(err.message);
    }
  });

  bindAccountRows();
}

function bindAccountRows(scope = document) {
  scope.querySelectorAll('[data-reset-ctv]').forEach(button => button.addEventListener('click', async () => {
    openResetCtvPasswordModal(button.dataset.resetCtv);
  }));
  scope.querySelectorAll('[data-topup-ctv]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openTopupCtvModal(btn.dataset.topupCtv, btn.dataset.ctvName, btn.dataset.wallet === 'backup' ? 'backup' : 'main');
    });
  });

  scope.querySelectorAll('[data-lock-ctv]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.lockCtv;
      const locked = btn.dataset.locked === '1';
      try {
        const r = await apiFetch(`/api/admin/ctv/${id}`, 'PUT', { isLocked: !locked });
        showToast(r.message);
        await loadAdminOverview();
        renderCurrentView();
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  scope.querySelectorAll('[data-del-ctv]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ctvName = btn.dataset.ctvName || 'này';
      if (!confirm(`Xóa tài khoản CTV "${ctvName}"? Các phiên đăng nhập sẽ bị thu hồi và tài khoản sẽ bị xóa khỏi danh sách.`)) return;
      try {
        const r = await apiFetch(`/api/admin/ctv/${btn.dataset.delCtv}`, 'DELETE');
        showToast(r.message);
        await loadAdminOverview();
        renderCurrentView();
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

function openTopupCtvModal(ctvId, ctvName, initialWallet = 'main') {
  let activeWallet = initialWallet === 'backup' ? 'backup' : 'main';
  let adjustmentKey = createRequestKey();
  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  const ctvRecord = (state.adminOverview?.ctvs || []).find((u) => u.id === ctvId);
  const mainBal = Number(ctvRecord?.balance || 0);
  const dpBal = Number(ctvRecord?.backupBalance || 0);

  box.className = 'modal-box';

  const renderTopupBody = () => {
    const isDp = activeWallet === 'backup';
    title.textContent = isDp
      ? `Nạp / Điều chỉnh Ví Nguồn DP: ${ctvName}`
      : `Nạp / Điều chỉnh Ví CTV (bình thường): ${ctvName}`;

    body.innerHTML = `
      <div class="pricing-mode-switch" style="width:100%;">
        <button type="button" class="pricing-mode-btn ${!isDp ? 'is-active' : ''}" data-topup-wallet="main" style="flex:1;">
          Ví CTV (bình thường): ${formatVnd(mainBal)}
        </button>
        <button type="button" class="pricing-mode-btn ${isDp ? 'is-active' : ''}" data-topup-wallet="backup" style="flex:1;">
          Ví Nguồn DP: ${formatVnd(dpBal)}
        </button>
      </div>
      <div class="backup-quote-box ${isDp ? 'is-quote' : ''}" style="font-size:12.5px;">
        ${isDp
          ? `Đang thao tác trên <strong>Ví Nguồn DP</strong> (hiện có <strong>${formatVnd(dpBal)}</strong>). Chỉ dùng riêng cho đơn Nguồn dự phòng, hoàn toàn tách biệt với Ví CTV bình thường.`
          : `Đang thao tác trên <strong>Ví CTV bình thường</strong> (hiện có <strong>${formatVnd(mainBal)}</strong>). Dùng cho các đơn Server Zn, tách biệt với Ví Nguồn DP.`}
      </div>
      <div>
        <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Số tiền điều chỉnh (Nhập số dương để nạp, số âm để trừ):</label>
        <input type="number" id="modalTopupAmt" class="input-box" value="100000" step="10000" />
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="btn-frost" data-q-amt="50000">+50.000đ</button>
        <button type="button" class="btn-frost" data-q-amt="100000">+100.000đ</button>
        <button type="button" class="btn-frost" data-q-amt="500000">+500.000đ</button>
        <button type="button" class="btn-frost" data-q-amt="-50000">Trừ 50.000đ</button>
      </div>
      <div>
        <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Ghi chú:</label>
        <input type="text" id="modalTopupNote" class="input-box" value="${isDp ? 'Admin nạp tiền Ví Nguồn DP' : 'Admin nạp tiền ví CTV'}" />
      </div>
      <div class="action-row align-end">
        <button type="button" class="btn-violet" id="btnConfirmTopupSubmit">${isDp ? 'Xác nhận cập nhật Ví Nguồn DP →' : 'Xác nhận cập nhật Ví CTV →'}</button>
      </div>
    `;

    body.querySelectorAll('[data-topup-wallet]').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const nextWallet = tabBtn.dataset.topupWallet === 'backup' ? 'backup' : 'main';
        if (nextWallet === activeWallet) return;
        activeWallet = nextWallet;
        adjustmentKey = createRequestKey();
        renderTopupBody();
      });
    });

    body.querySelectorAll('[data-q-amt]').forEach((b) => {
      b.addEventListener('click', () => {
        body.querySelector('#modalTopupAmt').value = b.dataset.qAmt;
      });
    });

    body.querySelector('#btnConfirmTopupSubmit')?.addEventListener('click', async (ev) => {
      const submitBtn = ev.currentTarget;
      if (submitBtn.disabled) return;
      const amount = Number(body.querySelector('#modalTopupAmt')?.value || 0);
      const note = body.querySelector('#modalTopupNote')?.value || '';
      submitBtn.disabled = true;
      try {
        const r = await apiFetch(`/api/admin/ctv/${ctvId}/balance`, 'POST', {
          amount,
          note,
          wallet: activeWallet,
          idempotency_key: adjustmentKey,
        });
        showToast(r.message);
        overlay.style.display = 'none';
        await loadAdminOverview();
        renderCurrentView();
      } catch (err) {
        showToast(err.message);
        submitBtn.disabled = false;
      }
    });
  };

  renderTopupBody();
  overlay.style.display = 'flex';
}

function renderAdminSystemPageHtml() {
  const srcCfg = state.adminOverview?.settings?.serverZn || state.adminOverview?.settings?.source || {};
  const storage = state.adminOverview?.storage || { mode: 'json', persistent: false, isRender: false, healthy: true };
  const stats = state.adminOverview?.stats || {};
  const isPg = storage.mode === 'postgresql';

  return `
    <div class="glass-panel" style="max-width:760px;">
      <div class="panel-title-row">
        <span class="panel-title-text"><span class="panel-title-icon">${znIcon('database', 16)}</span><span>Lưu trữ Dữ liệu &amp; Sao lưu (Chống mất tài khoản CTV)</span></span>
        <span class="badge-tag ${isPg ? 'green' : storage.isRender ? 'red' : 'amber'}">
          ${isPg ? '● PostgreSQL (Bền vững — Không mất khi máy chủ nghỉ)' : storage.isRender ? '● JSON ổ tạm Render (Sẽ mất khi máy chủ nghỉ / triển khai lại)' : '● JSON cục bộ (data/db.json)'}
        </span>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;">
          <div class="stat-subcard" style="padding:12px 14px;">
            <div style="font-size:11px;color:var(--color-fog-veil);">Tài khoản CTV</div>
            <strong style="font-size:18px;font-weight:500;color:var(--color-platinum);">${stats.totalCtvCount || 0} CTV</strong>
          </div>
          <div class="stat-subcard" style="padding:12px 14px;">
            <div style="font-size:11px;color:var(--color-fog-veil);">Tổng số dư Ví CTV</div>
            <strong style="font-size:18px;font-weight:500;color:var(--color-lavender-phosphor);">${formatVnd(stats.totalCtvBalance || 0)}</strong>
          </div>
          <div class="stat-subcard" style="padding:12px 14px;">
            <div style="font-size:11px;color:var(--color-fog-veil);">Tổng số dư Ví Nguồn DP</div>
            <strong style="font-size:18px;font-weight:500;color:var(--color-aurora-gradient);">${formatVnd(stats.totalCtvBackupBalance || 0)}</strong>
          </div>
          <div class="stat-subcard" style="padding:12px 14px;">
            <div style="font-size:11px;color:var(--color-fog-veil);">Đơn hàng / Giao dịch</div>
            <strong style="font-size:18px;font-weight:500;color:var(--color-aurora-gradient);">${stats.totalLocalOrders || 0} / ${stats.totalTransactions || 0}</strong>
          </div>
        </div>

        ${!isPg ? `
          <div class="storage-guide-box">
            <strong style="color:#fff;display:inline-flex;align-items:center;gap:6px;">${znIcon('sparkles', 15)} <span>Phương án lưu trữ MIỄN PHÍ vĩnh viễn cho Render Free (&lt;10 CTV): Neon PostgreSQL</span></strong>
            <ol>
              <li>Vào <strong>neon.tech</strong> (đăng nhập bằng GitHub/Google, miễn phí 0đ trọn đời, không cần thẻ tín dụng) → Tạo Project mới (chọn Region gần Render như Singapore hoặc US East).</li>
              <li>Bấm <strong>Connect</strong> → Copy chuỗi kết nối PostgreSQL (bắt đầu bằng <code>postgresql://...</code>).</li>
              <li>Vào Render Dashboard → Service ZnStudio → <strong>Environment</strong> → Thêm biến <code>DATABASE_URL</code> = chuỗi vừa copy → Lưu &amp; Deploy lại. Từ đó toàn bộ CTV, ví, đơn hàng và bảng giá sẽ <strong>không bao giờ bị mất</strong> kể cả khi Render ngủ hoặc tắt!</li>
            </ol>
            <div style="font-size:12px;color:var(--color-fog-veil);display:flex;align-items:center;gap:6px;">
              ${znIcon('info', 14)} <span>Mẹo giữ web mượt không bị ngủ 15 phút: Tạo monitor miễn phí trên <strong>UptimeRobot</strong> hoặc <strong>cron-job.org</strong> gọi <code>https://&lt;domain-của-bạn&gt;/api/ping</code> mỗi 10 phút.</span>
            </div>
          </div>
        ` : `
          <div style="font-size:12.5px;color:#5eead4;background:rgba(38,150,132,0.12);padding:10px 14px;border-radius:10px;display:flex;align-items:center;gap:8px;">
            ${znIcon('check', 15)} <span>Hệ thống đang kết nối PostgreSQL bền vững. Toàn bộ tài khoản CTV, số dư ví, đơn hàng và bảng giá được bảo toàn an toàn khi hosting nghỉ hoặc khởi động lại.</span>
          </div>
        `}

        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <button type="button" class="btn-frost" id="btnExportBackupJson">${znIcon('download', 14)} <span>Tải bản sao lưu JSON</span></button>
          <button type="button" class="btn-frost" id="btnImportBackupJson">${znIcon('upload', 14)} <span>Khôi phục từ tệp JSON</span></button>
          <input type="file" id="admBackupFileInput" accept="application/json,.json" style="display:none;" />
          <span style="font-size:11.5px;color:var(--color-fog-veil);">Bản sao lưu không chứa mật khẩu hay mã xác thực Server Zn.</span>
        </div>
      </div>
    </div>

    <div class="glass-panel" style="max-width:760px;">
      <div class="panel-title-row">
        <span class="panel-title-text"><span class="panel-title-icon">${znIcon('server', 16)}</span><span>Cấu hình kết nối Server Zn</span></span>
        <span class="badge-tag ${srcCfg.connected ? 'green' : 'red'}">
          ${srcCfg.connected ? '● Đã kết nối' : '○ Chưa kết nối'}
        </span>
      </div>
      ${srcCfg.lastError ? `<div style="color:#fca5a5;font-size:12px;">${escapeHtml(srcCfg.lastError)}</div>` : ''}
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Email kết nối Server Zn:</label>
          <input type="email" id="admSrcEmail" class="input-box" value="${escapeHtml(srcCfg.email || '')}" />
        </div>
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Mật khẩu kết nối Server Zn (Để trống nếu giữ nguyên):</label>
          <input type="password" id="admSrcPassword" class="input-box" autocomplete="new-password" placeholder="••••••••" />
        </div>
        <div class="action-row align-end">
          <button type="button" class="btn-frost" id="btnAdmReconnectSrc">${znIcon('refresh', 13)} <span>Đồng bộ &amp; Kết nối lại Server Zn</span></button>
          <button type="button" class="btn-violet" id="btnAdmSaveSrc">${znIcon('save', 14)} <span>Lưu cấu hình Server Zn</span></button>
        </div>
      </div>
    </div>
    <form class="glass-panel" id="adminPasswordForm" style="max-width:760px;display:flex;flex-direction:column;gap:14px;">
      <div class="panel-title-text">Đổi mật khẩu đăng nhập Admin</div>
      <div style="font-size:12px;color:var(--color-moon-mist);">Sau khi đổi mật khẩu, tất cả phiên đăng nhập Admin sẽ được đăng xuất.</div>
      <label>Mật khẩu hiện tại
        <input type="password" id="admCurrentPassword" class="input-box" autocomplete="current-password" required />
      </label>
      <label>Mật khẩu mới (12–128 ký tự)
        <input type="password" id="admNewPassword" class="input-box" autocomplete="new-password" minlength="12" maxlength="128" required />
      </label>
      <label>Nhập lại mật khẩu mới
        <input type="password" id="admConfirmPassword" class="input-box" autocomplete="new-password" minlength="12" maxlength="128" required />
      </label>
      <button type="submit" class="btn-violet">Đổi mật khẩu Admin</button>
    </form>
  `;
}

function bindAdminSystemEvents() {
  document.getElementById('btnExportBackupJson')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnExportBackupJson');
    if (btn) btn.disabled = true;
    try {
      const r = await apiFetch('/api/admin/backup/export');
      const blob = new Blob([JSON.stringify(r.backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `znstudio-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Đã tải bản sao lưu JSON thành công!');
    } catch (err) {
      showToast(`Lỗi sao lưu: ${err.message}`);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  const fileInput = document.getElementById('admBackupFileInput');
  document.getElementById('btnImportBackupJson')?.addEventListener('click', () => {
    if (fileInput) {
      fileInput.value = '';
      fileInput.click();
    }
  });
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!confirm(`Khôi phục toàn bộ CTV, số dư, đơn hàng và bảng giá từ tệp "${file.name}"? Dữ liệu hiện tại sẽ được thay thế bằng bản sao lưu này.`)) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const payload = parsed.backup ? { backup: parsed.backup } : { backup: parsed };
      const r = await apiFetch('/api/admin/backup/import', 'POST', payload);
      showToast(r.message || 'Đã khôi phục dữ liệu thành công!');
      await Promise.all([loadAdminOverview(), loadCatalog(true), loadOrders(true)]);
      renderCurrentView();
    } catch (err) {
      showToast(`Lỗi khôi phục: ${err.message}`);
    }
  });
  document.getElementById('adminPasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const currentPassword = document.getElementById('admCurrentPassword').value;
    const newPassword = document.getElementById('admNewPassword').value;
    if (newPassword !== document.getElementById('admConfirmPassword').value) {
      showToast('Mật khẩu nhập lại chưa khớp.');
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const r = await apiFetch('/api/admin/password', 'PUT', { currentPassword, newPassword });
      clearAuthState();
      updateShellAuthUI();
      showToast(r.message);
    } catch (err) {
      showToast(err.message);
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById('btnAdmReconnectSrc')?.addEventListener('click', async () => {
    const button = document.getElementById('btnAdmReconnectSrc');
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = 'Đang kết nối...';
    try {
      showToast('Đang kết nối lại và đồng bộ dữ liệu Server Zn...');
      const r = await apiFetch('/api/admin/server-zn/reconnect', 'POST');
      showToast(r.message);
      await Promise.all([loadCatalog(true, '', 6500), loadAdminOverview()]);
      renderCurrentView();
    } catch (err) {
      showToast(err.message);
      await loadAdminOverview();
      renderCurrentView();
    } finally {
      button.disabled = false;
      button.innerHTML = `${znIcon('refresh', 13)} <span>Đồng bộ &amp; Kết nối lại Server Zn</span>`;
    }
  });

  document.getElementById('btnAdmSaveSrc')?.addEventListener('click', async () => {
    const button = document.getElementById('btnAdmSaveSrc');
    if (button.disabled) return;
    button.disabled = true;
    const sourceEmail = document.getElementById('admSrcEmail')?.value || '';
    const sourcePassword = document.getElementById('admSrcPassword')?.value || '';
    try {
      const r = await apiFetch('/api/admin/settings', 'PUT', { sourceEmail, sourcePassword });
      showToast(r.message);
      await Promise.all([loadCatalog(true, '', 6500), loadAdminOverview()]);
      renderCurrentView();
    } catch (err) {
      showToast(err.message);
      await loadAdminOverview();
      renderCurrentView();
    } finally {
      button.disabled = false;
    }
  });
}

// ============================================================================
// GLOBAL EVENTS & BOOTSTRAP
// ============================================================================
function bindGlobalEvents() {
  document.addEventListener('click', async event => {
    const btn = event.target.closest('[data-list-more]');
    if (!btn || btn.disabled) return;
    const key = btn.dataset.listMore;
    const view = state.currentView;
    btn.disabled = true;
    state.listLimits[key] = Number(btn.dataset.shown) + 20;
    if (key === 'modalPackages') renderCreateOrderModalBody();
    else if (view === 'admin_monitor') await loadAdminMonitor();
    else if (key === 'orderList') {
      await loadOrders();
      if (view === state.currentView) renderCurrentView();
    } else if (['pricePackages', 'priceFruits', 'accounts'].includes(key)) {
      const tbody = btn.closest('tbody');
      const template = document.createElement('template');
      template.innerHTML = key === 'accounts' ? renderAdminCtvPageHtml() : renderAdminPricingPageHtml();
      const index = [...document.querySelectorAll('#mainViewContainer tbody')].indexOf(tbody);
      const batch = document.createDocumentFragment();
      const rendered = template.content.querySelectorAll('tbody')[index];
      for (const row of [...rendered.rows].slice(tbody.rows.length - 1)) batch.append(row);
      const bind = { accounts: bindAccountRows, priceFruits: bindAdminFruitRowEvents, pricePackages: bindPackageRows };
      bind[key](batch);
      btn.closest('tr').replaceWith(batch);
    } else renderCurrentView();
    btn.disabled = false;
  });

  // Catalog auto-sync schedule: Admin every 1 min, CTV every 10 min (zero lag; pre-order modal ALWAYS live-syncs!).
  let lastClientCatalogSyncAt = Date.now();
  setInterval(async () => {
    if (!state.user || document.hidden) return;
    const isAdmin = state.user.role === 'admin';
    const intervalMs = isAdmin ? 60 * 1000 : 10 * 60 * 1000;
    if (Date.now() - lastClientCatalogSyncAt < intervalMs) return;
    lastClientCatalogSyncAt = Date.now();
    try {
      const catChanged = await loadCatalog(false);
      if (catChanged && !isUserTypingOrModalOpen() && (ORDER_VIEWS.includes(state.currentView) || state.currentView === 'dashboard' || state.currentView === 'admin_pricing')) {
        renderCurrentView();
      }
    } catch { }
  }, 30000);

  // Adaptive lightweight progress polling: ONLY polls every 12s while user has an active running order
  // in view (server coalesces scoped active endpoint every 10s -> 1 tiny call shared by all CTVs, 0 calls when idle).
  setInterval(async () => {
    if (!state.user || document.hidden || state.maintenanceLocked || state.loadingOrders || isUserTypingOrModalOpen()) return;
    if (!hasRunningOrdersInView()) return;
    try {
      const changed = await loadOrders(false, { live: true });
      if (changed && !isUserTypingOrModalOpen()) renderCurrentViewPreservingScroll();
    } catch { }
  }, 12000);

  // Sync session, wallet balance, and live orders every 60s.
  setInterval(async () => {
    if (!state.user || document.hidden) return;
    try {
      const result = await apiFetch('/api/auth/me');
      if (result.user) { state.user = result.user; updateShellAuthUI(); }
      if (result.user?.role !== 'admin' && result.updateVersion !== undefined) {
        if (handleCtvUpdateVersion(result.updateVersion, { isCtvConfirmed: true })) return;
      }
      if (state.currentView === 'admin_monitor' && state.user?.role === 'admin') {
        await loadAdminMonitor();
      } else if ((ORDER_VIEWS.includes(state.currentView) || state.currentView === 'dashboard' || state.currentView === 'order_history') && !isUserTypingOrModalOpen()) {
        if (Date.now() - (state.lastOrdersSyncAt || 0) >= 10000) {
          const changed = await loadOrders(false);
          if (changed && !isUserTypingOrModalOpen()) renderCurrentViewPreservingScroll();
        }
      }
    } catch { }
  }, 60000);

  // Ultra-light maintenance & auto-update check every 10s for CTVs (zero DB load)
  const checkCtvMaintenance = async () => {
    if (state.user?.role === 'admin' || document.hidden) return;
    const isTrackedCtvBrowser = Boolean(state.token) || readStoredCtvUpdateVer() !== null;
    if (!isTrackedCtvBrowser) return;
    try {
      const p = await fetch('/api/ping', { headers: { Accept: 'application/json' } }).then(r => r.json()).catch(() => null);
      if (!p) return;
      if (p.appVersions) syncAppVersionsState(p.appVersions);
      if (state.token) {
        if (p.maintenance) {
          setCtvMaintenanceOverlay(true, 'Hệ thống Zn đang bảo trì');
        } else if (state.maintenanceLocked) {
          setCtvMaintenanceOverlay(false);
          if (handleCtvUpdateVersion(p.updateVersion, { isCtvConfirmed: true })) return;
          await initAuth();
          if (state.user) await loadInitialAppData();
        }
      }
      if (!p.maintenance && !state.maintenanceLocked) {
        handleCtvUpdateVersion(p.updateVersion, { isCtvConfirmed: Boolean(state.token && state.user?.role === 'ctv') });
      }
    } catch { }
  };
  setInterval(checkCtvMaintenance, 10000);

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) checkCtvMaintenance();
    });
    window.addEventListener('storage', (event) => {
      if (event.key === CTV_UPDATE_VER_KEY && state.user?.role !== 'admin' && !state.maintenanceLocked) {
        const nextVer = Number(event.newValue || 0);
        if (Number.isFinite(nextVer) && state.seenUpdateVersion != null && nextVer > state.seenUpdateVersion) {
          triggerCtvAutoReload(nextVer);
        }
      }
    });
  }

  // When returning to tab, refresh orders promptly if stale (>10s) and catalog only if stale (>1 min Admin / >10 min CTV).
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', async () => {
      if (document.hidden) return;
      if (state.user?.role !== 'admin') await checkCtvMaintenance();
      if (!state.user || state.maintenanceLocked) return;
      const onOrderView = ORDER_VIEWS.includes(state.currentView) || state.currentView === 'dashboard' || state.currentView === 'order_history';
      if (onOrderView && !state.loadingOrders && Date.now() - (state.lastOrdersSyncAt || 0) >= 10000) {
        try {
          const ordChanged = await loadOrders(false, { live: hasRunningOrdersInView() });
          if (ordChanged && !isUserTypingOrModalOpen()) renderCurrentViewPreservingScroll();
        } catch { }
      }
      const intervalMs = state.user.role === 'admin' ? 60 * 1000 : 10 * 60 * 1000;
      if (Date.now() - lastClientCatalogSyncAt < intervalMs) return;
      lastClientCatalogSyncAt = Date.now();
      try {
        const catChanged = await loadCatalog(false);
        if (catChanged && !isUserTypingOrModalOpen() && (ORDER_VIEWS.includes(state.currentView) || state.currentView === 'dashboard' || state.currentView === 'admin_pricing')) {
          renderCurrentView();
        }
      } catch { }
    });
  }
  // Sidebar menu navigation
  document.querySelectorAll('.sidebar-item[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
    });
  });

  document.getElementById('brandHomeLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchView('dashboard');
  });
  document.getElementById('brandTitleHomeLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchView('dashboard');
  });
  document.getElementById('btnOpenVersionChangelog')?.addEventListener('click', () => {
    openVersionChangelogModal();
  });
  document.getElementById('btnGateVersionChangelog')?.addEventListener('click', () => {
    openVersionChangelogModal();
  });

  // Mobile sidebar toggle
  document.getElementById('btnToggleMobileSidebar')?.addEventListener('click', () => {
    setMobileMenuOpen(!document.getElementById('appSidebar')?.classList.contains('is-open'));
  });
  document.getElementById('sidebarBackdrop')?.addEventListener('click', () => {
    setMobileMenuOpen(false);
  });

  window.matchMedia?.('(max-width: 860px)').addEventListener('change', () => setMobileMenuOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('appSidebar')?.classList.contains('is-open')) {
      setMobileMenuOpen(false);
      document.getElementById('btnToggleMobileSidebar')?.focus();
    }
  });

  // Modal close & body scroll lock (prevents background horizontal/vertical drift on iOS/Zalo/in-app browsers)
  const modalOverlayEl = document.getElementById('appModalOverlay');
  document.getElementById('btnCloseAppModal')?.addEventListener('click', () => {
    if (modalOverlayEl) modalOverlayEl.style.display = 'none';
  });
  modalOverlayEl?.addEventListener('click', (e) => {
    if (e.target === modalOverlayEl) modalOverlayEl.style.display = 'none';
  });
  if (modalOverlayEl && typeof MutationObserver !== 'undefined') {
    const syncBodyModalLock = () => {
      document.body?.classList?.toggle?.('modal-open', modalOverlayEl.style.display !== 'none');
    };
    new MutationObserver(syncBodyModalLock).observe(modalOverlayEl, { attributes: true, attributeFilter: ['style'] });
    syncBodyModalLock();
  }

  // Global top navbar reload button (available on all pages for both Admin & CTV)
  document.getElementById('btnTopReloadPage')?.addEventListener('click', (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    try { sessionStorage.removeItem('znplay_catalog_cache'); } catch { }
    window.location.reload();
  });

  // Logout always returns to the credential form.
  document.getElementById('btnTopLogout')?.addEventListener('click', logout);

  // Auth Gate Login Events
  document.getElementById('gateLoginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitButton = document.getElementById('btnGateSubmitLogin');
    if (submitButton.disabled) return;
    submitButton.disabled = true;
    const id = document.getElementById('gateLoginId')?.value || '';
    const pw = document.getElementById('gateLoginPw')?.value || '';
    const errEl = document.getElementById('gateLoginError');
    try {
      if (errEl) errEl.style.display = 'none';
      await loginWithCredentials(id, pw);
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      }
    } finally {
      submitButton.disabled = false;
    }
  });
}

function installClientProtection() {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  document.addEventListener('keydown', (e) => {
    const key = String(e.key || '').toLowerCase();
    const ctrlOrMeta = e.ctrlKey || e.metaKey;
    const isBlockedShortcut =
      e.key === 'F12' ||
      (ctrlOrMeta && (key === 'u' || key === 's')) ||
      (ctrlOrMeta && e.shiftKey && ['i', 'j', 'c'].includes(key)) ||
      (e.metaKey && e.altKey && ['i', 'j', 'c', 'u'].includes(key));
    if (isBlockedShortcut) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  document.addEventListener('contextmenu', (e) => {
    const target = e.target;
    const tag = target && target.tagName ? target.tagName.toUpperCase() : '';
    const hasSelection = typeof window !== 'undefined' && typeof window.getSelection === 'function' && String(window.getSelection()).trim().length > 0;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || hasSelection) return;
    e.preventDefault();
  });
}

async function bootstrap() {
  installClientProtection();
  bindGlobalEvents();
  syncAppVersionsState(state.appVersions);
  fetch('/api/ping', { headers: { Accept: 'application/json' } })
    .then(r => r.json())
    .then(p => { if (p?.appVersions) syncAppVersionsState(p.appVersions); })
    .catch(() => { });
  await initAuth();
  if (!state.user && readStoredCtvUpdateVer() !== null) {
    try {
      const p = await fetch('/api/ping', { headers: { Accept: 'application/json' } }).then(r => r.json()).catch(() => null);
      if (p?.appVersions) syncAppVersionsState(p.appVersions);
      if (p && !p.maintenance && handleCtvUpdateVersion(p.updateVersion, { isCtvConfirmed: false })) {
        return;
      }
    } catch { }
  }
  showCtvUpdatedNoticeIfPending();
  if (state.user) {
    await loadInitialAppData();
  }
}

bootstrap();
