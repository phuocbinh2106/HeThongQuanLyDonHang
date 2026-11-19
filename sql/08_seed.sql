-- ==============================================================================
-- 08_SEED: dữ liệu mẫu đủ minh hoạ mọi nghiệp vụ. Chạy bằng ecom_schema, trên schema RỖNG
-- (vừa chạy 01..07, hoặc sau t00_reset.sql). Khoá chính là identity nên ID bắt đầu từ 1.
--
-- Quy ước ID dành riêng cho kịch bản kiểm thử (KHÔNG dùng trong đơn mẫu):
--   * Sản phẩm 1, 2, 3 : tồn 10 / 20 / 50  -> TC-01, TC-03
--   * Sản phẩm 4       : INACTIVE           -> TC-04
--   * Sản phẩm 5       : tồn đúng 5         -> TC-10 (20 request đồng thời)
--   * Sản phẩm 35      : tồn 0 (hết hàng), 36: INACTIVE
--   * Khách 1, 2       : dùng để tạo đơn thử
-- Lưu ý SQL*Plus: không đặt chú thích "--" phía sau dấu ";" trên cùng một dòng.
-- ==============================================================================

-- ---------- 1. NGƯỜI BÁN (5) ----------
INSERT INTO sellers (shop_name, email, phone) VALUES (N'Samsung Store',      'samsung@shop.vn',    '0281111111');
INSERT INTO sellers (shop_name, email, phone) VALUES (N'Coolmate',           'coolmate@shop.vn',   '0282222222');
INSERT INTO sellers (shop_name, email, phone) VALUES (N'Laptop Pro Shop',    'laptoppro@shop.vn',  '0283333333');
INSERT INTO sellers (shop_name, email, phone) VALUES (N'Mỹ Phẩm Xinh',       'myphamxinh@shop.vn', '0284444444');
INSERT INTO sellers (shop_name, email, phone) VALUES (N'Nhà Sách Tri Thức',  'trithuc@shop.vn',    '0285555555');

-- ---------- 2. DANH MỤC (7, có cây cha - con qua parent_id) ----------
-- id 1..5 là danh mục gốc; id 6 là con của 1, id 7 là con của 2
INSERT INTO categories (category_name) VALUES (N'Điện thoại');
INSERT INTO categories (category_name) VALUES (N'Thời trang');
INSERT INTO categories (category_name) VALUES (N'Laptop');
INSERT INTO categories (category_name) VALUES (N'Mỹ phẩm');
INSERT INTO categories (category_name) VALUES (N'Sách');
INSERT INTO categories (parent_id, category_name) VALUES (1, N'Phụ kiện điện thoại');
INSERT INTO categories (parent_id, category_name) VALUES (2, N'Áo nam');

