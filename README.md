# Hệ thống quản lý đơn hàng cho sàn thương mại điện tử

Đồ án cuối kỳ môn **Các hệ quản trị cơ sở dữ liệu** — HUFLIT — **Đề tài 15**
Công nghệ trọng tâm: **Oracle Database 23ai – JSON Relational Duality Views**

| Thành viên | MSSV |
|---|---|
| Tống Phước Bình | 24DH110200 |
| Nguyễn Thị Khánh Uyên | 24DH112109 |
| Hoàng Hồng Minh Anh | 24DH112475 |

Giảng viên hướng dẫn: ThS. Lê Hồng Thúy Vũ

## Bài toán

Cung cấp **đồng thời** giao diện **tài liệu JSON** cho front-end (REST API) và **bảng quan hệ chuẩn
hoá cho báo cáo**, dùng **chung một nguồn dữ liệu**. Ba Duality View `ORDER_DV`, `PRODUCT_DV`,
`CUSTOMER_DV` cho phép đọc/ghi cả một đơn hàng bằng một tài liệu JSON, trong khi dữ liệu thật vẫn
nằm ở 10 bảng chuẩn hoá — nơi đặt toàn bộ ràng buộc, trigger và báo cáo SQL.

## Cấu trúc thư mục

```
├─ CLAUDE.md                 # bản giao việc / đặc tả chi tiết của đồ án
├─ docker-compose.yml        # Oracle 23ai Free cho máy mới
├─ .env.example              # mẫu biến môi trường (copy thành .env, KHÔNG commit .env)
├─ scripts/db.ps1            # chạy script SQL bằng SQL*Plus có sẵn trong container
├─ sql/                      # toàn bộ schema, PL/SQL, Duality View, dữ liệu mẫu, kiểm thử
└─ docs/                     # đề bài, báo cáo, nhật ký thay đổi thiết kế, log kiểm thử
```

### Các script SQL (chạy theo thứ tự)

| File | Nội dung | Chạy bằng |
|---|---|---|
| `00_setup_pdb.sql` | Tạo PDB `ecom`, tablespace, user `ecom_schema`, cấp quyền | SYS (CDB `FREE`) |
| `01_drop_all.sql` | Xoá sạch schema (khi cần cài lại) | ecom_schema |
| `02_tables.sql` | 10 bảng, sequence, ràng buộc, JSON Schema cho `products.attributes` | ecom_schema |
| `03_indexes.sql` | Chỉ mục IX-2..IX-4 | ecom_schema |
| `03b_indexes_toi_uu.sql` | Chỉ mục IX-1, IX-5, IX-6 thêm sau khi đo tối ưu (xem `docs/TOI_UU.md`) | ecom_schema |
| `04_pkg_order.sql` | Package nghiệp vụ `PKG_ORDER` | ecom_schema |
| `05_triggers.sql` | 6 trigger (2 compound) | ecom_schema |
| `06_duality_views.sql` | `ORDER_DV`, `PRODUCT_DV`, `CUSTOMER_DV` | ecom_schema |
| `07_pkg_order_rpt.sql` | Package báo cáo R1–R6 | ecom_schema |
| `08_seed.sql` | Dữ liệu mẫu (60 đơn, 36 sản phẩm, 10 khách...) | ecom_schema |
| `09_bulk_data.sql` | (Tuỳ chọn) dữ liệu lớn để đo tối ưu: 200.000 đơn, 50.000 sản phẩm… | ecom_schema |
| `10_toi_uu_Q1_Q3.sql` + `toi_uu/` | Đo execution plan trước / sau tối ưu (Q1–Q3 và câu SQL của M1, M3) | ecom_schema |
| `11_ords_autorest.sql` | (Tuỳ chọn) Bật ORDS AutoREST cho 3 Duality View, cần container ORDS (`scripts/ords.ps1`) | ecom_schema |
| `install_all.sql` | Gọi 01→08 theo thứ tự (kể cả 03b) | ecom_schema |
| `t00_reset.sql` | Đưa dữ liệu về ban đầu trước khi demo | ecom_schema |
| `t01_smoke_test.sql`, `t02_test_cases.sql` | Kiểm thử mức CSDL, tự in PASS/FAIL | ecom_schema |

