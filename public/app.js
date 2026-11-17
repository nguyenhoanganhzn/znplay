// ============================================================================
// ZNPLAY — SELLER & CTV SYSTEM (AUTHKIT FROSTED GLASS + SIDEBAR MENU)
// ============================================================================

import { createToolViews } from './tools.js';

const state = {
  token: sessionStorage.getItem('znplay_token') || '',
  user: null,
  catalogData: null,

  // Active Sidebar View
  currentView: 'fruit_coin', // default to 'fruit_coin' (Trái cây) or 'dashboard'

  // Filters on Order Pages
  orderSearch: '',
  orderActiveFilter: 'all', // 'all' | '1' | '0'
  orderProgressFilter: 'all', // 'all' | 'running' | 'completed'

  // Orders & Admin Data
  orders: [],
  adminOverview: null,
  adminMonitor: null,
  adminPricingTab: 'fruits', // 'fruits' | 'packages' | 'categories'
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
  createToolViews({ state, apiFetch, escapeHtml, showToast, formatVnd, formatDateVi, renderCurrentView, loadOrders });

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
  user_search: 'Công cụ: Tìm khách hàng để đặt đơn',
  identity_tools: 'Công cụ: Trích xuất tên nhân vật / Role ID',
  admin_monitor: 'Quản trị: Giám sát hoạt động & đối soát CTV',
  admin_pricing: 'Quản trị: Tùy chỉnh Giá từng Sản phẩm & Danh mục',
  admin_ctv: 'Quản trị: Quản lý Tài khoản CTV đặt đơn',
  admin_system: 'Quản trị: Cấu hình kết nối Nguồn API',
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
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

async function apiFetch(url, method = 'GET', body = null) {
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
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (requestToken && state.token !== requestToken) {
    throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng thử lại.');
  }
  if (res.status === 401 && requestToken && state.token === requestToken) {
    clearAuthState();
    updateShellAuthUI();
  }
  if (!res.ok && !data.needs_confirmation) {
    throw Object.assign(new Error(data.message || `Lỗi kết nối (${res.status})`), { code: data.code, status: res.status });
  }
  return data;
}

// ============================================================================
// AUTHENTICATION & SESSION GATE
// ============================================================================
function clearAuthState() {
  state.token = '';
  state.user = null;
  state.catalogData = null;
  state.orders = [];
  state.adminOverview = null;
  state.adminMonitor = null;
  state.currentView = 'fruit_coin';
  state.modalOrder.customer = null;
  state.modalOrder.fruit_preview_admin = null;
  localStorage.removeItem('znplay_token');
  sessionStorage.removeItem('znplay_token');
  const container = document.getElementById('mainViewContainer');
  if (container) container.innerHTML = '';
  const modal = document.getElementById('appModalOverlay');
  if (modal) modal.style.display = 'none';
  const modalBody = document.getElementById('appModalBody');
  if (modalBody) modalBody.innerHTML = '';
  const adminSection = document.getElementById('sidebarAdminSection');
  if (adminSection) adminSection.style.display = 'none';
}

async function initAuth() {
  const requestToken = state.token;
  if (state.token) {
    try {
      const r = await apiFetch('/api/auth/me');
      if (r.success && r.user) {
        state.user = r.user;
        updateShellAuthUI();
        return;
      }
    } catch {
      if (state.token !== requestToken) return;
    }
  }
  clearAuthState();
  updateShellAuthUI();
}

async function loginWithCredentials(identifier, password) {
  const r = await apiFetch('/api/auth/login', 'POST', { identifier, password });
  if (r.success && r.token) {
    clearAuthState();
    state.token = r.token;
    state.user = r.user;
    sessionStorage.setItem('znplay_token', r.token);
    const passwordInput = document.getElementById('gateLoginPw');
    if (passwordInput) passwordInput.value = '';
    showToast(`Chào mừng ${r.user.name}!`);
    updateShellAuthUI();
    await Promise.all([
      loadCatalog(false),
      loadOrders(),
      r.user.role === 'admin' ? loadAdminOverview() : Promise.resolve(),
    ]);
    renderCurrentView();
  }
}

async function logout() {
  const logoutRequest = apiFetch('/api/auth/logout', 'POST');
  clearAuthState();
  updateShellAuthUI();
  try {
    await logoutRequest;
  } catch {}
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

  if (roleBadge) {
    roleBadge.textContent = isAdmin ? 'ADMIN' : 'CTV';
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
        walletText.innerHTML = `Đã dùng: <strong style="color:#fbbf24;">${formatCompactVnd(wl.spent)}</strong> · Hạn mức: <strong style="color:#4ade80;">${formatCompactVnd(wl.limit)}</strong>`;
      } else {
        walletPill.className = 'wallet-pill-box';
        walletText.innerHTML = `Quyền: <strong style="color:#4ade80;">Quản trị viên (Admin)</strong>`;
      }
    } else {
      const bal = Number(state.user.balance || 0);
      walletPill.className = `wallet-pill-box ${bal <= 0 ? 'is-empty' : ''}`;
      walletText.innerHTML = `Số dư ví CTV: <strong style="color:${bal > 0 ? '#4ade80' : '#fca5a5'};">${formatVnd(bal)}</strong>`;
    }
  }
}

