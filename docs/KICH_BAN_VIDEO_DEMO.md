# Kịch bản quay video demo – Shopia (Đề tài 15, Nhóm 12, Lớp 408)

Thời lượng dự kiến: **khoảng 13–15 phút**, gồm 12 cảnh. Mỗi cảnh có:
- **Màn hình**: các thao tác cần làm.
- **Lời thoại**: đọc gần như nguyên văn.

Người nói dưới đây chỉ là **gợi ý** chia đều cho 3 thành viên; nhóm đổi tuỳ ý.

| Người nói | Cảnh |
|---|---|
| **Bình** – Tống Phước Bình (24DH110200) | 1, 2, 3, 4, 5 |
| **Uyên** – Nguyễn Thị Khánh Uyên (24DH112109) | 6, 7, 8, 9 |
| **Minh Anh** – Hoàng Hồng Minh Anh (24DH112475) | 10, 11, 12 |

---

## Chuẩn bị trước khi bấm quay

**Khởi động hệ thống.** Chạy lần lượt từng lệnh trong PowerShell, ở thư mục repo:

```powershell
docker start oracle23ai
```

```powershell
.\scripts\db.ps1 reset
```

```powershell
cd src\Ecom.Web; dotnet run --launch-profile http
```

- Lệnh đầu chỉ cần nếu container đang tắt; sau đó đợi 1–2 phút cho Oracle lên.
- `reset` đưa dữ liệu về ban đầu: 36 sản phẩm, 60 đơn, 10 khách.

**Kiểm tra trước khi quay**
1. Mở <http://localhost:5148>.
2. Vào vai **Quản trị** → menu **Hệ thống**: phải báo kết nối thành công, **INVALID = 0**.
3. Về trang chủ → khu "Bạn là ai?" → bấm **bỏ chọn**, để video bắt đầu ở trạng thái khách vãng lai.

**Mở sẵn**
- DBeaver, kết nối `localhost:1521/ecom` (user `ecom_schema`), cho cảnh 4.
- Một cửa sổ PowerShell ở thư mục repo, cho cảnh 11.

**Cài đặt quay**
- Màn hình 1920×1080, zoom trình duyệt 110–125% cho chữ dễ đọc.
- Tắt thông báo Windows, Zalo, Messenger; đóng các tab không liên quan.
- Phần mềm: OBS Studio, hoặc Xbox Game Bar (`Win + Alt + R`) đều được.
- Nên quay **từng cảnh một**, rồi ghép lại. Nói chậm, rõ; dừng 1–2 giây sau mỗi kết quả quan trọng để người xem kịp nhìn.

**Nếu quay lại từ đầu**, chạy lại `.\scripts\db.ps1 reset`, vì các cảnh demo có tạo thêm đơn và đổi tồn kho.

---

## Cảnh 1 – Giới thiệu đề tài (0:00 – 1:00) · Bình · khách vãng lai

**Màn hình**
1. Trang chủ Shopia.
2. Cuộn chậm qua banner, dải 4 tính năng, danh mục, sản phẩm đang bán.

**Lời thoại**
> Xin chào thầy cô. Nhóm 12, lớp 408 xin trình bày đồ án môn Các hệ quản trị cơ sở dữ liệu, đề tài số 15: Hệ thống quản lý đơn hàng cho sàn thương mại điện tử. Nhóm gồm ba thành viên: Tống Phước Bình, Nguyễn Thị Khánh Uyên và Hoàng Hồng Minh Anh.
>
> Bài toán đặt ra là: cùng một nguồn dữ liệu phải phục vụ đồng thời hai nhu cầu. Một là giao diện tài liệu JSON cho ứng dụng front-end qua REST API. Hai là bảng quan hệ chuẩn hoá để làm báo cáo. Công nghệ trọng tâm nhóm sử dụng là **JSON Relational Duality View** của Oracle Database 23ai.
>
> Ứng dụng minh hoạ là sàn Shopia, viết bằng ASP.NET Core MVC với C#. Giao diện dùng JavaScript gọi REST API, còn API đọc và ghi trực tiếp vào Duality View trên Oracle chạy trong Docker. Các con số trên trang chủ như số sản phẩm, số đơn, số khách hàng đều được đọc thật từ cơ sở dữ liệu.

