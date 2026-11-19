# Kết quả kiểm thử (chạy thật trên Oracle 23.26.3)

Tài liệu cho **Chương 4 – Kiểm thử** của báo cáo. Mọi kết quả dưới đây là kết quả chạy thật; log gốc
nằm trong `docs/test-logs/`. Không có số liệu ước đoán.

## 1. Cách kiểm thử: hai tầng cho mỗi kịch bản

| Tầng | Công cụ | Đường đi dữ liệu | Log |
|---|---|---|---|
| **CSDL** | `sql/t01_smoke_test.sql`, `sql/t02_test_cases.sql` (PL/SQL tự kiểm, in PASS/FAIL, ROLLBACK sau mỗi kịch bản) | SQL trực tiếp → Duality View / bảng / package | `2026-11-20_db_t01_t02.txt` |
| **Web/API** | `tests/api_test_cases.mjs` (Node.js `fetch`, in PASS/FAIL) | HTTP → API C# (ODP.NET) → Duality View / PKG_ORDER | `2026-11-20_api_test_cases.txt` |
| **Giao diện** | Thao tác tay trên trình duyệt khi làm từng màn hình M0–M7 | Trình duyệt (JS) → API → CSDL | ghi trong lịch sử commit |

Kiểm thử ở hai tầng chứng minh điều cốt lõi của đề tài: **quy tắc nằm ở bảng nền nên có hiệu lực ở
mọi kênh ghi** — ghi bằng tài liệu JSON qua web hay bằng SQL trực tiếp đều bị cùng một trigger /
ràng buộc kiểm tra.

Chạy lại (cần Oracle đang chạy; tầng web cần thêm `dotnet run`):
```powershell
.\scripts\db.ps1 reset
.\scripts\db.ps1 test
.\scripts\db.ps1 reset
node tests/api_test_cases.mjs
.\scripts\db.ps1 reset
```

## 2. Tổng hợp

| Tầng | Kết quả |
|---|---|
| CSDL (t01 + t02) | **14/14 PASS** (TC-01..09, 11..13, 15, 16) |
| Web/API | **16/16 PASS** (TC-01..16) |
| TC-10 đồng thời, lặp lại | **5/5 lần** đúng 5 thành công / 15 từ chối / tồn = 0 |

## 3. Chi tiết từng kịch bản

| Mã | Kịch bản | Mong đợi | CSDL | Web/API | Kết quả thật (trích log) |
|---|---|---|---|---|---|
| TC-01 | Tạo đơn hợp lệ 2 dòng bằng một tài liệu JSON | 201; giá, tổng đúng; lịch sử NULL→PENDING; tồn giảm | PASS | PASS | subtotal 23.388.000 = 22.990.000 + 2×199.000; total +25.000 phí ship; lịch sử `null→PENDING` bởi `customer:1` |
| TC-02 | Client gửi giá / tổng / trạng thái / số đơn giả | Bị bỏ qua, server tự tính | PASS | PASS | gửi `status=DELIVERED, unitPrice=1, orderNo=HACK-001` → `PENDING`, `unitPrice=4.490.000`, số đơn do sequence sinh |
| TC-03 | Một dòng vượt tồn kho | 409 ORA-20001, rollback **cả đơn** | PASS | PASS | số đơn 67→67, tồn SP1 9→9 (dòng hợp lệ cũng bị huỷ) |
| TC-04 | Đặt sản phẩm INACTIVE | 422 ORA-20003 | PASS | PASS | "Sản phẩm đã ngừng bán: 4" |
| TC-05 | Đổi trạng thái sai rồi đúng | 422 ORA-20002, rồi thành công | PASS | PASS | PENDING→SHIPPING bị chặn; PENDING→CONFIRMED thành công, có dòng lịch sử |
| TC-06 | Sửa dòng hàng khi đơn đã CONFIRMED | ORA-20004 ở **cả hai kênh** | PASS (JSON + SQL) | PASS (JSON) | 409 ORA-20004 |
| TC-07 | Huỷ đơn; thử huỷ đơn SHIPPING | Hoàn kho; lần sau báo lỗi | PASS | PASS | tồn SP3 46→42→huỷ→46; huỷ đơn SHIPPING → 422 ORA-20002 |
| TC-08 | Thanh toán vượt tổng (procedure và `payments[]`) | ORA-20005 ở cả hai kênh | PASS | PASS | cả hai → 422 ORA-20005; trả đúng tổng → 200 |
| TC-09 | Hai người cùng sửa một đơn | Người lưu sau nhận **412** | PASS | PASS | B lưu 200; A (ETag cũ) 412 ORA-42699; dữ liệu của B còn nguyên |
| TC-10 | 20 request đồng thời mua sản phẩm còn 5 | Đúng 5 thành công, tồn = 0 | — | PASS | 201×5, 409 (ORA-20001)×15, khác×0; tồn 5→0; trong CSDL đúng 5 dòng `order_items` của SP5 |
| TC-11 | `attributes` thiếu `brand` | Bị ràng buộc từ chối | PASS (SQL + DV) | PASS | thêm → 422 (ORA-02290 PRODUCTS_ATTR_CHK); sửa → 422 (ORA-40875) |
| TC-12 | UPDATE bảng bằng SQL rồi GET tài liệu JSON | JSON phản ánh ngay | PASS | PASS | `UPDATE orders SET ship_phone` bằng sqlplus → GET thấy ngay `0999888777` |
| TC-13 | Giảm giá > tiền hàng | ORA-20007 | PASS (SQL + JSON) | PASS | 422 ORA-20007 |
| TC-14 | Lọc sản phẩm theo thuộc tính JSON | Kết quả đúng; plan dùng chỉ mục | — | PASS (kết quả) | 4 bộ lọc (`brand`+`storageGb`, `brand`, `size[*]`, danh mục + `ramGb`) đều khớp kết quả lọc độc lập. **Phần execution plan đo ở bước tối ưu (Q2, chỉ mục IX-6)** |
| TC-15 | *(bổ sung)* Sửa / xoá / thêm dòng hàng qua JSON khi PENDING | 200; tổng + tồn kho đúng; đổi `status` trong tài liệu bị chặn | PASS | PASS | subtotal 14.250.000 = 3×4.490.000 + 2×390.000; đổi status qua JSON → ORA-40940 |
| TC-16 | *(bổ sung, BR-12)* Huỷ / trả hàng đơn đã thanh toán | Thanh toán PAID → REFUNDED | PASS | PASS | `payments=[REFUNDED]` |