## Chạy lại từ đầu trên máy mới (Windows)

Yêu cầu: Docker Desktop, .NET SDK 10 trở lên, Git. (Không cần cài Oracle Client — script dùng
SQL*Plus có sẵn trong container.)

**1. Lấy mã nguồn và cấu hình**
```powershell
git clone https://github.com/phuocbinh2106/HeThongQuanLyDonHang.git
cd HeThongQuanLyDonHang
copy .env.example .env
```
Mở `.env`, đổi `ORACLE_PWD` (mật khẩu SYS). Nếu máy **đã có** container Oracle 23ai, chỉ cần
đặt `ORACLE_CONTAINER` bằng tên container đó và bỏ qua bước 2.

**2. Khởi động Oracle 23ai Free**
```powershell
docker login container-registry.oracle.com
docker compose up -d
docker compose ps
```
Lần đầu mất vài phút; đợi trạng thái `healthy` (hoặc `docker logs -f oracle23ai` thấy
`DATABASE IS READY TO USE!`).

**3. Tạo PDB `ecom` và user `ecom_schema`** (chỉ một lần)
```powershell
.\scripts\db.ps1 setup-pdb
```

**4. Cài schema + dữ liệu mẫu, rồi chạy kiểm thử mức CSDL**
```powershell
.\scripts\db.ps1 install
.\scripts\db.ps1 test
```
Kết quả mong đợi: không có dòng lỗi trong phần "Kiểm tra đối tượng lỗi", và mọi dòng `TC-xx` đều
`PASS`. Sau khi chạy test, đưa dữ liệu về trạng thái ban đầu:
```powershell
.\scripts\db.ps1 reset
```
> Nếu PowerShell chặn chạy script: `powershell -ExecutionPolicy Bypass -File .\scripts\db.ps1 install`

**Dùng DBeaver thay cho script:** kết nối `localhost:1521`, service `ecom`, user `ecom_schema`;
mở và chạy (Alt+X) lần lượt từng file `01` → `08`. DBeaver không hiểu lệnh `@file`. Nếu DBeaver
hỏi *Bind parameters* (`:NEW`, `:OLD`) thì tắt ở *Preferences → Editors → SQL Editor → SQL Processing*.

**5. Chạy ứng dụng web (ASP.NET Core MVC, .NET 10)**

Mật khẩu CSDL **không** nằm trong mã nguồn. Lưu một lần bằng user-secrets (nằm ngoài thư mục repo):
```powershell
cd src\Ecom.Web
dotnet user-secrets set "EcomDb:Password" "oracle"
```
(hoặc đặt biến môi trường `ECOM_DB_PASSWORD`). Chuỗi kết nối không mật khẩu nằm ở
`src/Ecom.Web/appsettings.json` (`localhost:1521/ecom`, user `ecom_schema`).

```powershell
dotnet run --launch-profile http
```
Mở <http://localhost:5148>, chọn vai trò **Quản trị** rồi vào menu **Hệ thống** (trang `/System`, chỉ quản trị) – trang này gọi `GET /api/system/health`;
phải thấy "Kết nối Oracle thành công" và "Đối tượng INVALID = 0".

### Kiến trúc ứng dụng

```
Trình duyệt (Razor View + JavaScript fetch, wwwroot/js/api.js)
        │  JSON
ASP.NET Core MVC (src/Ecom.Web)
  ├─ Controllers/        → trả View (HTML)
  ├─ Controllers/Api/    → /api/... trả JSON (REST)
  ├─ Infrastructure/     → OracleExceptionFilter: OracleException → ProblemDetails + mã HTTP
  ├─ Services/           → OracleErrorMapper: ORA-200xx / 42699 / 40875... → 409 / 412 / 422
  └─ Data/               → OracleConnectionFactory (ODP.NET, gắn CLIENT_IDENTIFIER)
        │
Oracle 23ai – PDB ecom – schema ecom_schema
  ├─ Duality View ORDER_DV, PRODUCT_DV, CUSTOMER_DV   (đường JSON)
  └─ 10 bảng + PKG_ORDER + trigger + PKG_ORDER_RPT    (đường quan hệ / báo cáo)
```

