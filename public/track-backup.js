(function () {
  const root = document.getElementById('znTrackRoot');
  if (!root) return;
  const match = window.location.pathname.match(/^\/track\/backup\/([A-Za-z0-9_-]{16,64})$/);
  const token = match ? match[1] : '';
  let lastRefreshAt = 0;
  let loading = false;

  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const fmtNum = (n) => Math.round(Number(n || 0)).toLocaleString('vi-VN');
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  };
  const statusTone = (st) => {
    const s = String(st || '').toLowerCase();
    if (s === 'done' || s === 'completed') return 'green';
    if (s === 'failed' || s === 'cancelled') return 'red';
    if (s === 'running' || s === 'preparing' || s === 'queued' || s === 'friending') return 'violet';
    return 'amber';
  };

  function renderOrder(order, notice = '') {
    const p = order.progress || {};
    const total = Math.max(0, Number(order.totalCnt || 0));
    const done = Math.max(0, Number(order.completedCnt || 0));
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    const unit = p.unit || 'lần';
    const steps = Array.isArray(p.steps) ? p.steps : [];
    const mapBits = [];
    if (p.khu !== null && p.khu !== undefined) mapBits.push(`Khu #${fmtNum(p.khu)}`);
    if (p.population !== null && p.population !== undefined) mapBits.push(`${fmtNum(p.population)} người trong khu`);
    if (p.customersHere > 0) mapBits.push('Khách đang có mặt trong khu');
    else if (p.inZone === false) mapBits.push('Chưa thấy khách trong khu');
    if (p.leftMin !== null && p.leftMin !== undefined && ['running', 'paused', 'ready'].includes(order.backupStatus)) {
      mapBits.push(`Còn khoảng ${fmtNum(p.leftMin)} phút`);
    }
    if (p.queuePos > 0) mapBits.push(`Vị trí hàng đợi #${fmtNum(p.queuePos)}`);

    root.innerHTML = `
      <div class="track-card glass-panel">
        <div class="track-brand-row">
          <div style="display:flex;align-items:center;gap:10px;">
            <img src="/logo.jpg" alt="ZnStudio" class="brand-logo-img" />
            <div>
              <div class="brand-title" style="font-size:17px;">ZnStudio</div>
              <div class="tool-note">Theo dõi tiến độ đơn dịch vụ</div>
            </div>
          </div>
          <span class="badge-tag ${statusTone(order.backupStatus || order.status)}">${esc(order.statusText || 'Chờ cập nhật')}</span>
        </div>

        <div class="stat-subcard" style="gap:10px;">
          <div class="panel-title-row" style="margin-bottom:0;">
            <strong style="font-size:15px;color:#fff;">#${esc(order.remoteOrderId)} · ${esc(order.summary || order.categoryName)}</strong>
          </div>
          <div class="backup-order-meta">
            <span>Nhân vật: <strong style="color:#fff;">${esc(order.customerNickname || '—')}</strong></span>
            <span>·</span>
            <span>Tạo lúc: ${esc(fmtDate(order.createdAt))}</span>
          </div>

          ${total > 0 ? `
            <div class="backup-progress-block">
              <div class="backup-progress-head">
                <span>Tiến độ đã chạy</span>
                <strong>${fmtNum(done)} / ${fmtNum(total)} ${esc(unit)} (${pct}%)</strong>
              </div>
              <div class="progress-track"><div class="progress-fill ${pct >= 100 ? 'is-done' : ''}" style="width:${pct}%"></div></div>
            </div>
          ` : '<div class="tool-note">Bấm "Tải lại dữ liệu" để cập nhật số lượng đã chạy mới nhất.</div>'}

          ${steps.length ? `
            <div class="backup-step-chips">
              ${steps.map(s => `<span class="badge-tag ${s.done >= s.target && s.target > 0 ? 'green' : 'violet'}">${esc(s.name)}: ${fmtNum(s.done)}/${fmtNum(s.target)}</span>`).join('')}
            </div>
          ` : ''}

          ${p.activeWeather?.name ? `
            <div class="backup-quote-box is-quote" style="font-size:12.5px;">
              Đang thả: <strong>${esc(p.activeWeather.name)}</strong>${p.activeWeather.remainingSec ? ` (còn ~${fmtNum(p.activeWeather.remainingSec)} giây)` : ''}
            </div>
          ` : ''}

          ${mapBits.length ? `<div class="backup-map-meta">${mapBits.map(b => `<span class="badge-tag">${esc(b)}</span>`).join('')}</div>` : ''}
          ${p.pauseNote ? `<div class="tool-warning" style="font-size:12.5px;">${esc(p.pauseNote)}</div>` : ''}
        </div>

        <div class="track-footer-row">
          <div class="tool-note">
            ${p.syncedAt ? `Cập nhật gần nhất: <strong>${esc(fmtDate(p.syncedAt))}</strong>` : 'Chưa tải dữ liệu trực tiếp — bấm nút bên cạnh để kiểm tra.'}
            ${notice ? `<div style="margin-top:4px;color:var(--color-aurora-gradient);">${esc(notice)}</div>` : ''}
          </div>
          <button type="button" class="btn-violet" id="btnTrackRefresh">Tải lại dữ liệu</button>
        </div>
      </div>
    `;

    root.querySelector('#btnTrackRefresh')?.addEventListener('click', () => load(true));
  }

  async function load(refresh) {
    if (loading) return;
    if (!token) {
      root.innerHTML = '<div class="track-card glass-panel"><p class="tool-warning">Liên kết theo dõi không hợp lệ.</p></div>';
      return;
    }
    const now = Date.now();
    if (refresh && now - lastRefreshAt < 4000) {
      const wait = Math.ceil((4000 - (now - lastRefreshAt)) / 1000);
      const btn = root.querySelector('#btnTrackRefresh');
      if (btn) btn.textContent = `Chờ ${wait} giây…`;
      setTimeout(() => { const b = root.querySelector('#btnTrackRefresh'); if (b && !loading) b.textContent = 'Tải lại dữ liệu'; }, 1000);
      return;
    }
    loading = true;
    const btn = root.querySelector('#btnTrackRefresh');
    if (btn) { btn.disabled = true; btn.textContent = 'Đang tải, vui lòng chờ…'; }
    try {
      const res = await fetch('/api/public/backup-track/' + encodeURIComponent(token) + (refresh ? '?refresh=1' : ''), {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data.order) {
        throw new Error(data?.message || 'Không tìm thấy đơn theo dõi.');
      }
      if (refresh) lastRefreshAt = Date.now();
      renderOrder(data.order, refresh ? (data.cached ? 'Đang hiển thị dữ liệu vừa cập nhật gần nhất.' : 'Đã cập nhật tiến độ mới nhất.') : '');
    } catch (err) {
      if (root.querySelector('#btnTrackRefresh')) {
        const noticeEl = root.querySelector('.track-footer-row .tool-note');
        if (noticeEl) noticeEl.insertAdjacentHTML('beforeend', `<div style="margin-top:4px;color:#fda4af;">${esc(err.message)}</div>`);
        const b = root.querySelector('#btnTrackRefresh');
        if (b) { b.disabled = false; b.textContent = 'Tải lại dữ liệu'; }
      } else {
        root.innerHTML = `<div class="track-card glass-panel"><p class="tool-warning">${esc(err.message)}</p></div>`;
      }
    } finally {
      loading = false;
    }
  }

  load(false);
})();