---

## Cảnh 2 – Kiến trúc và cơ sở dữ liệu (1:00 – 2:15) · Bình

**Màn hình**
1. Mở báo cáo PDF tại **Hình 1.1** (kiến trúc), rồi **Hình 2.1** (mô hình ER) và **Hình 2.2** (ánh xạ ORDER_DV sang các bảng).
   - Có thể thay bằng: mở `sql/06_duality_views.sql` trong VS Code, chỉ vào `ORDER_DV`.
2. Mở Swagger `/api-docs`, cuộn qua danh sách endpoint.

**Lời thoại**
> Về cơ sở dữ liệu, nhóm thiết kế 10 bảng ở dạng chuẩn 3NF: khách hàng, sổ địa chỉ, người bán, danh mục, sản phẩm, đơn hàng, dòng hàng, thanh toán, vận chuyển và lịch sử trạng thái.
>
> Riêng bảng sản phẩm có cột `attributes` kiểu JSON để lưu thuộc tính khác nhau theo ngành hàng, có JSON Schema kiểm tra cấu trúc.
>
> Trên các bảng này, nhóm tạo ba Duality View: `ORDER_DV`, `PRODUCT_DV` và `CUSTOMER_DV`. Ví dụ, `ORDER_DV` gom một đơn hàng gồm khách, dòng hàng, thanh toán, vận chuyển và lịch sử thành **một tài liệu JSON**. Nhưng dữ liệu thật vẫn chỉ nằm ở các bảng, không lưu trùng ở đâu cả.
>
> Toàn bộ quy tắc nghiệp vụ được cài ở bảng nền bằng package `PKG_ORDER` và sáu trigger, trong đó có hai compound trigger. Vì vậy quy tắc có hiệu lực dù ghi qua tài liệu JSON hay qua SQL trực tiếp.
>
> Đây là tài liệu REST API trên Swagger, gồm 36 endpoint do ứng dụng C# cung cấp.

---

## Cảnh 3 – Vai khách hàng: xem và mua sản phẩm (2:15 – 3:45) · Bình · khách hàng #1

**Màn hình**
1. Trang chủ → khu **"Bạn là ai?"** → chọn **#1 – Nguyễn Văn An** → **Vào vai khách hàng**.
2. Chỉ vào menu: chỉ còn *Sản phẩm, Tạo đơn, Đơn của tôi, Hồ sơ của tôi*.
3. Menu **Sản phẩm** → lọc danh mục **Laptop**, RAM tối thiểu **16 GB** → **Lọc**.
4. Bấm vào ảnh một sản phẩm, ví dụ **Samsung Galaxy Z Flip6** (danh mục Điện thoại) → **trang chi tiết sản phẩm**.
   - Chỉ: giá, tồn kho, bảng thông số, dòng "Đã bán … (trong … đơn)", sản phẩm cùng danh mục.
5. Bấm **+** lên 2 → **Mua ngay** → trang Tạo đơn đã có sản phẩm với số lượng 2. **Chưa bấm Đặt hàng.**
6. Gõ thẳng địa chỉ `/Reports` → trang **403 – Không có quyền**.

**Lời thoại**
> Hệ thống mô phỏng đăng nhập bằng cách chọn vai trò. Em vào vai khách hàng Nguyễn Văn An. Khách hàng chỉ thấy giao diện mua bán, không thấy mã JSON hay câu SQL.
>
> Ở trang sản phẩm, em lọc laptop có RAM từ 16 GB. Thông tin RAM nằm trong cột JSON `attributes`, và câu lọc phía server dùng hàm `JSON_VALUE` trên cột này.
>
> Bấm vào một sản phẩm sẽ mở trang chi tiết. Phần thông tin sản phẩm được đọc từ tài liệu `PRODUCT_DV`. Còn dòng "đã bán bao nhiêu" thì đọc bằng một câu SQL thường trên bảng `order_items` nối `orders`. Hai cách đọc trên cùng một nguồn dữ liệu, không có cột "số đã bán" nào lưu trùng.
>
> Phân quyền được kiểm tra ở server. Nếu khách hàng cố mở trang báo cáo bằng cách gõ thẳng địa chỉ, server trả về trang 403 "Không có quyền". Gọi thẳng API cũng bị chặn như vậy.

