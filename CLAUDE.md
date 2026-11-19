# CLAUDE.md – Đồ án CHQTCSDL, Đề tài 15: Hệ thống quản lý đơn hàng cho sàn thương mại điện tử

> File này là bản giao việc cho Claude Code. Đặt ở **thư mục gốc của repo** để Claude Code tự đọc.
> **Luôn trả lời người dùng bằng tiếng Việt**, giải thích dễ hiểu, vì người dùng phải tự giải thích được mã khi vấn đáp.

---

## 1. Người dùng và yêu cầu

Tôi là sinh viên năm 3, chuyên ngành **Công nghệ phần mềm (nâng cao)**, Trường Đại học Ngoại ngữ – Tin học TP.HCM (**HUFLIT**). Tôi đang làm **đồ án cuối kỳ môn Các hệ quản trị cơ sở dữ liệu** (Oracle Database 23ai), nhóm 3 người:

| Thành viên | MSSV |
|---|---|
| Tống Phước Bình | 24DH110200 |
| Nguyễn Thị Khánh Uyên | 24DH112109 |
| Hoàng Hồng Minh Anh | 24DH112475 |

Giảng viên hướng dẫn: ThS. Lê Hồng Thúy Vũ.

**Đề tài số 15** (Nhóm 5 — JSON & JSON Relational Duality, Chương 4; CLO2, CLO4, CLO5):

| Tên đề tài | Mô tả bài toán / phạm vi | Công nghệ Oracle 23ai trọng tâm |
|---|---|---|
| Hệ thống quản lý đơn hàng cho sàn thương mại điện tử | Cung cấp **đồng thời** giao diện **JSON document** cho ứng dụng front-end (**REST API**) và **bảng quan hệ chuẩn hoá cho báo cáo**, dùng **chung một nguồn dữ liệu**. | **JSON Relational Duality Views** |

**Tôi cần Claude Code:**
1. Nghiên cứu đề tài, rồi đề xuất thiết kế CSDL và chức năng web phù hợp (đã có sẵn một bản thiết kế ở mục 5–6, hãy rà soát và cải tiến thay vì làm lại từ đầu).
2. Xây dựng **một ứng dụng web** để triển khai và minh hoạ CSDL, trong đó thể hiện rõ **mọi điều nêu trong mô tả bài toán** và **công nghệ trọng tâm** ở bảng trên.
3. Yêu cầu công nghệ:
   - Viết trên **Visual Studio Code**.
   - Kiến trúc **MVC**.
   - **Back-end: C#** (ASP.NET Core MVC).
   - **Front-end: JavaScript** (chạy trong các view của MVC).
   - **Database: Oracle Database 23ai chạy trong Docker.**
4. **Đẩy toàn bộ mã nguồn lên GitHub** giúp tôi.
5. Triển khai (cài đặt, chạy thử trên Oracle thật, sửa lỗi) giúp tôi luôn.

---

## 2. Yêu cầu bắt buộc của đồ án (trích đề bài của giảng viên)

Đề bài gốc: `docs/Nganh_HTTT__CNPM_DBMS_25_De_Tai_Do_An_Cuoi_Ky.pdf` (nếu đã chép vào repo).

- Dùng **Oracle Database 23ai** (Free hoặc Enterprise); khuyến khích chạy bằng **Docker** (theo Lab 1).
- Tối thiểu **5 bảng quan hệ**; tối thiểu **1 package, 2 trigger (hoặc compound trigger), 3 procedure/function, có xử lý exception**.
- Phải có **ít nhất một tình huống "khó"** chỉ giải quyết được bằng đúng công nghệ trọng tâm (ở đây là Duality View).
- Script tạo schema + **dữ liệu mẫu đủ minh hoạ mọi nghiệp vụ**; toàn bộ mã nguồn (SQL/PL-SQL, cấu hình Docker) nộp kèm báo cáo.
- **Tối thiểu 5 kịch bản kiểm thử** cho nghiệp vụ lõi (có trường hợp biên/lỗi).
- **Tối ưu hoá:** tối thiểu **2 truy vấn**, có **execution plan trước và sau** khi tối ưu.
- **BẮT BUỘC có ứng dụng chạy được** (web/mobile) với giao diện thao tác thật, gọi qua **lớp API/back-end** tới Oracle.
  - Demo chỉ bằng SQL*Plus/SQL Developer/DBeaver là **điểm liệt (0 điểm cả phần thi cuối kỳ)**.
  - Ứng dụng phải thao tác được các nghiệp vụ cốt lõi qua giao diện. Không yêu cầu giao diện đẹp; chấm luồng **giao diện ↔ API ↔ CSDL**.
