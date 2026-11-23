# Kịch bản demo (8–10 phút)

Ứng dụng mang tên **Shopia** (logo trong `src/Ecom.Web/wwwroot/img/`).
Mục tiêu: trong thời gian ngắn, cho giám khảo thấy **hệ thống chạy thật** qua luồng giao diện → API → CSDL,
và **6 tình huống khó** chỉ giải quyết gọn được bằng JSON Relational Duality View (TH-1 … TH-6).

## 0. Chuẩn bị (trước giờ bảo vệ, ~5 phút)

```powershell
docker start oracle23ai                       # nếu container đang tắt; đợi ~1-2 phút
.\scripts\db.ps1 reset                         # đưa dữ liệu demo về ban đầu (60 đơn, 36 sản phẩm)
cd src\Ecom.Web; dotnet run --launch-profile http
```
- Mở trình duyệt: <http://localhost:5148> → chọn vai **Quản trị** → menu **Hệ thống** (`/System`): phải báo **thành công, INVALID = 0**. Xong thì bấm "bỏ chọn" vai trò ở trang chủ.
- Mở sẵn DBeaver kết nối `localhost:1521/ecom` (user `ecom_schema`) cho bước 4.
- Mở sẵn một terminal ở thư mục repo cho bước 9.
- Đóng các tab trình duyệt cũ; bỏ chọn vai trò (trang chủ → khu "Bạn là ai?" → "bỏ chọn").

> Nếu **vừa reset** khi web đang chạy thì không cần khởi động lại web (đã xử lý ORA-04068).
> Nếu **cài lại toàn bộ** bằng `.\scripts\db.ps1 install` thì phải khởi động lại web.

## 1. Mở đầu – kiến trúc (0:00–1:00)

**Nói:** "Đề tài yêu cầu cùng một nguồn dữ liệu vừa phục vụ REST API dạng tài liệu JSON, vừa phục vụ báo cáo
trên bảng chuẩn hoá. Nhóm dùng JSON Relational Duality View của Oracle 23ai. Ứng dụng viết bằng ASP.NET Core MVC;
API C# đọc/ghi **trực tiếp** Duality View, còn nghiệp vụ và báo cáo gọi package PL/SQL."

**Làm:** Trang chủ Shopia → chỉ phần hero "một nguồn – hai cách nhìn" (số sản phẩm / đơn / khách lấy thật từ CSDL)
→ cuộn xuống khu **"Bạn là ai?"** chọn
**Khách hàng #1 – Nguyễn Văn An** → "Vào vai khách hàng" (góc phải header hiện avatar + vai trò).
→ Chỉ menu chỉ còn *Tạo đơn / Đơn của tôi / Hồ sơ của tôi* → gõ thẳng địa chỉ **/Reports** → trang **403 – Không có quyền**.

**Nói:** "Đăng nhập là mô phỏng, nhưng quyền được kiểm tra ở server: mọi API và mọi trang đều đọc vai trò; khách hàng
chỉ thấy đơn của mình, không xem được báo cáo – gọi thẳng API cũng nhận 403."

> Thứ tự vai trò trong demo: **khách hàng #1** (bước 1–3) → **người bán #3 – Laptop Pro Shop** (bước 4) →
> **quản trị sàn** (bước 5–9). Đổi vai trò: bấm avatar góc phải header → khu "Bạn là ai?" ở trang chủ.

## 2. TH-1, TH-4 – Tạo cả một đơn bằng một tài liệu JSON (1:00–2:15) · vai trò khách hàng #1

**Làm:** Menu *Tạo đơn* (ô khách bị khoá vào chính mình) → thêm *Samsung Galaxy S24* SL 1, *Áo thun Coolmate* SL 2
→ ở cột giỏ hàng bên phải tick **"Chế độ thử TC-02"** → chỉ khung *Tài liệu JSON sẽ gửi* bên trái (có `status: DELIVERED`,
`unitPrice: 1`, `orderNo: HACK-001`) → *Đặt hàng*.

**Kết quả:** HTTP 201, đơn **PENDING**, số đơn do sequence sinh, giá thật do CSDL lấy, lịch sử ghi bởi `customer:1`.

**Nói:** "Một request, một câu `INSERT INTO order_dv`; Oracle tách ra ORDERS và ORDER_ITEMS, trigger chốt giá, trừ kho,
tính tổng. Giá và trạng thái client gửi bị bỏ qua vì quy tắc nằm ở bảng nền."

## 3. TH-2 – Một nguồn dữ liệu, hai cách nhìn (2:15–3:30) · vai trò khách hàng #1