---

## Cảnh 4 – TH-1, TH-4: tạo cả một đơn bằng một tài liệu JSON (3:45 – 5:15) · Bình · quản trị sàn

**Màn hình**
1. Bấm avatar góc phải → trang chủ → **Vào vai quản trị**.
2. Menu **Tạo đơn** → chọn khách **#1 – Nguyễn Văn An**.
3. Thêm **Samsung Galaxy S24 256GB**, số lượng 1, và **Áo thun Coolmate**, số lượng 2.
4. Tick ô vàng **"Chế độ thử TC-02"**.
5. Chỉ khung **Tài liệu JSON sẽ gửi**: có `status: "DELIVERED"`, `unitPrice: 1`, `totalAmount: 1`.
6. Bấm **Đặt hàng** → kết quả **HTTP 201**.
   - Đơn ở trạng thái **PENDING**.
   - Số đơn dạng `ORD-yyyymmdd-nnnnnn`.
   - Tổng tiền đúng theo giá thật.

**Lời thoại**
> Bây giờ em chuyển sang vai quản trị để xem được phần kỹ thuật. Em tạo một đơn hai dòng hàng.
>
> Toàn bộ đơn gồm khách, địa chỉ giao và các dòng hàng được gửi bằng **một tài liệu JSON trong một request**. Phía server, API chỉ chạy đúng một câu `INSERT INTO order_dv`. Oracle tự tách tài liệu ra hai bảng `orders` và `order_items`.
>
> Em cố tình bật chế độ thử: client gửi giá 1 đồng, tổng tiền 1 đồng và trạng thái "đã giao". Kết quả: đơn vẫn được tạo ở trạng thái PENDING, giá và tổng tiền là giá thật trong cơ sở dữ liệu. Lý do là trigger lấy đơn giá từ bảng sản phẩm, tính lại tổng tiền và đặt trạng thái ban đầu. Các trường này trong Duality View được khai báo `NOUPDATE`, nên client không thể tự quyết định giá hay trạng thái.

---

## Cảnh 5 – TH-2: một nguồn dữ liệu, hai cách nhìn (5:15 – 6:30) · Bình · quản trị sàn

**Màn hình**
1. Bấm **Xem chi tiết đơn** vừa tạo.
2. Chỉ thanh tiến trình trạng thái.
3. Tab **Dạng JSON**: chỉ ETag, `items[]`, `history[]`.
4. Tab **Dạng bảng quan hệ**: chỉ các dòng thật trong 5 bảng, có ROWID.
5. Sang DBeaver, chạy câu dưới (thay số đơn vừa tạo):
   ```sql
   UPDATE orders SET ship_phone = '0999888777' WHERE order_no = '<số đơn vừa tạo>';
   COMMIT;
   ```
6. Quay lại trình duyệt → **Đọc lại cả hai** → số điện thoại trong tài liệu JSON đổi ngay, ETag cũng đổi.

**Lời thoại**
> Đây là màn hình quan trọng nhất để thấy tính "duality". Cùng một đơn hàng được hiển thị ở hai dạng. Tab bên trái là tài liệu JSON đọc từ `ORDER_DV`. Tab bên phải là các dòng thật trong năm bảng nền. Số đơn, trạng thái, tổng tiền ở hai bên hoàn toàn khớp nhau.
>
> Để chứng minh không có bản sao, em sửa số điện thoại bằng câu UPDATE trực tiếp trên bảng `orders` trong DBeaver. Quay lại web và đọc lại, tài liệu JSON phản ánh ngay số mới, và ETag cũng thay đổi. Không có bảng nào lưu tài liệu JSON; Oracle sinh tài liệu từ chính các dòng này mỗi lần đọc.

---

## Cảnh 6 – TH-6: thuộc tính JSON linh hoạt theo ngành hàng (6:30 – 7:45) · Uyên · người bán #3

