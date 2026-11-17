export function createToolViews({ state, apiFetch, escapeHtml: esc, showToast, formatVnd: money, formatDateVi: date, renderCurrentView, loadOrders }) {
  const panel = (title, content) => `<section class="glass-panel"><div class="panel-title-row"><span class="panel-title-text">${title}</span></div>${content}</section>`;
  const button = (label, attribute, id) => `<button type="button" class="btn-frost" ${attribute}="${esc(id)}">${label}</button>`;

  function renderIdentityToolsHtml() {
    return panel('2. Trích xuất tên nhân vật / ID Game', '<p class="tool-note">Chưa mở. Tính năng này sẽ được bổ sung ở phiên bản sau.</p>');
  }

  function bindIdentityToolsEvents() {}

  async function loadAdminMonitor() {
    if (state.user?.role !== 'admin') return;
    try {
      const response = await apiFetch('/api/admin/monitor');
      if (state.user?.role !== 'admin') return;
      state.adminMonitor = response;
      if (state.currentView === 'admin_monitor') renderCurrentView();
    } catch (error) { showToast(error.message); }
  }

  function renderAdminMonitorHtml() {
    const data = state.adminMonitor;
    if (!data) return panel('Giám sát & đối soát CTV', `<p class="tool-note">Đang tải nhật ký hoạt động...</p>${button('Tải dữ liệu', 'data-refresh-monitor', '')}`);
    const statuses = { processing: 'Đang gửi nguồn', uncertain: 'Chưa xác định kết quả', completed: 'Có chênh lệch chi phí' };
    const presence = (data.ctvs || []).map(user => {
      const online = user.lastSeenAt && Date.now() - Date.parse(user.lastSeenAt) < 120000;
      return `<tr><td>${esc(user.name)}<div class="tool-note">${esc(user.username)}</div></td><td>${money(user.balance)}</td><td>${user.isLocked ? '<span class="badge-tag red">Đã khóa</span>' : online ? '<span class="badge-tag green">Hoạt động gần đây</span>' : 'Không có hoạt động gần đây'}</td><td>${date(user.lastSeenAt)}</td></tr>`;
    }).join('');
    const intents = (data.intents || []).map(intent => `<tr><td>${esc(intent.userName)}<div class="tool-note">${date(intent.createdAt)}</div></td><td>${esc(intent.summary || intent.category)}<div class="tool-note">${esc(intent.id)}</div></td><td>${money(intent.heldAmount)}<div class="tool-note">Chi phí dự kiến: ${money(intent.expectedCost)}</div></td><td>${esc(statuses[intent.status] || intent.status)}</td><td>${intent.status === 'uncertain' ? button('Đối soát nguồn', 'data-reconcile-intent', intent.id) : intent.requiresReview ? button('Ghi nhận chênh lệch', 'data-ack-intent', intent.id) : 'Đợi phản hồi nguồn'}</td></tr>`).join('');
    const cancellations = (data.cancellations || []).map(order => `<tr><td>${esc(order.placedBy?.name)}<div class="tool-note">${esc(order.categoryName)} #${esc(order.remoteOrderId)}</div></td><td>${esc(order.summary)}</td><td>${money(order.sellPrice)}<div class="tool-note">Đã hoàn CTV: ${money(order.refundedAmount || 0)}</div></td><td>${order.status === 'cancelled' ? 'Đã hủy tại nguồn, chờ đối soát tiền' : 'CTV yêu cầu hủy; nguồn có thể vẫn chạy'}</td><td>${order.status === 'cancelled' ? button('Hoàn tiền đã đối soát', 'data-refund-order', order.id) : button('Hủy tại nguồn', 'data-cancel-source', order.id)}</td></tr>`).join('');
    const events = (data.events || []).map(event => `<tr><td>${date(event.createdAt)}</td><td>${esc(event.actorName)}<div class="tool-note">${esc(event.actorRole)}</div></td><td>${esc(event.action)}</td><td>${esc(JSON.stringify(event.details || {}))}</td></tr>`).join('');
    const table = (headers, rows) => `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(title => `<th>${title}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}">Chưa có dữ liệu</td></tr>`}</tbody></table></div>`;
    return panel('Giám sát CTV', `<div class="tool-actions"><span class="badge-tag ${data.storageHealthy ? 'green' : 'red'}">${data.storageHealthy ? 'Lưu trữ đang hoạt động' : 'Lỗi ghi dữ liệu: tạm dừng giao dịch'}</span>${button('Làm mới', 'data-refresh-monitor', '')}</div><p class="tool-note">Tự cập nhật mỗi 30 giây khi đang mở trang. Nhật ký chỉ admin được xem; không ghi mật khẩu hay token.</p>${table(['CTV', 'Số dư', 'Trạng thái', 'Hoạt động gần nhất'], presence)}`)
      + panel('Yêu cầu cần kiểm tra', table(['CTV', 'Đơn / yêu cầu', 'Tiền giữ', 'Kết quả', 'Xử lý'], intents))
      + panel('Yêu cầu hủy / hoàn tiền', `<p class="tool-note">Chỉ hoàn ví sau khi kiểm tra nguồn. Hủy đơn không tự động hoàn toàn bộ tiền.</p>${table(['CTV / nguồn', 'Đơn', 'Giá bán', 'Trạng thái', 'Thao tác'], cancellations)}`)
      + panel('200 hoạt động gần nhất', table(['Thời điểm', 'Tài khoản', 'Hoạt động', 'Kết quả / đối soát'], events));
  }

  function openReviewModal(title, content, handler) {
    const overlay = document.getElementById('appModalOverlay');
    const box = document.getElementById('appModalBox');
    const body = document.getElementById('appModalBody');
    box.className = 'modal-box';
    document.getElementById('appModalTitle').textContent = title;
    body.innerHTML = `<form id="reviewForm" class="tool-form tool-form-column">${content}<label>Ghi chú đối soát<textarea class="input-box" name="note" minlength="10" maxlength="500" required placeholder="Mã đơn nguồn, kết quả đã kiểm tra, số tiền đã nhận lại..."></textarea></label><label class="tool-check"><input type="checkbox" name="confirmed" required /> Tôi đã kiểm tra dữ liệu thực tế tại nguồn chính.</label><button type="submit" class="btn-violet">Xác nhận kết quả đối soát</button></form>`;
    overlay.style.display = 'flex';
    const form = body.querySelector('#reviewForm');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      if (submit.disabled) return;
      submit.disabled = true;
      try {
        const response = await handler(form);
        overlay.style.display = 'none';
        body.innerHTML = '';
        showToast(response.message);
        await loadAdminMonitor();
      } catch (error) { showToast(error.message); }
      finally { submit.disabled = false; }
    });
  }

  const readReview = form => ({ note: form.elements.note.value.trim(), confirmed: form.elements.confirmed.checked });
  function bindAdminMonitorEvents() {
    document.querySelectorAll('[data-refresh-monitor]').forEach(control => control.addEventListener('click', loadAdminMonitor));
    document.querySelectorAll('[data-reconcile-intent]').forEach(control => control.addEventListener('click', () => {
      const intent = state.adminMonitor.intents.find(item => item.id === control.dataset.reconcileIntent);
      openReviewModal(`Đối soát: ${intent.userName}`, `<p class="tool-note">Yêu cầu này không tự gửi lại. Chỉ xác nhận sau khi kiểm tra nguồn đã tạo đơn hay chưa.</p><label>Kết quả<select class="input-box" name="resolution" required><option value="">Chọn sau khi kiểm tra nguồn</option><option value="created">Nguồn đã tạo đơn</option><option value="not_created">Nguồn xác nhận chưa tạo đơn — trả khoản giữ</option></select></label><label>Mã đơn nguồn (nếu đã tạo)<input class="input-box" name="remoteOrderId" type="number" min="1" step="1" /></label><label>Chi phí thực tế ở nguồn (nếu đã tạo)<input class="input-box" name="actualCost" type="number" min="0" step="1" /></label>`, form => apiFetch(`/api/admin/intents/${encodeURIComponent(intent.id)}/reconcile`, 'POST', { ...readReview(form), resolution: form.elements.resolution.value, remoteOrderId: form.elements.remoteOrderId.value === '' ? null : Number(form.elements.remoteOrderId.value), actualCost: form.elements.actualCost.value === '' ? null : Number(form.elements.actualCost.value) }));
    }));
    document.querySelectorAll('[data-ack-intent]').forEach(control => control.addEventListener('click', () => {
      openReviewModal('Ghi nhận chênh lệch chi phí nguồn', '<p class="tool-note">Thao tác này ghi nhận admin đã kiểm tra chi phí, không tự trừ thêm tiền ví CTV.</p>', form => apiFetch(`/api/admin/intents/${encodeURIComponent(control.dataset.ackIntent)}/acknowledge`, 'POST', readReview(form)));
    }));
    document.querySelectorAll('[data-cancel-source]').forEach(control => control.addEventListener('click', async () => {
      const order = state.adminMonitor.cancellations.find(item => item.id === control.dataset.cancelSource);
      if (!confirm(`Hủy đơn ${order.categoryName} #${order.remoteOrderId} tại nguồn? Chưa tự động hoàn ví CTV.`)) return;
      control.disabled = true;
      try {
        const response = await apiFetch(`/api/orders/${encodeURIComponent(order.category)}/${encodeURIComponent(order.remoteOrderId)}`, 'DELETE', { deletion_note: 'Admin duyệt yêu cầu hủy từ CTV' });
        showToast(response.message);
        await loadAdminMonitor();
        await loadOrders();
      } catch (error) { showToast(error.message); }
      finally { control.disabled = false; }
    }));
    document.querySelectorAll('[data-refund-order]').forEach(control => control.addEventListener('click', () => {
      const order = state.adminMonitor.cancellations.find(item => item.id === control.dataset.refundOrder);
      const key = crypto.randomUUID();
      openReviewModal(`Hoàn ví đơn #${order.remoteOrderId}`, `<p class="tool-note">Nhập tổng tiền nguồn đã hoàn cho đơn, bao gồm các lần trước. Hoàn CTV bị giới hạn theo tỷ lệ tiền nguồn đã hoàn; không thể hoàn trùng hoặc vượt giá trị đơn.</p><label>Tổng tiền nguồn đã hoàn (VNĐ, lũy kế)<input class="input-box" name="sourceRefund" type="number" min="${order.sourceRefunded || 0}" max="${order.costPrice}" value="${order.sourceRefunded || 0}" step="1" required /></label><label>Hoàn thêm vào ví CTV (VNĐ)<input class="input-box" name="amount" type="number" min="1" max="${Math.max(0, order.sellPrice - (order.refundedAmount || 0))}" step="1" required /></label>`, form => apiFetch(`/api/admin/orders/${encodeURIComponent(order.id)}/refund`, 'POST', { ...readReview(form), sourceRefund: Number(form.elements.sourceRefund.value), amount: Number(form.elements.amount.value), idempotency_key: key }));
    }));
  }

  return { renderIdentityToolsHtml, bindIdentityToolsEvents, loadAdminMonitor, renderAdminMonitorHtml, bindAdminMonitorEvents };
}