TC-15 và TC-16 là kịch bản bổ sung, sinh ra từ hai lỗi phát hiện khi chạy thật (ORA-40896, thiếu hoàn
tiền) — xem `docs/THAY_DOI_THIET_KE.md` mục 2b, 2d.

## 4. TC-10 — vì sao không bán vượt tồn khi 20 request chạy đồng thời

**Kết quả 5 lần chạy (mỗi lần reset dữ liệu trước):**

| Lần | 201 | 409 ORA-20001 | Khác | Tồn sau | Thời gian 20 request |
|---|---|---|---|---|---|
| 1 | 5 | 15 | 0 | 0 | 1035 ms (lần đầu, kết nối pool còn lạnh) |
| 2 | 5 | 15 | 0 | 0 | 173 ms |
| 3 | 5 | 15 | 0 | 0 | 225 ms |
| 4 | 5 | 15 | 0 | 0 | 149 ms |
| 5 | 5 | 15 | 0 | 0 | 148 ms (lần ghi vào `2026-11-20_api_test_cases.txt`) |

**Cơ chế (để vấn đáp):** 20 request được gửi cùng lúc; ASP.NET xử lý song song, mỗi request lấy một
kết nối riêng từ connection pool của ODP.NET → 20 giao dịch Oracle chạy đồng thời. Trừ kho nằm trong
`pkg_order.sp_reserve_stock` bằng **một câu lệnh nguyên tử**:
```sql
UPDATE products SET stock_qty = stock_qty - :qty
 WHERE product_id = :id AND status = 'ACTIVE' AND stock_qty >= :qty
RETURNING price INTO :price;
-- SQL%ROWCOUNT = 0  ->  RAISE_APPLICATION_ERROR(-20001, 'Không đủ tồn kho ...')
```
- Câu `UPDATE` khoá dòng sản phẩm; các giao dịch khác muốn sửa dòng đó phải **chờ** tới khi giao dịch
  trước COMMIT.
- Ở mức cô lập mặc định **READ COMMITTED**, khi được đi tiếp Oracle **đánh giá lại điều kiện
  `stock_qty >= :qty` trên giá trị mới nhất** (write consistency / statement restart). Khi tồn đã về 0,
  điều kiện sai → 0 dòng → ORA-20001 → cả đơn rollback (TC-03).
- Không có bước "đọc tồn rồi mới trừ" tách rời (SELECT rồi UPDATE) nên không có khe hở giữa hai bước
  để hai giao dịch cùng thấy "còn 1" → vì vậy READ COMMITTED là đủ, không cần SERIALIZABLE hay
  `SELECT ... FOR UPDATE`.
- Thêm một lớp bảo vệ: `CHECK (stock_qty >= 0)` trên bảng `products`.

## 5. Kiểm thử thủ công trên giao diện (khi làm từng màn hình)

| Màn hình | Đã thử trên trình duyệt |
|---|---|
| M0 | Vào vai khách #2 → danh sách tự lọc 7 đơn; vai người bán Coolmate → chỉ 8 sản phẩm của shop |
| M1 | Lọc Laptop + RAM ≥ 16 (3 kết quả); xoá `brand` → 422; hai người sửa một sản phẩm → 412 |
| M2 | TC-01, TC-02 (chế độ thử giá giả), TC-03 (SL 999 → 409, tồn không đổi) |
| M3 | Lọc khách #1 + DELIVERED (4 đơn), phân trang 60 đơn / 3 trang |
| M4 | Đối chiếu 9/9 điểm JSON ↔ bảng; TC-12 sửa bằng SQL → JSON đổi ngay |
| M5 | TC-05, TC-06, TC-07, TC-08, **TC-09 bằng hai tab thật**, huỷ đơn đã trả tiền → REFUNDED |
| M6 | Tổng phụ R2 cộng đúng tổng cộng; top N = 0 → 422; **TH-2**: giao xong đơn #59 → R1 có ngay dòng 2026-11 |
| M7 | Thêm/xoá địa chỉ, đổi mặc định trong một lần lưu; email trùng → 409; đơn cũ giữ địa chỉ chụp lại |

## 6. Ghi chú quan sát được

- **Múi giờ:** container Oracle chạy theo giờ **UTC** (`SYSDATE`, `SYSTIMESTAMP`), máy Windows theo giờ
  Việt Nam (UTC+7). Từ 0h đến 7h sáng giờ Việt Nam, số đơn và ngày đặt mang **ngày hôm trước**
  (ví dụ chạy lúc 00:34 ngày 20/11 nhưng số đơn là `ORD-20261119-…`). Không ảnh hưởng tính đúng của
  kiểm thử; nếu cần, đặt múi giờ cho container (biến `TZ`) hoặc dùng `SYSTIMESTAMP AT TIME ZONE`.
- **Số thứ tự nhảy** (`order_id`, `order_no` không liên tục): do `CACHE` của sequence/identity và do các
  giao dịch bị rollback trong kiểm thử — hành vi bình thường của Oracle.