// ============================================================================
// LOAD CATALOG, SYSTEM STATUS DOTS & FLASH SALE MARQUEE
// ============================================================================
async function loadCatalog(forceRefresh = false) {
  if (!state.user) return;
  const requestToken = state.token;
  try {
    const r = await apiFetch(`/api/catalog${forceRefresh ? '?refresh=1' : ''}`);
    if (!r.success || state.token !== requestToken) return;
    state.catalogData = r;

    // Update Sidebar Status Dots (Exact match with HoanNguyen!)
    const st = r.systemStatus || {};
    const updateDot = (id, working) => {
      const el = document.getElementById(id);
      if (!el) return;
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

    updateSaleMarquee();
    updateShellAuthUI();
  } catch (err) {
    console.error('Error loading catalog:', err);
  }
}

function updateSaleMarquee() {
  const track = document.getElementById('saleMarqueeTrack');
  if (!track || !state.catalogData) return;

  const cat = state.catalogData.catalog || {};
  const saleItems = [];

  for (const p of cat.buff_tim || []) {
    if (p.is_on_sale && p.sale && p.sale.slots_remaining > 0) {
      saleItems.push(
        `✦ Gói ${formatNum(p.quantity)} Tim - ${formatVnd(p.original_price)} → ${formatVnd(
          p.total_price
        )} • Còn ${p.sale.slots_remaining}/${p.sale.slots_total} lượt • Đặt ngay!`
      );
    }
  }
  for (const p of cat.fruit_coin || []) {
    if (p.is_on_sale && p.sale && p.sale.slots_remaining > 0) {
      saleItems.push(
        `✦ Gói ${formatNum(p.coin_quantity || p.quantity)} Xu - ${formatVnd(
          p.original_price
        )} → ${formatVnd(p.total_price)} • Còn ${p.sale.slots_remaining}/${p.sale.slots_total} lượt • Đặt ngay!`
      );
    }
  }

  const text =
    saleItems.length > 0
      ? [...saleItems, ...saleItems].join('   ')
      : '✦ Hệ thống ZnPlay vận hành tự động 24/7 — Vui lòng kiểm tra kỹ thông tin nhân vật trước khi tạo đơn!';
  track.textContent = text;
}

// ============================================================================
// LOAD ORDERS & ADMIN OVERVIEW
// ============================================================================
async function loadOrders() {
  if (!state.user) return;
  const requestToken = state.token;
  try {
    const r = await apiFetch('/api/orders?category=all');
    if (r.success && state.token === requestToken) {
      state.orders = r.orders || [];
      const activeCount = state.orders.filter((o) => o.status !== 'completed' && o.isActive).length;
      const badge = document.getElementById('sidebarActiveOrdersCount');
      if (badge) badge.textContent = String(activeCount);
    }
  } catch (err) {
    console.error('Error loading orders:', err);
  }
}

async function loadAdminOverview() {
  if (!state.user || state.user.role !== 'admin') return;
  const requestToken = state.token;
  try {
    const r = await apiFetch('/api/admin/overview');
    if (r.success && state.token === requestToken && state.user?.role === 'admin') {
      state.adminOverview = r;
    }
  } catch (err) {
    console.error('Error loading admin overview:', err);
  }
}

// ============================================================================
// VIEW ROUTER & RENDERER
// ============================================================================
function switchView(viewKey) {
  if (!state.user) return;
  if (!Object.hasOwn(VIEW_TITLES, viewKey) || (viewKey.startsWith('admin_') && state.user.role !== 'admin')) {
    viewKey = 'fruit_coin';
  }
  state.currentView = viewKey;
  document.querySelectorAll('.sidebar-item[data-view]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.view === viewKey);
  });
  const titleEl = document.getElementById('topNavbarViewTitle');
  if (titleEl) {
    titleEl.textContent = VIEW_TITLES[viewKey] || 'ZnPlay';
  }
  // Close mobile sidebar if open
  document.getElementById('appSidebar')?.classList.remove('is-open');
  document.getElementById('sidebarBackdrop')?.classList.remove('is-open');

  renderCurrentView();
  if (viewKey === 'admin_monitor') loadAdminMonitor();
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
      <div class="glass-panel" style="background:rgba(228,109,76,0.16);box-shadow:rgba(228,109,76,0.45) 0 0 0 1px inset;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-weight:600;color:#fca5a5;font-size:14px;">⚠️ Tài khoản CTV của bạn chưa có số dư (0đ)</div>
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
  } else if (view === 'user_search') {
    container.innerHTML = zeroBannerHtml + renderUserSearchPageHtml();
    bindUserSearchPageEvents();
  } else if (view === 'identity_tools') {
    container.innerHTML = zeroBannerHtml + renderIdentityToolsHtml();
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

  const totalOrders = catOrders.length;
  const completedOrders = catOrders.filter((o) => o.status === 'completed').length;
  const activeOrdersCount = catOrders.filter((o) => o.status !== 'completed' && o.isActive).length;
  const inactiveOrdersCount = catOrders.filter((o) => o.status !== 'completed' && !o.isActive).length;

  const totalUnits = catOrders.reduce((s, o) => s + Number(o.totalCnt || 0), 0);
  const completedUnits = catOrders.reduce((s, o) => s + Number(o.completedCnt || 0), 0);
  const activeRemainingUnits = catOrders
    .filter((o) => o.status !== 'completed' && o.isActive)
    .reduce((s, o) => s + Math.max(0, Number(o.totalCnt || 0) - Number(o.completedCnt || 0)), 0);
  const pausedRemainingUnits = catOrders
    .filter((o) => o.status !== 'completed' && !o.isActive)
    .reduce((s, o) => s + Math.max(0, Number(o.totalCnt || 0) - Number(o.completedCnt || 0)), 0);

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

  // Apply search/status filters
  const filteredOrders = catOrders.filter((o) => {
    if (state.orderActiveFilter === '1' && !o.isActive) return false;
    if (state.orderActiveFilter === '0' && o.isActive) return false;
    if (state.orderProgressFilter === 'running' && ['completed', 'cancelled'].includes(o.status)) return false;
    if (state.orderProgressFilter === 'completed' && o.status !== 'completed') return false;
    if (state.orderSearch.trim()) {
      const q = state.orderSearch.trim().toLowerCase();
      const matchName = String(o.customer?.nickname || '').toLowerCase().includes(q);
      const matchSuid = String(o.customer?.suid || '').toLowerCase().includes(q);
      const matchId = String(o.remoteOrderId || o.id).toLowerCase().includes(q);
      if (!matchName && !matchSuid && !matchId) return false;
    }
    return true;
  });

  // Extra footer buttons inside Stats Panel (Kho trái cây / Kho xu / Bảng giá)
  let footerButtonsHtml = '';
  if (catKey === 'fruit_coin') {
    footerButtonsHtml = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
        <button type="button" class="btn-frost" id="btnViewFruitWarehouse">📦 Xem kho trái cây</button>
        <button type="button" class="btn-frost" id="btnViewCoinWarehouse">🪙 Xem kho xu</button>
        <button type="button" class="btn-frost" id="btnViewCategoryPrices">🏷️ Xem bảng giá gói xu</button>
      </div>
    `;
  } else if (['buff_tim', 'buff_sao', 'guestbook', 'mail_gift', 'farm_gift'].includes(catKey)) {
    footerButtonsHtml = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
        <button type="button" class="btn-frost" id="btnViewCategoryPrices">🏷️ Xem bảng giá ${escapeHtml(VIEW_TITLES[catKey])}</button>
      </div>
    `;
  }

  return `
    <!-- TOP STATS PANEL CARD (MATCHING SCREENSHOT 1) -->
    <div class="glass-panel">
      <div class="panel-title-row">
        <div class="panel-title-left">
          <span class="panel-title-text">${escapeHtml(VIEW_TITLES[catKey])}</span>
          <span class="system-status-chip ${isWorking ? 'is-working' : 'is-not-working'}">
            ● ${isWorking ? 'Đang hoạt động' : 'Không hoạt động'}
          </span>
        </div>
        <button type="button" class="btn-frost" id="btnRefreshCatPage" style="font-size:12px;">
          ↻ Làm mới dữ liệu
        </button>
      </div>

      <div class="stats-three-grid">
        <!-- Subcard 1: Đơn hàng -->
        <div class="stat-subcard">
          <div class="stat-subcard-head">
            <div class="stat-icon-box blue">📋</div>
            <span>Đơn hàng</span>
          </div>
          <div class="stat-main-metric">
            <span>Đã hoàn thành:</span>
            <strong>${completedOrders}</strong>
            <span>/ ${totalOrders}</span>
          </div>
          <hr class="stat-divider" />
          <div class="stat-meta-row">
            <span><span style="color:#4ade80;">▶ Đang bật</span> <strong>${activeOrdersCount}</strong></span>
            <span><span style="color:#f87171;">⏸ Đang tắt</span> <strong>${inactiveOrdersCount}</strong></span>
          </div>
        </div>

        <!-- Subcard 2: Tiến độ -->
        <div class="stat-subcard">
          <div class="stat-subcard-head">
            <div class="stat-icon-box amber">🎁</div>
            <span>Tiến độ ${escapeHtml(unitName)}</span>
          </div>
          <div class="stat-main-metric">
            <span>Đã gửi thành công:</span>
            <strong>${formatNum(completedUnits)}</strong>
            <span>/ ${formatNum(totalUnits)}</span>
          </div>
          <hr class="stat-divider" />
          <div class="stat-meta-row">
            <span><span style="color:#4ade80;">↗ Đang chạy</span> <strong>${formatNum(activeRemainingUnits)}</strong></span>
            <span><span style="color:#f87171;">⏹ Tạm dừng</span> <strong>${formatNum(pausedRemainingUnits)}</strong></span>
          </div>
        </div>

        <!-- Subcard 3: Tốc độ xử lý -->
        <div class="stat-subcard">
          <div class="stat-subcard-head">
            <div class="stat-icon-box violet">⚡</div>
            <span>Tốc độ xử lý</span>
          </div>
          <div class="stat-meta-row">
            <span>☁️ Tốc độ gửi:</span>
            <strong style="color:#fff;">${Number(rateObj.assigned_rate || 0).toFixed(1)} ${escapeHtml(unitName)}/phút</strong>
          </div>
          <div class="stat-meta-row">
            <span>✓ Thành công:</span>
            <strong style="color:#4ade80;">${Number(rateObj.completed_rate || 0).toFixed(1)} ${escapeHtml(unitName)}/phút</strong>
          </div>
          <div class="stat-meta-row">
            <span>🕒 Chờ sau lỗi:</span>
            <strong style="color:#fff;">${rateObj.cooldown_second ?? 180} giây</strong>
          </div>
        </div>
      </div>

      ${footerButtonsHtml}
    </div>

    <!-- BOTTOM ORDER MANAGEMENT CARD (MATCHING SCREENSHOT 1) -->
    <div class="glass-panel">
      <div class="panel-title-row">
        <span class="panel-title-text">Quản lý đơn hàng</span>
        <button type="button" class="btn-violet" id="btnOpenAddOrderModal" ${catKey === 'weather_buff' ? 'disabled title="Hiện chỉ hỗ trợ xem lịch sử thời tiết"' : ''}>
          + Thêm Đơn Hàng
        </button>
      </div>

      <!-- Filter Row -->
      <div class="filters-grid">
        <div>
          <input
            type="text"
            id="catOrderSearchInput"
            class="input-box"
            placeholder="🔍 Tìm kiếm theo tên, SUID, mã đơn..."
            value="${escapeHtml(state.orderSearch)}"
          />
        </div>
        <div>
          <select id="catOrderActiveSelect" class="input-box">
            <option value="all" ${state.orderActiveFilter === 'all' ? 'selected' : ''}>Lọc theo trạng thái: Tất cả</option>
            <option value="1" ${state.orderActiveFilter === '1' ? 'selected' : ''}>Đang bật (Active)</option>
            <option value="0" ${state.orderActiveFilter === '0' ? 'selected' : ''}>Đang tắt (Paused)</option>
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

      <!-- Data Table -->
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>KHÁCH HÀNG</th>
              <th>GÓI / VẬT PHẨM</th>
              <th>SỐ LƯỢNG</th>
              <th>GIÁ</th>
              <th>ĐANG GỬI</th>
              <th>HOÀN THÀNH</th>
              <th>THẤT BẠI</th>
              <th>TIẾN ĐỘ</th>
              <th>TRẠNG THÁI</th>
              <th>BẬT/TẮT</th>
              <th>GHI CHÚ</th>
              <th>TẠO LÚC</th>
              <th>THAO TÁC</th>
            </tr>
          </thead>
          <tbody>
            ${
              filteredOrders.length === 0
                ? `
              <tr>
                <td colspan="13" style="text-align:center;padding:32px;color:var(--color-fog-veil);">
                  Không có dữ liệu
                </td>
              </tr>
            `
                : filteredOrders.map((o) => renderOrderTableRowHtml(o)).join('')
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderOrderTableRowHtml(o) {
  const isAdmin = state.user?.role === 'admin';
  const pct =
    o.totalCnt > 0
      ? Math.min(100, Math.round((Number(o.completedCnt || 0) / Number(o.totalCnt)) * 100))
      : 0;

  const statusBadge =
    o.status === 'cancelled' ? `<span class="badge-tag red">Đã hủy</span>` : o.status === 'completed'
      ? `<span class="badge-tag green">Hoàn thành</span>`
      : `<span class="badge-tag violet">${escapeHtml(o.status || 'assigned')}</span>`;

  // Admin sees cost & profit tooltip; CTV ONLY sees o.sellPrice!
  const adminNote =
    isAdmin && o.costPrice !== undefined && o.markupAmount > 0
      ? `<div style="font-size:10px;color:#4ade80;">Lãi: +${formatVnd(o.markupAmount)}</div>`
      : '';

  return `
    <tr>
      <td>
        <div style="font-weight:600;color:#fff;">${escapeHtml(o.customer?.nickname || '—')}</div>
        <div style="font-size:11px;color:var(--color-fog-veil);">
          #${escapeHtml(o.remoteOrderId || o.id)} · SUID: ${escapeHtml(o.customer?.suid || '—')}
        </div>
      </td>
      <td>
        <span class="badge-tag">${escapeHtml(o.summary)}</span>
      </td>
      <td><strong>${formatNum(o.totalCnt || 0)}</strong></td>
      <td>
        <div style="font-weight:600;color:#fbbf24;">${formatVnd(o.sellPrice)}</div>
        ${adminNote}
      </td>
      <td>${formatNum(o.sendingCnt || 0)}</td>
      <td style="color:#4ade80;font-weight:600;">${formatNum(o.completedCnt || 0)}</td>
      <td style="color:#f87171;">${formatNum(o.failedCnt || 0)}</td>
      <td>
        <div style="font-size:12px;font-weight:600;">${pct}%</div>
      </td>
      <td>${statusBadge}</td>
      <td>
        ${
          o.remoteOrderId && !['completed', 'cancelled'].includes(o.status) && !o.requiresReview
            ? `<button type="button" class="switch-btn ${o.isActive ? 'is-on' : ''}" data-toggle-order="${escapeHtml(o.remoteOrderId)}" data-order-cat="${escapeHtml(o.category)}" title="Bật/Tắt đơn"></button>`
            : '—'
        }
      </td>
      <td style="font-size:12px;color:var(--color-fog-veil);max-width:160px;">
        ${escapeHtml(o.note || '—')}
      </td>
      <td style="font-size:12px;color:var(--color-fog-veil);white-space:nowrap;">
        ${formatDateVi(o.createdAt)}
      </td>
      <td>
        ${
          o.remoteOrderId && o.status !== 'cancelled' && (!o.cancelRequested || isAdmin)
            ? `<button type="button" class="btn-frost" style="padding:4px 10px;font-size:11px;color:#fca5a5;" data-delete-order="${escapeHtml(o.remoteOrderId)}" data-order-cat="${escapeHtml(o.category)}">${isAdmin ? 'Hủy tại nguồn' : 'Yêu cầu hủy'}</button>`
            : '—'
        }
      </td>
    </tr>
  `;
}

function bindOrderCategoryPageEvents(catKey) {
  document.getElementById('btnRefreshCatPage')?.addEventListener('click', async () => {
    showToast('Đang đồng bộ dữ liệu mới nhất...');
    await Promise.all([loadCatalog(true), loadOrders()]);
    renderCurrentView();
  });

  document.getElementById('btnOpenAddOrderModal')?.addEventListener('click', () => {
    openCreateOrderModal(catKey);
  });

  document.getElementById('btnViewFruitWarehouse')?.addEventListener('click', openFruitWarehouseModal);
  document.getElementById('btnViewCoinWarehouse')?.addEventListener('click', openCoinWarehouseModal);
  document.getElementById('btnViewCategoryPrices')?.addEventListener('click', () => {
    openCategoryPriceListModal(catKey);
  });

  const searchIn = document.getElementById('catOrderSearchInput');
  searchIn?.addEventListener('input', (e) => {
    state.orderSearch = e.target.value;
    renderCurrentView();
    const el = document.getElementById('catOrderSearchInput');
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });

  document.getElementById('catOrderActiveSelect')?.addEventListener('change', (e) => {
    state.orderActiveFilter = e.target.value;
    renderCurrentView();
  });

  document.getElementById('catOrderProgressSelect')?.addEventListener('change', (e) => {
    state.orderProgressFilter = e.target.value;
    renderCurrentView();
  });

  bindOrderRowActionButtons();
}

function bindOrderRowActionButtons() {
  document.querySelectorAll('[data-toggle-order]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const remId = btn.dataset.toggleOrder;
      const cat = btn.dataset.orderCat;
      btn.disabled = true;
      try {
        const res = await apiFetch(`/api/orders/${cat}/${remId}/toggle-active`, 'PUT');
        showToast(res.message || 'Đã cập nhật trạng thái đơn hàng');
        await loadOrders();
        renderCurrentView();
      } catch (err) {
        showToast(`Lỗi: ${err.message}`);
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-delete-order]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const remId = btn.dataset.deleteOrder;
      const cat = btn.dataset.orderCat;
      if (!confirm(state.user.role === 'admin' ? `Hủy đơn #${remId} tại nguồn? Tiền ví sẽ chỉ được hoàn sau khi đối soát.` : `Gửi yêu cầu hủy đơn #${remId} cho admin? Nguồn có thể vẫn chạy đến khi admin xử lý; chưa tự động hoàn tiền.`)) return;
      btn.disabled = true;
      try {
        const res = await apiFetch(`/api/orders/${cat}/${remId}`, 'DELETE', {
          deletion_note: 'Xóa đơn từ ZnPlay',
        });
        showToast(res.message || 'Đã xóa đơn hàng');
        await Promise.all([loadOrders(), initAuth()]);
        renderCurrentView();
      } catch (err) {
        showToast(`Không thể xóa: ${err.message}`);
        btn.disabled = false;
      }
    });
  });
}

