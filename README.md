# ZnPlay

Ứng dụng Node.js / Express quản lý đơn Play Together và tài khoản CTV.

## Chạy tại máy

Yêu cầu Node.js từ 22.16 trở lên. Phiên bản được kiểm tra: 24.15.0.

1. Chạy `npm ci`.
2. Sao chép `.env.example` thành `.env` và điền các biến cấu hình.
3. Chạy `npm start`, mở http://localhost:3000.
4. Chạy `npm test` để kiểm tra.

Lần chạy đầu với cơ sở dữ liệu mới cần `ADMIN_PASSWORD` dài 12–128 ký tự.
Tên đăng nhập mặc định là `admin`, có thể đặt qua `ADMIN_USERNAME`.
Không tạo tài khoản CTV mẫu. Admin tạo CTV trong giao diện quản trị.

Nếu đã có `data/db.json`, ứng dụng giữ tài khoản, mật khẩu và số dư hiện có.
`ADMIN_PASSWORD` chỉ dùng khi khởi tạo cơ sở dữ liệu mới. Đổi mật khẩu tài khoản
hiện có bằng chức năng trong giao diện admin.

## Biến môi trường

| Biến | Mục đích |
| --- | --- |
| `ADMIN_USERNAME` | Tên tài khoản admin khi khởi tạo, mặc định `admin` |
| `ADMIN_EMAIL` | Email admin khi khởi tạo, tùy chọn |
| `ADMIN_PASSWORD` | Mật khẩu admin khi khởi tạo, bắt buộc với dữ liệu mới |
| `HOANNGUYEN_EMAIL` | Email đăng nhập nguồn chính |
| `HOANNGUYEN_PASSWORD` | Mật khẩu đăng nhập nguồn chính |
| `DATA_DIR` | Thư mục lưu dữ liệu, mặc định `data` cạnh `server.js` |
| `PORT` | Cổng HTTP, mặc định `3000`; Render tự cung cấp |
| `HOST` | Địa chỉ lắng nghe, mặc định `0.0.0.0` |

Biến tài khoản nguồn, khi có giá trị, được ưu tiên hơn cấu hình đã lưu trong database.
Nếu thay tài khoản nguồn qua Environment trên Render, cần triển khai lại dịch vụ.

## Đưa lên Render để thử

Kết nối repo GitHub bằng Blueprint `render.yaml` hoặc tạo **Web Service** thủ công:

- Runtime: Node.
- Build Command: `npm ci`.
- Start Command: `npm start`.
- Health Check: `/api/health`.
- Nhập mật khẩu admin và thông tin nguồn tại **Environment** của Render.

Blueprint sử dụng gói Free, phù hợp kiểm tra giao diện và luồng đăng nhập.
File JSON trên Render Free có thể mất thay đổi khi dịch vụ ngủ, khởi động lại hoặc
triển khai lại. Không dùng cách lưu này cho ví và đơn cần giữ lâu dài.
Trước khi cho CTV sử dụng số dư thật, cần chuyển sang cơ sở dữ liệu bền vững
hoặc gắn persistent disk trên dịch vụ trả phí rồi đặt `DATA_DIR` vào thư mục trên disk.
Chỉ chạy một instance khi dùng database JSON.

Nạp ví, đặt đơn và hoàn ví đều hoạt động trên Render Free, không yêu cầu persistent
disk. Admin cấp số dư nội bộ cho CTV trên ZnPlay; khi CTV đặt đơn, ZnPlay trừ ví CTV
theo giá bán và gửi đơn sang HoanNguyen, nơi tài khoản nguồn thanh toán chi phí thực tế.
Nạp ví CTV không tự chuyển tiền hay nạp vào tài khoản HoanNguyen.
Sao lưu dữ liệu riêng trước khi đổi thư mục lưu trữ hoặc triển khai lại.

## Quyền và đối soát CTV

- CTV chỉ xem và thao tác đơn của mình; quyền được kiểm tra theo cả danh mục và mã đơn.
- Mỗi yêu cầu tạo đơn có mã chống trùng. Tiền được giữ và lưu trước khi gửi nguồn.
- Khi không xác định được nguồn đã tạo đơn hay chưa, giữ nguyên khoản giữ tiền,
  khóa đặt tiếp và đưa vào danh sách admin đối soát. Không tự gửi lại yêu cầu.
- CTV gửi yêu cầu hủy; admin duyệt hủy tại nguồn. Lịch sử không bị xóa.
- Không tự hoàn toàn bộ tiền khi hủy. Admin nhập tổng tiền nguồn đã hoàn và xác nhận;
  tiền hoàn CTV bị giới hạn theo phần đã đối soát, có chống hoàn trùng.
- Admin xem hoạt động, yêu cầu chờ xử lý và hoạt động gần nhất của CTV.
  Lưu tối đa 5.000 sự kiện gần nhất, hiển thị 200; nhật ký không ghi mật khẩu/token.
- Phiên đăng nhập hết hạn sau 12 giờ; khóa hoặc đổi mật khẩu CTV sẽ thu hồi phiên.
  Token trình duyệt được giữ trong sessionStorage của từng tab.
- Nhóm **Công cụ** có tìm khách hàng để đặt đơn bằng tên hoặc Role ID.
  Mục trích xuất tên/ID Game để phiên bản sau, chưa mở API hay thao tác thực tế.
- Buff thời tiết hiện chỉ xem lịch sử, chưa mở tạo đơn mới.

Ứng dụng kết nối nguồn thật: tạo đơn trong lúc thử vẫn có thể phát sinh chi phí
ở tài khoản nguồn. Các bài kiểm tra tự động dùng dữ liệu giả, không tạo đơn thật.

## Bảo vệ thông tin

Không đưa `.env`, `data/`, token, bản sao lưu, log hoặc `node_modules/` lên GitHub.
Các đường dẫn này được loại bằng `.gitignore`. Kho mã không chứa mật khẩu mặc định.
Không commit dữ liệu ví, phiên đăng nhập hay thông tin khách hàng.
Nếu mật khẩu từng được công khai, đổi mật khẩu tại dịch vụ tương ứng.

Dữ liệu không đọc được sẽ làm máy chủ dừng thay vì tự ghi đè bằng dữ liệu mới.
Luôn sao lưu database riêng trước khi thay đổi cách lưu trữ.
