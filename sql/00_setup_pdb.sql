-- ==============================================================================
-- SETUP PLUGGABLE DATABASE: ĐỀ TÀI 15 - HỆ THỐNG QUẢN LÝ ĐƠN HÀNG SÀN TMĐT
-- Oracle Database 23ai (Free) - PDB: ecom / Schema: ecom_schema
--
-- LƯU Ý KHI CHẠY (DBeaver):
--   * Kết nối bằng user SYS, Role SYSDBA, Service name = FREE (đây là CDB gốc,
--     KHÔNG dùng FREEPDB1), vì lệnh CREATE PLUGGABLE DATABASE chỉ chạy ở CDB$ROOT.
--   * Chạy cả file bằng Alt+X (Execute script).
-- ==============================================================================

-- ==============================================================================
-- BƯỚC 1: TẠO VÀ MỞ PLUGGABLE DATABASE (PDB)
-- ==============================================================================
ALTER SESSION SET CONTAINER = CDB$ROOT;

-- Tạo PDB mới tên là ecom (Cấp tài khoản quản trị cụm admin_ecom)
CREATE PLUGGABLE DATABASE ecom ADMIN USER admin_ecom IDENTIFIED BY oracle
FILE_NAME_CONVERT = ('/opt/oracle/oradata/FREE/pdbseed/', '/opt/oracle/oradata/FREE/ecom/');

-- Mở PDB và lưu trạng thái để tự động mở khi khởi động lại server
ALTER PLUGGABLE DATABASE ecom OPEN;
ALTER PLUGGABLE DATABASE ecom SAVE STATE;

-- Chuyển phiên làm việc (session) vào PDB vừa tạo để thực hiện các bước tiếp theo
ALTER SESSION SET CONTAINER = ecom;

-- ==============================================================================
-- BƯỚC 2: TẠO TABLESPACE (Không gian lưu trữ vật lý cho đề tài 15)
-- ==============================================================================
-- Lưu file .dbf vào đúng thư mục ecom
CREATE TABLESPACE ecom_tablespace
DATAFILE '/opt/oracle/oradata/FREE/ecom/ecom_tablespace.dbf'
SIZE 500M
AUTOEXTEND ON NEXT 100M MAXSIZE 2G;

-- ==============================================================================
-- BƯỚC 3: TẠO USER / SCHEMA (Gắn với Tablespace vừa tạo)
-- ==============================================================================
CREATE USER ecom_schema IDENTIFIED BY oracle
    DEFAULT TABLESPACE ecom_tablespace
    TEMPORARY TABLESPACE TEMP
    QUOTA UNLIMITED ON ecom_tablespace;

-- ==============================================================================
-- BƯỚC 4: CẤP QUYỀN HỆ THỐNG (GRANTS)
-- ==============================================================================
-- 4a. Quyền đăng nhập & kết nối
GRANT CREATE SESSION TO ecom_schema;
GRANT DEBUG CONNECT SESSION TO ecom_schema;

-- 4b. Quyền tạo và chỉnh sửa cấu trúc dữ liệu cơ bản
GRANT CREATE TABLE TO ecom_schema;
GRANT CREATE SEQUENCE TO ecom_schema;
-- CREATE VIEW cũng là quyền dùng để tạo JSON Relational Duality View
-- (lưu ý: KHÔNG đặt chú thích "--" sau dấu ";" cùng dòng, SQL*Plus sẽ gộp lệnh -> ORA-03405)
GRANT CREATE VIEW TO ecom_schema;

-- 4c. Quyền lập trình PL/SQL (Procedures, Functions, Triggers, Packages)
GRANT CREATE PROCEDURE TO ecom_schema;
GRANT CREATE TRIGGER TO ecom_schema;
GRANT CREATE TYPE TO ecom_schema;

-- 4d. Quyền phục vụ kiểm thử đồng thời và phân tích execution plan (Chương 4)
GRANT SELECT ON v_$lock TO ecom_schema;
GRANT SELECT ON v_$session TO ecom_schema;
GRANT SELECT ON v_$sql TO ecom_schema;
GRANT SELECT ON v_$sql_plan TO ecom_schema;
GRANT SELECT ON v_$sql_plan_statistics_all TO ecom_schema;

-- Hoàn tất thiết lập
COMMIT;

-- thông tin đăng nhập
-- Database / Service Name: ecom
-- Username: ecom_schema
-- Password: oracle
-- Role: Normal (mặc định)
