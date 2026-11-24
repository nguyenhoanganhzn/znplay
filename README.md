# ZnPlay

Ứng dụng Node.js / Express quản lý đơn Play Together và tài khoản CTV.

## Chạy tại máy

Yêu cầu Node.js từ 22.16 trở lên. Phiên bản được kiểm tra: 24.15.0.

1. Chạy `npm ci`.
2. Sao chép `.env.example` thành `.env` và điền các biến cấu hình.
3. Chạy `npm start`, mở http://localhost:3000.
4. Chạy `npm test` để kiểm tra.

Trên Windows, chạy `.\scripts\install-local.ps1` trong PowerShell để khởi động
localhost bằng Task Scheduler. Tác vụ **ZnPlay Localhost** chạy dưới tài khoản
hiện tại, tự chạy khi đăng nhập và kiểm tra mỗi phút để khởi động lại nếu tác vụ đã dừng.
Máy cần bật và thức để nhận kết nối.

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
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL riêng tư. Khi có giá trị, ứng dụng đọc và ghi vào PostgreSQL |
| `PORT` | Cổng HTTP, mặc định `3000`; Render tự cung cấp |
| `HOST` | Địa chỉ lắng nghe, mặc định `0.0.0.0` |

Biến tài khoản nguồn, khi có giá trị, được ưu tiên hơn cấu hình đã lưu trong database.
Nếu thay tài khoản nguồn qua Environment trên Render, cần triển khai lại dịch vụ.

## Chuyển dữ liệu hiện có sang Neon (Miễn phí vĩnh viễn)

