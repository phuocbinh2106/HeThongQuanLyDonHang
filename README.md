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
git clone https://github.com/<tai-khoan>/HeThongQuanLyDonHang.git
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

**5. Ứng dụng web (ASP.NET Core MVC)** — *đang xây dựng*, hướng dẫn sẽ bổ sung tại đây.

## Tài liệu

- [`docs/THAY_DOI_THIET_KE.md`](docs/THAY_DOI_THIET_KE.md): các thay đổi so với thiết kế ban đầu và
  phát hiện khi chạy trên Oracle thật (đọc trước khi cập nhật báo cáo).
- [`docs/test-logs/`](docs/test-logs/): log kiểm thử thật.
- `docs/Nganh_HTTT__CNPM_DBMS_25_De_Tai_Do_An_Cuoi_Ky.pdf`: đề bài và rubric.
