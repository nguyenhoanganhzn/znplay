export function createToolViews({ state, apiFetch, pageLimit, moreButton, renderLocalPages, escapeHtml: esc, showToast, copyTextToClipboard, formatVnd: money, formatNum = (v) => Math.round(Number(v || 0)).toLocaleString('vi-VN'), formatDateVi: date, renderCurrentView, znIcon = () => '' }) {
  const panel = (title, content, extra = '') => `<section class="glass-panel" ${extra}><div class="panel-title-row"><span class="panel-title-text">${title}</span></div>${content}</section>`;
  const button = (label, attribute, id, cls = 'btn-frost') => `<button type="button" class="${cls}" ${attribute}="${esc(id)}">${label}</button>`;
  const AVATAR_FALLBACK_SVG = '<svg viewBox="0 0 64 64" width="52" height="52" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="#0b4a46"/><circle cx="32" cy="24" r="11" fill="#cbfffc" fill-opacity="0.78"/><path d="M14 54c3-10 10-15 18-15s15 5 18 15" fill="#cbfffc" fill-opacity="0.78"/></svg>';

  const CAT_LABELS = {
    fruit_coin: 'Xu nông trại',
    fruit_by_fruit: 'Trái cây lẻ',
    buff_tim: 'Buff Tim',
    buff_luot_xem: 'Tăng lượt xem hồ sơ',
    buff_sao: 'Buff Sao',
    guestbook: 'Bài viết',
    farm_gift: 'Quà nông trại',
    mail_gift: 'Quà thư',
    weather_buff: 'Buff Thời Tiết',
    backup_weather: 'Dự phòng · Buff thời tiết',
    backup_guide: 'Dự phòng · Dắt thẻ',
    backup_treasure: 'Dự phòng · Đảo kho báu',
    backup_emptymap: 'Dự phòng · Map trống',
    backup_seeds: 'Dự phòng · Hạt dưa hấu',
  };

  function auditActionIcon(action) {
    const a = String(action || '');
    if (a === 'POST /auth/login') return znIcon('key', 14);
    if (a === 'POST /auth/logout') return znIcon('logout', 14);
    if (a === 'POST /orders/place') return znIcon('plus', 14);
    if (a === 'POST /backup/quote') return znIcon('layers', 14);
    if (/^POST \/backup\/orders\/[^/]+\/(refresh|resume|pause)$/.test(a)) return znIcon('refresh', 14);
    if (/^DELETE \/backup\/orders\/[^/]+$/.test(a) || a === 'POST /backup/orders/clear-finished') return znIcon('trash', 14);
    if (/^POST \/admin\/intents\/[^/]+\/(reconcile|acknowledge)$/.test(a)) return znIcon('shield', 14);
    if (/^PUT \/orders\/[^/]+\/\d+\/toggle-active$/.test(a)) return znIcon('activity', 14);
    if (/^DELETE \/orders\/[^/]+\/\d+$/.test(a)) return znIcon('trash', 14);
    if (/^PUT \/orders\/weather_buff\/\d+\/slots\/\d+$/.test(a)) return znIcon('user', 14);
    if (/^DELETE \/orders\/weather_buff\/\d+\/slots\/\d+$/.test(a)) return znIcon('user', 14);
    if (/^PUT \/orders\/weather_buff\/\d+\/weathers$/.test(a)) return znIcon('cloud', 14);
    if (/^POST \/orders\/weather_buff\/\d+\/share-link$/.test(a)) return znIcon('link', 14);
    if (a === 'POST /customer/search-ingame' || a === 'POST /tools/identity' || a === 'POST /tools/identity/detail' || a === 'POST /customer/resolve-role-id') return znIcon('search', 14);
    if (a === 'POST /customer/select-ingame') return znIcon('check', 14);
    if (/^POST \/admin\/ctv\/[^/]+\/balance$/.test(a)) return znIcon('wallet', 14);
    if (/^PUT \/admin\/ctv\/[^/]+$/.test(a) || a === 'POST /admin/ctv') return znIcon('users', 14);
    if (a === 'POST /admin/maintenance') return znIcon('shield', 14);
    if (a === 'POST /admin/notify-update' || a === 'PUT /admin/app-versions') return znIcon('refresh', 14);
    if (a === 'POST /admin/server-zn/reconnect' || a === 'POST /admin/source/reconnect') return znIcon('server', 14);
    if (a === 'PUT /admin/settings') return znIcon('sliders', 14);
    if (a === 'POST /admin/backup/import') return znIcon('upload', 14);
    if (/^DELETE \/admin\/ctv\/[^/]+$/.test(a)) return znIcon('trash', 14);
    if (/^POST \/admin\/orders\/[^/]+\/refund$/.test(a)) return znIcon('wallet', 14);
    return znIcon('activity', 14);
  }

  function formatAuditAction(action) {
    const a = String(action || '');
    if (a === 'POST /auth/login') return 'Đăng nhập hệ thống';
    if (a === 'POST /auth/logout') return 'Đăng xuất';
    if (a === 'POST /orders/place') return 'Đặt đơn hàng mới';
    if (a === 'POST /backup/quote') return 'Xem báo giá nguồn dự phòng';
    if (/^POST \/backup\/orders\/[^/]+\/refresh$/.test(a)) return 'Cập nhật trạng thái đơn dự phòng';
    if (/^POST \/backup\/orders\/[^/]+\/resume$/.test(a)) return 'Chạy / tiếp tục đơn dự phòng';
    if (/^POST \/backup\/orders\/[^/]+\/pause$/.test(a)) return 'Tạm dừng đơn dự phòng';
    if (/^DELETE \/backup\/orders\/[^/]+$/.test(a)) return 'Xóa đơn dự phòng đã xong';
    if (a === 'POST /backup/orders/clear-finished') return 'Dọn các đơn dự phòng đã xong';
    if (/^POST \/admin\/intents\/[^/]+\/reconcile$/.test(a)) return 'Quản trị đối soát đơn chưa rõ kết quả';
    if (/^POST \/admin\/intents\/[^/]+\/acknowledge$/.test(a)) return 'Quản trị xác nhận chi phí đơn';
    if (/^PUT \/orders\/[^/]+\/\d+\/toggle-active$/.test(a)) return 'Bật / Tắt đơn hàng';
    if (/^DELETE \/orders\/[^/]+\/\d+$/.test(a)) return 'Hủy đơn hàng';
    if (/^PUT \/orders\/weather_buff\/\d+\/slots\/\d+$/.test(a)) return 'Gán / Đổi khách Buff Thời Tiết';
    if (/^DELETE \/orders\/weather_buff\/\d+\/slots\/\d+$/.test(a)) return 'Gỡ khách Buff Thời Tiết';
    if (/^PUT \/orders\/weather_buff\/\d+\/weathers$/.test(a)) return 'Lưu cấu hình thời tiết';
    if (/^POST \/orders\/weather_buff\/\d+\/share-link$/.test(a)) return 'Lấy liên kết theo dõi thời tiết';
    if (a === 'POST /customer/search-ingame') return 'Tìm nhân vật trong game';
    if (a === 'POST /tools/identity') return 'Tra cứu ID Game / Tên nhân vật';
    if (a === 'POST /tools/identity/detail') return 'Xem hồ sơ chi tiết nhân vật';
    if (a === 'POST /customer/select-ingame') return 'Chọn nhân vật khách hàng';
    if (a === 'POST /customer/resolve-role-id') return 'Tra cứu khách theo mã ID nhân vật';
    if (/^POST \/admin\/ctv\/[^/]+\/balance$/.test(a)) return 'Quản trị nạp / trừ ví CTV';
    if (/^PUT \/admin\/ctv\/[^/]+$/.test(a)) return 'Quản trị cập nhật tài khoản CTV';
    if (a === 'POST /admin/ctv') return 'Quản trị tạo tài khoản CTV';
    if (a === 'POST /admin/maintenance') return 'Quản trị bật / tắt chế độ bảo trì';
    if (a === 'POST /admin/notify-update') return 'Quản trị kích hoạt tự động tải lại cho CTV';
    if (a === 'PUT /admin/app-versions') return 'Quản trị cập nhật phiên bản hệ thống';
    if (a === 'POST /admin/server-zn/reconnect' || a === 'POST /admin/source/reconnect' || a === 'POST /api/admin/server-zn/reconnect' || a === 'POST /api/admin/source/reconnect') return 'Quản trị đồng bộ & kết nối lại Server Zn';
    if (a === 'PUT /admin/settings') return 'Quản trị cập nhật bảng giá & cấu hình';
    if (a === 'POST /admin/backup/import') return 'Quản trị khôi phục bản sao lưu dữ liệu';
    if (/^DELETE \/admin\/ctv\/[^/]+$/.test(a)) return 'Quản trị xóa tài khoản CTV';
    if (/^POST \/admin\/orders\/[^/]+\/refund$/.test(a)) return 'Quản trị hoàn tiền đối soát';
    return a;
  }

  function formatAuditDetails(details) {
    if (!details || typeof details !== 'object') return '—';
    const parts = [];
    if (details.version) parts.push(`Phiên bản: ${details.version}`);
    if (details.wallet === 'backup') parts.push('Ví Nguồn DP');
    else if (details.wallet === 'main') parts.push('Ví CTV');
    if (details.category) parts.push(`Mục: ${CAT_LABELS[details.category] || details.category}`);
    if (details.remoteOrderId) parts.push(`Đơn #${details.remoteOrderId}`);
    if (details.sellPrice !== undefined) parts.push(`Giá bán: ${money(details.sellPrice)}`);
    if (details.refundedAmount !== undefined && Number(details.refundedAmount) > 0) parts.push(`Hoàn ví: +${money(details.refundedAmount)}`);
    if (details.amount !== undefined) parts.push(`Số tiền: ${Number(details.amount) >= 0 ? '+' : ''}${money(details.amount)}`);
    if (details.balanceAfter !== undefined) parts.push(`Sau GD: ${money(details.balanceAfter)}`);
    if (details.nickname) parts.push(`Tên tìm: ${details.nickname}${details.resultCount !== undefined ? ` (${details.resultCount} KQ)` : ''}`);
    if (details.roleId) parts.push(`ID nhân vật: ${details.roleId}`);
    if (details.suid) parts.push(`SUID: ${details.suid}`);
    if (details.totalQty !== undefined) parts.push(`Tổng thời tiết: ${details.totalQty} lần`);
    if (details.passwordReset) parts.push('Đặt lại mật khẩu');
    if (details.isLocked === true) parts.push('Đã khóa tài khoản');
    if (details.hiddenCategories && typeof details.hiddenCategories === 'object') {
      const hiddenList = [];
      const shownList = [];
      for (const [k, v] of Object.entries(details.hiddenCategories)) {
        const name = CAT_LABELS[k] || k;
        if (v) hiddenList.push(name);
        else shownList.push(name);
      }
      if (hiddenList.length) parts.push(`Ẩn với CTV: ${hiddenList.join(', ')}`);
      if (shownList.length) parts.push(`Hiện lại với CTV: ${shownList.join(', ')}`);
    }
    if (details.note) parts.push(`Ghi chú: ${details.note}`);
    if (details.status && Number(details.status) >= 400) parts.push(`Mã lỗi ${details.status}`);
    if (parts.length > 0) return parts.join(' · ');
    const raw = JSON.stringify(details);
    return raw === '{}' ? '—' : raw;
  }

  function formatIdentityStatusBadge(player) {
    const raw = String(player?.onlineStatus || '').trim();
    const online = player?.isOnline === true || /^online$/i.test(raw);
    if (online) {
      return `<span class="identity-status-pill is-online"><span class="identity-status-dot" aria-hidden="true"></span><span>Đang trực tuyến</span></span>`;
    }
    if (raw) {
      const vi = raw
        .replace(/^offline$/i, 'Ngoại tuyến')
        .replace(/^online\s*lần cuối/i, 'Hoạt động lần cuối');
      return `<span class="identity-status-pill is-offline"><span class="identity-status-dot" aria-hidden="true"></span><span>${esc(vi)}</span></span>`;
    }
    return '';
  }

  function formatIdentityRegionText(player) {
    const name = String(player?.regionName || '').trim();
    const code = String(player?.region || '').trim();
    if (name && code && name.toLowerCase() !== code.toLowerCase()) return `${name} (${code.toUpperCase()})`;
    return name || (code ? code.toUpperCase() : '');
  }

  function buildIdentitySummaryText(player) {
    const lines = [`Tên nhân vật: ${player.nickname}`];
    if (player.gameCode) lines.push(`Mã nhân vật (ID Game): ${player.gameCode}`);
    lines.push(`ID nhân vật (SUID): ${player.roleId}`);
    const meta = [];
    const regionText = formatIdentityRegionText(player);
    if (regionText) meta.push(`Khu vực: ${regionText}`);
    if (player.achievementLevel !== undefined) meta.push(`Cấp thành tích: ${formatNum(player.achievementLevel)}`);
    if (meta.length) lines.push(meta.join(' · '));
    const activity = [];
    if (player.isOnline === true || /^online$/i.test(String(player.onlineStatus || ''))) activity.push('Đang trực tuyến');
    else if (player.onlineStatus) activity.push(player.onlineStatus);
    if (player.lastLogin) activity.push(`Đăng nhập gần nhất: ${player.lastLogin}`);
    if (activity.length) lines.push(activity.join(' · '));
    if (player.intro) lines.push(`Giới thiệu: ${player.intro}`);
    const stats = [];
    if (player.userLikes !== undefined) stats.push(`Tim: ${formatNum(player.userLikes)}`);
    if (player.homeLikes !== undefined) stats.push(`Sao nhà: ${formatNum(player.homeLikes)}`);
    if (player.followerCount !== undefined) stats.push(`Theo dõi: ${formatNum(player.followerCount)}`);
    if (player.friendCount !== undefined) stats.push(`Bạn bè: ${formatNum(player.friendCount)}`);
    if (stats.length) lines.push(stats.join(' | '));
    const visits = [];
    if (player.totalHomeVisitCount !== undefined) visits.push(`Ghé nhà: ${formatNum(player.totalHomeVisitCount)}`);
    if (player.todayProfileVisitCount !== undefined) visits.push(`Xem hồ sơ hôm nay: ${formatNum(player.todayProfileVisitCount)}`);
    if (player.totalProfileVisitCount !== undefined) visits.push(`Tổng xem hồ sơ: ${formatNum(player.totalProfileVisitCount)}`);
    if (visits.length) lines.push(visits.join(' | '));
    return lines.join('\n');
  }

  function renderIdentityPlayerCardHtml(player, detailMeta = null) {
    const safePhoto = typeof player.photoUrl === 'string' && /^https:\/\//i.test(player.photoUrl) ? player.photoUrl : '';
    const regionText = formatIdentityRegionText(player);
    const statusBadge = formatIdentityStatusBadge(player);
    const hasLevel = player.achievementLevel !== undefined;
    const isLoading = detailMeta?.status === 'loading';
    const detailError = detailMeta?.status === 'error' ? detailMeta.error : '';

    const metricSpecs = [
      ['userLikes', 'Tim cá nhân', 'heart', 'is-heart'],
      ['homeLikes', 'Sao nhà', 'star', 'is-star'],
      ['totalHomeVisitCount', 'Lượt ghé nhà', 'home', 'is-home'],
      ['followerCount', 'Người theo dõi', 'users', 'is-follow'],
      ['friendCount', 'Bạn bè', 'user', 'is-friend'],
      ['todayProfileVisitCount', 'Xem HS hôm nay', 'eye', 'is-visit'],
      ['totalProfileVisitCount', 'Tổng xem hồ sơ', 'barChart', 'is-total'],
    ];
    const presentMetrics = metricSpecs.filter(([key]) => player[key] !== undefined);
    const hasMetrics = presentMetrics.length > 0;

    const codeRow = (label, value, copyLabel, mono = false) => `
      <div class="identity-field">
        <div class="identity-field-text">
          <span class="tool-note">${label}</span>
          <strong${mono ? ' class="identity-mono"' : ''}>${esc(value)}</strong>
        </div>
        <button type="button" class="btn-frost identity-copy-btn" data-identity-copy="${esc(value)}">
          ${znIcon('copy', 13)} <span>${copyLabel}</span>
        </button>
      </div>`;

    return `
      <article class="stat-subcard identity-profile-card" data-identity-card="${esc(player.roleId)}">
        <div class="identity-profile-head">
          <div class="identity-avatar-wrap">
            ${safePhoto ? `<img src="${esc(safePhoto)}" alt="${esc(player.nickname)}" class="identity-avatar-img" loading="lazy" decoding="async" referrerpolicy="no-referrer" />` : ''}
            <div class="identity-avatar-fallback"${safePhoto ? ' style="display:none;"' : ''}>${AVATAR_FALLBACK_SVG}</div>
            ${hasLevel ? `<span class="snapshot-level-badge" title="Cấp độ thành tích">${formatNum(player.achievementLevel)}</span>` : ''}
          </div>
          <div class="identity-head-main">
            <div class="identity-head-top">
              <strong class="identity-nickname">${esc(player.nickname)}</strong>
              ${statusBadge}
            </div>
            <div class="identity-meta-pills">
              ${regionText ? `<span class="identity-meta-pill">${znIcon('globe', 12)} <span>${esc(regionText)}</span></span>` : ''}
              ${hasLevel ? `<span class="identity-meta-pill">${znIcon('sparkles', 12)} <span>Cấp ${formatNum(player.achievementLevel)}</span></span>` : ''}
              ${player.lastLogin ? `<span class="identity-meta-pill">${znIcon('clock', 12)} <span>Đăng nhập: ${esc(player.lastLogin)}</span></span>` : ''}
            </div>
          </div>
          <div class="identity-head-actions">
            ${hasMetrics
              ? `<button type="button" class="btn-frost identity-action-btn" data-identity-refresh="${esc(player.roleId)}" ${isLoading ? 'disabled' : ''} title="Cập nhật chỉ số mới nhất từ game">${znIcon('refresh', 13)} <span>${isLoading ? 'Đang tải…' : 'Làm mới'}</span></button>`
              : `<button type="button" class="btn-frost identity-action-btn is-accent" data-identity-detail="${esc(player.roleId)}" ${isLoading ? 'disabled' : ''}>${znIcon('eye', 13)} <span>${isLoading ? 'Đang tải…' : 'Xem chi tiết hồ sơ'}</span></button>`
            }
          </div>
        </div>

        ${player.intro ? `
          <div class="identity-intro-box">
            <span class="identity-intro-label">${znIcon('message', 13)} <span>Giới thiệu</span></span>
            <p class="identity-intro-text">${esc(player.intro)}</p>
          </div>` : ''}

        ${isLoading && !hasMetrics ? `
          <div class="identity-detail-loading">
            <span class="loading-dot" aria-hidden="true"></span>
            <span>Đang trích xuất chỉ số Tim, Sao nhà, Theo dõi, Bạn bè &amp; lượt ghé thăm…</span>
          </div>` : ''}

        ${detailError ? `
          <div class="identity-detail-error">
            <span>${esc(detailError)}</span>
            <button type="button" class="btn-frost identity-action-btn" data-identity-detail="${esc(player.roleId)}">${znIcon('refresh', 12)} <span>Thử lại</span></button>
          </div>` : ''}

        ${hasMetrics ? `
          <div class="identity-stats-grid">
            ${presentMetrics.map(([key, label, iconName, toneCls]) => `
              <div class="identity-stat-tile ${toneCls}">
                <span class="identity-stat-label">${znIcon(iconName, 13)} <span>${label}</span></span>
                <strong class="identity-stat-value">${formatNum(player[key])}</strong>
              </div>`).join('')}
          </div>` : ''}

        <div class="identity-codes-box">
          ${codeRow('Tên nhân vật', player.nickname, 'Sao chép tên')}
          ${player.gameCode ? codeRow('ID Game · mã nhân vật', player.gameCode, 'Sao chép mã', true) : ''}
          ${codeRow('ID nhân vật · dạng số', player.roleId, 'Sao chép ID', true)}
        </div>

        <div class="identity-card-footer">
          <span class="tool-note">${hasMetrics ? (detailMeta?.cached ? 'Hồ sơ đầy đủ (từ bộ nhớ đệm nhanh)' : 'Hồ sơ đầy đủ đồng bộ trực tiếp') : 'Bấm “Xem chi tiết hồ sơ” để lấy thêm Tim, Sao nhà, Theo dõi &amp; Bạn bè'}</span>
          <button type="button" class="btn-frost identity-copy-btn" data-identity-copy-all="${esc(player.roleId)}">
            ${znIcon('copy', 13)} <span>Sao chép toàn bộ hồ sơ</span>
          </button>
        </div>
      </article>`;
  }

  function renderIdentityToolsHtml() {
    return panel(`${znIcon('search', 17)} Tra cứu &amp; trích xuất hồ sơ nhân vật`, `
      <form id="identityForm" class="customer-search-fields" role="search">
        <select name="mode" class="input-box" aria-label="Tra cứu theo">
          <option value="name">Theo tên nhân vật</option>
          <option value="id">Theo ID Game</option>
        </select>
        <input name="query" class="input-box" aria-label="Tên nhân vật" placeholder="Nhập tên nhân vật, mã XXXX-XXXX-XXXX hoặc ID số" maxlength="80" required autocomplete="off" spellcheck="false">
        <button class="btn-violet" type="submit">${znIcon('search', 14)} <span>Tra cứu</span></button>
      </form>
      <p class="tool-note identity-search-hint">Tự động nhận diện mã nhân vật <code>XXXX-XXXX-XXXX</code> hoặc ID số; trích xuất đầy đủ ảnh đại diện, cấp độ, khu vực, trạng thái, Tim, Sao nhà, Theo dõi, Bạn bè và lượt xem hồ sơ.</p>
      <p id="identityStatus" class="tool-note" role="status"></p>
      <div id="identityResults" class="identity-results"></div>`);
  }

  function bindIdentityToolsEvents() {
    const form = document.getElementById('identityForm');
    const status = document.getElementById('identityStatus');
    const results = document.getElementById('identityResults');
    const { mode, query } = form.elements;
    const submit = form.querySelector('[type="submit"]');
    let revision = 0;
    let currentPlayers = [];
    const detailStates = new Map();
    const sessionDetailCache = new Map();

    function bindAvatarFallbacks(rootEl) {
      rootEl.querySelectorAll('.identity-avatar-img').forEach(img => {
        img.addEventListener('error', () => {
          img.style.display = 'none';
          const fb = img.parentElement?.querySelector('.identity-avatar-fallback');
          if (fb) fb.style.display = 'flex';
        }, { once: true });
      });
    }

    function mergeDetailPlayer(basePlayer, detailPlayer) {
      return {
        ...basePlayer,
        ...detailPlayer,
        isOnline: detailPlayer.isOnline !== undefined ? detailPlayer.isOnline : basePlayer.isOnline,
        onlineStatus: detailPlayer.onlineStatus || basePlayer.onlineStatus,
        regionName: detailPlayer.regionName || basePlayer.regionName,
        region: detailPlayer.region || basePlayer.region,
        photoUrl: detailPlayer.photoUrl || basePlayer.photoUrl,
        lastLogin: detailPlayer.lastLogin || basePlayer.lastLogin,
        intro: detailPlayer.intro !== undefined ? detailPlayer.intro : basePlayer.intro,
      };
    }

    function rerenderCard(roleId) {
      const idx = currentPlayers.findIndex(p => p.roleId === roleId);
      if (idx === -1) return;
      const cardEl = results.querySelector(`[data-identity-card="${CSS.escape ? CSS.escape(roleId) : roleId}"]`);
      if (!cardEl) return;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderIdentityPlayerCardHtml(currentPlayers[idx], detailStates.get(roleId));
      const nextCard = wrapper.firstElementChild;
      if (nextCard) {
        cardEl.replaceWith(nextCard);
        bindAvatarFallbacks(nextCard);
      }
    }

    async function loadPlayerDetail(roleId, { force = false, expectedRevision = revision } = {}) {
      const idx = currentPlayers.findIndex(p => p.roleId === roleId);
      if (idx === -1) return;
      if (!force && sessionDetailCache.has(roleId)) {
        const cached = sessionDetailCache.get(roleId);
        currentPlayers[idx] = mergeDetailPlayer(currentPlayers[idx], cached.player);
        detailStates.set(roleId, { status: 'loaded', cached: true });
        rerenderCard(roleId);
        return;
      }
      if (detailStates.get(roleId)?.status === 'loading') return;
      detailStates.set(roleId, { status: 'loading' });
      rerenderCard(roleId);
      try {
        const res = await apiFetch('/api/tools/identity/detail', 'POST', { roleId, force });
        if (expectedRevision !== revision || !form.isConnected) return;
        const pos = currentPlayers.findIndex(p => p.roleId === roleId);
        if (pos === -1 || !res?.player) return;
        sessionDetailCache.set(roleId, { player: res.player, cached: Boolean(res.cached) });
        currentPlayers[pos] = mergeDetailPlayer(currentPlayers[pos], res.player);
        detailStates.set(roleId, { status: 'loaded', cached: Boolean(res.cached) });
        rerenderCard(roleId);
      } catch (err) {
        if (expectedRevision !== revision || !form.isConnected) return;
        detailStates.set(roleId, { status: 'error', error: err.message || 'Chưa tải được hồ sơ chi tiết.' });
        rerenderCard(roleId);
      }
    }

    function reset() {
      revision++;
      currentPlayers = [];
      detailStates.clear();
      status.textContent = '';
      results.classList.remove('is-single');
      results.replaceChildren();
      submit.disabled = false;
    }

    mode.addEventListener('change', () => {
      reset();
      query.value = '';
      query.placeholder = mode.value === 'id'
        ? 'Nhập ID dạng số hoặc mã XXXX-XXXX-XXXX'
        : 'Nhập tên nhân vật, mã XXXX-XXXX-XXXX hoặc ID số';
      query.setAttribute('aria-label', mode.value === 'id' ? 'ID Game' : 'Tên nhân vật');
      query.focus();
    });

    query.addEventListener('input', reset);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit.disabled) return;
      reset();
      const term = query.value.trim();
      if (!term) { status.textContent = query.placeholder; query.focus(); return; }

      let effectiveMode = mode.value;
      if (effectiveMode === 'name' && (/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/i.test(term) || /^\d{12,20}$/.test(term))) {
        effectiveMode = 'id';
        mode.value = 'id';
      }

      const request = revision;
      submit.disabled = true;
      status.textContent = 'Đang tìm nhân vật trên Server Zn…';
      try {
        const { players } = await apiFetch('/api/tools/identity', 'POST', { mode: effectiveMode, query: term });
        if (request !== revision || !form.isConnected) return;
        currentPlayers = (players || []).map(p => {
          if (p.hasFullProfile) {
            sessionDetailCache.set(p.roleId, { player: p, cached: false });
            detailStates.set(p.roleId, { status: 'loaded', cached: false });
            return p;
          }
          if (sessionDetailCache.has(p.roleId)) {
            detailStates.set(p.roleId, { status: 'loaded', cached: true });
            return mergeDetailPlayer(p, sessionDetailCache.get(p.roleId).player);
          }
          return p;
        });

        status.textContent = currentPlayers.length
          ? `Tìm thấy ${currentPlayers.length} nhân vật.`
          : `Không tìm thấy nhân vật khớp với “${term}”.`;
        results.classList.toggle('is-single', currentPlayers.length === 1);

        renderLocalPages(results, currentPlayers, visible => {
          results.innerHTML = visible.map(player => renderIdentityPlayerCardHtml(player, detailStates.get(player.roleId))).join('');
          bindAvatarFallbacks(results);
        });

        // Auto-hydrate full stats when search returns a single exact character (zero extra click, zero N+1 load)
        if (currentPlayers.length === 1 && !currentPlayers[0].hasFullProfile) {
          loadPlayerDetail(currentPlayers[0].roleId, { expectedRevision: request });
        }
      } catch (error) {
        if (request === revision) status.textContent = error.message;
      } finally {
        if (request === revision) submit.disabled = false;
      }
    });

    results.addEventListener('click', async event => {
      const copyBtn = event.target.closest('[data-identity-copy]');
      if (copyBtn) {
        const copied = await copyTextToClipboard(copyBtn.dataset.identityCopy);
        showToast(copied ? 'Đã sao chép.' : 'Trình duyệt chưa cho phép sao chép. Hãy chọn và sao chép trực tiếp.');
        return;
      }
      const copyAllBtn = event.target.closest('[data-identity-copy-all]');
      if (copyAllBtn) {
        const player = currentPlayers.find(p => p.roleId === copyAllBtn.dataset.identityCopyAll);
        if (!player) return;
        const copied = await copyTextToClipboard(buildIdentitySummaryText(player));
        showToast(copied ? 'Đã sao chép toàn bộ hồ sơ nhân vật.' : 'Trình duyệt chưa cho phép sao chép.');
        return;
      }
      const detailBtn = event.target.closest('[data-identity-detail]');
      if (detailBtn) {
        loadPlayerDetail(detailBtn.dataset.identityDetail, { force: false, expectedRevision: revision });
        return;
      }
      const refreshBtn = event.target.closest('[data-identity-refresh]');
      if (refreshBtn) {
        loadPlayerDetail(refreshBtn.dataset.identityRefresh, { force: true, expectedRevision: revision });
      }
    });
  }

  let detailVersion = 0;
  let overviewVersion = 0;
  let searchTimer;
  async function loadAdminMonitorCtvDetail(ctvId, silent = false) {
    if (state.user?.role !== 'admin' || !ctvId) return;
    const version = ++detailVersion;
    const token = state.token;
    state.adminMonitorCtvId = ctvId;
    const current = () => version === detailVersion && state.token === token && state.user?.role === 'admin' && state.adminMonitorCtvId === ctvId;
    if (!silent && state.adminMonitorCtvDetail?.ctv.id !== ctvId) {
      state.adminMonitorCtvLoading = true;
      renderCurrentView();
    }
    const params = new URLSearchParams({
      orders: pageLimit('orders'), transactions: pageLimit('transactions'), events: pageLimit('events'),
      category: state.adminMonitorCtvCatFilter || 'all', q: state.adminMonitorCtvOrderSearch || '',
    });
    try {
      const result = await apiFetch(`/api/admin/monitor/ctv/${encodeURIComponent(ctvId)}?${params}`);
      if (current()) state.adminMonitorCtvDetail = result;
    } catch (err) {
      if (current()) showToast(err.message);
    } finally {
      if (current()) {
        state.adminMonitorCtvLoading = false;
        if (state.currentView === 'admin_monitor') {
          const input = document.activeElement?.id === 'monitorCtvOrderSearch' && document.activeElement;
          const pos = input && input.selectionStart;
          renderCurrentView();
          if (input) {
            const replacement = document.getElementById('monitorCtvOrderSearch');
            replacement?.focus();
            replacement?.setSelectionRange(pos, pos);
          }
        }
      }
    }
  }

  async function loadAdminMonitor() {
    if (state.user?.role !== 'admin') return;
    const token = state.token;
    const version = ++overviewVersion;
    try {
      const data = await apiFetch(`/api/admin/monitor?ctvs=${pageLimit('ctvs')}&events=${pageLimit('systemEvents')}&summary=1`);
      if (token !== state.token || state.user?.role !== 'admin' || version !== overviewVersion) return;
      state.adminMonitor = data;
      if (state.adminMonitorCtvId) await loadAdminMonitorCtvDetail(state.adminMonitorCtvId, true);
      else if (state.currentView === 'admin_monitor') renderCurrentView();
    } catch (err) { if (state.token === token) showToast(err.message); }
  }

  const table = (headers, rows) => `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" class="tool-note">Chưa có dữ liệu</td></tr>`}</tbody></table></div>`;
  function eventTable(events) {
    return table(['Thời điểm', 'Tài khoản', 'Hoạt động', 'Chi tiết'], events.map(e => `<tr>
      <td>${esc(date(e.createdAt))}</td><td>${esc(e.actorName)}</td>
      <td><span class="audit-action-cell">${auditActionIcon(e.action)}<span>${esc(formatAuditAction(e.action))}</span></span></td><td>${esc(formatAuditDetails(e.details))}</td></tr>`).join(''));
  }

  function walletCards(totals, overview) {
    const backupTopup = overview ? (overview.backupTopup ?? 0) : (totals?.backupTopup ?? 0);
    const backupSpent = overview ? (overview.backupSpent ?? 0) : (totals?.backupSpent ?? 0);
    const backupHeld = overview ? (overview.backupHeld ?? 0) : (totals?.backupHeld ?? 0);
    const backupBalance = overview ? (overview.backupBalance ?? 0) : (totals?.backupBalance ?? 0);
    const cards = [
      { label: overview ? 'Tổng đã nạp' : 'Tổng đã nạp (Ví CTV)', value: totals?.totalTopup, note: 'Ví CTV (Server Zn).' },
      { label: 'Tổng đã sử dụng (sau hoàn tiền)', value: totals?.totalSpent, note: 'Chỉ tính đơn Server Zn.' },
      { label: overview ? 'Tổng còn lại' : 'Số dư Ví CTV', value: totals?.balance, note: 'Số dư Ví CTV bình thường.' },
    ];
    if (overview) {
      cards.push({
        label: 'Admin phải thanh toán',
        value: overview.adminPayable,
        note: overview.adminPayable == null ? 'Chưa lấy được hạn mức đã dùng từ Server Zn.' : 'Hạn mức Server Zn đã dùng trong tuần + số dư Ví CTV.',
      });
    }
    cards.push({
      label: overview ? 'Nguồn dự phòng' : 'Ví Nguồn DP',
      value: backupBalance,
      note: `Nạp: ${money(backupTopup)} · Đã dùng: ${money(backupSpent)}${backupHeld > 0 ? ' · Đang giữ: ' + money(backupHeld) : ''}.`,
      isBackup: true,
    });
    const gridCls = overview ? 'stats-three-grid monitor-wallet-grid is-five' : 'stats-three-grid monitor-wallet-grid is-four';
    return `<div class="${gridCls}">${cards.map(card => `<div class="stat-subcard monitor-wallet-card${card.isBackup ? ' is-backup-card' : ''}">
      <span class="tool-note monitor-wallet-label">${card.label}</span>
      <strong class="wallet-value">${card.value == null ? '—' : money(card.value)}</strong>
      ${card.note ? `<span class="tool-note monitor-wallet-sub">${card.note}</span>` : ''}</div>`).join('')}</div>`;
  }

  function renderSelectedCtvDetailHtml() {
    const id = state.adminMonitorCtvId;
    if (!id) return '';
    const d = state.adminMonitorCtvDetail;
    if (d?.ctv?.id !== id) return panel('Chi tiết CTV', state.adminMonitorCtvLoading ? 'Đang tải…' : 'Chưa tải được dữ liệu.');
    const sum = d.summary;
    const tab = state.adminMonitorCtvTab || 'orders';
    const labels = { orders: 'Đơn đã đặt', transactions: 'Biến động ví', events: 'Hoạt động' };
    const filters = `<div class="tool-actions"><input class="input-box" id="monitorCtvOrderSearch" aria-label="Tìm đơn" placeholder="Tìm khách, SUID, mã đơn hoặc gói" value="${esc(state.adminMonitorCtvOrderSearch || '')}">
      <select class="input-box" id="monitorCtvCatFilter" aria-label="Danh mục"><option value="all">Tất cả danh mục</option>
      ${Object.entries(CAT_LABELS).map(([key,label]) => `<option value="${key}" ${state.adminMonitorCtvCatFilter === key ? 'selected' : ''}>${label}</option>`).join('')}</select></div>`;
    let content;
    if (tab === 'orders') {
      content = filters + table(['Thời điểm', 'Mã đơn', 'Khách hàng', 'Đơn đã đặt', 'Tiền trừ ví'], d.orders.map(o => `<tr>
        <td>${esc(date(o.createdAt))}</td><td>#${esc(o.remoteOrderId || o.id)}</td>
        <td>${esc(o.customer?.nickname || 'Chưa gán khách')}<div class="tool-note">${esc(o.customer?.suid || '')}</div></td>
        <td><strong>${esc(o.summary || '—')}</strong><div class="tool-note">${esc(o.categoryName)}</div></td>
        <td>${o.debit == null ? `Chưa liên kết giao dịch<div class="tool-note">Giá đơn ${money(o.sellPrice)}</div>` : money(o.debit)}
          ${o.refundedAmount ? `<div class="tool-note">Đã hoàn ${money(o.refundedAmount)}</div>` : ''}</td></tr>`).join(''))
        + moreButton(tab, d.filteredCount, 0, d.orders.length);
    } else if (tab === 'events') {
      content = eventTable(d.events) + moreButton(tab, d.eventCount, 0, d.events.length);
    } else {
      const types = { admin_topup: 'Nạp ví', admin_deduct: 'Admin trừ ví', order_debit: 'Đặt đơn', order_hold: 'Giữ tiền', order_release: 'Trả tiền giữ', order_refund: 'Hoàn tiền đơn' };
      content = table(['Thời điểm', 'Ví', 'Giao dịch', 'Số tiền', 'Số dư sau GD', 'Ghi chú'], d.transactions.map(t => {
        const isDpTx = t.wallet === 'backup' || t.source === 'backup';
        return `<tr>
        <td>${esc(date(t.createdAt))}</td>
        <td><span class="badge-tag ${isDpTx ? 'green' : 'violet'}" style="font-size:10.5px;">${isDpTx ? 'Ví Nguồn DP' : 'Ví CTV'}</span></td>
        <td>${esc(types[t.type] || t.type)}</td><td>${t.amount > 0 ? '+' : ''}${money(t.amount)}</td>
        <td>${money(t.balanceAfter)}</td><td>${esc(t.note || '—')}</td></tr>`;
      }).join('')) + moreButton(tab, d.transactionCount, 0, d.transactions.length);
    }
    const extraNotes = [];
    if (sum.held) extraNotes.push(`Đang giữ đơn Server Zn ${money(sum.held)}`);
    if (sum.backupHeld) extraNotes.push(`Đang giữ đơn Nguồn DP ${money(sum.backupHeld)}`);
    if (sum.deducted) extraNotes.push(`Admin đã trừ Ví CTV ${money(sum.deducted)}`);
    if (sum.backupDeducted) extraNotes.push(`Admin đã trừ Ví Nguồn DP ${money(sum.backupDeducted)}`);
    return panel(`Đối soát · ${esc(d.ctv.name)}`, `
      ${walletCards(sum)}
      ${extraNotes.length ? `<p class="tool-note">${extraNotes.join(' · ')}</p>` : ''}
      ${sum.unaccountedBalance ? `<p class="tool-warning">Chênh lệch giữa số dư ví và sổ giao dịch: ${money(sum.unaccountedBalance)}. Tổng đã nạp và đã dùng chỉ gồm giao dịch có ghi nhận.</p>` : ''}
      <div class="tool-actions monitor-tabs">${Object.entries(labels).map(([key,label]) => button(label,'data-ctv-detail-tab',key,key === tab ? 'btn-violet' : 'btn-frost')).join('')}
        ${button('Đóng chi tiết','data-close-ctv-detail','')}</div>${content}`, 'id="monitorCtvDetailPanel"');
  }

  function renderAdminMonitorHtml() {
    const data = state.adminMonitor;
    if (!data) return panel('Giám sát CTV', `Đang tải… ${button(`${znIcon('refresh', 13)} Làm mới`,'data-refresh-monitor','')}`);
    const rows = data.ctvs.map(u => `<tr><td><strong>${esc(u.name)}</strong><div class="tool-note">${esc(u.username)}</div></td>
      <td>${money(u.totalTopup)}</td><td>${money(u.totalSpent)}</td><td class="wallet-balance">${money(u.balance)}</td>
      <td class="wallet-backup-cell"><strong>${money(u.backupBalance || 0)}</strong><div class="tool-note">Nạp ${money(u.backupTopup || 0)} · Dùng ${money(u.backupSpent || 0)}</div></td>
      <td>${Number(u.orderCount || 0)}</td>
      <td>${button(u.id === state.adminMonitorCtvId ? 'Đang xem' : 'Xem đơn', 'data-select-ctv', u.id, u.id === state.adminMonitorCtvId ? 'btn-violet' : 'btn-frost')}</td></tr>`).join('');
    return panel('Tổng ví của toàn bộ CTV', walletCards(data.walletTotals, data), 'id="monitorWalletTotals"')
      + panel('Ví và đơn hàng của CTV', `${!data.storageHealthy ? '<p class="tool-warning">Lỗi ghi dữ liệu ví.</p>' : ''}
      <div class="tool-actions">${button(`${znIcon('refresh', 13)} Làm mới`, 'data-refresh-monitor', '')}</div>
      ${table(['CTV','Đã nạp (Ví CTV)','Đã dùng (Server Zn)','Ví CTV còn lại','Ví Nguồn DP','Số đơn','Chi tiết'], rows)}${moreButton('ctvs', data.ctvCount, 0, data.ctvs.length)}`)
      + renderSelectedCtvDetailHtml()
      + panel('50 hoạt động gần nhất', eventTable(data.events) + moreButton('systemEvents', data.eventCount, 0, data.events.length));
  }

  function bindAdminMonitorEvents() {
    document.querySelectorAll('[data-refresh-monitor]').forEach(control => control.addEventListener('click', loadAdminMonitor));

    const selectCtv = async (ctvId) => {
      if (!ctvId) {
        state.adminMonitorCtvId = null;
        state.adminMonitorCtvDetail = null;
        renderCurrentView();
        return;
      }
      state.adminMonitorCtvTab = 'orders';
      for (const key of ['orders','events','transactions']) delete state.listLimits[key];
      state.adminMonitorCtvOrderSearch = '';
      state.adminMonitorCtvCatFilter = 'all';
      await loadAdminMonitorCtvDetail(ctvId, false);
      document.getElementById('monitorCtvDetailPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    document.querySelectorAll('[data-select-ctv]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectCtv(btn.dataset.selectCtv);
      });
    });
    document.querySelectorAll('[data-close-ctv-detail]').forEach(btn => {
      btn.addEventListener('click', () => selectCtv(''));
    });
    document.querySelectorAll('[data-ctv-detail-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.adminMonitorCtvTab = btn.dataset.ctvDetailTab;
        renderCurrentView();
      });
    });
    document.getElementById('monitorCtvOrderSearch')?.addEventListener('input', (e) => {
      state.adminMonitorCtvOrderSearch = e.target.value;
      state.listLimits.orders = 20;
      detailVersion++;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadAdminMonitorCtvDetail(state.adminMonitorCtvId, true), 200);
    });
    document.getElementById('monitorCtvCatFilter')?.addEventListener('change', (e) => {
      state.adminMonitorCtvCatFilter = e.target.value;
      state.listLimits.orders = 20;
      loadAdminMonitorCtvDetail(state.adminMonitorCtvId, true);
    });

  }

  return { renderIdentityToolsHtml, bindIdentityToolsEvents, loadAdminMonitor, renderAdminMonitorHtml, bindAdminMonitorEvents };
}
