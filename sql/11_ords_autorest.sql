-- ==============================================================================
-- 11_ORDS_AUTOREST: bật ORDS AutoREST cho 3 Duality View (tuỳ chọn, cần container ORDS: scripts\ords.ps1 start)
--
-- Chạy bằng user ecom_schema (DBeaver: Alt+X; hoặc .\scripts\db.ps1 file 11_ords_autorest.sql).
-- Sau khi chạy, Oracle TỰ SINH REST API, không cần viết code:
--   GET    http://localhost:8181/ords/ecom/order_dv/            danh sách tài liệu (có phân trang)
--   GET    http://localhost:8181/ords/ecom/order_dv/{id}        một tài liệu + ETag
--   POST   http://localhost:8181/ords/ecom/order_dv/            thêm tài liệu  = INSERT INTO order_dv
--   PUT    http://localhost:8181/ords/ecom/order_dv/{id}        ghi đè (If-Match) = UPDATE order_dv
--   DELETE http://localhost:8181/ords/ecom/order_dv/{id}        bị từ chối vì ORDER_DV khai báo NODELETE
-- (tương tự product_dv, customer_dv)
--
-- p_auto_rest_auth => FALSE: KHÔNG yêu cầu đăng nhập (chỉ dùng demo trên máy cá nhân). ORDS không đi qua
-- phân quyền theo vai trò của API C#; nhưng mọi quy tắc nghiệp vụ nằm ở bảng nền (trigger, ràng buộc,
-- JSON Schema) VẪN chạy, vì ORDS cũng chỉ ghi vào Duality View.
-- Tắt lại: chạy khối "TẮT" ở cuối file.
-- ==============================================================================
BEGIN
  -- Cho phép ORDS phục vụ schema ecom_schema tại đường dẫn /ords/ecom/
  ORDS.ENABLE_SCHEMA(
    p_enabled             => TRUE,
    p_schema              => 'ECOM_SCHEMA',
    p_url_mapping_type    => 'BASE_PATH',
    p_url_mapping_pattern => 'ecom',
    p_auto_rest_auth      => FALSE);

  -- AutoREST cho từng Duality View; alias = tên trên URL
  ORDS.ENABLE_OBJECT(p_enabled => TRUE, p_schema => 'ECOM_SCHEMA', p_object => 'ORDER_DV',
                     p_object_type => 'VIEW', p_object_alias => 'order_dv', p_auto_rest_auth => FALSE);
  ORDS.ENABLE_OBJECT(p_enabled => TRUE, p_schema => 'ECOM_SCHEMA', p_object => 'PRODUCT_DV',
                     p_object_type => 'VIEW', p_object_alias => 'product_dv', p_auto_rest_auth => FALSE);
  ORDS.ENABLE_OBJECT(p_enabled => TRUE, p_schema => 'ECOM_SCHEMA', p_object => 'CUSTOMER_DV',
                     p_object_type => 'VIEW', p_object_alias => 'customer_dv', p_auto_rest_auth => FALSE);
  COMMIT;
END;
/

-- Kiểm tra: các đối tượng đang bật AutoREST
SELECT parsing_object, object_alias, type, status FROM user_ords_enabled_objects ORDER BY object_alias;

-- ------------------------------------------------------------------------------
-- TẮT (bỏ chú thích rồi chạy nếu muốn gỡ AutoREST):
-- BEGIN
--   FOR v IN (SELECT 'ORDER_DV' n FROM dual UNION ALL SELECT 'PRODUCT_DV' FROM dual UNION ALL SELECT 'CUSTOMER_DV' FROM dual) LOOP
--     ORDS.ENABLE_OBJECT(p_enabled => FALSE, p_schema => 'ECOM_SCHEMA', p_object => v.n, p_object_type => 'VIEW');
--   END LOOP;
--   COMMIT;
-- END;
-- /
