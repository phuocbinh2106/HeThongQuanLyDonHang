# ORDS AutoREST Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Oracle tự sinh REST API (ORDS AutoREST) cho 3 Duality View và một trang web so sánh với API C# tự viết.

**Architecture:** Container ORDS chính thức chạy cạnh `oracle23ai`, cài vào PDB `ecom`, AutoREST bật bằng PL/SQL trong
schema `ecom_schema`. Web thêm API chuyển tiếp `/api/ords/...` (chỉ quản trị, tránh CORS) và trang `/Ords`.

**Tech Stack:** Docker, ORDS ≥ 24.1, Oracle 23.26.3, ASP.NET Core (.NET 10) `HttpClient`, JS thuần, test Node (`fetch`).

**Spec:** `docs/superpowers/specs/2026-11-23-ords-autorest-design.md`

## Global Constraints
- Image: `container-registry.oracle.com/database/ords:latest`; cổng máy `8181` -> container `8080`; tên container `ords`.
- ORDS nối DB qua `host.docker.internal:1521/ecom`; mật khẩu SYS đọc lúc chạy từ env `ORACLE_PWD` của container Oracle, không ghi vào repo.
- Đường dẫn REST: `http://localhost:8181/ords/ecom/{order_dv|product_dv|customer_dv}/` (alias schema `ecom`), không xác thực.
- Cấu hình web: `Ords:BaseUrl` = `http://localhost:8181/ords/ecom/`.
- ORDS chưa chạy không được làm hỏng trang khác; `/Ords` và `/api/ords/*` chỉ quản trị.
- Không cập nhật báo cáo Word.

## Review Focus
- ORDS chưa chạy: `/api/ords/...` trả 503 ProblemDetails "ORDS chưa chạy", trang hiện thông báo (test ORDS-04 khi dừng container — kiểm tay).
- Đường dẫn chuyển tiếp lạ (`../`, URL tuyệt đối): chỉ cho `order_dv|product_dv|customer_dv` + phần đuôi số/ký tự an toàn, còn lại 400 (test ORDS-03).
- Vai trò không phải quản trị gọi `/api/ords/...` -> 401/403 (test ORDS-03).
- Lỗi do ORDS trả (ví dụ trigger ORA-20001) được chuyển nguyên mã HTTP + thân lỗi về trang (test ORDS-02).
- ETag ORDS và C# cùng một tài liệu phải trùng (test ORDS-01).

---

### Task 1: Chạy ORDS + bật AutoREST

**Files:**
- Create: `scripts/ords.ps1` (start | stop | status), `sql/11_ords_autorest.sql`
- Modify: `docker-compose.yml` (dịch vụ `ords`), `.gitignore` (thư mục cấu hình ORDS cục bộ nếu có)

- [ ] Step 1: `docker pull` image; `ords.ps1 start` tạo file chuỗi kết nối tạm (ngoài repo), chạy container, chờ log "ORDS is ready".
- [ ] Step 2: `sql/11_ords_autorest.sql` (chạy bằng `ecom_schema`): `ORDS.ENABLE_SCHEMA(p_enabled=>TRUE, p_schema=>'ECOM_SCHEMA', p_url_mapping_type=>'BASE_PATH', p_url_mapping_pattern=>'ecom', p_auto_rest_auth=>FALSE)`; `ORDS.ENABLE_OBJECT(p_object=>X, p_object_type=>'VIEW', p_object_alias=>lower(X), p_auto_rest_auth=>FALSE)` cho 3 view; `COMMIT`.
- [ ] Step 3: Kiểm tra: `curl http://localhost:8181/ords/ecom/order_dv/1` -> 200, có `_metadata.etag`.

### Task 2: Test trước (RED)

**Files:** Create `tests/ords_test.mjs` (biến `ECOM_BASE_URL`, `ORDS_BASE_URL`)

- [ ] ORDS-01: đơn #3: `GET {web}/api/orders/3` (admin) và `GET {web}/api/ords/order_dv/3` (admin) -> cùng `_id`, `orderNo`, `totalAmount`, số dòng `items`, cùng ETag.
- [ ] ORDS-02: `POST {web}/api/ords/order_dv/` (admin) tài liệu đơn khách 1, 1 dòng sản phẩm 1 số lượng 99999 -> HTTP ≥ 400 và thân chứa `ORA-20001`.
- [ ] ORDS-03: vãng lai -> 401, khách -> 403; `GET /api/ords/../x` hoặc view lạ `/api/ords/orders/1` -> 400.
- [ ] Chạy: thấy FAIL vì `/api/ords` chưa có (404).

### Task 3: API chuyển tiếp + trang /Ords (GREEN)

**Files:**
- Create: `src/Ecom.Web/Controllers/Api/OrdsApiController.cs`, `src/Ecom.Web/Controllers/OrdsController.cs`, `src/Ecom.Web/Views/Ords/Index.cshtml`, `src/Ecom.Web/wwwroot/js/ords.js`
- Modify: `Program.cs` (`AddHttpClient("ords")`), `appsettings.json` (`Ords:BaseUrl`), `_Layout.cshtml` (menu quản trị)

**Interfaces:**
- `GET|POST|PUT /api/ords/{view}/{**rest}` `[RequireRole(Admin)]`; `view` ∈ {order_dv, product_dv, customer_dv}; `rest` khớp `^[0-9A-Za-z_\-]*$`; chuyển tiếp body, `If-Match`, trả nguyên status + content-type + `ETag` + header `X-Ords-Url` (URL gốc). Lỗi kết nối -> 503 ProblemDetails.
- Trang: chọn mã đơn -> hai cột (C# | ORDS): URL, HTTP, ETag, JSON; nút "Ghi thử qua ORDS: đặt quá tồn kho".

- [ ] Chạy `tests/ords_test.mjs` -> 3/3 PASS; `api_authz` + `api_test_cases` vẫn PASS; reset dữ liệu.

### Task 4: Tài liệu + commit
- [ ] README mục "ORDS AutoREST" (chạy `scripts/ords.ps1 start`, `db.ps1 file 11_ords_autorest.sql`, URL mẫu); `THAY_DOI_THIET_KE.md` Đ17.
- [ ] Commit (không push nếu người dùng chưa bảo).
