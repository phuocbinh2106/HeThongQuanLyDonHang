-- ==============================================================================
-- 01_DROP_ALL: XOÁ SẠCH mọi đối tượng trong schema ecom_schema để dựng lại từ đầu.
-- Chạy bằng ecom_schema (KHÔNG chạy bằng SYS). Dùng khi muốn cài lại toàn bộ.
-- Thứ tự: Duality View -> trigger -> package -> bảng -> sequence, cuối cùng dọn thùng rác.
-- ==============================================================================
BEGIN
  -- 1) Duality View (phụ thuộc vào bảng nên xoá trước)
  FOR r IN (SELECT view_name FROM user_json_duality_views) LOOP
    EXECUTE IMMEDIATE 'DROP VIEW "' || r.view_name || '"';
  END LOOP;

  -- 2) View thường, trigger, package, procedure, function
  FOR r IN (SELECT object_name, object_type FROM user_objects
             WHERE object_type IN ('VIEW','TRIGGER','PACKAGE','PROCEDURE','FUNCTION')) LOOP
    EXECUTE IMMEDIATE 'DROP ' || r.object_type || ' "' || r.object_name || '"';
  END LOOP;

  -- 3) Bảng (CASCADE CONSTRAINTS để bỏ qua thứ tự khoá ngoại; PURGE để không vào thùng rác)
  FOR r IN (SELECT table_name FROM user_tables WHERE table_name NOT LIKE 'BIN$%') LOOP
    EXECUTE IMMEDIATE 'DROP TABLE "' || r.table_name || '" CASCADE CONSTRAINTS PURGE';
  END LOOP;

  -- 4) Sequence do người dùng tạo (sequence ISEQ$$ của identity tự mất theo bảng)
  FOR r IN (SELECT sequence_name FROM user_sequences WHERE sequence_name NOT LIKE 'ISEQ$$%') LOOP
    EXECUTE IMMEDIATE 'DROP SEQUENCE "' || r.sequence_name || '"';
  END LOOP;

  -- 5) Synonym còn sót (nếu có)
  FOR r IN (SELECT synonym_name FROM user_synonyms) LOOP
    EXECUTE IMMEDIATE 'DROP SYNONYM "' || r.synonym_name || '"';
  END LOOP;
END;
/

PURGE RECYCLEBIN;