### Giao diện Shopia

Giao diện mang thương hiệu **Shopia** (logo: `src/Ecom.Web/wwwroot/img/`), bố cục theo kiểu các sàn TMĐT phổ biến:
header có ô tìm kiếm + giỏ hàng + vai trò, menu ngang, trang chủ có hero / danh mục / sản phẩm, thẻ sản phẩm dạng lưới,
trang tạo đơn kiểu thanh toán, tab trạng thái đơn, thanh tiến trình vòng đời đơn. Màu lấy từ logo (xanh rêu – xanh ngọc –
vàng), định nghĩa bằng biến CSS ở `wwwroot/css/site.css`; biểu tượng là SVG vẽ sẵn trong `wwwroot/js/shopia.js`, nên giao
diện không cần mạng. CSDL không lưu ảnh sản phẩm, nên ảnh trên thẻ là hình minh hoạ vẽ theo danh mục + thương hiệu.

### Tài liệu REST API (Swagger) – `/api-docs`

Mở <http://localhost:5148/api-docs> để xem và gọi thử toàn bộ 22 endpoint (Swagger UI, sinh bằng Swashbuckle từ các
API controller và chú thích `///`; tài liệu OpenAPI ở `/api-docs/v1/swagger.json`). Cấu hình ở
`src/Ecom.Web/Infrastructure/SwaggerSetup.cs`:
- Endpoint chia nhóm theo Duality View / package (`ORDER_DV + PKG_ORDER`, `PRODUCT_DV`, `CUSTOMER_DV`, `PKG_ORDER_RPT`).
- Các lệnh PUT có ô header **If-Match** (dán ETag từ lần GET trước) để thử TH-5: ETag cũ → 412.
- Lệnh tạo đơn / sản phẩm / khách có sẵn **ví dụ tài liệu JSON**, bấm *Try it out → Execute* là chạy.
- Phần mô tả có bảng ánh xạ mã lỗi Oracle → HTTP.

### Phân quyền theo vai trò

Đăng nhập vẫn **mô phỏng** (chọn vai trò ở trang chủ → cookie `ecom_user` = `customer:N` / `seller:N` / `admin`), nhưng
**quyền được kiểm tra ở server**, không chỉ ẩn nút trên giao diện:

| Chức năng | Vãng lai | Khách hàng | Người bán | Quản trị |
|---|---|---|---|---|
| Trang chủ, xem sản phẩm | ✔ | ✔ | ✔ | ✔ |
| Đăng bán / sửa sản phẩm, đổi ảnh | ✘ | ✘ | chỉ sản phẩm của shop mình | ✔ |
| Tạo đơn | ✘ | chỉ cho chính mình | ✘ | ✔ |
| Danh sách / chi tiết đơn | ✘ | chỉ đơn của mình | chỉ đơn có sản phẩm của shop | ✔ |
| Đổi trạng thái đơn | ✘ | ✘ (chỉ được huỷ) | đơn có sản phẩm của shop | ✔ |
| Sửa đơn: địa chỉ, dòng hàng, thanh toán | ✘ | đơn của mình | ✘ | ✔ (mọi trường) |
| Sửa đơn: thêm vận đơn (shipments[]) | ✘ | ✘ | đơn có sản phẩm của shop | ✔ |
| Khách hàng / sổ địa chỉ | ✘ | chỉ hồ sơ của mình (không tự đổi status) | ✘ | ✔ |
| Báo cáo, Hệ thống (kiểm tra kết nối) | ✘ | ✘ | ✘ | ✔ |

