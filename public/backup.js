const serviceNames = {
  weather: 'Thuê buff thời tiết', guide: 'Thuê dắt thẻ', treasure: 'Thuê dắt đảo kho báu',
  emptymap: 'Thuê map trống', seeds: 'Mua hạt dưa hấu',
};
export const backupPricingCategories = Object.entries(serviceNames).map(([key, label]) => ({
  key: 'backup_' + key, label: 'Dự phòng · ' + label, icon: 'layers', unitHint: 'đơn',
  stepFixed: 1000, presetsFixed: [1000, 2000, 5000],
}));

export function mountBackup(container, { apiFetch, state, escapeHtml: esc, formatVnd: money, formatDateVi, updateShellAuthUI }) {
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
  const admin = state.user.role === 'admin';
  const pendingStorage = 'znplay_backup_pending_' + state.user.id;
  let services = [], orderLimit = 20, ordersVersion = 0;
  const button = (label, attr, style = 'btn-frost') => `<button type="button" class="${style}" ${attr}>${label}</button>`;
  const numeric = (key, label, min, max, initial) => `<label>${label}<input class="input-box" required type="number" name="${key}" min="${min}" max="${max}" step="1" value="${initial}"></label>`;

  async function loadOrders() {
    const version = ++ordersVersion;
    try {
      const { reviews, orders, total } = await apiFetch('/api/backup/orders?limit=' + orderLimit);
      if (version !== ordersVersion || !root.isConnected) return;
      orderList.innerHTML = orders.length ? `<div class="tool-form-column">${orders.map(o => `
        <article class="stat-subcard"><div class="panel-title-row"><strong>#${esc(o.remoteOrderId)} · ${esc(o.summary)}</strong>
        <span class="badge-tag">${esc(o.statusText)}</span></div>
        <div>${esc(o.customer?.nickname || '')} · ${money(o.sellPrice)} · ${esc(formatDateVi(o.createdAt))}</div>
        ${admin ? `<small class="tool-note">${esc(o.placedBy?.name || '')} · Giá nguồn ${money(o.costPrice)}</small>` : ''}
        <div class="tool-actions">${button('Cập nhật trạng thái', `data-order="${esc(o.id)}" data-action="refresh"`)}
        ${o.canResume ? button('Chạy / tiếp tục', `data-order="${esc(o.id)}" data-action="resume"`, 'btn-violet') : ''}</div></article>`).join('')}</div>
        ${orders.length < total && orderLimit < 500 ? button('Xem thêm đơn', 'data-more') : ''}` : '<p class="tool-note">Chưa có đơn nguồn dự phòng.</p>';
      if (reviews.length) orderList.insertAdjacentHTML('afterbegin', reviews.map(i => `<details class="tool-warning"><summary>
        ${i.status === 'processing' ? 'Đang gửi' : 'Chờ đối soát'} · ${esc(i.summary)} · ${money(i.heldAmount)}</summary>
        <p>${esc(i.userName || '')} · ${esc(i.customer || '')} · ${esc(formatDateVi(i.createdAt))}</p>
        ${admin && i.status !== 'processing' ? `<form class="tool-form-column" data-review="${esc(i.id)}">
          ${i.requiresReview ? '<strong>Kiểm tra chi phí của đơn #' + esc(i.remoteOrderId) + '</strong>' :
          '<label>Kết quả kiểm tra tại nguồn<select class="input-box" required name="resolution"><option value="">Chọn kết quả</option><option value="created">Đã tạo đơn</option><option value="not_created">Chưa tạo đơn, hoàn khoản giữ</option></select></label><div hidden data-created><label>Mã đơn nguồn<input class="input-box" type="number" min="1" name="remoteOrderId"></label><label>Chi phí thực tế (đ)<input class="input-box" type="number" min="0" name="actualCost"></label></div>'}
          <label>Ghi chú đối soát<input class="input-box" name="note" minlength="10" maxlength="500" required></label>
          <label><input type="checkbox" required> Tôi đã kiểm tra giao dịch tại nguồn dự phòng.</label>
          <button class="btn-frost" type="submit">Lưu kết quả đối soát</button><output></output></form>` : ''}</details>`).join(''));
    } catch (error) { if (version === ordersVersion) orderList.textContent = error.message; }
  }
  orderList.addEventListener('click', async event => {
    const btn = event.target.closest('button');
    if (!btn || btn.disabled || btn.type === 'submit') return;
    if (btn.hasAttribute('data-more')) { orderLimit += 20; return loadOrders(); }
    btn.disabled = true;
    try {
      await apiFetch('/api/backup/orders/' + encodeURIComponent(btn.dataset.order) + '/' + btn.dataset.action, 'POST', {});
      await loadOrders();
    } catch (e) { btn.after(document.createTextNode(' ' + e.message)); }
    finally { btn.disabled = false; }
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
    const submit = form.querySelector('button');
    submit.disabled = true;
    try {
      await apiFetch('/api/admin/intents/' + encodeURIComponent(form.dataset.review) + (resolution ? '/reconcile' : '/acknowledge'), 'POST', data);
      await loadOrders();
    } catch (error) { form.querySelector('output').textContent = error.message; }
    finally { submit.disabled = false; }
  };
  container.querySelector('[data-orders-refresh]').onclick = loadOrders;

  function openForm(service) {
    const multi = ['guide', 'weather'].includes(service.key);
    const weatherRow = () => `<div class="tool-actions" data-line><select aria-label="Loại thời tiết" class="input-box" required name="weather">
      ${service.catalog.map(w => `<option value="${w.productId}">${esc(w.name)}</option>`).join('')}</select>
      ${numeric('count', 'Số lần', 1, service.maxPerOrder, 1)} ${button('Bỏ', 'data-remove')}</div>`;
    const duration = ['guide', 'treasure'].includes(service.key) ? numeric('minutes', 'Thời gian thuê (phút)', service.minMinutes, service.maxHours * 60, service.minMinutes) : '';
    editor.innerHTML = `<form class="tool-form-column stat-subcard" style="margin-top:16px">
      <h3>${esc(service.title)}</h3><fieldset class="tool-form-column" style="border:0;padding:0;margin:0">
      <label>Tên nhân vật${multi ? ' (tối đa 10 tên, cách nhau bằng dấu phẩy)' : ''}
      <input name="charName" class="input-box" required maxlength="${multi ? 1008 : 100}" autocomplete="off"></label>
      ${service.key === 'weather' ? `<div data-lines>${weatherRow()}</div>${button('Thêm loại thời tiết', 'data-add')}` : ''}
      ${service.key === 'guide' ? numeric('bots', 'Số bot', 1, service.maxBots, 1) : ''}${duration}
      ${service.key === 'guide' ? '<fieldset class="tool-actions"><legend>Bản đồ dò</legend>' + [['square','Quảng trường'],['camp','Cắm trại'],['resort','Khu nghỉ dưỡng'],['downtown','Khu trung tâm']].map(([k,v]) => `<label><input type="checkbox" name="maps" value="${k}" checked> ${v}</label>`).join(' ') + '</fieldset>' : ''}
      ${service.key === 'seeds' ? numeric('quantity', 'Số hạt', 1, service.maxPerOrder, 1) : ''}
      </fieldset><div aria-live="polite" data-message></div>
      <div class="tool-actions"><button class="btn-violet" type="submit">Xem báo giá</button></div></form>`;
    const form = editor.querySelector('form'), fields = form.querySelector('fieldset');
    const submit = form.querySelector('[type=submit]'), message = form.querySelector('[data-message]');
    let selection, busy = false;
    function reset() {
      selection = null;
      submit.textContent = 'Xem báo giá';
      message.textContent = '';
    }
    form.oninput = reset;
    form.onclick = event => {
      if (event.target.closest('[data-add]')) {
        form.querySelector('[data-lines]').insertAdjacentHTML('beforeend', weatherRow());
        reset();
      }
      if (event.target.closest('[data-remove]') && form.querySelectorAll('[data-line]').length > 1) {
        event.target.closest('[data-line]').remove();
        reset();
      }
    };
    form.onsubmit = async event => {
      event.preventDefault();
      if (busy) return;
      const data = new FormData(form);
      const input = { category: 'backup_' + service.key, charName: String(data.get('charName') || '').trim() };
      for (const key of ['bots', 'minutes', 'quantity']) if (data.has(key)) input[key] = Number(data.get(key));
      if (service.key === 'guide') input.maps = data.getAll('maps');
      if (service.key === 'weather') input.items = Array.from(form.querySelectorAll('[data-line]'), line =>
        ({ productId: Number(line.querySelector('select').value), count: Number(line.querySelector('input').value) }));
      const key = JSON.stringify(input);
      const placing = selection && selection.key === key;
      busy = true; fields.disabled = true; submit.disabled = true;
      try {
        if (!placing) {
          const quote = await apiFetch('/api/backup/quote', 'POST', input);
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
          const fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
          const pending = JSON.parse(sessionStorage.getItem(pendingStorage) || '{}');
          const previous = pending[fingerprint];
          selection = { key, fingerprint, price: previous?.price ?? quote.sellPrice, requestKey: previous?.requestKey || crypto.randomUUID() };
          message.textContent = previous ? 'Yêu cầu trước đang chờ kết quả. Giá đã xác nhận ' + money(previous.price) :
            `${quote.summary} · ${admin ? 'Giá nguồn ' + money(quote.costPrice) + ' · Giá CTV ' : 'Trừ ví CTV '}${money(quote.sellPrice)}`;
          submit.textContent = previous ? 'Kiểm tra yêu cầu đã gửi' : 'Xác nhận đặt đơn';
        } else {
          const { fingerprint, requestKey } = selection;
          const pending = JSON.parse(sessionStorage.getItem(pendingStorage) || '{}');
          sessionStorage.setItem(pendingStorage, JSON.stringify({ ...pending, [fingerprint]: { requestKey, price: selection.price } }));
          const result = await apiFetch('/api/orders/place', 'POST', { ...input, expected_price: selection.price, idempotency_key: requestKey });
          forgetRequest(fingerprint);
          if (state.user && !admin) { state.user.balance = result.userBalance; updateShellAuthUI(); }
          reset(); form.reset();
          message.textContent = 'Đã tạo đơn #' + result.order.remoteOrderId + '.';
          await loadOrders();
        }
      } catch (error) {
        if (placing && error.status && error.status < 500 && error.code !== 'ORDER_REVIEW_REQUIRED') {
          forgetRequest(selection.fingerprint);
          reset();
        }
        message.textContent = error.message;
        if (placing && !error.status) message.textContent += ' Bấm xác nhận lại để kiểm tra cùng mã yêu cầu.';
        if (placing) await loadOrders();
      } finally { busy = false; fields.disabled = false; submit.disabled = false; }
    };
    form.elements.charName.focus();
  }
  function forgetRequest(fingerprint) {
    const pending = JSON.parse(sessionStorage.getItem(pendingStorage) || '{}');
    delete pending[fingerprint];
    sessionStorage.setItem(pendingStorage, JSON.stringify(pending));
  }
  async function loadCatalog() {
    const refresh = root.querySelector('[data-refresh]');
    refresh.disabled = true;
    editor.replaceChildren(); catalog.textContent = 'Đang tải dịch vụ…';
    try {
      const result = await apiFetch('/api/backup/services');
      services = result.services;
      catalog.innerHTML = `<div class="pricing-cat-grid">${services.map(s => `
        <article class="pricing-cat-card"><div class="panel-title-row"><strong>${esc(s.title)}</strong>
        <span class="badge-tag ${s.enabled === true ? 'green' : 'amber'}">${s.enabled === true ? 'Hoạt động' : s.enabled === false ? 'Tạm ngưng' : 'Chưa có trạng thái'}</span></div>
        ${s.key === 'emptymap' && Number.isInteger(s.free) ? `<small class="tool-note">Còn ${s.free} map trống</small>` : ''}
        ${s.enabled === true ? button('Chọn dịch vụ', `data-service="${esc(s.key)}"`) : ''}</article>`).join('')}</div>`;
    } catch (e) { catalog.textContent = e.message; }
    finally { refresh.disabled = false; }
  }
  catalog.onclick = event => {
    const service = services.find(s => s.key === event.target.closest('[data-service]')?.dataset.service);
    if (service?.enabled) openForm(service);
  };
  root.querySelector('[data-refresh]').onclick = loadCatalog;
  loadCatalog(); loadOrders();
}
