-- ==============================================================================
-- _DO: đo MỘT truy vấn. Gọi:  @@toi_uu/_do.sql <file truy vấn> "<nhãn>"
--   1) chạy lần 1 (nạp bộ đệm, phân tích câu lệnh) -> ghi nhận con trỏ và số liệu tích luỹ trong V$SQL
--   2) chạy lần 2 -> lấy CHÊNH LỆCH buffer_gets / elapsed_time = đúng chi phí của riêng lần 2
--      (nếu lần 2 sinh con trỏ con mới, lấy số liệu của con trỏ mới - chỉ có 1 lần chạy)
--   3) in execution plan của lần 2 (ALLSTATS LAST +COST) và một dòng TÓM TẮT
-- Vì sao lấy tổng từ V$SQL thay vì cột Buffers dòng Id 0 của plan? Với truy vấn trên Duality View
-- và truy vấn con trong SELECT, các nhánh con được in thành cây riêng, dòng Id 0 KHÔNG cộng dồn chúng.
-- ==============================================================================
SET TERMOUT OFF
@@&1
SET TERMOUT ON
BEGIN
  SELECT prev_sql_id, prev_child_number INTO :q_sql, :q_child
    FROM v$session WHERE sid = SYS_CONTEXT('USERENV', 'SID');
  SELECT buffer_gets, elapsed_time INTO :bg0, :et0
    FROM v$sql WHERE sql_id = :q_sql AND child_number = :q_child;
END;
/
SET TERMOUT OFF
@@&1
SET TERMOUT ON
DECLARE
  l_sql   VARCHAR2(13);
  l_child NUMBER;
BEGIN
  SELECT prev_sql_id, prev_child_number INTO l_sql, l_child
    FROM v$session WHERE sid = SYS_CONTEXT('USERENV', 'SID');
  IF l_sql = :q_sql AND l_child = :q_child THEN
    SELECT buffer_gets - :bg0, elapsed_time - :et0 INTO :bg, :et
      FROM v$sql WHERE sql_id = l_sql AND child_number = l_child;
  ELSE
    SELECT buffer_gets, elapsed_time INTO :bg, :et
      FROM v$sql WHERE sql_id = l_sql AND child_number = l_child;
    :q_sql := l_sql;
    :q_child := l_child;
  END IF;
  SELECT cost INTO :cost FROM v$sql_plan
   WHERE sql_id = :q_sql AND child_number = :q_child AND id = 0;
END;
/
PROMPT
PROMPT ===== &2
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(:q_sql, :q_child, 'ALLSTATS LAST +COST'));
SELECT 'TOM_TAT | &2 | Cost=' || :cost || ' | Buffers=' || :bg
       || ' | ms=' || TO_CHAR(:et / 1000, 'FM999990.00') AS tom_tat
  FROM dual;