- `Infrastructure/AccessControl.cs`: đọc vai trò (cookie sai định dạng = vãng lai), thuộc tính `[RequireRole(...)]` gắn lên
  controller / action. API trả **401** (chưa chọn vai trò) / **403** (không đủ quyền) dạng ProblemDetails; trang MVC hiện trang
  "Không có quyền" (`Views/Shared/Forbidden.cshtml`).
- Quyền trên **từng bản ghi**: đơn của khách nào / có sản phẩm của người bán nào (`OrderRepository.GetAccessAsync`), sản phẩm
  thuộc shop nào; khi PUT tài liệu đơn, so tài liệu mới với tài liệu hiện tại để biết **trường nào bị đổi** và chặn trường
  không thuộc quyền của vai trò (ví dụ khách hàng tự đặt `discount` → 403). ETag được so **trước** (bản cũ → 412, không báo
  nhầm thành 403); khách hàng chỉ được **thêm** thanh toán, không sửa dòng đã có; chỉ quản trị đổi được khách của đơn
  (`customer.customerId`) và người bán không đổi được shop của sản phẩm (`seller.sellerId`) – vì Duality View sẽ đổi luôn
  khoá ngoại `orders.customer_id` / `products.seller_id` nếu client đổi khoá của object con.
- `[RequireRole]` là **bộ lọc phân quyền** (`IAuthorizationFilter`): chạy trước khi đọc body, nên người không đủ quyền luôn
  nhận 401 / 403 chứ không phải 400.
- Danh sách đơn: khách hàng luôn bị giới hạn `customer_id` = chính mình (bỏ qua tham số client gửi); người bán chỉ thấy đơn có
  sản phẩm của shop (`EXISTS` trên `order_items` ⋈ `products`).
- Màn hình chọn vai trò dùng `GET /api/session/customers` (chỉ mã + họ tên); `GET /api/customers` đầy đủ chỉ dành cho quản trị.
- Kiểm thử: `node tests/api_authz.mjs` – 22 kịch bản AZ-01…AZ-22 (gọi thẳng API và trang bằng từng vai trò). AZ-16 tạo
  một sản phẩm thử (INACTIVE) kèm ảnh; chạy `.scriptsdb.ps1 reset` sau khi kiểm thử để dữ liệu về như ban đầu.

### Tìm khách hàng phía server

Không màn hình nào tải danh sách **tất cả** khách: các ô chọn khách (lọc đơn của quản trị, tạo đơn, chọn vai trò) là ô
"gõ để gợi ý" (`customerPicker` trong `wwwroot/js/shopia.js`), mỗi lần gõ gọi `GET /api/customers?q=...&limit=8`;
trang Khách hàng tải từng trang 20 khách ("Xem thêm"). CSDL lọc theo mã KH / họ tên / email / SĐT rồi cắt trang bằng
`OFFSET … FETCH NEXT`, trả `{ total, items }`; họ tên so sánh bằng `COLLATE BINARY_AI` nên gõ "nguyen" vẫn ra "Nguyễn".

### ORDS AutoREST (tuỳ chọn) – REST do Oracle tự sinh

ORDS (Oracle REST Data Services) bật **AutoREST** cho 3 Duality View: Oracle tự sinh REST API đầy đủ (GET / POST / PUT,
ETag, phân trang) mà không viết dòng code nào – so sánh với API C# nhóm tự viết.

```powershell
.scriptsords.ps1 start                      # lần đầu: tải image + cài ORDS vào PDB ecom (vài phút), cổng 8181
.scriptsdb.ps1 file 11_ords_autorest.sql    # bật AutoREST (một lần, lưu trong CSDL)
.scriptsords.ps1 status                     # thử GET http://localhost:8181/ords/ecom/order_dv/1
```

- URL: `http://localhost:8181/ords/ecom/order_dv/{id}` (tương tự `product_dv`, `customer_dv`). **Không xác thực** – chỉ
  dùng demo trên máy cá nhân; ORDS không đi qua phân quyền theo vai trò của API C#, nhưng mọi quy tắc nghiệp vụ ở bảng nền
  (trigger, ràng buộc, JSON Schema) vẫn chạy: `POST` một đơn quá tồn kho qua ORDS → `ORA-20001`, đơn không được tạo.
