const backupServiceNames = {
  weather: 'Thuê buff thời tiết', guide: 'Thuê dắt thẻ', treasure: 'Thuê dắt đảo kho báu',
  emptymap: 'Thuê map trống', seeds: 'Mua hạt dưa hấu',
};
export const backupPricingCategories = Object.entries(backupServiceNames).map(([key, label]) => ({
  key: 'backup_' + key, label: 'Dự phòng · ' + label, icon: 'layers', unitHint: 'đơn',
  stepFixed: 1000, presetsFixed: [1000, 2000, 5000],
}));

export function mountBackup(container, { apiFetch, state, escapeHtml: esc, formatVnd: money, formatDateVi, updateShellAuthUI, showToast }) {
  if (container.querySelector('#backupView')) return;
  container.innerHTML = `<section id="backupView" class="glass-panel">
    <div class="panel-title-row"><h2 class="panel-title-text">Nguồn dự phòng</h2>
    <button type="button" class="btn-frost" data-refresh>Làm mới danh mục</button></div>
    <div data-services aria-live="polite">Đang tải dịch vụ…</div>
    <div data-editor></div></section>
    <section class="glass-panel"><div class="panel-title-row"><h2 class="panel-title-text">Đơn nguồn dự phòng</h2>
    <button type="button" class="btn-frost" data-orders-refresh>Làm mới danh sách</button></div>
    <div data-orders>Đang tải đơn…</div></section>`;
  const root = container.querySelector('#backupView');
  const catalog = root.querySelector('[data-services]');
  const editor = root.querySelector('[data-editor]');
  const orderList = container.querySelector('[data-orders]');
  const ordersRefreshBtn = container.querySelector('[data-orders-refresh]');
  const admin = state.user.role === 'admin';
  const pendingStorage = 'znplay_backup_pending_' + state.user.id;
  let services = [], selectedServiceKey = '', orderLimit = 20, ordersVersion = 0, catalogVersion = 0;

  const button = (label, attr, style = 'btn-frost') => `<button type="button" class="${style}" ${attr}>${label}</button>`;
  const numeric = (key, label, min, max, initial) => `<label>${label}<input class="input-box" required type="number" name="${key}" min="${min}" max="${max}" step="1" value="${initial}"></label>`;

  function notify(text) {
    if (typeof showToast === 'function' && text) showToast(text);
  }
  function readPending() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(pendingStorage) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }
  function writePending(map) {
    try { sessionStorage.setItem(pendingStorage, JSON.stringify(map)); } catch { }
  }
  function forgetRequest(fingerprint) {
    const pending = readPending();
    delete pending[fingerprint];
    writePending(pending);
  }
  function safeRequestUuid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (globalThis.crypto?.getRandomValues) {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }
    return 'bk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
  async function hashRequestKey(raw) {
    if (globalThis.crypto?.subtle?.digest && typeof TextEncoder !== 'undefined') {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    }
    // Deterministic 64-bit FNV-1a fallback for non-secure HTTP/LAN contexts where crypto.subtle is unavailable.
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < raw.length; i++) {
      const c = raw.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + '_' + raw.length;
  }
  function statusTone(order) {
    const st = String(order.backupStatus || order.status || '').toLowerCase();
    if (st === 'done' || st === 'completed') return 'green';
    if (st === 'failed' || st === 'cancelled') return 'red';
    if (st === 'running' || st === 'preparing' || st === 'queued' || st === 'friending') return 'violet';
    return 'amber';
  }

  async function loadOrders() {
    const version = ++ordersVersion;
    if (ordersRefreshBtn) {
      ordersRefreshBtn.disabled = true;
      ordersRefreshBtn.textContent = 'Đang tải…';
    }
    try {
      const { reviews, orders, total } = await apiFetch('/api/backup/orders?limit=' + orderLimit);
      if (version !== ordersVersion || !root.isConnected) return;
      orderList.innerHTML = orders.length ? `<div class="tool-form-column">${orders.map(o => `
        <article class="stat-subcard backup-order-card"><div class="panel-title-row"><strong>#${esc(o.remoteOrderId)} · ${esc(o.summary)}</strong>
        <span class="badge-tag ${statusTone(o)}">${esc(o.statusText)}</span></div>
        <div class="backup-order-meta"><span>${esc(o.customer?.nickname || '')}</span> · <span class="backup-order-price">Giá CTV ${money(o.sellPrice)}</span> · <span>${esc(formatDateVi(o.createdAt))}</span></div>
        ${admin && o.placedBy?.name ? `<small class="tool-note">Người đặt: ${esc(o.placedBy.name)}</small>` : ''}
        <div class="tool-actions">${button('Cập nhật trạng thái', `data-order="${esc(o.id)}" data-action="refresh"`)}
        ${o.canResume ? button('Chạy / tiếp tục', `data-order="${esc(o.id)}" data-action="resume"`, 'btn-violet') : ''}</div>
        <div class="tool-note backup-order-msg" data-order-msg aria-live="polite"></div></article>`).join('')}</div>
        ${orders.length < total && orderLimit < 500 ? `<div class="tool-actions" style="margin-top:12px;">${button('Xem thêm đơn', 'data-more')}</div>` : ''}` : '<p class="tool-note">Chưa có đơn nguồn dự phòng.</p>';
      if (reviews.length) orderList.insertAdjacentHTML('afterbegin', reviews.map(i => `<details class="tool-warning" style="margin-bottom:12px;"><summary>
        ${i.status === 'processing' ? 'Đang gửi' : 'Chờ đối soát'} · ${esc(i.summary)} · ${money(i.heldAmount)}</summary>
        <p>${esc(i.userName || '')} · ${esc(i.customer || '')} · ${esc(formatDateVi(i.createdAt))}</p>
        ${admin && i.status !== 'processing' ? `<form class="tool-form-column" data-review="${esc(i.id)}">
          ${i.requiresReview ? '<strong>Kiểm tra chi phí của đơn #' + esc(i.remoteOrderId) + '</strong>' :
          '<label>Kết quả kiểm tra tại nguồn<select class="input-box" required name="resolution"><option value="">Chọn kết quả</option><option value="created">Đã tạo đơn</option><option value="not_created">Chưa tạo đơn, hoàn khoản giữ</option></select></label><div hidden data-created><label>Mã đơn nguồn<input class="input-box" type="number" min="1" name="remoteOrderId"></label><label>Chi phí thực tế (đ)<input class="input-box" type="number" min="0" name="actualCost"></label></div>'}
          <label>Ghi chú đối soát<input class="input-box" name="note" minlength="10" maxlength="500" required></label>
          <label class="tool-check"><input type="checkbox" required> Tôi đã kiểm tra giao dịch tại nguồn dự phòng.</label>
          <div class="tool-actions"><button class="btn-frost" type="submit">Lưu kết quả đối soát</button></div><output></output></form>` : ''}</details>`).join(''));
    } catch (error) {
      if (version === ordersVersion && root.isConnected) orderList.textContent = error.message;
    } finally {
      if (version === ordersVersion && ordersRefreshBtn && root.isConnected) {
        ordersRefreshBtn.disabled = false;
        ordersRefreshBtn.textContent = 'Làm mới danh sách';
      }
    }
  }
  orderList.addEventListener('click', async event => {
    const btn = event.target.closest('button');
    if (!btn || btn.disabled || btn.type === 'submit') return;
    if (btn.hasAttribute('data-more')) { orderLimit += 20; return loadOrders(); }
    const card = btn.closest('.backup-order-card');
    const msgEl = card?.querySelector('[data-order-msg]');
    if (msgEl) msgEl.textContent = '';
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = btn.dataset.action === 'resume' ? 'Đang chạy…' : 'Đang cập nhật…';
    try {
      const res = await apiFetch('/api/backup/orders/' + encodeURIComponent(btn.dataset.order) + '/' + btn.dataset.action, 'POST', {});
      notify(res.message || ('Trạng thái: ' + (res.statusText || 'Đã cập nhật')));
      await loadOrders();
    } catch (e) {
      if (msgEl) msgEl.textContent = e.message;
      notify(e.message);
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
  orderList.onchange = event => {
    if (event.target.name === 'resolution') {
      const box = event.target.form.querySelector('[data-created]');
      box.hidden = event.target.value !== 'created';
      box.querySelectorAll('input').forEach(el => { el.required = !box.hidden; });
    }
  };
  orderList.onsubmit = async event => {
    event.preventDefault();
    const form = event.target, fields = form.elements, resolution = fields.resolution?.value;
    const data = { confirmed: true, note: fields.note.value };
    if (resolution) data.resolution = resolution;
    if (resolution === 'created') Object.assign(data, { remoteOrderId: Number(fields.remoteOrderId.value), actualCost: Number(fields.actualCost.value) });
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await apiFetch('/api/admin/intents/' + encodeURIComponent(form.dataset.review) + (resolution ? '/reconcile' : '/acknowledge'), 'POST', data);
      notify('Đã lưu kết quả đối soát.');
      await loadOrders();
    } catch (error) { form.querySelector('output').textContent = error.message; }
    finally { submit.disabled = false; }
  };
  if (ordersRefreshBtn) ordersRefreshBtn.onclick = loadOrders;

  function highlightSelectedCard() {
    catalog.querySelectorAll('[data-service-card]').forEach(card => {
      card.classList.toggle('is-selected', card.dataset.serviceCard === selectedServiceKey);
    });
  }

  function openForm(service) {
    selectedServiceKey = service.key;
    highlightSelectedCard();
    const multi = ['guide', 'weather'].includes(service.key);
    const weatherCatalog = Array.isArray(service.catalog) ? service.catalog : [];
    const weatherEmpty = service.key === 'weather' && weatherCatalog.length === 0;
    const weatherRow = () => `<div class="backup-weather-row" data-line>
      <label>Loại thời tiết<select aria-label="Loại thời tiết" class="input-box" required name="weather">
      ${weatherCatalog.map(w => `<option value="${w.productId}">${esc(w.name)}</option>`).join('')}</select></label>
      ${numeric('count', 'Số lần', 1, service.maxPerOrder, 1)}
      <div class="backup-weather-remove">${button('Bỏ', 'data-remove')}</div></div>`;
    const duration = ['guide', 'treasure'].includes(service.key) ? numeric('minutes', 'Thời gian thuê (phút)', service.minMinutes, service.maxHours * 60, service.minMinutes) : '';
    editor.innerHTML = `<form class="tool-form-column stat-subcard backup-order-form" style="margin-top:16px">
      <h3>${esc(service.title)}</h3>
      ${weatherEmpty ? '<p class="tool-warning">Nguồn dự phòng hiện chưa có loại thời tiết khả dụng. Hãy bấm Làm mới danh mục sau.</p>' : ''}
      <fieldset class="tool-form-column" style="border:0;padding:0;margin:0" ${weatherEmpty ? 'disabled' : ''}>
      <label>Tên nhân vật${multi ? ' (tối đa 10 tên, cách nhau bằng dấu phẩy)' : ''}
      <input name="charName" class="input-box" required maxlength="${multi ? 1008 : 100}" autocomplete="off"></label>
      ${service.key === 'weather' && !weatherEmpty ? `<div class="tool-form-column" data-lines>${weatherRow()}</div><div class="tool-actions">${button('+ Thêm loại thời tiết', 'data-add')}</div>` : ''}
      ${service.key === 'guide' ? numeric('bots', 'Số bot', 1, service.maxBots, 1) : ''}${duration}
      ${service.key === 'guide' ? '<fieldset class="tool-actions backup-maps-fieldset"><legend>Bản đồ dò</legend>' + [['square','Quảng trường'],['camp','Cắm trại'],['resort','Khu nghỉ dưỡng'],['downtown','Khu trung tâm']].map(([k,v]) => `<label class="tool-check"><input type="checkbox" name="maps" value="${k}" checked> ${v}</label>`).join(' ') + '</fieldset>' : ''}
      ${service.key === 'seeds' ? numeric('quantity', 'Số hạt', 1, service.maxPerOrder, 1) : ''}
      </fieldset><div aria-live="polite" class="backup-quote-box" data-message hidden></div>
      <div class="tool-actions"><button class="btn-violet" type="submit" ${weatherEmpty ? 'disabled' : ''}>Xem báo giá</button></div></form>`;
    const form = editor.querySelector('form'), fields = form.querySelector('fieldset');
    const submit = form.querySelector('[type=submit]'), message = form.querySelector('[data-message]');
    let selection, busy = false;

    function syncRemoveButtons() {
      const lines = form.querySelectorAll('[data-line]');
      lines.forEach(line => {
        const rm = line.querySelector('[data-remove]');
        if (rm) rm.disabled = lines.length <= 1;
      });
    }
    syncRemoveButtons();

    function showMessage(text, tone = '') {
      message.textContent = text || '';
      message.hidden = !text;
      message.className = 'backup-quote-box' + (tone ? ' is-' + tone : '');
    }
    function reset() {
      selection = null;
      submit.textContent = 'Xem báo giá';
      showMessage('');
    }
    form.oninput = reset;
    form.onchange = reset;
    form.onclick = event => {
      if (event.target.closest('[data-add]')) {
        form.querySelector('[data-lines]')?.insertAdjacentHTML('beforeend', weatherRow());
        syncRemoveButtons();
        reset();
      }
      if (event.target.closest('[data-remove]') && form.querySelectorAll('[data-line]').length > 1) {
        event.target.closest('[data-line]').remove();
        syncRemoveButtons();
        reset();
      }
    };
    form.onsubmit = async event => {
      event.preventDefault();
      if (busy || weatherEmpty) return;
      const data = new FormData(form);
      const input = { category: 'backup_' + service.key, charName: String(data.get('charName') || '').trim() };
      for (const key of ['bots', 'minutes', 'quantity']) if (data.has(key)) input[key] = Number(data.get(key));
      if (service.key === 'guide') input.maps = data.getAll('maps');
      if (service.key === 'weather') input.items = Array.from(form.querySelectorAll('[data-line]'), line =>
        ({ productId: Number(line.querySelector('select').value), count: Number(line.querySelector('input').value) }));
      const key = JSON.stringify(input);
      const placing = Boolean(selection && selection.key === key);
      busy = true; fields.disabled = true; submit.disabled = true;
      submit.textContent = placing ? 'Đang gửi đơn…' : 'Đang lấy báo giá…';
      try {
        if (!placing) {
          const quote = await apiFetch('/api/backup/quote', 'POST', input);
          const fingerprint = await hashRequestKey(key);
          const pending = readPending();
          const previous = pending[fingerprint];
          selection = { key, fingerprint, price: previous?.price ?? quote.sellPrice, requestKey: previous?.requestKey || safeRequestUuid() };
          showMessage(previous
            ? 'Yêu cầu trước đang chờ kết quả. Giá CTV đã xác nhận: ' + money(previous.price)
            : `${quote.summary} · Giá CTV: ${money(quote.sellPrice)}`, 'quote');
          submit.textContent = previous ? 'Kiểm tra yêu cầu đã gửi' : 'Xác nhận đặt đơn';
        } else {
          const { fingerprint, requestKey } = selection;
          const pending = readPending();
          writePending({ ...pending, [fingerprint]: { requestKey, price: selection.price } });
          const result = await apiFetch('/api/orders/place', 'POST', { ...input, expected_price: selection.price, idempotency_key: requestKey });
          forgetRequest(fingerprint);
          if (state.user && !admin && result.userBalance !== undefined) {
            state.user.balance = result.userBalance;
            updateShellAuthUI();
          }
          reset();
          form.reset();
          if (service.key === 'weather') {
            const linesBox = form.querySelector('[data-lines]');
            if (linesBox) { linesBox.innerHTML = weatherRow(); syncRemoveButtons(); }
          }
          const createdMsg = 'Đã tạo đơn #' + result.order.remoteOrderId + '.';
          showMessage(createdMsg, 'ok');
          notify(createdMsg);
          await loadOrders();
        }
      } catch (error) {
        if (placing && error.status && error.status < 500 && error.code !== 'ORDER_REVIEW_REQUIRED') {
          forgetRequest(selection.fingerprint);
          reset();
        } else if (placing) {
          submit.textContent = 'Xác nhận đặt đơn';
        } else {
          submit.textContent = 'Xem báo giá';
        }
        let errText = error.message;
        if (placing && !error.status) errText += ' Bấm xác nhận lại để kiểm tra cùng mã yêu cầu.';
        showMessage(errText, 'error');
        if (placing && error.code === 'ORDER_REVIEW_REQUIRED' && !admin) {
          apiFetch('/api/auth/me').then(me => {
            if (me?.user) { state.user = me.user; updateShellAuthUI(); }
          }).catch(() => {});
        }
        if (placing) await loadOrders();
      } finally { busy = false; fields.disabled = weatherEmpty; submit.disabled = weatherEmpty; }
    };
    if (!weatherEmpty && form.elements.charName) {
      form.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      form.elements.charName.focus();
    }
  }

  async function loadCatalog(fresh = false) {
    const version = ++catalogVersion;
    const refresh = root.querySelector('[data-refresh]');
    refresh.disabled = true;
    refresh.textContent = 'Đang tải…';
    editor.replaceChildren();
    selectedServiceKey = '';
    catalog.textContent = 'Đang tải dịch vụ…';
    try {
      const result = await apiFetch('/api/backup/services' + (fresh ? '?refresh=1' : ''));
      if (version !== catalogVersion || !root.isConnected) return;
      services = result.services || [];
      catalog.innerHTML = `<div class="pricing-cat-grid">${services.map(s => `
        <article class="pricing-cat-card" data-service-card="${esc(s.key)}"><div class="panel-title-row"><strong>${esc(s.title)}</strong>
        <span class="badge-tag ${s.enabled === true ? 'green' : 'amber'}">${s.enabled === true ? 'Hoạt động' : s.enabled === false ? 'Tạm ngưng' : 'Chưa có trạng thái'}</span></div>
        ${s.key === 'emptymap' && Number.isInteger(s.free) ? `<small class="tool-note">Còn ${s.free} map trống</small>` : ''}
        ${s.enabled === true ? `<div class="tool-actions">${button('Chọn dịch vụ', `data-service="${esc(s.key)}"`)}</div>` : ''}</article>`).join('')}</div>`;
    } catch (e) {
      if (version === catalogVersion && root.isConnected) catalog.textContent = e.message;
    } finally {
      if (version === catalogVersion && root.isConnected) {
        refresh.disabled = false;
        refresh.textContent = 'Làm mới danh mục';
      }
    }
  }
  catalog.onclick = event => {
    const service = services.find(s => s.key === event.target.closest('[data-service]')?.dataset.service);
    if (service?.enabled) openForm(service);
  };
  root.querySelector('[data-refresh]').onclick = () => loadCatalog(true);
  loadCatalog(false); loadOrders();
}