### Cách nhanh nhất (Cửa hàng mới hoặc muốn giữ dữ liệu từ giờ trở đi)
1. Đăng ký miễn phí tại [neon.tech](https://neon.tech) (không cần thẻ tín dụng, miễn phí 0.5 GB & 100 CU-giờ/tháng — quá dư cho dưới 10 CTV).
2. Tạo Project mới → bấm **Connect** → copy chuỗi `DATABASE_URL` (`postgresql://...`).
3. Dán `DATABASE_URL` vào **Render → Environment** (đảm bảo đã có `ADMIN_PASSWORD`) → Deploy lại.
4. Hệ thống sẽ tự khởi tạo bảng PostgreSQL lần đầu. Kiểm tra `/api/health` thấy `storage: "postgresql"`. Từ lúc này toàn bộ tài khoản CTV, số dư ví, đơn hàng và bảng giá sẽ **không bao giờ bị mất** khi Render ngủ hoặc tắt.
5. Nếu muốn mang dữ liệu từ localhost lên hosting, mở **Quản trị → Cấu hình Nguồn API → Tải bản sao lưu JSON** ở localhost rồi **Khôi phục từ file JSON** trên hosting (hoặc dùng CLI `npm run db:import` bên dưới).

### Chuyển bằng CLI (`npm run db:import`)
1. Trước khi redeploy Render hoặc thay biến môi trường, ngừng các thao tác làm
   thay đổi dữ liệu và lấy bản sao riêng của `data/db.json` đang phục vụ.
2. Đặt `DATABASE_URL` trong `.env`; đặt `DATA_DIR` trỏ đến thư mục chứa bản sao chính thức. Giữ file này ngoài Git.
3. Chạy `npm ci` và `npm run db:import`. Lệnh nhập tài khoản, phiên, giá,
   số dư, giao dịch, đơn, yêu cầu đối soát và nhật ký trong một giao dịch và từ chối ghi đè database ZnPlay đã có dữ liệu.
4. Đặt cùng `DATABASE_URL` trong Render Environment và triển khai một instance.

### Giữ Render Free phản hồi nhanh (tùy chọn miễn phí)
Render Free ngủ sau 15 phút không có truy cập. Bạn có thể tạo 1 monitor miễn phí trên **UptimeRobot** hoặc **cron-job.org** gọi `GET https://<domain-của-bạn>/api/ping` mỗi 10 phút trong khung giờ bán hàng để trang luôn nóng và phản hồi tức thì.

Khi `DATABASE_URL` đã cấu hình, lỗi PostgreSQL kéo dài khiến API tạm ngừng phục vụ để bảo vệ số dư; lỗi ngắt kết nối tạm thời khi Neon thức dậy sẽ tự động thử lại.
Mỗi môi trường chạy một tiến trình ghi. Dùng database hoặc nhánh Neon riêng
cho localhost để hai môi trường không tiếp quản dữ liệu của nhau.

Đặt `TEST_DATABASE_URL` vào môi trường chạy `npm test` để chạy thêm kiểm thử
tích hợp PostgreSQL. Bài kiểm thử tạo rồi dọn một schema riêng.

## Đưa lên Render

Kết nối repo GitHub bằng Blueprint `render.yaml` hoặc tạo **Web Service** thủ công:

- Runtime: Node.
- Build Command: `npm ci`.
- Start Command: `npm start`.
- Health Check: `/api/health`.
- Nhập mật khẩu admin và thông tin nguồn tại **Environment** của Render.

Blueprint sử dụng Render Free. Dịch vụ ngủ sau 15 phút không có truy cập và có
thể mất khoảng một phút để thức dậy. Để tránh chế độ ngủ do vắng truy cập,
cần dùng compute trả phí. Neon giữ dữ liệu khi tiến trình Render khởi động lại.
Nếu để trống `DATABASE_URL`, ứng dụng dùng JSON tại `DATA_DIR`; tệp trên ổ tạm
của Render có thể mất khi triển khai lại hoặc khi dịch vụ ngủ. [Render Free](https://render.com/docs/free)

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
- Sau 15 giây kể từ lúc tạo, CTV có thể xóa đơn Buff Thời Tiết của mình khi đơn còn trống và chưa chạy.
  Sau khi nguồn xác nhận xóa, ví nhận lại đúng giá CTV đã đặt. Giao dịch hoàn được giữ trong sổ ví.
  Nếu nguồn mất kết nối trong lúc xóa, admin kiểm tra đơn tại nguồn rồi dùng **Đối soát xóa đơn** ở bảng Buff Thời Tiết.
- Trong **Giám sát & đối soát CTV**, mục **Admin phải thanh toán** cộng hạn mức nguồn đã dùng trong tuần với tổng số dư của tất cả CTV.
- Admin xem hoạt động, yêu cầu chờ xử lý và hoạt động gần nhất của CTV.
  Lưu tối đa 5.000 sự kiện gần nhất, hiển thị 200; nhật ký không ghi mật khẩu/token.
- Phiên đăng nhập hết hạn sau 12 giờ; khóa hoặc đổi mật khẩu CTV sẽ thu hồi phiên.
  Token trình duyệt được giữ trong sessionStorage của từng tab.
- Trong **Công cụ → Trích xuất ID Game / Tên nhân vật**, nhập tên, Role ID dạng số
  hoặc mã nhân vật `XXXX-XXXX-XXXX` để tra cứu từ client game của HoanNguyen.
  Mỗi kết quả có nút sao chép riêng cho tên và từng dạng ID.

Ứng dụng kết nối nguồn thật: tạo đơn trong lúc thử vẫn có thể phát sinh chi phí
ở tài khoản nguồn. Các bài kiểm tra tự động dùng dữ liệu giả, không tạo đơn thật.

## Bảo vệ thông tin

Không đưa `.env`, `data/`, token, bản sao lưu, log hoặc `node_modules/` lên GitHub.
Các đường dẫn này được loại bằng `.gitignore`. Kho mã không chứa mật khẩu mặc định.
Không commit dữ liệu ví, phiên đăng nhập hay thông tin khách hàng.
Nếu mật khẩu từng được công khai, đổi mật khẩu tại dịch vụ tương ứng.

Dữ liệu không đọc được sẽ làm máy chủ dừng thay vì tự ghi đè bằng dữ liệu mới.
Luôn sao lưu database riêng trước khi thay đổi cách lưu trữ.