- Trang **C# và ORDS** (`/Ords`, chỉ quản trị): cùng một đơn đọc qua `GET /api/orders/{id}` và qua ORDS (cùng dữ liệu, cùng
  ETag); nút ghi thử qua ORDS. Trình duyệt gọi ORDS qua `/api/ords/{view}/{id}` (web chuyển tiếp, vì khác cổng sẽ bị CORS);
  ORDS chưa chạy → 503 "ORDS chưa chạy", các trang khác không ảnh hưởng.
- `scripts/ords.ps1` gọi thẳng `ords install --password-stdin` (mật khẩu SYS đọc từ container Oracle lúc chạy, không lưu
  trong repo) và bật `debug.printDebugToScreen` để ORDS trả chi tiết lỗi Oracle thay vì "ORDS-25001 Bad Request" (chỉ dùng demo).
- Kiểm thử: `node tests/ords_test.mjs` (ORDS-01…03).

### Đăng bán sản phẩm và ảnh sản phẩm

- **Đăng bán** (`/Products/Create`, menu "Đăng bán", chỉ người bán và quản trị): biểu mẫu thông tin chung (cột bảng
  `products`), thuộc tính theo ngành hàng (cột JSON `attributes`; gợi ý khoá từ `JSON_DATAGUIDE` của danh mục), ảnh.
  JavaScript ráp **một tài liệu JSON** (hiện ở khung bên phải) rồi `POST /api/products` → `INSERT INTO product_dv`.
  Người bán luôn đăng cho shop mình (server ép `seller.sellerId`); thiếu `brand` hoặc bảo hành âm → JSON Schema của cột
  từ chối (422); trùng SKU → 409.
- **Ảnh sản phẩm** là tệp trên server, **không lưu trong CSDL** (Đ16 trong `docs/THAY_DOI_THIET_KE.md`):
  `GET /api/products/{id}/image` trả ảnh người bán tải lên (`App_Data/uploads/products/{id}.*`, không commit, bị xoá khi
  `db.ps1 reset` / `install`), nếu không có thì ảnh mẫu `wwwroot/img/products/{id}.jpg`, không có nữa thì 404 và giao diện
  hiện biểu tượng danh mục. `POST /api/products/{id}/image` (multipart, JPG/PNG/WEBP ≤ 2 MB, kiểm tra chữ ký tệp): người bán
  của shop sở hữu sản phẩm hoặc quản trị; trong hộp thoại tài liệu ở trang Sản phẩm có nút **Đổi ảnh**.
- Ảnh mẫu của 36 sản phẩm và 7 danh mục lấy từ Wikimedia Commons / Openverse với giấy phép tự do (CC0, Public Domain,
  CC BY, CC BY-SA); tác giả, giấy phép và đường dẫn ảnh gốc ghi ở `src/Ecom.Web/wwwroot/img/CREDITS.md`.

### Màn hình và API đã có

