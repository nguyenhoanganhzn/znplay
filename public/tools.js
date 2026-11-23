export function createToolViews({ state, apiFetch, pageLimit, moreButton, renderLocalPages, escapeHtml: esc, showToast, copyTextToClipboard, formatVnd: money, formatDateVi: date, renderCurrentView }) {
  const panel = (title, content, extra = '') => `<section class="glass-panel" ${extra}><div class="panel-title-row"><span class="panel-title-text">${title}</span></div>${content}</section>`;
  const button = (label, attribute, id, cls = 'btn-frost') => `<button type="button" class="${cls}" ${attribute}="${esc(id)}">${label}</button>`;

  const CAT_LABELS = {
    fruit_coin: 'Xu nông trại',
    fruit_by_fruit: 'Trái cây lẻ',
    buff_tim: 'Buff Tim',
    buff_sao: 'Buff Sao',
    guestbook: 'Bài viết',
    farm_gift: 'Quà nông trại',
    mail_gift: 'Quà thư',
    weather_buff: 'Buff Thời Tiết',
  };

  function formatAuditAction(action) {
    const a = String(action || '');
    if (a === 'POST /auth/login') return '🔑 Đăng nhập hệ thống';
    if (a === 'POST /auth/logout') return '🚪 Đăng xuất';
    if (a === 'POST /orders/place') return '🛒 Đặt đơn hàng mới';
    if (/^PUT \/orders\/[^/]+\/\d+\/toggle-active$/.test(a)) return '⏯️ Bật / Tắt đơn hàng';
    if (/^DELETE \/orders\/[^/]+\/\d+$/.test(a)) return '🗑️ Hủy đơn hàng';
    if (/^PUT \/orders\/weather_buff\/\d+\/slots\/\d+$/.test(a)) return '👤 Gán / Đổi khách Buff Thời Tiết';
    if (/^DELETE \/orders\/weather_buff\/\d+\/slots\/\d+$/.test(a)) return '👤 Gỡ khách Buff Thời Tiết';
    if (/^PUT \/orders\/weather_buff\/\d+\/weathers$/.test(a)) return '☁️ Lưu cấu hình thời tiết';
    if (/^POST \/orders\/weather_buff\/\d+\/share-link$/.test(a)) return '🔗 Lấy link theo dõi thời tiết';
    if (a === 'POST /customer/search-ingame') return '🔍 Tìm nhân vật trong game';
    if (a === 'POST /tools/identity') return 'Tra cứu ID Game / Tên nhân vật';
    if (a === 'POST /customer/select-ingame') return '✓ Chọn nhân vật khách hàng';
    if (a === 'POST /customer/resolve-role-id') return '🆔 Tra cứu khách theo Role ID';
    if (/^POST \/admin\/ctv\/[^/]+\/balance$/.test(a)) return '💰 Admin nạp / trừ ví CTV';
    if (/^PUT \/admin\/ctv\/[^/]+$/.test(a)) return '⚙️ Admin cập nhật tài khoản CTV';
    if (a === 'POST /admin/ctv') return '➕ Admin tạo tài khoản CTV';
    if (a === 'POST /admin/maintenance') return '🛠️ Admin bật / tắt chế độ bảo trì';
    if (a === 'POST /admin/notify-update') return '🔄 Admin gửi thông báo cập nhật cho CTV';
    if (/^DELETE \/admin\/ctv\/[^/]+$/.test(a)) return '🔒 Admin khóa / lưu trữ CTV';
    if (/^POST \/admin\/orders\/[^/]+\/refund$/.test(a)) return '↩️ Admin hoàn tiền đối soát';
    return a;
  }

  function formatAuditDetails(details) {
    if (!details || typeof details !== 'object') return '—';
    const parts = [];
    if (details.category) parts.push(`Mục: ${CAT_LABELS[details.category] || details.category}`);
    if (details.remoteOrderId) parts.push(`Đơn #${details.remoteOrderId}`);
    if (details.sellPrice !== undefined) parts.push(`Giá bán: ${money(details.sellPrice)}`);
    if (details.refundedAmount !== undefined && Number(details.refundedAmount) > 0) parts.push(`Hoàn ví: +${money(details.refundedAmount)}`);
    if (details.amount !== undefined) parts.push(`Số tiền: ${Number(details.amount) >= 0 ? '+' : ''}${money(details.amount)}`);
    if (details.balanceAfter !== undefined) parts.push(`Sau GD: ${money(details.balanceAfter)}`);
    if (details.nickname) parts.push(`Tên tìm: ${details.nickname}${details.resultCount !== undefined ? ` (${details.resultCount} KQ)` : ''}`);
    if (details.roleId) parts.push(`Role ID: ${details.roleId}`);
    if (details.suid) parts.push(`SUID: ${details.suid}`);
    if (details.totalQty !== undefined) parts.push(`Tổng thời tiết: ${details.totalQty} lần`);
    if (details.passwordReset) parts.push('Đặt lại mật khẩu');
    if (details.isLocked === true) parts.push('Đã khóa tài khoản');
    if (details.note) parts.push(`Ghi chú: ${details.note}`);
    if (details.status && Number(details.status) >= 400) parts.push(`HTTP ${details.status}`);
    if (parts.length > 0) return parts.join(' · ');
    const raw = JSON.stringify(details);
    return raw === '{}' ? '—' : raw;
  }

  function renderIdentityToolsHtml() {
    return panel('Tra cứu nhân vật', `
      <form id="identityForm" class="customer-search-fields" role="search">
        <select name="mode" class="input-box" aria-label="Tra cứu theo">
          <option value="name">Theo tên nhân vật</option>
          <option value="id">Theo ID Game</option>
        </select>
        <input name="query" class="input-box" aria-label="Tên nhân vật" placeholder="Nhập tên nhân vật trong game" maxlength="80" required autocomplete="off" spellcheck="false">
        <button class="btn-violet" type="submit">Tra cứu</button>
      </form>
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
    function reset() {
      revision++;
      status.textContent = '';
      results.replaceChildren();
      submit.disabled = false;
    }
    mode.addEventListener('change', () => {
      reset();
      query.value = '';
      query.placeholder = mode.value === 'id' ? 'Nhập ID dạng số hoặc XXXX-XXXX-XXXX' : 'Nhập tên nhân vật trong game';
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
      const request = revision;
      submit.disabled = true;
      status.textContent = 'Đang tìm nhân vật trên nguồn game…';
      try {
        const { players } = await apiFetch('/api/tools/identity', 'POST', { mode: mode.value, query: term });
        if (request !== revision || !form.isConnected) return;
        status.textContent = players.length ? `Tìm thấy ${players.length} nhân vật.` : `Không tìm thấy nhân vật khớp với “${term}”.`;
        const row = (label, value, copyLabel) => `<div class="identity-field">
          <div><span class="tool-note">${label}</span><strong>${esc(value)}</strong></div>
          ${button(copyLabel, 'data-identity-copy', value)}</div>`;
        renderLocalPages(results, players, visible => {
          results.innerHTML = visible.map(player => `<article class="stat-subcard">
            ${row('Tên nhân vật', player.nickname, 'Sao chép tên')}
            ${player.gameCode ? row('ID Game · mã nhân vật', player.gameCode, 'Sao chép mã') : ''}
            ${row('Role ID · dạng số', player.roleId, 'Sao chép ID')}
          </article>`).join('');
        });
      } catch (error) {
        if (request === revision) status.textContent = error.message;
      } finally {
        if (request === revision) submit.disabled = false;
      }
    });
    results.addEventListener('click', async event => {
      const target = event.target.closest('[data-identity-copy]');
      if (!target) return;
      const copied = await copyTextToClipboard(target.dataset.identityCopy);
      showToast(copied ? 'Đã sao chép.' : 'Trình duyệt chưa cho phép sao chép. Hãy chọn và sao chép trực tiếp.');
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
      <td>${esc(formatAuditAction(e.action))}</td><td>${esc(formatAuditDetails(e.details))}</td></tr>`).join(''));
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
      content = table(['Thời điểm', 'Giao dịch', 'Số tiền', 'Số dư sau giao dịch', 'Ghi chú'], d.transactions.map(t => `<tr>
        <td>${esc(date(t.createdAt))}</td><td>${esc(types[t.type] || t.type)}</td><td>${t.amount > 0 ? '+' : ''}${money(t.amount)}</td>
        <td>${money(t.balanceAfter)}</td><td>${esc(t.note || '—')}</td></tr>`).join('')) + moreButton(tab, d.transactionCount, 0, d.transactions.length);
    }
    return panel(`Đối soát · ${esc(d.ctv.name)}`, `
      <div class="stats-three-grid">${[['Tổng đã nạp',sum.totalTopup],['Đã dùng sau hoàn tiền',sum.totalSpent],['Số dư còn lại',sum.balance]].map(([label,n]) => `<div class="stat-subcard"><span class="tool-note">${label}</span><strong class="wallet-value">${money(n)}</strong></div>`).join('')}</div>
      ${sum.held || sum.deducted ? `<p class="tool-note">Đang giữ cho đơn ${money(sum.held)} · Admin đã trừ ví ${money(sum.deducted)}</p>` : ''}
      ${sum.unaccountedBalance ? `<p class="tool-warning">Chênh lệch giữa số dư ví và sổ giao dịch: ${money(sum.unaccountedBalance)}. Tổng đã nạp và đã dùng chỉ gồm giao dịch có ghi nhận.</p>` : ''}
      <div class="tool-actions monitor-tabs">${Object.entries(labels).map(([key,label]) => button(label,'data-ctv-detail-tab',key,key === tab ? 'btn-violet' : 'btn-frost')).join('')}
        ${button('Đóng chi tiết','data-close-ctv-detail','')}</div>${content}`, 'id="monitorCtvDetailPanel"');
  }

  function renderAdminMonitorHtml() {
    const data = state.adminMonitor;
    if (!data) return panel('Giám sát CTV', `Đang tải… ${button('Làm mới','data-refresh-monitor','')}`);
    const rows = data.ctvs.map(u => `<tr><td><strong>${esc(u.name)}</strong><div class="tool-note">${esc(u.username)}</div></td>
      <td>${money(u.totalTopup)}</td><td>${money(u.totalSpent)}</td><td class="wallet-balance">${money(u.balance)}</td><td>${Number(u.orderCount || 0)}</td>
      <td>${button(u.id === state.adminMonitorCtvId ? 'Đang xem' : 'Xem đơn', 'data-select-ctv', u.id, u.id === state.adminMonitorCtvId ? 'btn-violet' : 'btn-frost')}</td></tr>`).join('');
    return panel('Ví và đơn hàng của CTV', `${!data.storageHealthy ? '<p class="tool-warning">Lỗi ghi dữ liệu ví.</p>' : ''}
      <div class="tool-actions">${button('Làm mới', 'data-refresh-monitor', '')}</div>
      ${table(['CTV','Tổng đã nạp','Đã dùng sau hoàn tiền','Còn lại','Số đơn','Chi tiết'], rows)}${moreButton('ctvs', data.ctvCount, 0, data.ctvs.length)}`)
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