- Được dùng AI để sinh mã giao diện/API. **Lõi CSDL (schema, Duality View, PL/SQL, trigger, truy vấn) sinh viên phải tự hiểu và giải thích được từng dòng.**
- Điểm liệt cũng áp dụng nếu: hệ thống không chạy khi demo, phát hiện sao chép, hoặc không giải thích được mã mình viết.

**Rubric (100 điểm):** Phân tích & thiết kế CSDL 15 · Cài đặt kỹ thuật cốt lõi 20 · Chất lượng mã & tối ưu 10 · **Ứng dụng minh hoạ 15** · Báo cáo 10 · Slide & trình bày 10 · **Vấn đáp 20**.

**Thứ tự ưu tiên chấm:** hệ thống chạy đúng khi demo **>** vận dụng đúng công nghệ trọng tâm **>** xử lý biên/ngoại lệ **>** báo cáo/slide.

**Vấn đáp (5–7 phút/người, hỏi riêng từng người), 3 vòng:**
1. Giải thích một đoạn code bất kỳ (giám khảo chọn ngẫu nhiên).
2. Câu hỏi tình huống: "Nếu yêu cầu đổi thành… thì sửa gì?", "Nếu bỏ trigger/index này thì sao?"
3. Viết thêm một truy vấn nhỏ hoặc sửa PL/SQL/API ngay tại chỗ.

**Câu hỏi gợi ý cho nhóm JSON/Duality và các nhóm liên quan:**
- Vì sao trường này lưu JSON thay vì tách bảng?
- Duality View giúp gì cho việc xây REST API so với cách truyền thống?
- Trigger có gây mutating table không, xử lý bằng compound trigger thế nào?
- Hai giao dịch cùng kích hoạt trigger thì có nhất quán không?
- Mức cô lập giao dịch đang dùng là gì, vì sao?
- Execution plan trước/sau khác nhau ở bước nào?

---

## 3. Môi trường và trạng thái hiện tại (đọc kỹ trước khi làm)

### 3.1. Máy của người dùng
- Đã có **Docker** và đã pull image **Oracle Database Free 23ai**.
- Đã có **DBeaver** và đã kết nối được Oracle.
- **VS Code** dùng để viết web.
- Chưa có web, chưa có API, chưa cài ORDS.
- Cần kiểm tra lại: `dotnet --version` (cần .NET SDK LTS, ví dụ 8 hoặc mới hơn), `git --version`, `gh --version`. Cài thêm nếu thiếu.

### 3.2. CSDL đã dựng (theo các script trong thư mục `sql/`)
- Container Oracle Free; CDB service `FREE`.
- Đã tạo **PDB `ecom`** bằng `sql/00_setup_pdb.sql` (tablespace `ecom_tablespace`).
- **User/schema `ecom_schema`, mật khẩu `oracle`.** Kết nối: `localhost:1521/ecom`.

### 3.3. Tình trạng các script (TRUNG THỰC)
**Chưa có script nào được chạy trọn vẹn và xác nhận đúng trên Oracle thật.** Những gì người dùng đã báo lại:
1. Khi chạy `05_triggers.sql` trong DBeaver, hiện hộp thoại *Bind parameters* (`:NEW`, `:OLD`). Cách khắc phục: tắt xử lý tham số trong DBeaver (*Preferences → Editors → SQL Editor → SQL Processing*), chạy lại bằng Alt+X. **Chưa xác nhận trigger đã tạo thành công.**
2. Chạy TC-01 (`INSERT INTO order_dv VALUES ('{...}')`) bị lỗi:
   `ORA-42692: Cannot insert into JSON Relational Duality View 'ECOM_SCHEMA'.'ORDER_DV': Error while inserting into table 'ORDER_ITEMS'` / `ORA-32795: cannot insert into a generated always identity column`.
   - **Đã sửa:** mọi cột identity đổi thành `GENERATED BY DEFAULT ON NULL AS IDENTITY` (trong `02_tables.sql`), kèm `02b_fix_identity.sql` để ALTER bảng đã tạo.
   - **Chưa xác nhận** người dùng đã chạy bản sửa và TC-01 đã qua chưa.