// ============================================================================
// 2. MODAL: + THÊM ĐƠN HÀNG (CREATE ORDER DIALOG)
// ============================================================================
function openCreateOrderModal(catKey) {
  if (catKey === 'weather_buff') { showToast('Buff thời tiết hiện chỉ hỗ trợ xem lịch sử; chưa mở tạo đơn để tránh tính phí sai.'); return; }
  // Check CTV wallet balance first!
  if (state.user.role !== 'admin' && Number(state.user.balance || 0) <= 0) {
    showToast('Số dư ví CTV của bạn là 0đ. Vui lòng nạp tiền vào ví trước khi tạo đơn!');
    return;
  }

  const r = state.catalogData;
  if (!r) return;

  state.modalOrder.category = catKey === 'fruit_coin' ? 'fruit_coin' : catKey;
  state.modalOrder.requestKey = null;
  state.modalOrder.requestSignature = null;
  state.modalOrder.quotedPrice = 0;
  state.modalOrder.fruitOrderType = 'by_coin';

  const cat = r.catalog || {};
  if (cat.fruit_coin?.length && !state.modalOrder.coin_price_package_id) {
    state.modalOrder.coin_price_package_id = cat.fruit_coin[0].id;
  }
  if (cat.buff_tim?.length && catKey === 'buff_tim') {
    state.modalOrder.price_package_id = cat.buff_tim[0].id;
  } else if (cat.buff_sao?.length && catKey === 'buff_sao') {
    state.modalOrder.price_package_id = cat.buff_sao[0].id;
  } else if (cat.guestbook?.length && catKey === 'guestbook') {
    state.modalOrder.price_package_id = cat.guestbook[0].id;
  } else if (catKey === 'mail_gift' && cat.mail_gift?.length) {
    state.modalOrder.gift_id = cat.mail_gift[0].id;
    state.modalOrder.gift_plant_id = cat.mail_gift[0].packages?.[0]?.id || null;
  } else if (catKey === 'farm_gift' && cat.farm_gift?.length) {
    state.modalOrder.gift_id = cat.farm_gift[0].id;
    state.modalOrder.gift_plant_id = cat.farm_gift[0].packages?.[0]?.id || null;
  }

  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  if (!overlay || !box || !title) return;

  box.className = 'modal-box';
  title.textContent = `+ Thêm mới: ${VIEW_TITLES[catKey] || 'Đơn hàng'}`;
  overlay.style.display = 'flex';

  renderCreateOrderModalBody();
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
        <div style="display:flex;gap:8px;">
          <button type="button" class="btn-frost ${isByCoin ? 'is-active' : ''}" id="modalTabByCoin" style="flex:1;">
            🪙 Gửi Xu Nông Trại (Theo Gói)
          </button>
          <button type="button" class="btn-frost ${!isByCoin ? 'is-active' : ''}" id="modalTabByFruit" style="flex:1;">
            🍎 Gửi Trái Cây (Theo Số Lượng & Đột Biến)
          </button>
        </div>
      </div>

      ${
        isByCoin
          ? `
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Chọn gói số lượng Xu:</label>
          <div class="pkg-picker-list">
            ${coinPkgs
              .map((p) => {
                const isSel = Number(state.modalOrder.coin_price_package_id) === Number(p.id);
                const tObj = p.prices_by_tier?.[state.modalOrder.min_coin_filter] || p;
                return `
                  <div class="pkg-picker-card ${isSel ? 'is-selected' : ''}" data-modal-coin-pkg="${p.id}">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                      <strong style="color:#fff;font-size:14px;">${formatNum(p.coin_quantity || p.quantity)} Xu</strong>
                      ${p.is_on_sale ? `<span class="badge-tag amber">Sale</span>` : ''}
                    </div>
                    <div style="display:flex;align-items:baseline;gap:8px;">
                      <span style="font-weight:700;color:#5eead4;font-size:15px;">${formatVnd(tObj.total_price)}</span>
                      ${p.is_on_sale ? `<span style="text-decoration:line-through;font-size:11px;color:var(--color-fog-veil);">${formatVnd(tObj.original_price)}</span>` : ''}
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Lọc giá trị trái tối thiểu:</label>
          <select id="modalCoinTierSelect" class="input-box">
            ${tiers
              .map(
                (t) => `
              <option value="${t.min_coin}" ${Number(state.modalOrder.min_coin_filter) === Number(t.min_coin) ? 'selected' : ''}>
                Trái từ ${formatNum(t.min_coin)} Xu trở lên ${t.markup_percent > 0 ? `(+${t.markup_percent}%)` : '(Mặc định)'} — Kho còn: ${formatNum(t.quantity)} Xu
              </option>
            `
              )
              .join('')}
          </select>
        </div>
      `
          : `
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;">
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
          <div style="display:flex;gap:8px;">
            <button type="button" class="btn-frost ${state.modalOrder.fruit_variant_mode === 'regular' ? 'is-active' : ''}" id="modalFruitModeReg" style="flex:1;">
              Chỉ trái thường
            </button>
            <button type="button" class="btn-frost ${state.modalOrder.fruit_variant_mode === 'specify' ? 'is-active' : ''}" id="modalFruitModeSpec" style="flex:1;">
              Chọn hệ đột biến (${state.modalOrder.fruit_mutation_list.length})
            </button>
          </div>
        </div>

        ${
          state.modalOrder.fruit_variant_mode === 'specify'
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
  } else if (catKey === 'buff_tim' || catKey === 'buff_sao' || catKey === 'guestbook') {
    const pkgs = catalog[catKey] || [];
    const unitTxt = catKey === 'buff_tim' ? 'Tim' : catKey === 'buff_sao' ? 'Sao' : 'Bài viết';

    categoryFormHtml = `
      <div>
        <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Chọn gói số lượng:</label>
        ${
          pkgs.length === 0
            ? `<div style="padding:14px;background:rgba(228,109,76,0.14);border-radius:8px;color:#fca5a5;">Hiện chưa có gói giá đang mở cho danh mục này.</div>`
            : `
          <div class="pkg-picker-list">
            ${pkgs
              .map((p) => {
                const isSel = Number(state.modalOrder.price_package_id) === Number(p.id);
                return `
                  <div class="pkg-picker-card ${isSel ? 'is-selected' : ''}" data-modal-std-pkg="${p.id}">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                      <strong style="color:#fff;font-size:14px;">${formatNum(p.quantity)} ${unitTxt}</strong>
                      ${p.is_on_sale && p.sale ? `<span class="badge-tag amber">Còn ${p.sale.slots_remaining} slot</span>` : ''}
                    </div>
                    <div style="display:flex;align-items:baseline;gap:8px;">
                      <span style="font-weight:700;color:#5eead4;font-size:15px;">${formatVnd(p.total_price)}</span>
                      ${p.is_on_sale ? `<span style="text-decoration:line-through;font-size:11px;color:var(--color-fog-veil);">${formatVnd(p.original_price)}</span>` : ''}
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        `
        }
      </div>
      ${
        catKey === 'guestbook'
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
          ${pkgs
            .map((p) => {
              const isSel = Number(state.modalOrder.gift_plant_id) === Number(p.id);
              return `
                <div class="pkg-picker-card ${isSel ? 'is-selected' : ''}" data-modal-gift-pkg="${p.id}">
                  <strong style="color:#fff;">Số lượng: ${formatNum(p.quantity)}</strong>
                  <span style="font-weight:700;color:#5eead4;">${formatVnd(p.total_price)}</span>
                </div>
              `;
            })
            .join('')}
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
    ${
      !isWorking
        ? `
      <div style="padding:12px 14px;background:rgba(228,109,76,0.18);border-radius:8px;color:#fca5a5;font-size:13px;">
        ⚠️ Hệ thống chạy đơn <strong>${escapeHtml(VIEW_TITLES[catKey])}</strong> hiện đang ở trạng thái <strong>Không hoạt động</strong> trên máy chủ.
      </div>
    `
        : ''
    }

    <!-- STEP 1: FIND & SELECT CUSTOMER -->
    <div style="background:rgba(255,255,255,0.02);padding:14px;border-radius:12px;box-shadow:var(--shadow-subtle);display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <strong style="color:#fff;font-size:13px;">1. Chọn khách hàng Play Together</strong>
        <div style="display:flex;gap:6px;">
          <button type="button" class="btn-frost ${state.modalOrder.customerTab === 'ingame' ? 'is-active' : ''}" data-mcust-tab="ingame" style="padding:4px 10px;font-size:11px;">
            Tìm theo Tên (Trong Game)
          </button>
          <button type="button" class="btn-frost ${state.modalOrder.customerTab === 'roleid' ? 'is-active' : ''}" data-mcust-tab="roleid" style="padding:4px 10px;font-size:11px;">
            Theo Role ID
          </button>
          ${state.user.role === 'admin' ? `<button type="button" class="btn-frost ${state.modalOrder.customerTab === 'saved' ? 'is-active' : ''}" data-mcust-tab="saved" style="padding:4px 10px;font-size:11px;">
            Khách đã lưu
          </button>` : ''}
        </div>
      </div>

      ${
        cust
          ? `
        <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(102,58,243,0.18);padding:10px 14px;border-radius:8px;box-shadow:rgba(156,127,249,0.5) 0 0 0 1px inset;">
          <div>
            <div style="font-weight:600;color:#fff;font-size:14px;">✓ ${escapeHtml(cust.nickname)}</div>
            <div style="font-size:11px;color:var(--color-moon-mist);">SUID: ${escapeHtml(cust.suid || '—')} ${cust.region ? `· ${escapeHtml(cust.region)}` : ''}</div>
          </div>
          <button type="button" class="btn-frost" id="btnModalClearCust" style="padding:4px 10px;font-size:11px;">Đổi khách</button>
        </div>
      `
          : `
        <div style="display:flex;gap:8px;">
          <input
            type="text"
            id="modalCustSearchInput"
            class="input-box"
            placeholder="${
              state.modalOrder.customerTab === 'ingame'
                ? 'Nhập tên nhân vật cần tìm trong game...'
                : state.modalOrder.customerTab === 'roleid'
                ? 'Nhập mã Role ID (XXXX-XXXX-XXXX)...'
                : 'Nhập tên hoặc SUID khách quen...'
            }"
          />
          <button type="button" class="btn-violet" id="btnModalSearchCust">Tìm</button>
        </div>
        <div id="modalCustSearchStatus" style="font-size:12px;color:var(--color-fog-veil);"></div>
        <div id="modalCustSearchResults" style="display:flex;flex-direction:column;gap:6px;max-height:190px;overflow-y:auto;"></div>
      `
      }
    </div>

    <!-- STEP 2: PACKAGE / FRUIT CONFIGURATION -->
    <div style="display:flex;flex-direction:column;gap:12px;">
      ${categoryFormHtml}
    </div>

    <!-- STEP 3: TOTAL PRICE & SUBMIT -->
    <div style="background:rgba(5,6,15,0.7);padding:14px 16px;border-radius:10px;box-shadow:var(--shadow-subtle);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:12px;color:var(--color-moon-mist);">Tổng tiền thanh toán:</div>
        <div style="font-size:22px;font-weight:700;color:#fbbf24;" id="modalTotalPriceText">0đ</div>
      </div>
      <div style="display:flex;gap:10px;">
        <button type="button" class="btn-frost" id="btnModalCancel">Hủy</button>
        <button type="button" class="btn-violet" id="btnModalSaveOrder" ${!isWorking ? 'disabled' : ''}>
          Lưu & Chạy Đơn Hàng →
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

  // Fruit Order Type Tabs (by_coin vs by_fruit)
  body.querySelector('#modalTabByCoin')?.addEventListener('click', () => {
    state.modalOrder.fruitOrderType = 'by_coin';
    state.modalOrder.category = 'fruit_coin';
    renderCreateOrderModalBody();
  });
  body.querySelector('#modalTabByFruit')?.addEventListener('click', () => {
    state.modalOrder.fruitOrderType = 'by_fruit';
    state.modalOrder.category = 'fruit_by_fruit';
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

let modalPreviewTimer = null;
function triggerModalFruitPreview() {
  if (modalPreviewTimer) clearTimeout(modalPreviewTimer);
  state.modalOrder.fruit_preview_price = 0;
  state.modalOrder.quotedPrice = 0;
  const signature = JSON.stringify([state.modalOrder.fruit_item_id, state.modalOrder.fruit_total_cnt, state.modalOrder.fruit_variant_mode, state.modalOrder.fruit_mutation_list]);
  const priceEl = document.getElementById('modalTotalPriceText');
  if (priceEl) priceEl.textContent = 'Đang tính...';

  modalPreviewTimer = setTimeout(async () => {
    try {
      const r = await apiFetch('/api/catalog/preview-fruit', 'POST', {
        fruit_item_id: state.modalOrder.fruit_item_id,
        total_cnt: state.modalOrder.fruit_total_cnt,
        mutation_list:
          state.modalOrder.fruit_variant_mode === 'specify' ? state.modalOrder.fruit_mutation_list : [],
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
  }, 180);
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
  } else if (cat === 'buff_tim' || cat === 'buff_sao' || cat === 'guestbook') {
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
    statusEl.textContent = '⏳ Đang kết nối máy chủ Play Together tìm nhân vật...';
    resultsEl.innerHTML = '';
    try {
      const r = await apiFetch('/api/customer/search-ingame', 'POST', { nickname: q });
      const list = r.profiles || [];
      statusEl.textContent = `Tìm thấy ${list.length} kết quả:`;
      resultsEl.innerHTML = list
        .map(
          (p, i) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:8px;">
            <div>
              <strong style="color:#fff;">${escapeHtml(p.Nickname)}</strong>
              <span class="badge-tag violet" style="margin-left:6px;">${escapeHtml(p.RegionName || p.Region || 'VN')}</span>
              <div style="font-size:11px;color:var(--color-fog-veil);">SUID: ${escapeHtml(p.suid)} · ${escapeHtml(p.Online_Status || '')}</div>
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
    } catch (err) {
      statusEl.textContent = `Lỗi: ${err.message}`;
    }
  } else if (mode === 'roleid') {
    if (!q) {
      showToast('Vui lòng nhập Role ID.');
      return;
    }
    statusEl.textContent = '⏳ Đang kiểm tra Role ID...';
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
    statusEl.textContent = '⏳ Đang tải danh sách khách hàng...';
    try {
      const r = await apiFetch(`/api/customer/saved?q=${encodeURIComponent(q)}`);
      const list = r.customers || [];
      statusEl.textContent = `Hiển thị ${list.length} khách hàng:`;
      resultsEl.innerHTML = list
        .map(
          (c) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:8px;">
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
    } catch (err) {
      statusEl.textContent = `Lỗi: ${err.message}`;
    }
  }
}

async function submitModalOrder(confirmDuplicate = false) {
  const m = state.modalOrder;
  if (!m.customer?.customerId) {
    showToast('Vui lòng tìm và chọn khách hàng trước khi lưu đơn!');
    return;
  }
  if (!Number.isSafeInteger(m.quotedPrice) || m.quotedPrice <= 0) {
    showToast('Vui lòng đợi giá hợp lệ trước khi đặt đơn.');
    return;
  }

  const payload = {
    category: m.category,
    customer_id: m.customer.customerId,
    game_profile_id: m.customer.gameProfileId,
    customer_snapshot: m.customer,
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
  } else if (m.category === 'buff_tim' || m.category === 'buff_sao' || m.category === 'guestbook') {
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
    m.requestKey = crypto.randomUUID();
  }
  payload.idempotency_key = m.requestKey;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang xử lý...';
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
        btn.textContent = 'Lưu & Chạy Đơn Hàng →';
      }
      return;
    }

    if (r.success) {
      showToast(r.message || 'Tạo đơn hàng thành công!');
      document.getElementById('appModalOverlay').style.display = 'none';
      if (r.userBalance !== undefined && state.user) {
        state.user.balance = r.userBalance;
        updateShellAuthUI();
      }
      await loadOrders();
      renderCurrentView();
    }
  } catch (err) {
    showToast(err.message);
    if (err.code === 'PRICE_CHANGED') {
      await loadCatalog(true);
      if (m.category === 'fruit_by_fruit') triggerModalFruitPreview();
      else renderCreateOrderModalBody();
    }
    if (err.code === 'ORDER_REVIEW_REQUIRED') {
      const current = await apiFetch('/api/auth/me').catch(() => null);
      if (current?.user) { state.user = current.user; updateShellAuthUI(); }
      if (btn) { btn.disabled = true; btn.textContent = 'Chờ admin đối soát'; }
    } else if (btn) {
      btn.disabled = false;
      btn.textContent = 'Lưu & Chạy Đơn Hàng →';
    }
  }
}

// ============================================================================
// 3. MODALS: FRUIT WAREHOUSE, COIN WAREHOUSE, CATEGORY PRICE LIST
// ============================================================================
function openFruitWarehouseModal() {
  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body || !state.catalogData) return;

  box.className = 'modal-box wide';
  title.textContent = '📦 Kho Trái Cây Trực Tuyến';
  const fruits = (state.catalogData.catalog?.fruit_by_fruit || [])
    .slice()
    .sort((a, b) => b.stock_quantity - a.stock_quantity);

  body.innerHTML = `
    <input type="text" id="whFruitFilterInput" class="input-box" placeholder="🔍 Tìm tên trái cây trong kho (${fruits.length} loại)..." />
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;max-height:420px;overflow-y:auto;padding:2px;" id="whFruitGrid"></div>
  `;

  const grid = body.querySelector('#whFruitGrid');
  const renderList = (q = '') => {
    const cq = q.trim().toLowerCase();
    const list = cq ? fruits.filter((f) => f.name.toLowerCase().includes(cq)) : fruits;
    grid.innerHTML = list
      .map(
        (f) => `
        <div class="pkg-picker-card" data-wh-fruit="${f.id}">
          <div style="display:flex;align-items:center;gap:10px;">
            ${f.icon ? `<img src="${escapeHtml(f.icon)}" style="width:36px;height:36px;object-fit:contain;" alt="" />` : '🍎'}
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
        state.modalOrder.fruitOrderType = 'by_fruit';
        state.modalOrder.category = 'fruit_by_fruit';
        state.modalOrder.fruit_item_id = Number(card.dataset.whFruit);
        openCreateOrderModal('fruit_coin');
        state.modalOrder.fruitOrderType = 'by_fruit';
        state.modalOrder.category = 'fruit_by_fruit';
        renderCreateOrderModalBody();
        triggerModalFruitPreview();
      });
    });
  };

  renderList('');
  body.querySelector('#whFruitFilterInput')?.addEventListener('input', (e) => renderList(e.target.value));
  overlay.style.display = 'flex';
}

function openCoinWarehouseModal() {
  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body || !state.catalogData) return;

  box.className = 'modal-box';
  title.textContent = '🪙 Kho Xu Nông Trại Trực Tuyến';
  const coin = state.catalogData.coinStock || {};
  const tiers = state.catalogData.coinTiers || [];

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
          ${tiers
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
  overlay.style.display = 'flex';
}

function openCategoryPriceListModal(catKey) {
  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body || !state.catalogData) return;

  box.className = 'modal-box';
  title.textContent = `🏷️ Bảng giá: ${VIEW_TITLES[catKey] || catKey}`;
  const pkgs = state.catalogData.catalog?.[catKey] || [];

  if (!pkgs.length) {
    body.innerHTML = `<div style="color:var(--color-fog-veil);padding:16px 0;">Hiện chưa có gói giá nào đang mở cho danh mục này.</div>`;
  } else {
    body.innerHTML = `
      <div class="pkg-picker-list" style="max-height:420px;">
        ${pkgs
          .map(
            (p) => `
          <div class="pkg-picker-card">
            <div style="display:flex;justify-content:space-between;">
              <strong style="color:#fff;">Gói ${formatNum(p.quantity || p.coin_quantity)}</strong>
              ${p.is_on_sale && p.sale ? `<span class="badge-tag amber">Sale còn ${p.sale.slots_remaining} slot</span>` : ''}
            </div>
            <div style="font-size:16px;font-weight:700;color:#5eead4;">${formatVnd(p.total_price)}</div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
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
  const activeOrders = state.orders.filter((o) => o.status !== 'completed' && o.isActive).length;

  const catCards = [
    { key: 'farm_gift', icon: '🏪', name: 'Quà nông trại', working: st.farm_gift },
    { key: 'mail_gift', icon: '✉️', name: 'Quà thư', working: st.mail_gift },
    { key: 'guestbook', icon: '📰', name: 'Bài viết', working: st.guestbook },
    { key: 'buff_tim', icon: '🤍', name: 'Buff Tim', working: st.buff_tim },
    { key: 'buff_sao', icon: '☆', name: 'Buff Sao', working: st.buff_sao },
    { key: 'weather_buff', icon: '☁️', name: 'Buff Thời Tiết', working: st.weather_buff },
    { key: 'fruit_coin', icon: '🪙', name: 'Trái cây & Xu', working: st.fruit_coin },
  ];

  return `
    <div class="stats-three-grid">
      <div class="glass-panel">
        <div style="font-size:12px;color:var(--color-moon-mist);">Trữ lượng Kho Xu Nông Trại</div>
        <div style="font-size:24px;font-weight:700;color:#4ade80;margin-top:6px;">${formatNum(coinQty)} Xu</div>
        <div style="font-size:12px;color:var(--color-fog-veil);margin-top:4px;">Kho trái cây: ${formatNum(totalFruits)} trái sẵn sàng</div>
      </div>

      <div class="glass-panel">
        <div style="font-size:12px;color:var(--color-moon-mist);">Đơn hàng đang chạy</div>
        <div style="font-size:24px;font-weight:700;color:#fff;margin-top:6px;">${activeOrders} đơn đang bật</div>
        <div style="font-size:12px;color:var(--color-fog-veil);margin-top:4px;">Tổng số đơn: ${state.orders.length} đơn</div>
      </div>

      <div class="glass-panel">
        <div style="font-size:12px;color:var(--color-moon-mist);">${state.user.role === 'admin' ? 'Trạng thái Quản trị Admin' : 'Số dư Ví CTV của bạn'}</div>
        <div style="font-size:24px;font-weight:700;color:#fbbf24;margin-top:6px;">
          ${state.user.role === 'admin' ? 'Đã đồng bộ API' : formatVnd(state.user.balance)}
        </div>
        <div style="font-size:12px;color:var(--color-fog-veil);margin-top:4px;">
          ${state.user.role === 'admin' ? 'Bấm mục Quản trị bên trái để chỉnh giá CTV' : 'Đảm bảo có số dư để tạo đơn hàng'}
        </div>
      </div>
    </div>

    <div class="glass-panel">
      <div class="panel-title-row">
        <span class="panel-title-text">Danh mục Chạy Đơn (Đồng bộ trạng thái thực tế)</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;">
        ${catCards
          .map(
            (c) => `
          <div class="stat-subcard" style="cursor:pointer;" data-dash-goto="${c.key}">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <strong style="color:#fff;font-size:15px;">${c.icon} ${escapeHtml(c.name)}</strong>
              <span class="system-status-chip ${c.working ? 'is-working' : 'is-not-working'}" style="font-size:11px;padding:2px 8px;">
                ● ${c.working ? 'Hoạt động' : 'Tạm ngưng'}
              </span>
            </div>
            <div style="display:flex;justify-content:flex-end;margin-top:6px;">
              <span class="btn-frost" style="padding:5px 12px;font-size:11px;">Mở danh mục →</span>
            </div>
          </div>
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
    const r = await apiFetch('/api/settlements');
    const isAdmin = state.user.role === 'admin';
    const trxList = r.transactions || [];

    let summaryHtml = '';
    if (isAdmin) {
      const wl = r.hnSettlement?.weekly_limit || { limit: 5000000, spent: 0, remaining: 5000000 };
      summaryHtml = `
        <div class="stats-three-grid">
          <div class="stat-subcard">
            <div style="font-size:12px;color:var(--color-moon-mist);">Hạn mức tuần nguồn</div>
            <div style="font-size:22px;font-weight:700;color:#fff;">${formatVnd(wl.limit)}</div>
          </div>
          <div class="stat-subcard">
            <div style="font-size:12px;color:var(--color-moon-mist);">Đã sử dụng trong tuần</div>
            <div style="font-size:22px;font-weight:700;color:#fbbf24;">${formatVnd(wl.spent)}</div>
          </div>
          <div class="stat-subcard">
            <div style="font-size:12px;color:var(--color-moon-mist);">Hạn mức còn lại</div>
            <div style="font-size:22px;font-weight:700;color:#4ade80;">${formatVnd(wl.remaining)}</div>
          </div>
        </div>
      `;
    } else {
      const s = r.summary || { orderCount: 0, totalSpent: 0, currentBalance: state.user.balance };
      summaryHtml = `
        <div class="stats-three-grid">
          <div class="stat-subcard">
            <div style="font-size:12px;color:var(--color-moon-mist);">Số dư ví hiện tại</div>
            <div style="font-size:22px;font-weight:700;color:#4ade80;">${formatVnd(s.currentBalance)}</div>
          </div>
          <div class="stat-subcard">
            <div style="font-size:12px;color:var(--color-moon-mist);">Tổng đơn đã đặt</div>
            <div style="font-size:22px;font-weight:700;color:#fff;">${s.orderCount} đơn</div>
          </div>
          <div class="stat-subcard">
            <div style="font-size:12px;color:var(--color-moon-mist);">Tổng tiền đã thanh toán</div>
            <div style="font-size:22px;font-weight:700;color:#fbbf24;">${formatVnd(s.totalSpent)}</div>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      ${zeroBannerHtml}
      <div class="glass-panel">
        <div class="panel-title-row">
          <span class="panel-title-text">💲 Đối soát tuần & Biến động số dư (${escapeHtml(r.weekStart || '')})</span>
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
              ${
                trxList.length === 0
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
                      <td>${escapeHtml(t.note)}</td>
                      <td>${formatDateVi(t.createdAt)}</td>
                    </tr>
                  `
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="glass-panel">Lỗi tải đối soát: ${escapeHtml(err.message)}</div>`;
  }
}

function renderOrderHistoryHtml() {
  return `
    <div class="glass-panel">
      <div class="panel-title-row">
        <span class="panel-title-text">📄 Toàn bộ Lịch sử đơn hàng (${state.orders.length} đơn)</span>
        <input type="text" id="histSearchInput" class="input-box" style="max-width:280px;" placeholder="🔍 Tìm tên khách, mã đơn, SUID..." value="${escapeHtml(state.orderSearch)}" />
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>KHÁCH HÀNG</th>
              <th>GÓI / VẬT PHẨM</th>
              <th>SỐ LƯỢNG</th>
              <th>GIÁ</th>
              <th>ĐANG GỬI</th>
              <th>HOÀN THÀNH</th>
              <th>THẤT BẠI</th>
              <th>TIẾN ĐỘ</th>
              <th>TRẠNG THÁI</th>
              <th>BẬT/TẮT</th>
              <th>GHI CHÚ</th>
              <th>TẠO LÚC</th>
              <th>THAO TÁC</th>
            </tr>
          </thead>
          <tbody>
            ${
              state.orders.length === 0
                ? `<tr><td colspan="13" style="text-align:center;padding:28px;color:var(--color-fog-veil);">Không có dữ liệu</td></tr>`
                : state.orders
                    .filter((o) => {
                      if (!state.orderSearch.trim()) return true;
                      const q = state.orderSearch.trim().toLowerCase();
                      return (
                        String(o.customer?.nickname || '').toLowerCase().includes(q) ||
                        String(o.customer?.suid || '').toLowerCase().includes(q) ||
                        String(o.remoteOrderId || o.id).toLowerCase().includes(q)
                      );
                    })
                    .map((o) => renderOrderTableRowHtml(o))
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function bindOrderHistoryEvents() {
  const input = document.getElementById('histSearchInput');
  input?.addEventListener('input', (e) => {
    state.orderSearch = e.target.value;
    renderCurrentView();
    const el = document.getElementById('histSearchInput');
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });
  bindOrderRowActionButtons();
}

function renderUserSearchPageHtml() {
  return `
    <div class="glass-panel">
      <div class="panel-title-row">
        <span class="panel-title-text">1. Tìm khách hàng để đặt đơn</span>
      </div>
      <div style="display:flex;gap:10px;max-width:600px;">
        <select id="pageUserSearchMode" class="input-box" style="max-width:150px;"><option value="name">Tên nhân vật</option><option value="id">Role ID</option></select>
        <input type="text" id="pageUserSearchInput" class="input-box" placeholder="Nhập tên nhân vật trong game (VD: Kitty, Yvelzz)..." />
        <button type="button" class="btn-violet" id="btnPageUserSearch">🔍 Tìm trong Game</button>
      </div>
      <div id="pageUserSearchStatus" style="margin-top:12px;font-size:13px;color:var(--color-fog-veil);"></div>
      <div id="pageUserSearchResults" style="margin-top:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;"></div>
    </div>
  `;
}

function bindUserSearchPageEvents() {
  const runSearch = async () => {
    const q = document.getElementById('pageUserSearchInput')?.value?.trim();
    const status = document.getElementById('pageUserSearchStatus');
    const results = document.getElementById('pageUserSearchResults');
    if (!q) {
      showToast('Vui lòng nhập tên nhân vật cần tìm.');
      return;
    }
    status.textContent = '⏳ Đang kết nối máy chủ Play Together để tìm nhân vật...';
    results.innerHTML = '';
    try {
      if (document.getElementById('pageUserSearchMode')?.value === 'id') {
        const response = await apiFetch('/api/customer/resolve-role-id', 'POST', { role_id: q });
        if (response.customer) {
          state.modalOrder.customer = response.customer;
          openCreateOrderModal('fruit_coin');
          status.textContent = 'Đã chọn nhân vật theo Role ID.';
        }
        return;
      }
      const r = await apiFetch('/api/customer/search-ingame', 'POST', { nickname: q });
      const list = r.profiles || [];
      status.textContent = `Tìm thấy ${list.length} nhân vật:`;
      results.innerHTML = list
        .map(
          (p, idx) => `
          <div class="stat-subcard">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
              <div>
                <div style="font-weight:700;color:#fff;font-size:15px;">${escapeHtml(p.Nickname)}</div>
                <div style="font-size:12px;color:var(--color-moon-mist);">Khu vực: ${escapeHtml(p.RegionName || p.Region || 'VN')} · Lv.${p.AchievementLevel ?? 1}</div>
                <div style="font-size:11px;color:var(--color-fog-veil);">SUID: ${escapeHtml(p.suid)} · ${escapeHtml(p.Online_Status || '')}</div>
              </div>
              <button type="button" class="btn-violet" data-page-pick-prof="${idx}">Đặt đơn →</button>
            </div>
          </div>
        `
        )
        .join('');

      results.querySelectorAll('[data-page-pick-prof]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const prof = list[Number(btn.dataset.pagePickProf)];
          btn.disabled = true;
          btn.textContent = 'Đang lưu...';
          try {
            const sel = await apiFetch('/api/customer/select-ingame', 'POST', { profile: prof });
            if (sel.success && sel.customer) {
              state.modalOrder.customer = sel.customer;
              openCreateOrderModal('fruit_coin');
            }
          } catch (err) {
            showToast(err.message);
            btn.disabled = false;
            btn.textContent = 'Đặt đơn →';
          }
        });
      });
    } catch (err) {
      status.textContent = `Lỗi: ${err.message}`;
    }
  };

  document.getElementById('btnPageUserSearch')?.addEventListener('click', runSearch);
  document.getElementById('pageUserSearchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSearch();
  });
}

async function renderSavedCustomersPage(container, zeroBannerHtml, q = '') {
  try {
    const r = await apiFetch(`/api/customer/saved?q=${encodeURIComponent(q)}`);
    const list = r.customers || [];
    container.innerHTML = `
      ${zeroBannerHtml}
      <div class="glass-panel">
        <div class="panel-title-row">
          <span class="panel-title-text">📁 Tra cứu khách hàng đã lưu (${r.total || list.length} khách)</span>
          <div style="display:flex;gap:8px;">
            <input type="text" id="savedCustQueryInput" class="input-box" style="width:260px;" value="${escapeHtml(q)}" placeholder="Nhập tên hoặc SUID..." />
            <button type="button" class="btn-violet" id="btnSavedCustSearch">Tìm</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>TÊN NHÂN VẬT</th>
                <th>SUID</th>
                <th>NGÀY LƯU</th>
                <th>THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              ${list
                .map(
                  (c) => `
                <tr>
                  <td>#${c.id}</td>
                  <td><strong style="color:#fff;">${escapeHtml(c.nickname || '—')}</strong></td>
                  <td>${escapeHtml(c.suid || '—')}</td>
                  <td>${formatDateVi(c.created_at)}</td>
                  <td>
                    <button type="button" class="btn-frost" style="padding:4px 10px;font-size:11px;" data-order-for-saved="${c.id}">
                      + Tạo đơn cho khách này
                    </button>
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.querySelector('#btnSavedCustSearch')?.addEventListener('click', () => {
      const val = container.querySelector('#savedCustQueryInput')?.value || '';
      renderSavedCustomersPage(container, zeroBannerHtml, val);
    });
    container.querySelectorAll('[data-order-for-saved]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const det = await apiFetch(`/api/customer/saved/${btn.dataset.orderForSaved}`);
          if (det.success && det.customer) {
            state.modalOrder.customer = det.customer;
            openCreateOrderModal('fruit_coin');
          }
        } catch (err) {
          showToast(err.message);
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="glass-panel">Lỗi: ${escapeHtml(err.message)}</div>`;
  }
}

// ============================================================================
// 6. ADMIN PAGE: TÙY CHỈNH GIÁ TỪNG SẢN PHẨM (NHÂN SÂM 130Đ -> 170Đ, GÓI XU...)
// ============================================================================
function renderAdminPricingPageHtml() {
  const r = state.catalogData;
  const adm = state.adminOverview;
  const fruits = r?.catalog?.fruit_by_fruit || [];
  const defaultFruitMarkup = adm?.settings?.defaultFruitUnitMarkup ?? 40;
  const cm = adm?.settings?.categoryMarkups || {};

  const filteredFruits = state.adminFruitSearch.trim()
    ? fruits.filter((f) => f.name.toLowerCase().includes(state.adminFruitSearch.trim().toLowerCase()))
    : fruits;

  // Collect all fixed packages across categories
  const fixedPackages = [];
  const pushPkgs = (arr, catKey, catLabel, unitLabel) => {
    for (const p of arr || []) {
      fixedPackages.push({
        key: `${catKey}:${p.id}`,
        catKey,
        catLabel,
        id: p.id,
        name: `Gói ${formatNum(p.quantity || p.coin_quantity)} ${unitLabel}${p.is_on_sale ? ' (Đang Sale)' : ''}`,
        costPrice: p._admin?.cost_effective ?? p.total_price,
        sellPrice: p.total_price,
        profit: p._admin?.profit ?? 0,
        hasOverride: p._admin?.has_custom_override ?? false,
      });
    }
  };
  pushPkgs(r?.catalog?.fruit_coin, 'fruit_coin', 'Xu Nông Trại', 'Xu');
  pushPkgs(r?.catalog?.buff_tim, 'buff_tim', 'Buff Tim', 'Tim');
  pushPkgs(r?.catalog?.buff_sao, 'buff_sao', 'Buff Sao', 'Sao');
  pushPkgs(r?.catalog?.guestbook, 'guestbook', 'Bài Viết', 'Bài viết');

  return `
    <div class="glass-panel">
      <div class="panel-title-row">
        <div>
          <span class="panel-title-text">🏷️ Tùy chỉnh Giá bán CTV cho từng Sản phẩm & Danh mục</span>
          <div style="font-size:12px;color:var(--color-fog-veil);margin-top:4px;">
            CTV sẽ chỉ nhìn thấy mức <strong>Giá bán CTV</strong> bạn cài đặt ở đây. Khi CTV đặt đơn, ví CTV bị trừ theo Giá bán CTV và hệ thống trừ giá gốc bên HoanNguyen.
          </div>
        </div>
        <button type="button" class="btn-violet" id="btnSaveAllAdminPricing">
          💾 Lưu Toàn Bộ Bảng Giá
        </button>
      </div>

      <!-- Sub-navigation tabs -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;">
        <button type="button" class="btn-frost ${state.adminPricingTab === 'fruits' ? 'is-active' : ''}" data-adm-ptab="fruits">
          🍎 1. Giá từng loại Trái cây (${fruits.length} loại — VD: Nhân sâm 130đ → 170đ)
        </button>
        <button type="button" class="btn-frost ${state.adminPricingTab === 'packages' ? 'is-active' : ''}" data-adm-ptab="packages">
          📦 2. Giá từng Gói cố định (Xu, Buff Tim, Buff Sao, Bài viết)
        </button>
        <button type="button" class="btn-frost ${state.adminPricingTab === 'categories' ? 'is-active' : ''}" data-adm-ptab="categories">
          ⚙️ 3. Mức cộng mặc định theo Danh mục (+5.000đ)
        </button>
      </div>

      ${
        state.adminPricingTab === 'fruits'
          ? `
        <div style="background:rgba(102,58,243,0.12);padding:14px 16px;border-radius:10px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="font-size:13px;color:#fff;font-weight:600;">Mức cộng mặc định mỗi trái (cho các trái chưa chỉnh riêng):</span>
            <input type="number" id="admDefaultFruitMarkupInput" class="input-box" style="width:120px;" value="${defaultFruitMarkup}" step="10" min="0" />
            <span style="font-size:12px;color:var(--color-moon-mist);">đ / trái</span>
          </div>
          <input type="text" id="admFruitSearchInput" class="input-box" style="max-width:280px;" placeholder="🔍 Tìm trái cây: Nhân sâm, Dưa hấu..." value="${escapeHtml(state.adminFruitSearch)}" />
        </div>

        <div class="table-wrap" style="max-height:520px;overflow-y:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>TRÁI CÂY</th>
                <th>TỒN KHO</th>
                <th>GIÁ GỐC HOANNGUYEN / TRÁI</th>
                <th>GIÁ BÁN CHO CTV / TRÁI (VNĐ)</th>
                <th>LÃI ADMIN / TRÁI</th>
                <th>19 HỆ ĐỘT BIẾN</th>
              </tr>
            </thead>
            <tbody>
              ${filteredFruits
                .map((f) => {
                  const cost = f._admin?.cost_unit_price ?? 130;
                  const sell = f.unit_price;
                  const profit = sell - cost;
                  return `
                    <tr>
                      <td>
                        <div style="display:flex;align-items:center;gap:10px;">
                          ${f.icon ? `<img src="${escapeHtml(f.icon)}" style="width:30px;height:30px;object-fit:contain;" alt="" />` : '🍎'}
                          <strong style="color:#fff;">${escapeHtml(f.name)}</strong>
                        </div>
                      </td>
                      <td>${formatNum(f.stock_quantity)} trái</td>
                      <td><strong style="color:var(--color-moon-mist);">${formatVnd(cost)}</strong></td>
                      <td style="max-width:160px;">
                        <input
                          type="number"
                          class="input-box adm-fruit-unit-input"
                          data-fruit-id="${f.id}"
                          data-cost="${cost}"
                          value="${sell}"
                          step="10"
                          min="0"
                        />
                      </td>
                      <td>
                        <span class="badge-tag ${profit >= 0 ? 'green' : 'red'}" id="admFruitProfit_${f.id}">
                          ${profit >= 0 ? `+${formatVnd(profit)}` : formatVnd(profit)} / trái
                        </span>
                      </td>
                      <td>
                        <button type="button" class="btn-frost" style="padding:4px 10px;font-size:11px;" data-open-mut-pricing="${f.id}">
                          Chỉnh giá đột biến (${f.mutation_prices?.length || 0})
                        </button>
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      `
          : state.adminPricingTab === 'packages'
          ? `
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>DANH MỤC</th>
                <th>TÊN GÓI DỊCH VỤ</th>
                <th>GIÁ GỐC HOANNGUYEN</th>
                <th>GIÁ BÁN CHO CTV (VNĐ)</th>
                <th>LÃI ADMIN / ĐƠN</th>
              </tr>
            </thead>
            <tbody>
              ${fixedPackages
                .map(
                  (p) => `
                <tr>
                  <td><span class="badge-tag violet">${escapeHtml(p.catLabel)}</span></td>
                  <td><strong style="color:#fff;">${escapeHtml(p.name)}</strong></td>
                  <td><strong>${formatVnd(p.costPrice)}</strong></td>
                  <td style="max-width:180px;">
                    <input
                      type="number"
                      class="input-box adm-pkg-override-input"
                      data-pkg-key="${p.key}"
                      data-cost="${p.costPrice}"
                      value="${p.sellPrice}"
                      step="1000"
                      min="0"
                    />
                  </td>
                  <td>
                    <span class="badge-tag ${p.profit >= 0 ? 'green' : 'red'}" id="admPkgProfit_${p.key.replace(':', '_')}">
                      +${formatVnd(p.profit)}
                    </span>
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `
          : `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">
          <div>
            <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">01. Gói Xu Nông Trại (+VNĐ/đơn):</label>
            <input type="number" id="admCatMk_fruit_coin" class="input-box" value="${cm.fruit_coin ?? 5000}" step="1000" />
          </div>
          <div>
            <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">02. Phí cộng thêm mỗi đơn Trái cây lẻ (+VNĐ):</label>
            <input type="number" id="admCatMk_fruit_by_fruit" class="input-box" value="${cm.fruit_by_fruit ?? 0}" step="1000" />
          </div>
          <div>
            <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">03. Gói Buff Tim (+VNĐ/đơn):</label>
            <input type="number" id="admCatMk_buff_tim" class="input-box" value="${cm.buff_tim ?? 5000}" step="1000" />
          </div>
          <div>
            <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">04. Gói Buff Sao (+VNĐ/đơn):</label>
            <input type="number" id="admCatMk_buff_sao" class="input-box" value="${cm.buff_sao ?? 5000}" step="1000" />
          </div>
          <div>
            <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">05. Gói Bài viết lưu bút (+VNĐ/đơn):</label>
            <input type="number" id="admCatMk_guestbook" class="input-box" value="${cm.guestbook ?? 5000}" step="1000" />
          </div>
          <div>
            <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">06. Gói Quà thư (+VNĐ/đơn):</label>
            <input type="number" id="admCatMk_mail_gift" class="input-box" value="${cm.mail_gift ?? 5000}" step="1000" />
          </div>
          <div>
            <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">07. Gói Quà nông trại (+VNĐ/đơn):</label>
            <input type="number" id="admCatMk_farm_gift" class="input-box" value="${cm.farm_gift ?? 5000}" step="1000" />
          </div>
        </div>
      `
      }
    </div>
  `;
}

function bindAdminPricingEvents() {
  document.querySelectorAll('[data-adm-ptab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.adminPricingTab = btn.dataset.admPtab;
      renderCurrentView();
    });
  });

  const searchIn = document.getElementById('admFruitSearchInput');
  searchIn?.addEventListener('input', (e) => {
    state.adminFruitSearch = e.target.value;
    renderCurrentView();
    const el = document.getElementById('admFruitSearchInput');
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });

  // Live profit calculation when typing fruit unit price
  document.querySelectorAll('.adm-fruit-unit-input').forEach((inp) => {
    inp.addEventListener('input', () => {
      const fid = inp.dataset.fruitId;
      const cost = Number(inp.dataset.cost || 0);
      const sell = Number(inp.value || 0);
      const prof = sell - cost;
      const badge = document.getElementById(`admFruitProfit_${fid}`);
      if (badge) {
        badge.textContent = `${prof >= 0 ? `+${formatVnd(prof)}` : formatVnd(prof)} / trái`;
        badge.className = `badge-tag ${prof >= 0 ? 'green' : 'red'}`;
      }
    });
  });

  // Live profit calculation when typing package override price
  document.querySelectorAll('.adm-pkg-override-input').forEach((inp) => {
    inp.addEventListener('input', () => {
      const key = inp.dataset.pkgKey;
      const cost = Number(inp.dataset.cost || 0);
      const sell = Number(inp.value || 0);
      const prof = sell - cost;
      const badge = document.getElementById(`admPkgProfit_${key.replace(':', '_')}`);
      if (badge) {
        badge.textContent = `${prof >= 0 ? `+${formatVnd(prof)}` : formatVnd(prof)}`;
        badge.className = `badge-tag ${prof >= 0 ? 'green' : 'red'}`;
      }
    });
  });

  // Open Mutation Pricing Modal for a specific fruit
  document.querySelectorAll('[data-open-mut-pricing]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openAdminMutationPricingModal(Number(btn.dataset.openMutPricing));
    });
  });

  // Save All Admin Pricing
  document.getElementById('btnSaveAllAdminPricing')?.addEventListener('click', async () => {
    const payload = {};

    const defFruitMk = document.getElementById('admDefaultFruitMarkupInput');
    if (defFruitMk) payload.defaultFruitUnitMarkup = Number(defFruitMk.value || 0);

    const fruitUnitPrices = {};
    document.querySelectorAll('.adm-fruit-unit-input').forEach((inp) => {
      fruitUnitPrices[inp.dataset.fruitId] = Number(inp.value || 0);
    });
    if (Object.keys(fruitUnitPrices).length > 0) {
      payload.fruitUnitPrices = fruitUnitPrices;
    }

    const packagePriceOverrides = {};
    document.querySelectorAll('.adm-pkg-override-input').forEach((inp) => {
      packagePriceOverrides[inp.dataset.pkgKey] = Number(inp.value || 0);
    });
    if (Object.keys(packagePriceOverrides).length > 0) {
      payload.packagePriceOverrides = packagePriceOverrides;
    }

    if (document.getElementById('admCatMk_fruit_coin')) {
      payload.categoryMarkups = {
        fruit_coin: Number(document.getElementById('admCatMk_fruit_coin')?.value || 5000),
        fruit_by_fruit: Number(document.getElementById('admCatMk_fruit_by_fruit')?.value || 0),
        buff_tim: Number(document.getElementById('admCatMk_buff_tim')?.value || 5000),
        buff_sao: Number(document.getElementById('admCatMk_buff_sao')?.value || 5000),
        guestbook: Number(document.getElementById('admCatMk_guestbook')?.value || 5000),
        mail_gift: Number(document.getElementById('admCatMk_mail_gift')?.value || 5000),
        farm_gift: Number(document.getElementById('admCatMk_farm_gift')?.value || 5000),
      };
    }

    try {
      const r = await apiFetch('/api/admin/settings', 'PUT', payload);
      showToast(r.message || 'Đã lưu toàn bộ bảng giá CTV!');
      await Promise.all([loadCatalog(true), loadAdminOverview()]);
      renderCurrentView();
    } catch (err) {
      showToast(`Lỗi: ${err.message}`);
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

  box.className = 'modal-box';
  title.textContent = `Chỉnh giá 19 Hệ Đột Biến: ${f.name}`;
  const muts = f.mutation_prices || [];

  body.innerHTML = `
    <div class="table-wrap" style="max-height:420px;overflow-y:auto;">
      <table class="data-table">
        <thead>
          <tr>
            <th>HỆ ĐỘT BIẾN</th>
            <th>GIÁ GỐC HOANNGUYEN</th>
            <th>GIÁ BÁN CHO CTV (VNĐ)</th>
          </tr>
        </thead>
        <tbody>
          ${muts
            .map(
              (m) => `
            <tr>
              <td>
                <span style="display:inline-flex;align-items:center;gap:6px;">
                  <span style="width:10px;height:10px;border-radius:999px;background:${m.mutation_color};"></span>
                  <strong style="color:#fff;">${escapeHtml(m.mutation_name)}</strong>
                </span>
              </td>
              <td>${formatVnd(m._admin?.cost_unit_price ?? m.unit_price)}</td>
              <td>
                <input
                  type="number"
                  class="input-box adm-mut-price-input"
                  data-mut-key="${f.id}:${m.mutation_key}"
                  value="${m.unit_price}"
                  step="100"
                  min="0"
                />
              </td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px;">
      <button type="button" class="btn-violet" id="btnSaveMutPrices">Lưu giá đột biến →</button>
    </div>
  `;

  body.querySelector('#btnSaveMutPrices')?.addEventListener('click', async () => {
    const fruitMutationPrices = {};
    body.querySelectorAll('.adm-mut-price-input').forEach((inp) => {
      fruitMutationPrices[inp.dataset.mutKey] = Number(inp.value || 0);
    });
    try {
      const r = await apiFetch('/api/admin/settings', 'PUT', { fruitMutationPrices });
      showToast(r.message);
      overlay.style.display = 'none';
      await Promise.all([loadCatalog(true), loadAdminOverview()]);
      renderCurrentView();
    } catch (err) {
      showToast(err.message);
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

  return `
    <div class="stats-three-grid">
      <div class="glass-panel">
        <div style="font-size:12px;color:var(--color-moon-mist);">Tổng số tài khoản CTV</div>
        <div style="font-size:24px;font-weight:700;color:#fff;margin-top:4px;">${ctvs.length} CTV</div>
      </div>
      <div class="glass-panel">
        <div style="font-size:12px;color:var(--color-moon-mist);">Tổng doanh thu CTV đặt đơn</div>
        <div style="font-size:24px;font-weight:700;color:#fbbf24;margin-top:4px;">${formatVnd(stats.totalRevenue || 0)}</div>
      </div>
      <div class="glass-panel">
        <div style="font-size:12px;color:var(--color-moon-mist);">Tổng lợi nhuận chênh lệch Admin</div>
        <div style="font-size:24px;font-weight:700;color:#4ade80;margin-top:4px;">+${formatVnd(stats.totalProfit || 0)}</div>
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
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:4px;">Số dư ví nạp sẵn (VNĐ)</label>
          <input type="number" id="newCtvBalance" class="input-box" value="0" step="50000" min="0" />
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
        <span class="panel-title-text">Danh sách Cộng tác viên (CTV phải có số dư ví > 0đ mới được đặt đơn)</span>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>TÊN CTV</th>
              <th>USERNAME / EMAIL</th>
              <th>SỐ DƯ VÍ HIỆN TẠI</th>
              <th>SỐ ĐƠN ĐÃ ĐẶT</th>
              <th>DOANH SỐ / LÃI THU VỀ</th>
              <th>TRẠNG THÁI</th>
              <th>THAO TÁC</th>
            </tr>
          </thead>
          <tbody>
            ${ctvs
              .map(
                (u) => `
              <tr>
                <td><strong style="color:#fff;">${escapeHtml(u.name)}</strong><div style="font-size:11px;color:var(--color-fog-veil);">SĐT: ${escapeHtml(u.phone || '—')}</div></td>
                <td><strong>${escapeHtml(u.username)}</strong><div style="font-size:11px;color:var(--color-fog-veil);">${escapeHtml(u.email)}</div></td>
                <td><strong style="font-size:15px;color:${u.balance > 0 ? '#4ade80' : '#fca5a5'};">${formatVnd(u.balance)}</strong></td>
                <td>${u.totalOrders || 0} đơn</td>
                <td>
                  <div>Đã mua: ${formatVnd(u.totalSpent || 0)}</div>
                  <div style="font-size:11px;color:#4ade80;">Lãi Admin: +${formatVnd(u.totalProfit || 0)}</div>
                </td>
                <td>
                  <span class="badge-tag ${u.isLocked ? 'red' : u.balance > 0 ? 'green' : 'amber'}">
                    ${u.isLocked ? 'Đã khóa' : u.balance > 0 ? 'Đủ điều kiện đặt đơn' : 'Ví 0đ (Tạm chặn)'}
                  </span>
                </td>
                <td>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button type="button" class="btn-violet" style="padding:4px 10px;font-size:11px;" data-topup-ctv="${u.id}" data-ctv-name="${escapeHtml(u.name)}">
                      + Nạp / Trừ ví
                    </button>
                    <button type="button" class="btn-frost" style="padding:4px 10px;font-size:11px;" data-lock-ctv="${u.id}" data-locked="${u.isLocked ? '1' : '0'}">
                      ${u.isLocked ? 'Mở khóa' : 'Khóa'}
                    </button>
                    <button type="button" class="btn-frost" style="padding:4px 10px;font-size:11px;color:#fca5a5;" data-del-ctv="${u.id}">
                      Ngừng tài khoản
                    </button>
                    <button type="button" class="btn-frost" style="padding:4px 10px;font-size:11px;" data-reset-ctv="${u.id}">Đổi mật khẩu</button>
                  </div>
                </td>
              </tr>
            `
              )
              .join('')}
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
  document.querySelectorAll('[data-reset-ctv]').forEach(button => button.addEventListener('click', async () => {
    openResetCtvPasswordModal(button.dataset.resetCtv);
  }));
  document.getElementById('btnCreateCtvSubmit')?.addEventListener('click', async () => {
    const name = document.getElementById('newCtvName')?.value || '';
    const username = document.getElementById('newCtvUsername')?.value || '';
    const password = document.getElementById('newCtvPassword')?.value || '';
    const phone = document.getElementById('newCtvPhone')?.value || '';
    const balance = Number(document.getElementById('newCtvBalance')?.value || 0);

    try {
      const r = await apiFetch('/api/admin/ctv', 'POST', { name, username, password, phone, balance });
      showToast(r.message);
      await loadAdminOverview();
      renderCurrentView();
    } catch (err) {
      showToast(err.message);
    }
  });

  document.querySelectorAll('[data-topup-ctv]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openTopupCtvModal(btn.dataset.topupCtv, btn.dataset.ctvName);
    });
  });

  document.querySelectorAll('[data-lock-ctv]').forEach((btn) => {
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

  document.querySelectorAll('[data-del-ctv]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Ngừng tài khoản CTV này? Các phiên sẽ bị thu hồi; số dư và lịch sử vẫn được giữ để đối soát.')) return;
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

function openTopupCtvModal(ctvId, ctvName) {
  const adjustmentKey = crypto.randomUUID();
  const overlay = document.getElementById('appModalOverlay');
  const box = document.getElementById('appModalBox');
  const title = document.getElementById('appModalTitle');
  const body = document.getElementById('appModalBody');
  if (!overlay || !box || !title || !body) return;

  box.className = 'modal-box';
  title.textContent = `💲 Nạp / Điều chỉnh số dư ví CTV: ${ctvName}`;
  body.innerHTML = `
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
      <input type="text" id="modalTopupNote" class="input-box" value="Admin nạp tiền ví CTV" />
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px;">
      <button type="button" class="btn-violet" id="btnConfirmTopupSubmit">Xác nhận cập nhật →</button>
    </div>
  `;

  body.querySelectorAll('[data-q-amt]').forEach((b) => {
    b.addEventListener('click', () => {
      body.querySelector('#modalTopupAmt').value = b.dataset.qAmt;
    });
  });

  body.querySelector('#btnConfirmTopupSubmit')?.addEventListener('click', async () => {
    const amount = Number(body.querySelector('#modalTopupAmt')?.value || 0);
    const note = body.querySelector('#modalTopupNote')?.value || '';
    try {
      const r = await apiFetch(`/api/admin/ctv/${ctvId}/balance`, 'POST', { amount, note, idempotency_key: adjustmentKey });
      showToast(r.message);
      overlay.style.display = 'none';
      await loadAdminOverview();
      renderCurrentView();
    } catch (err) {
      showToast(err.message);
    }
  });

  overlay.style.display = 'flex';
}

function renderAdminSystemPageHtml() {
  const hn = state.adminOverview?.settings?.hoanNguyen || {};
  return `
    <div class="glass-panel" style="max-width:680px;">
      <div class="panel-title-row">
        <span class="panel-title-text">⚙️ Cấu hình Tài khoản Nguồn HoanNguyen</span>
        <span class="badge-tag ${hn.connected ? 'green' : 'red'}">
          ${hn.connected ? '● Đã kết nối' : '○ Chưa kết nối'}
        </span>
      </div>
      ${hn.lastError ? `<div style="color:#fca5a5;font-size:12px;">${escapeHtml(hn.lastError)}</div>` : ''}
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Email tài khoản nguồn HoanNguyen:</label>
          <input type="email" id="admHnEmail" class="input-box" value="${escapeHtml(hn.email || '')}" />
        </div>
        <div>
          <label style="font-size:12px;color:var(--color-moon-mist);display:block;margin-bottom:6px;">Mật khẩu HoanNguyen (Để trống nếu giữ nguyên):</label>
          <input type="password" id="admHnPassword" class="input-box" autocomplete="new-password" placeholder="••••••••" />
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button type="button" class="btn-frost" id="btnAdmReconnectHn">↻ Đồng bộ & Kết nối lại Token</button>
          <button type="button" class="btn-violet" id="btnAdmSaveHn">Lưu cấu hình nguồn</button>
        </div>
      </div>
    </div>
    <form class="glass-panel" id="adminPasswordForm" style="max-width:680px;display:flex;flex-direction:column;gap:14px;">
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
  document.getElementById('btnAdmReconnectHn')?.addEventListener('click', async () => {
    const button = document.getElementById('btnAdmReconnectHn');
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = 'Đang kết nối...';
    try {
      showToast('⏳ Đang kết nối lại và đồng bộ dữ liệu...');
      const r = await apiFetch('/api/admin/hoannguyen/reconnect', 'POST');
      showToast(r.message);
      await Promise.all([loadCatalog(true), loadAdminOverview()]);
      renderCurrentView();
    } catch (err) {
      showToast(err.message);
      await loadAdminOverview();
      renderCurrentView();
    } finally {
      button.disabled = false;
      button.textContent = '↻ Đồng bộ & Kết nối lại Token';
    }
  });

  document.getElementById('btnAdmSaveHn')?.addEventListener('click', async () => {
    const button = document.getElementById('btnAdmSaveHn');
    if (button.disabled) return;
    button.disabled = true;
    const hoanNguyenEmail = document.getElementById('admHnEmail')?.value || '';
    const hoanNguyenPassword = document.getElementById('admHnPassword')?.value || '';
    try {
      const r = await apiFetch('/api/admin/settings', 'PUT', { hoanNguyenEmail, hoanNguyenPassword });
      showToast(r.message);
      await Promise.all([loadCatalog(true), loadAdminOverview()]);
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
  setInterval(async () => {
    if (!state.user || document.hidden) return;
    try {
      const result = await apiFetch('/api/auth/me');
      if (result.user) { state.user = result.user; updateShellAuthUI(); }
      if (state.currentView === 'admin_monitor' && state.user?.role === 'admin') await loadAdminMonitor();
    } catch {}
  }, 30000);
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

  // Mobile sidebar toggle
  document.getElementById('btnToggleMobileSidebar')?.addEventListener('click', () => {
    document.getElementById('appSidebar')?.classList.toggle('is-open');
    document.getElementById('sidebarBackdrop')?.classList.toggle('is-open');
  });
  document.getElementById('sidebarBackdrop')?.addEventListener('click', () => {
    document.getElementById('appSidebar')?.classList.remove('is-open');
    document.getElementById('sidebarBackdrop')?.classList.remove('is-open');
  });

  // Modal close
  document.getElementById('btnCloseAppModal')?.addEventListener('click', () => {
    document.getElementById('appModalOverlay').style.display = 'none';
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

async function bootstrap() {
  bindGlobalEvents();
  await initAuth();
  if (state.user) {
    await Promise.all([
      loadCatalog(false),
      loadOrders(),
      state.user.role === 'admin' ? loadAdminOverview() : Promise.resolve(),
    ]);
    renderCurrentView();
  }
}

bootstrap();