**Màn hình**
1. Trang chủ → **"Bạn là ai?"** → chọn **#3 – Laptop Pro Shop** → **Vào vai người bán**.
2. Trang sản phẩm đã lọc sẵn "Chỉ sản phẩm của shop tôi".
3. Chỉ khu **"Thuộc tính JSON có trong danh mục"** (cpu, ramGb, storageGb…).
4. Bấm **"Câu SQL lọc vừa chạy"** → chỉ `JSON_VALUE(... '$.ramGb' RETURNING NUMBER)`.
5. Bấm nút **JSON** trên một laptop → xoá dòng `"brand"` trong `attributes` → **Lưu** → báo **422 – Thuộc tính JSON không đúng JSON Schema**.
6. Menu **Thống kê shop**: chỉ doanh thu theo tháng, sản phẩm bán chạy của shop.

**Lời thoại**
> Em là Uyên, em xin trình bày phần tiếp theo. Em vào vai người bán Laptop Pro Shop.
>
> Mỗi ngành hàng có bộ thuộc tính khác nhau. Điện thoại có RAM, bộ nhớ; quần áo có size, chất liệu; sách có tác giả, số trang. Thay vì tách nhiều bảng, nhóm lưu chúng trong cột JSON. Hệ thống dùng `JSON_DATAGUIDE` để tự nhận biết các thuộc tính đang có trong từng danh mục.
>
> Dù linh hoạt, cấu trúc vẫn được kiểm soát. Cột `attributes` có JSON Schema bắt buộc phải có trường `brand`. Khi em xoá `brand` rồi lưu tài liệu, Oracle từ chối và giao diện báo lỗi 422. Quy tắc này khai báo ngay trên kiểu cột, nên ghi qua tài liệu JSON hay ghi bằng SQL đều bị chặn.
>
> Người bán chỉ sửa được sản phẩm của shop mình, và có trang thống kê riêng: doanh thu theo tháng có luỹ kế, cùng các sản phẩm bán chạy. Số liệu này được tính bằng ba hàm trong package báo cáo.

---

## Cảnh 7 – TH-3: giao dịch nguyên tử (7:45 – 8:45) · Uyên · quản trị sàn

**Màn hình**
1. Vào vai **Quản trị** → **Tạo đơn**.
2. Thêm **Samsung Galaxy S24 256GB** số lượng 1, và **Samsung Galaxy A15 128GB** số lượng **999**.
3. Bấm **Đặt hàng** → báo **409 – Hết hàng (ORA-20001)**.
4. Mở "Chuỗi lỗi gốc từ Oracle": chỉ ORA-42692 bọc ORA-20001.
5. Mở menu **Sản phẩm** → tồn kho của Galaxy S24 **không đổi**.

**Lời thoại**
> Tình huống thứ ba: một đơn có nhiều dòng hàng phải là một giao dịch nguyên tử. Em đặt hai sản phẩm: dòng đầu hợp lệ, dòng thứ hai số lượng 999, vượt tồn kho.
>
> Kết quả là cả đơn bị từ chối với lỗi 409 Hết hàng, mã ORA-20001. Đây là mã lỗi do nhóm tự định nghĩa trong package. Tồn kho của sản phẩm ở dòng đầu cũng không bị trừ: vì cả tài liệu là một câu INSERT, một dòng lỗi thì toàn bộ câu lệnh bị huỷ. Lỗi Oracle được API chuyển thành mã HTTP đúng nghiệp vụ, kèm nguyên nhân rõ ràng trên giao diện.

---

## Cảnh 8 – TH-5: hai người cùng sửa một đơn và ETag (8:45 – 10:00) · Uyên · quản trị sàn

**Màn hình**
1. Trang chủ → khu **6 tình huống khó** → thẻ **TH-5** → bấm **"Mở đơn #60 tab 1"** và **"tab 2"**.
2. **Tab 1**: khu *Xử lý đơn* → mục 3 sửa **số điện thoại** → **Lưu tài liệu** → 200, ETag mới.
3. **Tab 2** (vẫn giữ ETag cũ): sửa **địa chỉ** → **Lưu tài liệu** → **412 – Xung đột ETag (ORA-42699)**.
4. Ở tab 1: mở tab **Theo thời gian** → **Lúc mở trang**: bản cũ (đọc bằng `AS OF SCN`) đặt cạnh bản hiện tại.

