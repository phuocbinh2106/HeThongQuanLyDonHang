-- ==============================================================================
-- 10_TOI_UU_Q1_Q3: đo execution plan TRƯỚC và SAU tối ưu (Chương 4 – Tối ưu hoá).
-- Chạy SAU 09_bulk_data.sql (cần dữ liệu lớn), bằng ecom_schema, trong SQL*Plus / SQLcl:
--   .\scripts\db.ps1 file 10_toi_uu_Q1_Q3.sql
-- Kết quả và phân tích: docs/TOI_UU.md
--
-- Hai cách tối ưu được đo:
--   (A) THÊM CHỈ MỤC (sql/03b_indexes_toi_uu.sql): IX-1 cho Q1, IX-6 cho Q2, IX-5 cho Q3
--   (B) VIẾT LẠI CÂU SQL của ứng dụng: M3 (Q1b -> Q1c), M1 (Q2b -> Q2c / Q2d)
-- Mỗi truy vấn nằm trong một file ở sql/toi_uu/; script con toi_uu/_do.sql chạy 2 lần, đo lần 2:
--   Cost    : chi phí optimizer ƯỚC LƯỢNG (dòng Id 0)
--   Buffers : tổng số block đọc từ bộ đệm của lần chạy (logical reads, lấy từ V$SQL) – chỉ số chính
--   ms      : thời gian thực của lần chạy (elapsed_time trong V$SQL)
-- Tham số: khách #1 (2.006 đơn), brand 'Apple' (253 / 50.036 sản phẩm), một đơn lớn đã giao.
-- ==============================================================================
SET DEFINE ON
SET SERVEROUTPUT OFF
SET LINESIZE 260
SET PAGESIZE 2000
SET LONG 100000
SET LONGCHUNKSIZE 100000
SET FEEDBACK OFF
SET VERIFY OFF
COLUMN plan_table_output FORMAT A250
COLUMN tom_tat FORMAT A120

-- Thu thập thống kê thực thi chi tiết (A-Rows, A-Time, Buffers) cho mọi câu lệnh trong phiên
ALTER SESSION SET statistics_level = ALL;

VARIABLE cust    NUMBER
VARIABLE off     NUMBER
VARIABLE n       NUMBER
VARIABLE max_rows NUMBER
VARIABLE brand   VARCHAR2(60)
VARIABLE oid     NUMBER
VARIABLE q_sql   VARCHAR2(13)
VARIABLE q_child NUMBER
VARIABLE bg0     NUMBER
VARIABLE et0     NUMBER
VARIABLE bg      NUMBER
VARIABLE et      NUMBER
VARIABLE cost    NUMBER
BEGIN
  :cust  := 1;
  :off   := 0;
  :n     := 20;
  :max_rows := 200;
  :brand := 'Apple';
  SELECT MIN(order_id) INTO :oid FROM orders WHERE note = 'BULK' AND status = 'DELIVERED';
END;
/
SELECT 'Dữ liệu: ' || (SELECT COUNT(*) FROM orders) || ' đơn, '
       || (SELECT COUNT(*) FROM products) || ' sản phẩm; khách #1 có '
       || (SELECT COUNT(*) FROM orders WHERE customer_id = :cust) || ' đơn; brand Apple có '
       || (SELECT COUNT(*) FROM products WHERE JSON_VALUE(attributes, '$.brand' RETURNING VARCHAR2(60)) = :brand)
       || ' sản phẩm; Q3 đọc đơn order_id = ' || :oid AS tom_tat
  FROM dual;

-- ---------- Đưa về trạng thái TRƯỚC: xoá IX-1, IX-5, IX-6 nếu đang có ----------
BEGIN
  FOR r IN (SELECT index_name FROM user_indexes
             WHERE index_name IN ('IX_ORDERS_CUST_DATE', 'IX_PAYMENTS_ORDER', 'IX_SHIPMENTS_ORDER',
                                  'IX_HISTORY_ORDER', 'IX_PRODUCTS_BRAND')) LOOP
    EXECUTE IMMEDIATE 'DROP INDEX ' || r.index_name;
  END LOOP;
END;
/

PROMPT
PROMPT ######################  TRƯỚC: chưa có IX-1, IX-5, IX-6  ######################
@@toi_uu/_do.sql q1.sql                    "TRUOC | Q1  don cua toi (orders)"
@@toi_uu/_do.sql q1b_m3_cu.sql             "TRUOC | Q1b M3 cau SQL cu"
@@toi_uu/_do.sql q1c_m3_moi.sql            "TRUOC | Q1c M3 cau SQL moi"
@@toi_uu/_do.sql q2.sql                    "TRUOC | Q2  loc brand tren bang"
@@toi_uu/_do.sql q2b_m1_cu.sql             "TRUOC | Q2b M1 cau SQL cu"
@@toi_uu/_do.sql q2c_m1_moi.sql            "TRUOC | Q2c M1 cau SQL moi"
@@toi_uu/_do.sql q2d_loc_tren_tai_lieu.sql "TRUOC | Q2d loc tren tai lieu DV"
@@toi_uu/_do.sql q3.sql                    "TRUOC | Q3  doc 1 tai lieu ORDER_DV"

PROMPT
PROMPT ######################  TẠO CHỈ MỤC: sql/03b_indexes_toi_uu.sql  ######################
@@03b_indexes_toi_uu.sql

PROMPT
PROMPT ######################  SAU: đã có IX-1, IX-5, IX-6  ######################
@@toi_uu/_do.sql q1.sql                    "SAU   | Q1  don cua toi (orders)"
@@toi_uu/_do.sql q1b_m3_cu.sql             "SAU   | Q1b M3 cau SQL cu"
@@toi_uu/_do.sql q1c_m3_moi.sql            "SAU   | Q1c M3 cau SQL moi"
@@toi_uu/_do.sql q2.sql                    "SAU   | Q2  loc brand tren bang"
@@toi_uu/_do.sql q2b_m1_cu.sql             "SAU   | Q2b M1 cau SQL cu"
@@toi_uu/_do.sql q2c_m1_moi.sql            "SAU   | Q2c M1 cau SQL moi"
@@toi_uu/_do.sql q2d_loc_tren_tai_lieu.sql "SAU   | Q2d loc tren tai lieu DV"
@@toi_uu/_do.sql q3.sql                    "SAU   | Q3  doc 1 tai lieu ORDER_DV"

ALTER SESSION SET statistics_level = TYPICAL;