-- ---------- 3. SẢN PHẨM (36). Cột attributes là JSON, thuộc tính khác nhau theo ngành hàng ----------
-- id 1..5: dành cho kiểm thử
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (1, 1, 'SS-S24-256', N'Samsung Galaxy S24 256GB', 22990000, 10,
        JSON('{"brand":"Samsung","color":"Black","ramGb":8,"storageGb":256,"screenInch":6.2,"warrantyMonths":12}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (1, 1, 'SS-A15-128', N'Samsung Galaxy A15 128GB', 4490000, 20,
        JSON('{"brand":"Samsung","color":"Blue","ramGb":6,"storageGb":128,"screenInch":6.5,"warrantyMonths":12}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (2, 7, 'CM-TEE-W-M', N'Áo thun Coolmate Cotton trắng', 199000, 50,
        JSON('{"brand":"Coolmate","size":["S","M","L"],"color":"White","material":"Cotton"}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes, status)
VALUES (2, 7, 'CM-OLD-001', N'Áo thun mẫu cũ (ngừng bán)', 90000, 5,
        JSON('{"brand":"Coolmate"}'), 'INACTIVE');
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (1, 6, 'SS-BUDS-LTD', N'Tai nghe Galaxy Buds bản giới hạn', 3990000, 5,
        JSON('{"brand":"Samsung","color":"Purple","wireless":true,"batteryHours":30,"warrantyMonths":12}'));

-- id 6..11: điện thoại
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (1, 1, 'SS-S24U-512', N'Samsung Galaxy S24 Ultra 512GB', 33990000, 40,
        JSON('{"brand":"Samsung","color":"Titanium Gray","ramGb":12,"storageGb":512,"screenInch":6.8,"warrantyMonths":12}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (1, 1, 'SS-ZFLIP6-256', N'Samsung Galaxy Z Flip6 256GB', 25990000, 30,
        JSON('{"brand":"Samsung","color":"Mint","ramGb":12,"storageGb":256,"screenInch":6.7,"foldable":true,"warrantyMonths":12}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (3, 1, 'AP-IP15-128', N'iPhone 15 128GB', 19990000, 40,
        JSON('{"brand":"Apple","color":"Pink","ramGb":6,"storageGb":128,"screenInch":6.1,"warrantyMonths":12}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (3, 1, 'AP-IP15P-256', N'iPhone 15 Pro 256GB', 28990000, 35,
        JSON('{"brand":"Apple","color":"Natural Titanium","ramGb":8,"storageGb":256,"screenInch":6.1,"warrantyMonths":12}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (3, 1, 'XI-RN13-256', N'Xiaomi Redmi Note 13 256GB', 5290000, 60,
        JSON('{"brand":"Xiaomi","color":"Black","ramGb":8,"storageGb":256,"screenInch":6.67,"warrantyMonths":18}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (3, 1, 'OP-RENO11-256', N'OPPO Reno11 5G 256GB', 10990000, 45,
        JSON('{"brand":"OPPO","color":"Green","ramGb":8,"storageGb":256,"screenInch":6.7,"warrantyMonths":12}'));

-- id 12..14: phụ kiện điện thoại
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (1, 6, 'SS-CHG-25W', N'Củ sạc nhanh Samsung 25W', 390000, 200,
        JSON('{"brand":"Samsung","powerW":25,"compatibleWith":["Galaxy S","Galaxy A"],"warrantyMonths":6}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (3, 6, 'AK-CASE-IP15', N'Ốp lưng trong suốt iPhone 15', 150000, 300,
        JSON('{"brand":"Anker","material":"TPU","compatibleWith":["iPhone 15"]}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (3, 6, 'AK-PB-10K', N'Pin dự phòng Anker 10000mAh', 590000, 150,
        JSON('{"brand":"Anker","capacityMah":10000,"powerW":22.5,"warrantyMonths":18}'));

-- id 15..19: laptop
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (3, 3, 'DL-INS15-I5', N'Laptop Dell Inspiron 15 Core i5', 15990000, 25,
        JSON('{"brand":"Dell","cpu":"Intel Core i5-1335U","ramGb":16,"storageGb":512,"screenInch":15.6,"warrantyMonths":12}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (3, 3, 'AS-VIVO14-OLED', N'Laptop ASUS Vivobook 14 OLED', 17490000, 25,
        JSON('{"brand":"ASUS","cpu":"AMD Ryzen 5 7530U","ramGb":16,"storageGb":512,"screenInch":14,"warrantyMonths":24}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (3, 3, 'AP-MBA-M3', N'MacBook Air 13 M3 8GB/256GB', 27990000, 20,
        JSON('{"brand":"Apple","cpu":"Apple M3","ramGb":8,"storageGb":256,"screenInch":13.6,"warrantyMonths":12}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (3, 3, 'LN-IDEAPAD5', N'Laptop Lenovo IdeaPad Slim 5', 16490000, 25,
        JSON('{"brand":"Lenovo","cpu":"Intel Core i5-13420H","ramGb":16,"storageGb":512,"screenInch":14,"warrantyMonths":24}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (3, 3, 'HP-PAV15', N'Laptop HP Pavilion 15', 14990000, 25,
        JSON('{"brand":"HP","cpu":"Intel Core i5-1235U","ramGb":8,"storageGb":512,"screenInch":15.6,"warrantyMonths":12}'));

-- id 20..24: thời trang
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (2, 7, 'CM-POLO-NAVY', N'Áo polo nam Coolmate xanh navy', 299000, 200,
        JSON('{"brand":"Coolmate","size":["M","L","XL"],"color":"Navy","material":"Cotton pique"}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (2, 7, 'CM-SOMI-OXF', N'Áo sơ mi Oxford Coolmate', 349000, 150,
        JSON('{"brand":"Coolmate","size":["S","M","L","XL"],"color":"White","material":"Oxford"}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (2, 2, 'CM-JEAN-SLIM', N'Quần jean nam slim fit', 459000, 150,
        JSON('{"brand":"Coolmate","size":["29","30","31","32"],"color":"Blue","material":"Denim"}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (2, 2, 'YD-DAM-HOA', N'Đầm hoa nữ dáng xoè', 389000, 120,
        JSON('{"brand":"Yody","size":["S","M","L"],"color":"Floral","material":"Voan"}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (2, 2, 'YD-KHOAC-GIO', N'Áo khoác gió unisex chống nước', 499000, 120,
        JSON('{"brand":"Yody","size":["M","L","XL"],"color":"Black","material":"Polyester","waterproof":true}'));

-- id 25..29: mỹ phẩm
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (4, 4, 'LR-SRM-150', N'Sữa rửa mặt La Roche-Posay 150ml', 395000, 200,
        JSON('{"brand":"La Roche-Posay","volumeMl":150,"skinType":"Da dầu","origin":"Pháp"}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (4, 4, 'CC-TONER-140', N'Nước cân bằng bí đao Cocoon 140ml', 175000, 200,
        JSON('{"brand":"Cocoon","volumeMl":140,"skinType":"Mọi loại da","origin":"Việt Nam","vegan":true}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (4, 4, 'AN-KCN-60', N'Kem chống nắng Anessa 60ml', 485000, 180,
        JSON('{"brand":"Anessa","volumeMl":60,"spf":50,"origin":"Nhật Bản"}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (4, 4, 'BI-TTT-500', N'Nước tẩy trang Bioderma 500ml', 459000, 180,
        JSON('{"brand":"Bioderma","volumeMl":500,"skinType":"Da nhạy cảm","origin":"Pháp"}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (4, 4, '3C-SON-TAUPE', N'Son kem 3CE Velvet Lip Tint', 299000, 150,
        JSON('{"brand":"3CE","color":"Taupe","weightG":4,"origin":"Hàn Quốc"}'));

-- id 30..34: sách (thương hiệu = nhà xuất bản, vẫn bắt buộc có "brand")
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (5, 5, 'BK-DNT', N'Đắc Nhân Tâm', 86000, 300,
        JSON('{"brand":"NXB Tổng hợp TP.HCM","author":"Dale Carnegie","pages":320,"language":"vi","coverType":"Bìa mềm"}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (5, 5, 'BK-NGK', N'Nhà Giả Kim', 79000, 300,
        JSON('{"brand":"NXB Hội Nhà Văn","author":"Paulo Coelho","pages":228,"language":"vi","coverType":"Bìa mềm"}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (5, 5, 'BK-CLEAN-CODE', N'Clean Code (bản tiếng Anh)', 650000, 80,
        JSON('{"brand":"Prentice Hall","author":"Robert C. Martin","pages":464,"language":"en","coverType":"Bìa mềm"}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (5, 5, 'BK-HQTCSDL', N'Giáo trình Hệ quản trị cơ sở dữ liệu', 120000, 100,
        JSON('{"brand":"NXB ĐHQG TP.HCM","author":"Nhiều tác giả","pages":410,"language":"vi","coverType":"Bìa mềm"}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (5, 5, 'BK-TTDGBN', N'Tuổi Trẻ Đáng Giá Bao Nhiêu', 90000, 300,
        JSON('{"brand":"NXB Hội Nhà Văn","author":"Rosie Nguyễn","pages":285,"language":"vi","coverType":"Bìa mềm"}'));

-- id 35, 36: hết hàng / ngừng bán (để minh hoạ lỗi trên giao diện)
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
VALUES (1, 1, 'SS-A55-256', N'Samsung Galaxy A55 5G 256GB (hết hàng)', 9990000, 0,
        JSON('{"brand":"Samsung","color":"Navy","ramGb":8,"storageGb":256,"screenInch":6.6,"warrantyMonths":12}'));
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes, status)
VALUES (2, 7, 'CM-TANK-OLD', N'Áo ba lỗ mẫu cũ (ngừng bán)', 99000, 10,
        JSON('{"brand":"Coolmate","size":["M","L"],"material":"Cotton"}'), 'INACTIVE');

-- ---------- 4. KHÁCH HÀNG (10) + SỔ ĐỊA CHỈ ----------
INSERT INTO customers (full_name, email, phone) VALUES (N'Nguyễn Văn An',     'an.nguyen@mail.vn',   '0900000001');
INSERT INTO customers (full_name, email, phone) VALUES (N'Trần Thị Bình',     'binh.tran@mail.vn',   '0900000002');
INSERT INTO customers (full_name, email, phone) VALUES (N'Lê Hoàng Cường',    'cuong.le@mail.vn',    '0900000003');
INSERT INTO customers (full_name, email, phone) VALUES (N'Phạm Thu Dung',     'dung.pham@mail.vn',   '0900000004');
INSERT INTO customers (full_name, email, phone) VALUES (N'Hoàng Minh Đức',    'duc.hoang@mail.vn',   '0900000005');
INSERT INTO customers (full_name, email, phone) VALUES (N'Võ Thị Giang',      'giang.vo@mail.vn',    '0900000006');
INSERT INTO customers (full_name, email, phone) VALUES (N'Đặng Quốc Huy',     'huy.dang@mail.vn',    '0900000007');
INSERT INTO customers (full_name, email, phone) VALUES (N'Bùi Ngọc Lan',      'lan.bui@mail.vn',     '0900000008');
INSERT INTO customers (full_name, email, phone) VALUES (N'Đỗ Thành Nam',      'nam.do@mail.vn',      '0900000009');
INSERT INTO customers (full_name, email, phone, status) VALUES (N'Ngô Bảo Phúc', 'phuc.ngo@mail.vn', '0900000010', 'LOCKED');

INSERT INTO customer_addresses (customer_id, receiver_name, receiver_phone, address_line, ward, district, city, is_default)
VALUES (1, N'Nguyễn Văn An', '0900000001', N'12 Nguyễn Huệ', N'Phường Bến Nghé', N'Quận 1', N'TP.HCM', 1);
INSERT INTO customer_addresses (customer_id, receiver_name, receiver_phone, address_line, ward, district, city, is_default)
VALUES (1, N'Nguyễn Văn An (công ty)', '0900000001', N'828 Sư Vạn Hạnh', N'Phường 13', N'Quận 10', N'TP.HCM', 0);
INSERT INTO customer_addresses (customer_id, receiver_name, receiver_phone, address_line, ward, district, city, is_default)
VALUES (2, N'Trần Thị Bình', '0900000002', N'45 Lê Lợi', N'Phường Bến Thành', N'Quận 1', N'TP.HCM', 1);
INSERT INTO customer_addresses (customer_id, receiver_name, receiver_phone, address_line, ward, district, city, is_default)
VALUES (3, N'Lê Hoàng Cường', '0900000003', N'10 Trần Phú', N'Phường Hải Châu 1', N'Quận Hải Châu', N'Đà Nẵng', 1);
INSERT INTO customer_addresses (customer_id, receiver_name, receiver_phone, address_line, ward, district, city, is_default)
VALUES (4, N'Phạm Thu Dung', '0900000004', N'25 Hàng Bài', N'Phường Hàng Bài', N'Quận Hoàn Kiếm', N'Hà Nội', 1);
INSERT INTO customer_addresses (customer_id, receiver_name, receiver_phone, address_line, ward, district, city, is_default)
VALUES (5, N'Hoàng Minh Đức', '0900000005', N'88 Võ Văn Tần', N'Phường 6', N'Quận 3', N'TP.HCM', 1);
INSERT INTO customer_addresses (customer_id, receiver_name, receiver_phone, address_line, ward, district, city, is_default)
VALUES (6, N'Võ Thị Giang', '0900000006', N'5 Nguyễn Văn Cừ', N'Phường An Khánh', N'Quận Ninh Kiều', N'Cần Thơ', 1);
INSERT INTO customer_addresses (customer_id, receiver_name, receiver_phone, address_line, ward, district, city, is_default)
VALUES (7, N'Đặng Quốc Huy', '0900000007', N'120 Lạch Tray', N'Phường Lạch Tray', N'Quận Ngô Quyền', N'Hải Phòng', 1);
INSERT INTO customer_addresses (customer_id, receiver_name, receiver_phone, address_line, ward, district, city, is_default)
VALUES (8, N'Bùi Ngọc Lan', '0900000008', N'300 Phan Xích Long', N'Phường 2', N'Quận Phú Nhuận', N'TP.HCM', 1);
INSERT INTO customer_addresses (customer_id, receiver_name, receiver_phone, address_line, ward, district, city, is_default)
VALUES (9, N'Đỗ Thành Nam', '0900000009', N'7 Hùng Vương', N'Phường Lộc Thọ', N'TP Nha Trang', N'Khánh Hoà', 1);
INSERT INTO customer_addresses (customer_id, receiver_name, receiver_phone, address_line, ward, district, city, is_default)
VALUES (10, N'Ngô Bảo Phúc', '0900000010', N'15 Lý Thường Kiệt', N'Phường 7', N'Quận 10', N'TP.HCM', 1);
COMMIT;

-- ---------- 5. 60 ĐƠN HÀNG MẪU, trải 8 tháng, đủ 7 trạng thái ----------
-- Đơn được tạo qua ĐÚNG đường nghiệp vụ thật: INSERT orders/order_items -> trigger chốt giá,
-- trừ kho, tính tổng; pkg_order.sp_change_status -> kiểm tra sơ đồ trạng thái, ghi lịch sử;
-- pkg_order.sp_record_payment -> kiểm tra không vượt tổng tiền.
-- Sau đó mới "lùi ngày" (order_date, lịch sử, thanh toán, vận chuyển) để báo cáo có nhiều tháng.
-- Dữ liệu sinh theo công thức MOD (không ngẫu nhiên) nên chạy lại luôn ra cùng kết quả.
DECLARE
  TYPE t_path IS TABLE OF VARCHAR2(12);
  c_orders   CONSTANT PLS_INTEGER := 60;
  l_order_id orders.order_id%TYPE;
  l_cust     customers.customer_id%TYPE;
  l_target   VARCHAR2(12);
  l_path     t_path;
  l_date     TIMESTAMP;
  l_total    orders.total_amount%TYPE;
  l_method   VARCHAR2(20);
  l_carrier  VARCHAR2(60);
  l_lines    PLS_INTEGER;
  l_k        PLS_INTEGER;
  l_addr     customer_addresses%ROWTYPE;
BEGIN
  FOR i IN 1 .. c_orders LOOP
    -- Khách: xoay vòng 1..9 (khách 10 bị khoá, không có đơn)
    l_cust := MOD(i * 7, 9) + 1;
    SELECT * INTO l_addr FROM customer_addresses
     WHERE customer_id = l_cust AND is_default = 1;

    -- Trạng thái đích: 8 đơn gần nhất đang xử lý; đơn cũ phần lớn đã giao, xen kẽ huỷ / trả
    IF i > c_orders - 8 THEN
      l_target := CASE MOD(i, 4) WHEN 0 THEN 'PENDING' WHEN 1 THEN 'CONFIRMED'
                                 WHEN 2 THEN 'PACKING' ELSE 'SHIPPING' END;
    ELSE
      l_target := CASE MOD(i, 10) WHEN 0 THEN 'CANCELLED' WHEN 7 THEN 'CANCELLED'
                                  WHEN 3 THEN 'RETURNED'  ELSE 'DELIVERED' END;
    END IF;

    -- Đường đi trạng thái hợp lệ theo sơ đồ (BR-06)
    l_path := CASE l_target
      WHEN 'PENDING'   THEN t_path()
      WHEN 'CONFIRMED' THEN t_path('CONFIRMED')
      WHEN 'PACKING'   THEN t_path('CONFIRMED','PACKING')
      WHEN 'SHIPPING'  THEN t_path('CONFIRMED','PACKING','SHIPPING')
      WHEN 'DELIVERED' THEN t_path('CONFIRMED','PACKING','SHIPPING','DELIVERED')
      WHEN 'RETURNED'  THEN t_path('CONFIRMED','PACKING','SHIPPING','DELIVERED','RETURNED')
      WHEN 'CANCELLED' THEN CASE WHEN MOD(i, 10) = 0 THEN t_path('CANCELLED')
                                 ELSE t_path('CONFIRMED','CANCELLED') END
    END;

    -- Đầu đơn: địa chỉ giao là BẢN CHỤP từ sổ địa chỉ; freeship mỗi 3 đơn; giảm 50.000đ mỗi 5 đơn
    INSERT INTO orders (customer_id, ship_receiver, ship_phone, ship_address,
                        shipping_fee, discount_amount)
    VALUES (l_cust, l_addr.receiver_name, l_addr.receiver_phone,
            l_addr.address_line || ', ' || l_addr.ward || ', ' || l_addr.district || ', ' || l_addr.city,
            CASE WHEN MOD(i, 3) = 0 THEN 0 ELSE 30000 END,
            CASE WHEN MOD(i, 5) = 0 THEN 50000 ELSE 0 END)
    RETURNING order_id INTO l_order_id;

    -- 1..3 dòng hàng, chọn trong sản phẩm 6..34 (29 sản phẩm); unit_price do trigger gán
    l_lines := MOD(i, 3) + 1;
    FOR j IN 1 .. l_lines LOOP
      INSERT INTO order_items (order_id, product_id, quantity)
      VALUES (l_order_id, 6 + MOD(i * 7 + j * 11, 29), MOD(i + j, 2) + 1);
    END LOOP;

    -- Chạy qua các trạng thái bằng procedure nghiệp vụ
    FOR s IN 1 .. l_path.COUNT LOOP
      pkg_order.sp_change_status(l_order_id, l_path(s),
        CASE WHEN l_path(s) = 'CANCELLED' THEN 'customer' ELSE 'seller' END,
        CASE WHEN l_path(s) = 'CANCELLED' THEN N'Khách đổi ý'
             WHEN l_path(s) = 'RETURNED'  THEN N'Hàng lỗi, khách trả lại' END);

      -- Đơn chuyển sang SHIPPING thì có vận đơn
      IF l_path(s) = 'SHIPPING' THEN
        l_carrier := CASE MOD(i, 4) WHEN 0 THEN 'GHN' WHEN 1 THEN 'GHTK'
                                    WHEN 2 THEN 'Viettel Post' ELSE 'Ninja Van' END;
        INSERT INTO shipments (order_id, carrier, tracking_no, status, shipped_at)
        VALUES (l_order_id, l_carrier,
                UPPER(SUBSTR(REPLACE(l_carrier, ' '), 1, 4)) || LPAD(l_order_id * 7919, 9, '0'),
                'IN_TRANSIT', SYSTIMESTAMP);
      ELSIF l_path(s) IN ('DELIVERED','RETURNED') THEN
        UPDATE shipments SET status = l_path(s), delivered_at = SYSTIMESTAMP
         WHERE order_id = l_order_id;
      END IF;
    END LOOP;

    -- Thanh toán: COD trả khi nhận hàng; các phương thức khác trả trước khi giao
    l_method := CASE MOD(i, 4) WHEN 0 THEN 'COD' WHEN 1 THEN 'BANK_TRANSFER'
                               WHEN 2 THEN 'E_WALLET' ELSE 'CARD' END;
    SELECT total_amount INTO l_total FROM orders WHERE order_id = l_order_id;
    IF l_target IN ('DELIVERED','RETURNED')
       OR (l_target IN ('CONFIRMED','PACKING','SHIPPING') AND l_method <> 'COD') THEN
      pkg_order.sp_record_payment(l_order_id, l_method, l_total, 'TXN' || LPAD(l_order_id, 8, '0'));
    END IF;
    IF l_target = 'RETURNED' THEN
      UPDATE payments SET status = 'REFUNDED' WHERE order_id = l_order_id;
    END IF;

    -- Lùi ngày: đơn 1 cách đây ~244 ngày, đơn 60 cách đây 2 ngày (mỗi đơn cách nhau 4 ngày)
    l_date := CAST(TRUNC(SYSDATE) AS TIMESTAMP)
              - NUMTODSINTERVAL((c_orders + 2 - i) * 4, 'DAY')
              + NUMTODSINTERVAL(8 + MOD(i * 5, 12), 'HOUR');
    -- g_internal = TRUE: cho phép sửa order_date / order_no (trigger bình thường chặn).
    -- order_no dạng ORD-yyyymmdd-nnnnnn: thay phần ngày (ký tự 5..12) bằng ngày đặt mới.
    pkg_order_ctx.g_internal := TRUE;
    UPDATE orders
       SET order_date = l_date, updated_at = l_date,
           order_no   = 'ORD-' || TO_CHAR(l_date, 'YYYYMMDD') || SUBSTR(order_no, 13)
     WHERE order_id = l_order_id;
    pkg_order_ctx.g_internal := FALSE;

    l_k := 0;
    FOR h IN (SELECT history_id FROM order_status_history
               WHERE order_id = l_order_id ORDER BY history_id) LOOP
      UPDATE order_status_history
         SET changed_at = l_date + NUMTODSINTERVAL(l_k * 9, 'HOUR')
       WHERE history_id = h.history_id;
      l_k := l_k + 1;
    END LOOP;
    UPDATE payments  SET paid_at = l_date + NUMTODSINTERVAL(2, 'HOUR')
     WHERE order_id = l_order_id;
    UPDATE shipments SET shipped_at   = l_date + NUMTODSINTERVAL(27, 'HOUR'),
                         delivered_at = CASE WHEN delivered_at IS NOT NULL
                                             THEN l_date + NUMTODSINTERVAL(36, 'HOUR') END
     WHERE order_id = l_order_id;
  END LOOP;
  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    pkg_order_ctx.g_internal := FALSE;
    ROLLBACK;
    RAISE;
END;
/

-- Thống kê nhanh sau khi nạp
SELECT status, COUNT(*) AS so_don FROM orders GROUP BY status ORDER BY status;
