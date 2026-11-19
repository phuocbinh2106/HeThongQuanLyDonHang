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
| `03_indexes.sql` | Chỉ mục IX-2..IX-4 (IX-1, 5, 6 để dành cho phần tối ưu) | ecom_schema |
| `04_pkg_order.sql` | Package nghiệp vụ `PKG_ORDER` | ecom_schema |
| `05_triggers.sql` | 6 trigger (2 compound) | ecom_schema |
| `06_duality_views.sql` | `ORDER_DV`, `PRODUCT_DV`, `CUSTOMER_DV` | ecom_schema |
| `07_pkg_order_rpt.sql` | Package báo cáo R1–R6 | ecom_schema |
| `08_seed.sql` | Dữ liệu mẫu (60 đơn, 36 sản phẩm, 10 khách...) | ecom_schema |
| `install_all.sql` | Gọi 01→08 theo thứ tự | ecom_schema |
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
Mở <http://localhost:5148>. Trang chủ có ô **Kiểm tra kết nối** gọi `GET /api/system/health`;
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

### Màn hình và API đã có

| Mã | Màn hình | API | CSDL |
|---|---|---|---|
| — | Trang chủ, kiểm tra kết nối | `GET /api/system/health` | `v$version`, `user_json_duality_views` |
| M1 | Sản phẩm (`/Products`): lọc theo danh mục (cả danh mục con), hãng, RAM, bộ nhớ, size; xem/sửa/thêm sản phẩm bằng tài liệu JSON | `GET /api/products`, `GET/PUT /api/products/{id}` (ETag / If-Match), `POST /api/products`, `GET /api/products/facets` | Lọc: `JSON_VALUE`, `JSON_EXISTS ... PASSING`, `CONNECT BY` trên bảng `products`; dữ liệu: tài liệu `PRODUCT_DV`; thuộc tính động: `JSON_DATAGUIDE` |

| M2 | Tạo đơn (`/Orders/Create`): chọn khách → địa chỉ từ sổ địa chỉ, giỏ hàng, xem trước tài liệu JSON gửi đi, chế độ thử gửi giá/trạng thái giả | `POST /api/orders` (201 + ETag + Location), `GET /api/orders/{id}`, `GET /api/customers`, `GET/PUT /api/customers/{id}` | Một câu `INSERT INTO order_dv`; trigger chốt giá, trừ kho, tính tổng, ghi lịch sử |

| M4 | Chi tiết đơn (`/Orders/Details/{id}`): tab **JSON** (tài liệu `ORDER_DV` + ETag + asof) và tab **bảng quan hệ** (dòng thật trong 5 bảng, kèm ROWID), tự đối chiếu 9 điểm giữa hai cách nhìn | `GET /api/orders/{id}`, `GET /api/orders/{id}/relational` | `ORDER_DV` và `SELECT` thẳng trên `orders`, `order_items`, `payments`, `shipments`, `order_status_history` |

Minh hoạ TC-12 ở M4: sửa bảng bằng SQL thuần (DBeaver) → bấm "Đọc lại cả hai" → tài liệu JSON đổi ngay.

Ca lỗi minh hoạ được ở M2: một dòng vượt tồn → **409** (ORA-20001), cả đơn huỷ, tồn kho không đổi (TC-03);
sản phẩm ngừng bán → **422** (ORA-20003, TC-04); giảm giá > tiền hàng → **422** (ORA-20007, TC-13);
gửi `status`/`unitPrice`/`subtotal` giả → bị bỏ qua (TC-02).

Ca lỗi minh hoạ được ở M1: sửa tài liệu bằng ETag cũ → **412** (ORA-42699);
xoá `brand` trong `attributes` → **422** (JSON Schema, ORA-40875 / ORA-02290).

## Tài liệu

- [`docs/THAY_DOI_THIET_KE.md`](docs/THAY_DOI_THIET_KE.md): các thay đổi so với thiết kế ban đầu và
  phát hiện khi chạy trên Oracle thật (đọc trước khi cập nhật báo cáo).
- [`docs/test-logs/`](docs/test-logs/): log kiểm thử thật.
- `docs/Nganh_HTTT__CNPM_DBMS_25_De_Tai_Do_An_Cuoi_Ky.pdf`: đề bài và rubric.