**Làm:** Bấm *Xem chi tiết đơn* → chỉ thanh tiến trình trạng thái (vẽ từ `history[]` của tài liệu) → tab **Dạng JSON** (ETag, asof, bảng ánh xạ trường → cột) → tab
**Dạng bảng quan hệ** (dòng thật trong 5 bảng, có ROWID) → so sánh vài giá trị giữa hai tab (số đơn, trạng thái, tổng tiền, số dòng hàng).
Khu *Xử lý đơn* của khách hàng chỉ có nút **Huỷ đơn**, thanh toán và sửa địa chỉ / dòng hàng (không tự đổi trạng thái).

**Làm thêm (TC-12):** Trong DBeaver chạy
```sql
UPDATE orders SET ship_phone = '0999888777' WHERE order_no = '<số đơn vừa tạo>'; COMMIT;
```
→ quay lại trang, bấm **Đọc lại cả hai** → tài liệu JSON đổi ngay, ETag đổi.

**Nói:** "Không có bảng nào lưu tài liệu JSON; Oracle sinh tài liệu từ chính các dòng này mỗi lần đọc."

## 4. TH-6 – Thuộc tính JSON linh hoạt (3:30–4:30) · vai trò người bán #3 – Laptop Pro Shop

**Làm:** Trang chủ → "Bạn là ai?" chọn **#3 – Laptop Pro Shop** → "Vào vai người bán" (mở trang sản phẩm, đã lọc sẵn
"Chỉ sản phẩm của shop tôi") → bộ lọc RAM tối thiểu **16 GB** → *Lọc*.
- Chỉ phần "Thuộc tính JSON có trong danh mục" (JSON_DATAGUIDE tự suy ra `cpu`, `ramGb`…).
- Bấm "Câu SQL lọc vừa chạy" (góc phải thanh kết quả): `CONNECT BY` (cây danh mục) + `JSON_VALUE(... '$.ramGb' RETURNING NUMBER)`.
- Bấm nút **JSON** trên một laptop → xoá dòng `"brand"` trong `attributes` → *Lưu* → **422 – Thuộc tính JSON không đúng JSON Schema**.
- (Tuỳ chọn) bỏ tick "Chỉ sản phẩm của shop tôi", mở JSON một điện thoại Samsung → hộp thoại **chỉ xem** (không có nút Lưu).

**Nói:** "Mỗi ngành hàng một kiểu thuộc tính, lưu ở cột JSON; JSON Schema khai báo ngay trên kiểu cột nên ghi qua
tài liệu hay qua SQL đều bị chặn. Người bán chỉ sửa được sản phẩm của shop mình."

## 5. TH-3 – Giao dịch nguyên tử (4:30–5:15) · vai trò quản trị sàn

