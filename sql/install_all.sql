-- ==============================================================================
-- INSTALL_ALL: cài toàn bộ schema theo đúng thứ tự (dùng cho SQL*Plus / SQLcl).
--   sqlplus ecom_schema/<mật khẩu>@localhost:1521/ecom @install_all.sql
-- DBeaver không hiểu lệnh @@ -> khi dùng DBeaver hãy mở và chạy (Alt+X) từng file theo
-- đúng thứ tự dưới đây.
-- ==============================================================================
SET ECHO OFF
SET FEEDBACK ON
SET DEFINE OFF
SET SQLBLANKLINES ON
SET SERVEROUTPUT ON
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

PROMPT ===== 01_drop_all.sql
@@01_drop_all.sql
PROMPT ===== 02_tables.sql
@@02_tables.sql
PROMPT ===== 03_indexes.sql
@@03_indexes.sql
PROMPT ===== 03b_indexes_toi_uu.sql
@@03b_indexes_toi_uu.sql
PROMPT ===== 04_pkg_order.sql
@@04_pkg_order.sql
PROMPT ===== 05_triggers.sql
@@05_triggers.sql
PROMPT ===== 06_duality_views.sql
@@06_duality_views.sql
PROMPT ===== 07_pkg_order_rpt.sql
@@07_pkg_order_rpt.sql
PROMPT ===== 08_seed.sql
@@08_seed.sql

PROMPT ===== Kiểm tra đối tượng lỗi (phải không có dòng nào)
SELECT name, type, line, text FROM user_errors ORDER BY name, sequence;
SELECT object_name, object_type FROM user_objects WHERE status <> 'VALID';
PROMPT ===== HOÀN TẤT
EXIT