| Mã | Màn hình | API | CSDL |
|---|---|---|---|
| M0 | Trang chủ: **chọn vai trò** (khách hàng / người bán / quản trị – mô phỏng), lối tắt demo TH-1..TH-6 | `GET /api/system/stats`, `GET /api/sellers`, `GET /api/customers?q=&limit=` | Vai trò (cookie `ecom_user`) → `CLIENT_IDENTIFIER` → trigger ghi `changed_by`; khách: tự lọc "đơn của tôi"; người bán: tự lọc sản phẩm của shop |
| M1 | Sản phẩm (`/Products`): lọc theo danh mục (cả danh mục con), hãng, RAM, bộ nhớ, size; xem/sửa/thêm sản phẩm bằng tài liệu JSON, đổi ảnh; **Đăng bán** (`/Products/Create`) bằng biểu mẫu | `GET /api/products`, `GET/PUT /api/products/{id}` (ETag / If-Match), `POST /api/products`, `GET /api/products/facets`, `GET/POST /api/products/{id}/image` | Lọc: `JSON_VALUE`, `JSON_EXISTS ... PASSING`, `CONNECT BY` trên bảng `products`; dữ liệu: tài liệu `PRODUCT_DV`; thuộc tính động: `JSON_DATAGUIDE` |
| M2 | Tạo đơn (`/Orders/Create`): chọn khách → địa chỉ từ sổ địa chỉ, giỏ hàng, xem trước tài liệu JSON gửi đi, chế độ thử gửi giá/trạng thái giả | `POST /api/orders` (201 + ETag + Location), `GET /api/orders/{id}`, `GET /api/customers?q=&limit=`, `GET/PUT /api/customers/{id}` | Một câu `INSERT INTO order_dv`; trigger chốt giá, trừ kho, tính tổng, ghi lịch sử |
| M3 | Danh sách đơn (`/Orders`): lọc theo khách ("Đơn của tôi"), trạng thái (nút lọc nhanh có số đếm), khoảng ngày, số đơn; phân trang 20 đơn | `GET /api/orders?customerId=&status=&from=&to=&q=&page=&pageSize=` | Bảng quan hệ `orders` (không qua Duality View); lọc theo khách có đúng dạng truy vấn **Q1** (`WHERE customer_id = :cust ORDER BY order_date DESC FETCH NEXT 20`) để đo tối ưu với chỉ mục IX-1 |
| M4 | Chi tiết đơn (`/Orders/Details/{id}`): tab **JSON** (tài liệu `ORDER_DV` + ETag + asof) và tab **bảng quan hệ** (dòng thật trong 5 bảng, kèm ROWID) | `GET /api/orders/{id}`, `GET /api/orders/{id}/relational` | `ORDER_DV` và `SELECT` thẳng trên `orders`, `order_items`, `payments`, `shipments`, `order_status_history` |
| M5 | Xử lý đơn (khu "Xử lý đơn" trên trang chi tiết): đổi trạng thái (nút hợp lệ do CSDL tính + ô "thử chuyển sai"), huỷ, ghi thanh toán qua **procedure hoặc payments[]**, sửa địa chỉ/dòng hàng, thêm vận đơn | `PUT /api/orders/{id}` (If-Match), `GET .../next-statuses`, `POST .../status`, `POST .../cancel`, `POST .../payments` | Đường JSON: `UPDATE order_dv`; đường quan hệ: `pkg_order.sp_change_status`, `sp_cancel_order`, `sp_record_payment`; `fn_is_valid_transition` gọi trong SQL (BOOLEAN 23ai) |
| M6 | Báo cáo (`/Reports`): R1 doanh thu tháng + luỹ kế + tăng trưởng, R2 người bán × danh mục có tổng phụ, R3 top N mỗi danh mục, R4 ma trận tháng × trạng thái, R5 tỉ lệ huỷ/trả, R6 doanh thu theo thương hiệu (JSON); bảng + biểu đồ CSS; xem mã PL/SQL từ `USER_SOURCE` | `GET /api/reports/{r1..r6}?from=&to=&top=&months=`, `GET /api/reports/{code}/source` | `PKG_ORDER_RPT` trả `SYS_REFCURSOR` (ODP.NET `OracleRefCursor`); `SUM() OVER`, `LAG`, `ROLLUP`, `DENSE_RANK`, `PIVOT`, `JSON_VALUE`; tham số sai → 422 (ORA-20010) |
| M7 | Khách hàng (`/Customers`): hồ sơ + sổ địa chỉ là một tài liệu; thêm / sửa / xoá địa chỉ, đổi mặc định rồi lưu một lần; tạo khách mới kèm địa chỉ | `GET /api/customers?q=&limit=&offset=`, `GET/PUT /api/customers/{id}` (If-Match), `POST /api/customers` | `CUSTOMER_DV` (customers + customer_addresses): một câu UPDATE thực hiện cả INSERT/UPDATE/DELETE địa chỉ; email trùng → 409 (ORA-00001) |