**Việc đầu tiên Claude Code phải làm:** kiểm tra trạng thái thật của CSDL trước khi viết web. Gợi ý:
```sql
SELECT object_name, object_type, status FROM user_objects ORDER BY object_type, object_name;
SELECT name, type, line, position, text FROM user_errors ORDER BY name, sequence;
SELECT banner_full FROM v$version;   -- Duality View dạng SQL cần 23.4 trở lên
```
Sau đó chạy `sql/t01_smoke_test.sql`. Nếu còn lỗi, **sửa script trước, chưa làm web**.

---

## 4. Các file có sẵn (chép vào repo)

| File | Nội dung |
|---|---|
| `sql/00_setup_pdb.sql` | Tạo PDB `ecom`, tablespace, user `ecom_schema`, cấp quyền. Chạy bằng SYS/SYSDBA, service `FREE` (CDB). Đổi tên từ `setup_ecom.sql`. |
| `sql/02_tables.sql` | 10 bảng, `seq_order_no`, ràng buộc PK/FK/UNIQUE/CHECK, `IS JSON VALIDATE` cho `products.attributes`. |
| `sql/02b_fix_identity.sql` | ALTER 10 cột identity sang `BY DEFAULT ON NULL` (chỉ dùng nếu đã tạo bảng bằng bản cũ). |
| `sql/03_indexes.sql` | Chỉ mục IX-2, IX-3, IX-4. IX-1, IX-5, IX-6 **cố ý để lại** cho phần tối ưu (đo trước/sau). |
| `sql/04_pkg_order.sql` | Package `PKG_ORDER`. |
| `sql/05_triggers.sql` | 6 trigger, trong đó 2 compound. Phải chạy **sau** `04`. |
| `sql/06_duality_views.sql` | `ORDER_DV`, `PRODUCT_DV`, `CUSTOMER_DV`. |
| `sql/08_seed.sql` | Dữ liệu mẫu tối thiểu (2 người bán, 2 danh mục, 4 sản phẩm trong đó 1 INACTIVE, 2 khách, 1 địa chỉ). Cần **mở rộng** (xem mục 9). |
| `sql/t01_smoke_test.sql` | Kiểm tra nhanh TC-01, TC-03, TC-05. |
| `docs/BaoCao_DoAn_DeTai15_Chuong1-5.docx` | Báo cáo Chương 1–5. Chương 3–5 do AI viết **trước khi** có ứng dụng C#; mô tả API Node.js/React, **cần cập nhật lại** theo ứng dụng thật. |
| `docs/Nganh_HTTT__CNPM_DBMS_25_De_Tai_Do_An_Cuoi_Ky.pdf` | Đề bài và rubric gốc. |

**Chưa có:**
- `07_pkg_order_rpt.sql` (báo cáo R1–R5).
- `09_bulk_data.sql` (dữ liệu lớn để đo tối ưu).
- `t00_reset.sql` (đưa dữ liệu về trạng thái ban đầu trước demo).
- Script đo tối ưu (Q1–Q3).
- Toàn bộ ứng dụng web.
- `docker-compose.yml`.
- `README.md`.

**Lưu ý DBeaver:** DBeaver không hiểu `@file.sql`. Phải mở từng file và chạy bằng Alt+X; mỗi khối PL/SQL kết thúc bằng dòng `/` đứng riêng. Nếu Claude Code chạy được `sqlplus`/`sql` (SQLcl) trong container thì dùng cách đó để tự động hoá.

---

## 5. Thiết kế CSDL hiện có (rà soát, chỉnh nếu cần)