**Lời thoại**
> Tình huống thứ năm là hai người cùng sửa một đơn. Em mở đơn số 60 ở hai tab, giả lập hai nhân viên.
>
> Mỗi tài liệu đọc ra đều có một ETag, giống như mã phiên bản. Tab thứ nhất sửa số điện thoại và lưu thành công, ETag đổi sang giá trị mới. Tab thứ hai vẫn giữ ETag cũ, nên khi lưu thì client gửi ETag cũ qua header `If-Match`. Oracle so sánh, thấy không khớp và từ chối với lỗi ORA-42699; API trả về 412. Nhờ vậy không có chuyện người sau ghi đè mất thay đổi của người trước, tức là không có lost update.
>
> Ngoài ra, nhóm dùng thêm Flashback Query: đọc lại tài liệu đơn hàng tại thời điểm mở trang bằng `AS OF SCN`, để so sánh bản cũ và bản hiện tại, mà không cần bảng lưu phiên bản riêng.

---

## Cảnh 9 – Vòng đời đơn hàng: trạng thái, thanh toán, huỷ (10:00 – 11:00) · Uyên · quản trị sàn

**Màn hình** (vẫn ở đơn #60, đang PENDING)
1. Ô **Thử chuyển tới** chọn **DELIVERED** → **Gửi (kể cả sai)** → báo **422 – ORA-20002**.
2. Bấm nút **→ CONFIRMED**. Nút này hiện ra vì CSDL tính được trạng thái hợp lệ kế tiếp.
3. **Ghi thanh toán**: chuyển khoản, đủ số tiền → thành công.
4. **Huỷ đơn** → thanh toán chuyển **REFUNDED**.
5. Tab bảng quan hệ: chỉ `payments.status` và lịch sử trạng thái.

**Lời thoại**
> Đơn hàng đi theo vòng đời: chờ xác nhận, đã xác nhận, đóng gói, đang giao, đã giao; có thể huỷ hoặc trả hàng. Nếu chuyển sai thứ tự, ví dụ từ chờ xác nhận nhảy thẳng sang đã giao, trigger gọi hàm `fn_is_valid_transition` và từ chối với lỗi ORA-20002.
>
> Chuyển đúng sang "đã xác nhận" thì thành công. Em ghi nhận thanh toán, rồi huỷ đơn. Khi huỷ, trigger tự hoàn lại tồn kho, chuyển khoản đã thanh toán sang trạng thái hoàn tiền, và ghi lịch sử. Bảng lịch sử trạng thái chỉ do trigger ghi; ứng dụng không tự ghi vào.

---

## Cảnh 10 – Báo cáo trên bảng chuẩn hoá (11:00 – 12:15) · Minh Anh · quản trị sàn

**Màn hình**
1. Mở **đơn #59** (đang SHIPPING) → bấm **→ DELIVERED**.
2. Menu **Báo cáo**:
   - **R1**: doanh thu theo tháng, có luỹ kế và tăng trưởng; có ngay dòng tháng hiện tại.
   - **R2**: theo người bán × danh mục, chỉ dòng tổng phụ.
   - **R3**: top sản phẩm theo danh mục.
   - **R4**: ma trận trạng thái × tháng.
3. Mở **"Lời gọi & mã PL/SQL"** của R1: chỉ `SUM() OVER`, `LAG`.

**Lời thoại**
> Em là Minh Anh, em xin trình bày phần báo cáo. Báo cáo chạy trên các bảng quan hệ chuẩn hoá chứ không qua Duality View, vì báo cáo cần quét và gom nhiều dữ liệu.
>
> Em vừa chuyển đơn số 59 sang trạng thái đã giao. Mở báo cáo ra, doanh thu đã có ngay, vì báo cáo và tài liệu JSON dùng chung một nguồn dữ liệu, không cần bước đồng bộ nào.
>
> Nhóm có sáu báo cáo trong package `PKG_ORDER_RPT`, dùng SQL nâng cao:
> - hàm cửa sổ `SUM OVER` và `LAG` để tính luỹ kế và tăng trưởng;
> - `ROLLUP` để có dòng tổng phụ;
> - `DENSE_RANK` để xếp hạng sản phẩm bán chạy;
> - `PIVOT` để xoay bảng trạng thái theo tháng.
>
> Mỗi báo cáo đều xem được mã PL/SQL ngay trên giao diện.

---

## Cảnh 11 – Nhiều khách cùng mua và kiểm thử tự động (12:15 – 13:30) · Minh Anh · quản trị sàn

**Màn hình**
1. Menu **Mua đồng thời**:
   - chọn một sản phẩm;
   - ô *Đặt lại tồn kho* = **5**, *Số khách cùng mua* = **20**;
   - bấm **Bắt đầu** → **5 đơn thành công, 15 đơn báo ORA-20001, tồn kho còn 0**.
2. Chuyển sang PowerShell, chạy `node tests/api_test_cases.mjs` → chỉ dòng cuối **TỔNG: 16/16 PASS**.

**Lời thoại**
> Đây là tình huống 20 khách cùng mua một sản phẩm chỉ còn 5 cái. Kết quả: đúng 5 đơn thành công, 15 đơn bị từ chối vì hết hàng, tồn kho về 0, không bán vượt.
>
> Nguyên nhân là việc trừ kho dùng một câu UPDATE có điều kiện "tồn kho lớn hơn hoặc bằng số lượng mua". Với mức cô lập READ COMMITTED, phiên đến sau phải chờ khoá của phiên trước. Sau đó Oracle đánh giá lại điều kiện trên giá trị mới nhất, nên không cần khoá cả bảng.
>
> Nhóm có 16 kịch bản kiểm thử nghiệp vụ chạy tự động qua API, kèm các bộ kiểm thử phân quyền và chức năng mở rộng. Tất cả đều chạy thật trên Oracle và đều đạt.

---

## Cảnh 12 – Tối ưu hoá và kết luận (13:30 – 14:30) · Minh Anh

**Màn hình**
1. Mở báo cáo PDF, Mục **4.4**: bảng tổng hợp và hình execution plan trước/sau của Q1, Q2, Q3.
   - Có thể thay bằng: mở `docs/TOI_UU.md`.
2. Kết thúc ở trang chủ Shopia.

**Lời thoại**
> Về tối ưu hoá, nhóm đo ba truy vấn trên khoảng 200 nghìn đơn bằng `DBMS_XPLAN`, so sánh số block đọc thực tế trước và sau khi tạo chỉ mục:
> - **Q1, "đơn của tôi"**: thêm chỉ mục trên khách hàng và ngày đặt, số block đọc giảm từ 3.021 xuống 20.
> - **Q2, lọc sản phẩm theo thương hiệu trong cột JSON**: thêm chỉ mục hàm `JSON_VALUE`, giảm từ 1.452 xuống 271.
> - **Q3, đọc một tài liệu đơn hàng**: thêm chỉ mục `order_id` ở các bảng con, giảm từ 5.388 xuống 28.
>
> Tóm lại, nhóm đã xây dựng hệ thống quản lý đơn hàng trên Oracle 23ai. Trong đó, cùng một nguồn dữ liệu quan hệ vừa phục vụ REST API dạng tài liệu JSON qua Duality View, vừa phục vụ báo cáo SQL, luôn nhất quán. Mọi quy tắc nghiệp vụ nằm ở cơ sở dữ liệu nên có hiệu lực với mọi kênh ghi.
>
> Mã nguồn đầy đủ có trên GitHub. Cảm ơn thầy cô đã theo dõi.

---

## Sau khi quay

- Chạy `.\scripts\db.ps1 reset` để đưa dữ liệu về ban đầu.
- Kiểm tra lại video:
  - có đủ tiếng;
  - chữ trên màn hình đọc được;
  - mỗi lỗi demo (403, 409, 412, 422) đều hiện rõ trên màn hình.
- Đặt tên tệp theo quy ước nộp bài, ví dụ `Lop408_Nhom12_DeTai15_Video.mp4`, rồi chép vào thư mục `nop_bai/Lop408_Nhom12_DeTai15/` trước khi nén.