Minh hoạ ở M5: TC-05 (sai trạng thái → 422), TC-06 (sửa dòng hàng khi đã khoá → 409), TC-07 (huỷ → hoàn kho, khoản đã trả chuyển REFUNDED – TC-16;
huỷ đơn SHIPPING → 422), TC-08 (vượt tổng → 422 ở cả hai kênh), **TC-09 (mở đơn ở hai tab, tab lưu sau → 412)**.
Đổi `status` bằng cách ghi tài liệu → 422 (ORA-40940, trạng thái chỉ đổi qua procedure).

Kiểm thử qua kênh web (PASS/FAIL, gồm TC-10 đồng thời): `node tests/api_test_cases.mjs`; kịch bản minh hoạ thêm: `node tests/api_order_lifecycle.mjs`, `node tests/api_customer_doc.mjs` (cần web đang chạy; xong thì `.\scripts\db.ps1 reset`).

Minh hoạ TH-2 ở M6: giao xong một đơn ở màn hình xử lý đơn → báo cáo R1/R4 có ngay số liệu mới (không đồng bộ, không bản sao).

Minh hoạ TC-12 ở M4: sửa bảng bằng SQL thuần (DBeaver) → bấm "Đọc lại cả hai" → tài liệu JSON đổi ngay.

Ca lỗi minh hoạ được ở M2: một dòng vượt tồn → **409** (ORA-20001), cả đơn huỷ, tồn kho không đổi (TC-03);
sản phẩm ngừng bán → **422** (ORA-20003, TC-04); giảm giá > tiền hàng → **422** (ORA-20007, TC-13);
gửi `status`/`unitPrice`/`subtotal` giả → bị bỏ qua (TC-02).

Ca lỗi minh hoạ được ở M1: sửa tài liệu bằng ETag cũ → **412** (ORA-42699);
xoá `brand` trong `attributes` → **422** (JSON Schema, ORA-40875 / ORA-02290).

## Tài liệu

- [`docs/BaoCao_DoAn_DeTai15_Chuong1-5_capnhat.docx`](docs/BaoCao_DoAn_DeTai15_Chuong1-5_capnhat.docx): **báo cáo đã cập nhật** theo ứng dụng thật
  (Chương 3–5 viết lại cho ASP.NET Core + ODP.NET, số liệu kiểm thử và tối ưu đo thật; Bảng 5.2 phân công thành viên). Bản gốc trước khi cập nhật đã xoá khỏi
  thư mục, vẫn lấy lại được từ lịch sử git (commit e6c4085 trở về trước).
- [`docs/PHAN_CONG_THANH_VIEN.md`](docs/PHAN_CONG_THANH_VIEN.md): phân công 3 thành viên, tệp cần nắm và câu hỏi vấn đáp của từng người.
- [`docs/KICH_BAN_BAO_CAO.docx`](docs/KICH_BAN_BAO_CAO.docx): kịch bản buổi báo cáo với giảng viên (10 phút, chia vai 3 người, lời thoại, dự phòng, chuẩn bị vấn đáp, truy vấn mẫu).
- [`docs/KICH_BAN_DEMO.md`](docs/KICH_BAN_DEMO.md): kịch bản demo 8–10 phút, phương án dự phòng, câu hỏi vấn đáp hay gặp.
- [`docs/THAY_DOI_THIET_KE.md`](docs/THAY_DOI_THIET_KE.md): các thay đổi so với thiết kế ban đầu và
  phát hiện khi chạy trên Oracle thật (đọc trước khi cập nhật báo cáo).
- [`docs/TOI_UU.md`](docs/TOI_UU.md): tối ưu hoá – execution plan và số liệu trước / sau trên 200.000 đơn (cho Chương 4).
- [`docs/KET_QUA_KIEM_THU.md`](docs/KET_QUA_KIEM_THU.md): tổng hợp kết quả kiểm thử TC-01..TC-16 ở tầng CSDL và tầng web (cho Chương 4).
- [`docs/test-logs/`](docs/test-logs/): log kiểm thử thật.
- `docs/Nganh_HTTT__CNPM_DBMS_25_De_Tai_Do_An_Cuoi_Ky.pdf`: đề bài và rubric.