### 5.1. Mười bảng
- `customers`
- `customer_addresses` (1–N với khách)
- `sellers`
- `categories` (cây cha–con qua `parent_id`)
- `products`: có cột **`attributes JSON`**, kiểm tra cấu trúc bằng `IS JSON VALIDATE`, bắt buộc có `brand`. Thuộc tính khác nhau theo ngành hàng: điện thoại có `ramGb`, `storageGb`; quần áo có `size`, `material`.
- `orders`
- `order_items`: UNIQUE `(order_id, product_id)`.
- `payments`
- `shipments`
- `order_status_history`: nhật ký trạng thái, **chỉ trigger được ghi**.

Thiết kế ở dạng chuẩn 3NF, với ba điểm phi chuẩn hoá có chủ đích:
- `order_items.unit_price`: giá chốt tại thời điểm mua.
- `orders.ship_receiver`, `ship_phone`, `ship_address`: bản chụp địa chỉ lúc đặt hàng.
- `orders.subtotal`, `total_amount`: dữ liệu dẫn xuất, do trigger tính.

### 5.2. Vòng đời đơn hàng
`PENDING → CONFIRMED → PACKING → SHIPPING → DELIVERED`
- Huỷ (`CANCELLED`) được từ PENDING, CONFIRMED, PACKING.
- `SHIPPING → RETURNED`, `DELIVERED → RETURNED`.
- `CANCELLED` và `RETURNED` là trạng thái cuối. Sang CANCELLED/RETURNED thì **hoàn tồn kho**.

### 5.3. Quy tắc nghiệp vụ và cơ chế
| Mã | Quy tắc | Cơ chế |
|---|---|---|
| BR-01 | Số lượng > 0; đơn phải có ≥ 1 dòng hàng mới được CONFIRMED | CHECK + `trg_ord_status_bu` |
| BR-02 | Chỉ đặt sản phẩm ACTIVE | `pkg_order.sp_reserve_stock` (ORA-20003) |
| BR-03 | Đơn giá lấy từ CSDL, **không tin giá client gửi** | `trg_oi_biud_row` gán `unit_price`, cấm sửa |
| BR-04 | Không bán vượt tồn kho, kể cả khi nhiều đơn đồng thời | Một lệnh `UPDATE ... WHERE stock_qty >= :qty RETURNING price` (nguyên tử). READ COMMITTED là đủ |
| BR-05 | subtotal/total do server tính; discount ≤ subtotal | Compound trigger `trg_oi_totals` (tránh mutating table) → `sp_recalc_totals` (ORA-20007) |
| BR-06 | Chỉ chuyển trạng thái theo sơ đồ | `fn_is_valid_transition` trong `trg_ord_status_bu` (ORA-20002) |
| BR-07 | Ghi lịch sử mọi lần đổi trạng thái | `trg_ord_audit_aiu` |
| BR-08 | Chỉ sửa dòng hàng khi đơn còn PENDING | `trg_oi_biud_row` (ORA-20004) |
| BR-09 | Tổng thanh toán PAID ≤ total_amount | `sp_record_payment` + compound trigger `trg_pay_check` (ORA-20005) |
| BR-10 | Chỉ huỷ khi chưa SHIPPING; huỷ/trả hàng thì hoàn kho | Sơ đồ trạng thái + `trg_ord_audit_aiu` |
| BR-11 | `order_no` duy nhất, dạng `ORD-yyyymmdd-nnnnnn` | `trg_ord_biu_row` + `seq_order_no` |

**Mã lỗi tự định nghĩa:**
| Mã | Ý nghĩa | HTTP gợi ý |
|---|---|---|
| -20001 | Hết hàng | 409 |
| -20002 | Chuyển trạng thái sai | 422 |
| -20003 | Sản phẩm ngừng bán / không tồn tại | 422 |
| -20004 | Đơn đã khoá | 409 |
| -20005 | Thanh toán vượt tổng | 422 |
| -20006 | Không tìm thấy đơn | 404 |
| -20007 | Giảm giá vượt tổng tiền hàng | 422 |
| ORA-42699 | ETag không khớp (Duality View) | **412** |