**Làm:** Trang chủ → "Vào vai quản trị" → *Tạo đơn* (quản trị đặt hộ, mặc định khách #1) → *Samsung Galaxy S24* SL 1
+ *Samsung Galaxy A15* SL **999** → *Đặt hàng*.

**Kết quả:** **409 – Hết hàng (ORA-20001)**; mở "Chuỗi lỗi gốc từ Oracle": ORA-42692 bọc ORA-20001.
Tồn kho S24 trong bảng sản phẩm **không đổi** – dòng hợp lệ cũng bị huỷ theo.

## 6. TH-5 – Hai người cùng sửa một đơn (5:15–6:30) · vai trò quản trị sàn

**Làm:** Trang chủ → khu *Lối tắt demo* → thẻ TH-5 mở **đơn #60** ở hai tab.
- Tab 1: khu *Xử lý đơn* → mục 3 sửa *Điện thoại* → **Lưu tài liệu** → 200, ETag mới.
- Tab 2 (vẫn giữ ETag cũ): sửa *Địa chỉ* → **Lưu tài liệu** → **412 – Xung đột ETag (ORA-42699)**.

**Nói:** "Client gửi ETag qua header If-Match; Oracle tự so với ETag hiện tại nên không có lost update."

## 7. Nghiệp vụ trạng thái, huỷ, hoàn tiền (6:30–7:30)

**Làm:** Đơn #60 (PENDING) → ô *Thử chuyển tới* chọn **DELIVERED** → *Gửi (kể cả sai)* → **422 ORA-20002**.
→ bấm **→ CONFIRMED** (nút hợp lệ do hàm `fn_is_valid_transition` trong CSDL tính).
→ *Ghi thanh toán* (chuyển khoản, đủ số tiền) → **Huỷ đơn** → thanh toán chuyển **REFUNDED**, tồn kho được hoàn
(xem tab bảng quan hệ: `payments.status`, lịch sử có 3 dòng).

## 8. Báo cáo trên bảng chuẩn hoá (7:30–8:30)

**Làm:** Mở **đơn #59** (đang SHIPPING) → **→ DELIVERED**. Menu *Báo cáo* → R1 có ngay dòng **2026-11**,
R4 chuyển một đơn sang cột DELIVERED. Chỉ R2 (dòng tổng phụ ROLLUP), mở "Lời gọi & mã PL/SQL" của R1
(`SUM() OVER`, `LAG`).

**Nói:** "Báo cáo chạy trên bảng, không qua Duality View; vì cùng một nguồn nên số liệu mới có ngay, không cần đồng bộ."

## 9. Đồng thời và kiểm thử tự động (8:30–9:30)

```powershell
node tests/api_test_cases.mjs
```
Chỉ dòng **TC-10**: 20 request đồng thời mua sản phẩm còn 5 → `201=5, 409=15, tồn sau=0`; dòng cuối **TỔNG: 16/16 PASS**.

**Nói:** "Trừ kho là một câu UPDATE có điều kiện `stock_qty >= :qty`; ở READ COMMITTED, phiên đến sau chờ khoá rồi
Oracle đánh giá lại điều kiện trên giá trị mới nhất, nên không bao giờ bán vượt tồn."

Sau demo: `.\scripts\db.ps1 reset` (kiểm thử tự động có tạo thêm đơn).

## Phương án dự phòng

| Sự cố | Cách xử lý |
|---|---|
| Trang chủ báo lỗi kết nối | `docker ps` xem `oracle23ai` đã chạy chưa; `docker start oracle23ai`, đợi 1–2 phút rồi bấm *Kiểm tra lại* |
| Báo đối tượng INVALID | `.\scripts\db.ps1 reset` (tự biên dịch lại schema) |
| Lỗi 500 ORA-04068 ngay sau khi cài lại toàn bộ | Khởi động lại web (`Ctrl+C`, `dotnet run --launch-profile http`) |
| Dữ liệu đã bị thao tác lung tung | `.\scripts\db.ps1 reset` (~10 giây), tải lại trang |
| Mất mạng | Không ảnh hưởng: ứng dụng, thư viện giao diện và biểu đồ đều chạy offline |

## Câu hỏi vấn đáp hay gặp – trả lời ngắn

- **Vì sao `attributes` lưu JSON thay vì tách bảng?** Thuộc tính khác nhau theo ngành hàng; tách bảng sẽ cần EAV hoặc
  nhiều bảng con. JSON + JSON Schema + chỉ mục hàm vừa linh hoạt vừa kiểm soát được cấu trúc và tốc độ lọc.
- **Duality View giúp gì cho REST API?** API chỉ chạy một câu SELECT/INSERT/UPDATE trên view; không viết mã ráp/tách
  JSON từ nhiều bảng, ghi nhiều bảng trong một giao dịch, có sẵn ETag chống ghi đè.
- **Trigger có gây mutating table không?** Có nếu trigger mức dòng đọc lại chính bảng → dùng compound trigger
  (`trg_oi_totals`, `trg_pay_check`). Với Duality View còn phải tránh trigger sửa các trường tham gia ETag của chính
  tài liệu đang ghi (ORA-40896) → `subtotal/totalAmount` NOCHECK, `status` NOUPDATE.
- **Phân quyền làm ở đâu?** Ở server: `[RequireRole]` trên controller (vai trò nào được gọi chức năng nào) và
  kiểm tra trên từng bản ghi (đơn của ai, đơn có sản phẩm của shop nào, PUT được đổi trường nào). Giao diện chỉ ẩn nút cho
  gọn; gọi thẳng API vẫn nhận 401 / 403 (`tests/api_authz.mjs`, 14 kịch bản). Đăng nhập vẫn mô phỏng (cookie), chưa xác thực thật.
- **Mức cô lập?** READ COMMITTED; đủ vì điều kiện nằm trong câu UPDATE nguyên tử (TC-10).
- **Execution plan trước/sau khác ở bước nào?** Q1: `TABLE ACCESS FULL` + `SORT` → `INDEX RANGE SCAN` + `COUNT STOPKEY`;
  Q2: `TABLE ACCESS FULL` → `INDEX RANGE SCAN` trên cột ảo của chỉ mục hàm; Q3: 3 nhánh `TABLE ACCESS FULL` → `INDEX RANGE SCAN`
  (chi tiết `docs/TOI_UU.md`).
- **Bỏ chỉ mục IX-5 thì sao?** Mỗi lần đọc một đơn quét toàn bộ payments/shipments/history (5.388 thay vì 28 block).