**Điểm mấu chốt để vấn đáp:** mọi quy tắc nằm ở **bảng nền**, nên có hiệu lực dù ghi qua tài liệu JSON (Duality View) hay qua SQL trực tiếp.

### 5.4. Duality View (công nghệ trọng tâm)
- **`ORDER_DV`** (gốc `orders`):
  - `customer` chỉ đọc.
  - `items[]` thêm/sửa/xoá được; thông tin sản phẩm làm phẳng bằng `UNNEST`, chỉ đọc.
  - `payments[]`, `shipments[]` thêm/sửa được.
  - `history[]` chỉ đọc.
- **`PRODUCT_DV`** (gốc `products`, kèm `seller`, `category` chỉ đọc; `attributes` là JSON gốc).
- **`CUSTOMER_DV`** (gốc `customers`, kèm `addresses[]`).

Quyết định đã chốt:
- Các trường hiển thị của bảng tham chiếu chỉ đọc gắn `WITH NOCHECK`, để client chỉ cần gửi khoá (`customerId`, `productId`).
- `orderNo`, `orderDate`, `subtotal`, `totalAmount`, `unitPrice` gắn `WITH NOUPDATE`; trigger quyết định giá trị.
- `stockQty` của `PRODUCT_DV` **không** NOCHECK, để ETag chặn người bán ghi đè tồn kho vừa bị đơn hàng trừ.
- Mọi cột identity: `GENERATED BY DEFAULT ON NULL` (bắt buộc với Duality View, xem lỗi ORA-32795 ở mục 3.3).
- **Không** dùng JSON Search Index trên `products.attributes`: Oracle ghi nhận chưa hỗ trợ trên cột của bảng nền Duality View. Thay bằng chỉ mục hàm `JSON_VALUE(attributes,'$.brand' RETURNING VARCHAR2(60))`; truy vấn phải dùng **đúng biểu thức** này.
- Đơn không xoá (`NODELETE`); huỷ bằng chuyển trạng thái để giữ lịch sử.

### 5.5. Sáu "tình huống khó" phải minh hoạ được trên web
| Mã | Tình huống |
|---|---|
| TH-1 | Đọc/ghi **cả một đơn** (khách, dòng hàng, thanh toán, vận chuyển, lịch sử) bằng **một tài liệu JSON / một request**. |
| TH-2 | Cùng dữ liệu phục vụ REST JSON và báo cáo SQL, luôn nhất quán (không nhân bản dữ liệu). |
| TH-3 | Ghi tài liệu nhiều dòng là **một giao dịch nguyên tử**: một dòng hết hàng thì cả đơn bị huỷ. |
| TH-4 | Client không tự quyết được giá, tổng tiền, trạng thái sai thứ tự. |
| TH-5 | Hai người cùng sửa một đơn → **ETag** chặn ghi đè (lost update); hai khách mua sản phẩm cuối cùng → không bán vượt tồn. |
| TH-6 | Thuộc tính sản phẩm linh hoạt theo ngành hàng (cột JSON + kiểm tra cấu trúc + chỉ mục). |

---

## 6. Thiết kế ứng dụng web (đề xuất; Claude Code rà soát rồi chốt với người dùng)

### 6.1. Kiến trúc
```
Trình duyệt (Razor View + JavaScript fetch)
        │
ASP.NET Core MVC (C#)
  ├─ MVC Controllers  → trả View (HTML)
  ├─ API Controllers  → /api/... trả JSON (REST)
  ├─ Services         → nghiệp vụ, ánh xạ lỗi ORA → HTTP
  └─ Repositories     → ODP.NET (Oracle.ManagedDataAccess.Core)
        │
Oracle Database 23ai Free (Docker) – PDB ecom, schema ecom_schema
  ├─ Duality Views: ORDER_DV, PRODUCT_DV, CUSTOMER_DV  (đường JSON)
  └─ Bảng chuẩn hoá + PKG_ORDER + trigger + báo cáo SQL (đường quan hệ)
```
- **Đường JSON (trọng tâm):** API C# đọc/ghi **trực tiếp Duality View**, không tự ráp JSON từ nhiều bảng:
  - Đọc: `SELECT JSON_SERIALIZE(data) FROM order_dv d WHERE d.data."_id" = :id`
  - Tạo: `INSERT INTO order_dv (data) VALUES (JSON(:doc))`
  - Sửa: `UPDATE order_dv d SET d.data = JSON(:doc) WHERE d.data."_id" = :id`
  - Cần **kiểm chứng trên Oracle thật** cú pháp bind JSON với ODP.NET (chuỗi + `JSON(:doc)`, hoặc `OracleDbType.Json`).
  - Trả `_metadata.etag` qua header `ETag`; nhận `If-Match` khi PUT; ORA-42699 → **412 Precondition Failed**.
- **Đường quan hệ:** gọi procedure `PKG_ORDER` (đổi trạng thái, huỷ, thanh toán) và truy vấn báo cáo trên bảng chuẩn hoá. **Không** dùng Duality View cho báo cáo quét nhiều dữ liệu.
- **ORDS (tuỳ chọn, cộng điểm):** đề bài gợi ý REST tự sinh bởi ORDS là cách tự nhiên cho đề tài này. Nếu còn thời gian, bật ORDS AutoREST cho 3 Duality View, thêm một trang demo gọi ORDS để so sánh với API C#. Cần Oracle ≥ 23.4 và ORDS ≥ 24.1. Hỏi người dùng trước khi làm.
- Luôn dùng **bind variable**, không nối chuỗi SQL. Connection string đọc từ cấu hình/biến môi trường, **không** hard-code mật khẩu trong mã đẩy lên GitHub.

### 6.2. Cấu trúc thư mục đề xuất
```
<repo>/
├─ CLAUDE.md
├─ README.md                      # cách chạy từ đầu trên máy mới
├─ docker-compose.yml             # Oracle 23ai Free (+ ORDS nếu làm)
├─ .gitignore                     # dotnet + VS Code + .env
├─ .env.example                   # mẫu biến môi trường, KHÔNG chứa mật khẩu thật
├─ sql/                           # 00…09 + t00_reset + t01… + toi_uu_Q1_Q3.sql
├─ docs/                          # đề bài, báo cáo, ảnh chụp minh chứng
└─ src/Ecom.Web/                  # ASP.NET Core MVC
   ├─ Controllers/                # HomeController, ProductsController, OrdersController, ReportsController…
   ├─ Controllers/Api/            # ProductsApiController, OrdersApiController, ReportsApiController…
   ├─ Models/                     # ViewModels, DTO
   ├─ Services/                   # OrderService, ReportService, OracleErrorMapper
   ├─ Data/                       # OracleConnectionFactory, Repositories
   ├─ Views/                      # Razor .cshtml
   └─ wwwroot/js/                 # JavaScript gọi /api bằng fetch
```

### 6.3. Các màn hình (tối thiểu)
| Mã | Màn hình | Nội dung | Gọi tới |
|---|---|---|---|
| M0 | Trang chủ / chọn vai trò | Khách hàng / Người bán / Quản trị (mô phỏng, không cần đăng nhập thật) | — |
| M1 | Sản phẩm | Danh sách, lọc theo danh mục, **lọc theo thuộc tính JSON** (hãng, dung lượng…), xem `attributes` | `PRODUCT_DV` + truy vấn `JSON_VALUE`/`JSON_EXISTS` |
| M2 | Tạo đơn | Chọn sản phẩm, số lượng, địa chỉ → gửi **một tài liệu JSON** | `INSERT INTO order_dv` |
| M3 | Đơn của tôi / Danh sách đơn | Lọc theo khách, trạng thái | `ORDER_DV` hoặc bảng `orders` |
| M4 | **Chi tiết đơn – hai tab** | Tab "Dạng JSON" (tài liệu `ORDER_DV` kèm ETag) và tab "Dạng bảng quan hệ" (các dòng thật trong `orders`, `order_items`, `payments`, `shipments`, `order_status_history`). **Màn hình demo quan trọng nhất cho tính "duality".** | cả hai |
| M5 | Xử lý đơn | Sửa địa chỉ/dòng hàng khi PENDING (PUT + ETag, báo xung đột 412); đổi trạng thái; huỷ; ghi thanh toán; thêm vận đơn | `UPDATE order_dv` + `PKG_ORDER` |
| M6 | Báo cáo | R1–R5, có bảng và biểu đồ đơn giản | `PKG_ORDER_RPT` / SQL nâng cao |
| M7 | Khách hàng | Hồ sơ + sổ địa chỉ (thêm/sửa/xoá địa chỉ trong tài liệu) | `CUSTOMER_DV` |

**Báo cáo R1–R5** (trên bảng chuẩn hoá, doanh thu tính đơn `DELIVERED`):
- R1: doanh thu theo tháng, luỹ kế, tăng trưởng (`SUM() OVER`, `LAG`).
- R2: doanh thu theo người bán × danh mục, có tổng phụ (`ROLLUP`/`CUBE`).
- R3: top N sản phẩm bán chạy mỗi danh mục (`DENSE_RANK`).
- R4: ma trận số đơn theo trạng thái × tháng (`PIVOT`).
- R5: tỉ lệ huỷ/trả theo người bán.

Thông báo lỗi trên giao diện phải hiện **đúng nguyên nhân** (hết hàng, sai trạng thái, xung đột ETag…) để demo các ca lỗi.

---

## 7. Kiểm thử và tối ưu hoá (phục vụ Chương 4 của báo cáo)

**Kịch bản kiểm thử** (làm được trên web và/hoặc SQL; tối thiểu 5, nên làm đủ):

| Mã | Kịch bản | Kết quả mong đợi |
|---|---|---|
| TC-01 | Tạo đơn hợp lệ 2 dòng | Thành công; giá, tổng tiền đúng; lịch sử có NULL → PENDING; tồn kho giảm |
| TC-02 | Client gửi giá/tổng/trạng thái giả | Bị bỏ qua, server tự tính |
| TC-03 | Một dòng vượt tồn kho | ORA-20001, rollback **cả đơn** |
| TC-04 | Đặt sản phẩm INACTIVE | ORA-20003 |
| TC-05 | Đổi trạng thái sai rồi đúng | ORA-20002, rồi thành công |
| TC-06 | Sửa dòng hàng khi đơn đã CONFIRMED (qua JSON và SQL) | ORA-20004 ở cả hai kênh |
| TC-07 | Huỷ đơn; thử huỷ đơn SHIPPING | Hoàn kho; lần sau báo lỗi |
| TC-08 | Thanh toán vượt tổng (procedure và `payments[]`) | ORA-20005 |
| TC-09 | Hai tab cùng sửa một đơn | Tab sau nhận **412** |
| TC-10 | 20 request đồng thời mua sản phẩm còn 5 | Đúng 5 thành công, tồn = 0 |
| TC-11 | `attributes` thiếu `brand` | Bị ràng buộc từ chối |
| TC-12 | UPDATE bảng bằng SQL rồi GET tài liệu JSON | JSON phản ánh ngay |
| TC-13 | Giảm giá > tiền hàng | ORA-20007 |
| TC-14 | Lọc sản phẩm theo thuộc tính JSON | Kết quả đúng; plan dùng chỉ mục |

**Tối ưu (tối thiểu 2, nên làm 3)** — đo bằng `DBMS_XPLAN.DISPLAY_CURSOR(NULL,NULL,'ALLSTATS LAST')` với dữ liệu lớn:
| Mã | Truy vấn | Chỉ mục |
|---|---|---|
| Q1 | "Đơn của tôi" (20 đơn mới nhất của một khách) | IX-1 `orders(customer_id, order_date DESC)` |
| Q2 | Lọc sản phẩm theo `brand` trong JSON | IX-6, chỉ mục hàm `JSON_VALUE` |
| Q3 | Đọc một tài liệu `ORDER_DV` | IX-5: chỉ mục `order_id` trên `payments`, `shipments`, `order_status_history` |

**Không bịa số liệu.** Chạy thật, ghi lại Cost / Buffers / A-Time trước và sau, chụp màn hình cho báo cáo.

---

## 8. GitHub

Trước khi tạo repo, **hỏi người dùng:**
- Tên repo, ví dụ `huflit-dbms-detai15-ecom-duality`.
- Public hay private.
- Tài khoản GitHub nào; đã đăng nhập `gh auth login` chưa.
- Có thêm các thành viên khác làm collaborator không.

Quy tắc:
- `.gitignore` chuẩn cho .NET + VS Code (`bin/`, `obj/`, `.vs/`, `*.user`, `.env`, `appsettings.Development.json` nếu chứa mật khẩu).
- **Không commit mật khẩu, connection string thật.** Dùng `dotnet user-secrets` hoặc `.env` (đã ignore) + `.env.example`.
- Commit nhỏ, thông điệp rõ ràng theo từng bước (CSDL, API, từng màn hình, kiểm thử…), để giảng viên thấy quá trình làm và đối chiếu đóng góp.
- `README.md` phải hướng dẫn chạy lại **từ đầu trên máy mới**: Docker → tạo PDB → chạy script theo thứ tự → cấu hình connection → `dotnet run` → mở trình duyệt.
- Commit và push chỉ khi người dùng đồng ý.

---

## 9. Thứ tự công việc đề xuất

1. **Kiểm tra môi trường** (Docker, container Oracle đang chạy, `dotnet`, `git`, `gh`) và **trạng thái CSDL** (mục 3.3).
2. **Hoàn thiện CSDL:**
   - Sửa script nếu còn lỗi; chạy `t01_smoke_test.sql` đến khi TC-01, TC-03, TC-05 đúng.
   - Viết `07_pkg_order_rpt.sql`, `t00_reset.sql`.
   - Mở rộng `08_seed.sql`: khoảng 10 khách, 5 người bán, 6 danh mục, 30–50 sản phẩm thuộc nhiều ngành hàng với `attributes` khác nhau, vài chục đơn ở đủ các trạng thái và trải qua nhiều tháng để báo cáo có dữ liệu.
3. **Khởi tạo repo + `docker-compose.yml` + `README.md`**; commit đầu tiên.
4. **Dựng ASP.NET Core MVC:** kết nối Oracle, trang kiểm tra kết nối, `OracleErrorMapper`.
5. **Làm màn hình theo thứ tự:** M1 → M2 → M4 → M5 → M3 → M6 → M7. Mỗi màn hình chạy thử trên Oracle thật rồi mới commit.
6. **Kiểm thử TC-01…TC-14** (kể cả TC-10 đồng thời, có thể viết bằng một console app hoặc script nhỏ). Ghi kết quả thật.
7. **Tối ưu:** viết `09_bulk_data.sql` (khoảng 200.000 đơn; tắt trigger khi nạp rồi tính lại tiền và bật lại), đo Q1–Q3 trước/sau.
8. **(Tuỳ chọn) ORDS** AutoREST cho 3 Duality View.
9. **Cập nhật báo cáo** Chương 3–5 cho khớp mã thật (C# thay vì Node.js/React), điền số liệu thật; chuẩn bị kịch bản demo 8–10 phút.

---

## 10. Quy tắc làm việc cho Claude Code

- **Không khẳng định mã "chạy được" khi chưa chạy trên Oracle thật.** Khi có lỗi, đọc nguyên văn `ORA-xxxxx` và sửa tận gốc.
- **Không bịa** số đo hiệu năng, kết quả kiểm thử, hay nội dung báo cáo.
- Làm theo thứ tự **CSDL → API → giao diện**; CSDL sai thì sửa trước khi làm web.
- Giữ mã lõi CSDL **đơn giản, có chú thích tiếng Việt**, đặt tên nhất quán, để sinh viên tự giải thích được.
- Sau mỗi phần lớn, viết một đoạn ngắn: **luồng dữ liệu giao diện → API → CSDL** của phần đó (để luyện vấn đáp).
- Nếu cần thay đổi thiết kế so với mục 5 (tên bảng, tên trường JSON, quy tắc…), **ghi lại lý do** để cập nhật báo cáo.
- Câu hỏi nào thuộc quyền quyết định của người dùng (tên repo, public/private, có làm ORDS không, tên schema), **hỏi trước khi làm**.
