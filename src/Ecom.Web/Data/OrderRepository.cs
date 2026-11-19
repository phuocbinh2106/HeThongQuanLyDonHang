using Ecom.Web.Models;
using Oracle.ManagedDataAccess.Client;

namespace Ecom.Web.Data;

/// <summary>Kết quả một truy vấn bảng: câu SQL đã chạy, tên cột, các dòng.</summary>
public record TableRows(string Sql, List<string> Columns, List<Dictionary<string, object?>> Rows);

/// <summary>
/// ĐƯỜNG QUAN HỆ của đơn hàng: đọc trực tiếp các dòng trong 5 bảng nền mà ORDER_DV ánh xạ tới.
/// Dùng cho tab "Dạng bảng quan hệ" ở M4: cùng một đơn, nhưng nhìn bằng bảng chuẩn hoá thay vì
/// tài liệu JSON -> chứng minh Duality View KHÔNG lưu bản sao, tài liệu được sinh từ chính các dòng này.
/// ROWID được lấy kèm để thấy đây là các dòng vật lý thật trong bảng.
/// </summary>
public class OrderRepository(OracleConnectionFactory db)
{
    // Mỗi bảng một câu SELECT đơn giản, không JOIN, lọc theo khoá :id (bind variable)
    private static readonly (string Table, string Sql)[] RelationalQueries =
    [
        ("orders", """
            SELECT ROWIDTOCHAR(o.rowid) AS row_id, o.order_id, o.order_no, o.customer_id, o.status,
                   o.order_date, o.ship_receiver, o.ship_phone, o.ship_address, o.subtotal,
                   o.shipping_fee, o.discount_amount, o.total_amount, o.updated_at
              FROM orders o
             WHERE o.order_id = :id
            """),
        ("order_items", """
            SELECT ROWIDTOCHAR(i.rowid) AS row_id, i.order_item_id, i.order_id, i.product_id,
                   i.quantity, i.unit_price
              FROM order_items i
             WHERE i.order_id = :id
             ORDER BY i.order_item_id
            """),
        ("payments", """
            SELECT ROWIDTOCHAR(p.rowid) AS row_id, p.payment_id, p.order_id, p.method, p.amount,
                   p.status, p.paid_at, p.transaction_ref
              FROM payments p
             WHERE p.order_id = :id
             ORDER BY p.payment_id
            """),
        ("shipments", """
            SELECT ROWIDTOCHAR(s.rowid) AS row_id, s.shipment_id, s.order_id, s.carrier, s.tracking_no,
                   s.status, s.shipped_at, s.delivered_at
              FROM shipments s
             WHERE s.order_id = :id
             ORDER BY s.shipment_id
            """),
        ("order_status_history", """
            SELECT ROWIDTOCHAR(h.rowid) AS row_id, h.history_id, h.order_id, h.old_status,
                   h.new_status, h.changed_at, h.changed_by, h.note
              FROM order_status_history h
             WHERE h.order_id = :id
             ORDER BY h.history_id
            """),
    ];

    // ------------------------------------------------------------------------------------------
    // NGHIỆP VỤ qua package PKG_ORDER (đường quan hệ). Mỗi thao tác là một giao dịch; xong thì
    // đọc lại tài liệu ORDER_DV trên cùng kết nối để trả về trạng thái mới + ETag mới.
    // Lỗi nghiệp vụ (ORA-20002 sai trạng thái, ORA-20005 vượt tổng...) để nguyên OracleException
    // bay ra, OracleExceptionFilter sẽ đổi thành HTTP 422/409/404.
    // ------------------------------------------------------------------------------------------

    /// <summary>
    /// Trạng thái kế tiếp hợp lệ của đơn. Lấy từ CHÍNH hàm pkg_order.fn_is_valid_transition
    /// (Oracle 23ai cho gọi hàm PL/SQL trả BOOLEAN ngay trong SQL) -> sơ đồ trạng thái chỉ
    /// được định nghĩa MỘT chỗ trong CSDL, giao diện không chép lại.
    /// </summary>
    public async Task<(string Current, List<string> Next)?> NextStatusesAsync(long id, CancellationToken ct)
    {
        const string sql = """
            SELECT o.status,
                   (SELECT LISTAGG(s.column_value, ',')
                      FROM TABLE(sys.odcivarchar2list('PENDING','CONFIRMED','PACKING','SHIPPING',
                                                      'DELIVERED','CANCELLED','RETURNED')) s
                     WHERE pkg_order.fn_is_valid_transition(o.status, s.column_value)) AS next_list
              FROM orders o
             WHERE o.order_id = :id
            """;
        await using var conn = await db.OpenAsync(ct: ct);
        await using var cmd = new OracleCommand(sql, conn);
        cmd.Parameters.Add(new OracleParameter("id", id));
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return null;
        var next = r.IsDBNull(1) ? [] : r.GetString(1).Split(',').ToList();
        return (r.GetString(0), next);
    }

    /// <summary>Đổi trạng thái: pkg_order.sp_change_status (trigger kiểm tra sơ đồ, ghi lịch sử, hoàn kho).</summary>
    public Task<string> ChangeStatusAsync(long id, string status, string? note, string user, CancellationToken ct)
        => CallAsync("pkg_order.sp_change_status", user, ct,
            new OracleParameter("p_order_id", id),
            new OracleParameter("p_new_status", status),
            new OracleParameter("p_user", user),
            new OracleParameter("p_note", (object?)note ?? DBNull.Value));

    /// <summary>Huỷ đơn: pkg_order.sp_cancel_order (chỉ được khi chưa SHIPPING; hoàn kho).</summary>
    public Task<string> CancelAsync(long id, string? reason, string user, CancellationToken ct)
        => CallAsync("pkg_order.sp_cancel_order", user, ct,
            new OracleParameter("p_order_id", id),
            new OracleParameter("p_reason", (object?)reason ?? DBNull.Value),
            new OracleParameter("p_user", user));

    /// <summary>Ghi thanh toán: pkg_order.sp_record_payment (khoá dòng đơn FOR UPDATE, không cho vượt tổng).</summary>
    public Task<string> RecordPaymentAsync(long id, string method, decimal amount, string? reference,
                                           string user, CancellationToken ct)
        => CallAsync("pkg_order.sp_record_payment", user, ct,
            new OracleParameter("p_order_id", id),
            new OracleParameter("p_method", method),
            new OracleParameter("p_amount", amount),
            new OracleParameter("p_ref", (object?)reference ?? DBNull.Value));

    /// <summary>Gọi một procedure trong giao dịch riêng, commit, rồi trả tài liệu ORDER_DV mới.</summary>
    private async Task<string> CallAsync(string procedure, string user, CancellationToken ct,
                                         params OracleParameter[] parameters)
    {
        await using var conn = await db.OpenAsync(user, ct);
        await using var tx = conn.BeginTransaction();
        await using (var cmd = new OracleCommand(procedure, conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure,
            BindByName = true,
            Transaction = tx,
        })
        {
            cmd.Parameters.AddRange(parameters);
            await cmd.ExecuteNonQueryAsync(ct);
        }
        await tx.CommitAsync(ct);
        var orderId = Convert.ToInt64(parameters[0].Value);
        return (await DualityViewStore.GetAsync(conn, DualityView.ORDER_DV, orderId, ct))!;
    }

    // ------------------------------------------------------------------------------------------
    // M3 – DANH SÁCH ĐƠN: đọc bảng quan hệ (không dựng tài liệu JSON cho từng đơn).
    // Khi chỉ lọc theo khách, câu chính có đúng dạng truy vấn Q1 của phần tối ưu:
    //   SELECT ... FROM orders o WHERE o.customer_id = :cust
    //   ORDER BY o.order_date DESC FETCH NEXT 20 ROWS ONLY      -> chỉ mục IX-1 (customer_id, order_date DESC)
    // ------------------------------------------------------------------------------------------
    public async Task<OrderListResult> ListAsync(Models.OrderFilter f, CancellationToken ct)
    {
        var pageSize = Math.Clamp(f.PageSize, 1, 100);
        var page = Math.Max(f.Page, 1);

        // Điều kiện lọc: chỉ ghép các mảnh SQL CỐ ĐỊNH; mọi giá trị người dùng đi qua bind variable
        (string Where, List<OracleParameter> Binds) Build(bool withStatus)
        {
            var w = new List<string>();
            var b = new List<OracleParameter>();
            if (f.CustomerId is not null) { w.Add("o.customer_id = :cust"); b.Add(new("cust", f.CustomerId)); }
            if (withStatus && !string.IsNullOrWhiteSpace(f.Status))
            { w.Add("o.status = :status"); b.Add(new("status", f.Status.ToUpperInvariant())); }
            if (f.From is not null) { w.Add("o.order_date >= :d_from"); b.Add(new("d_from", OracleDbType.Date) { Value = f.From.Value.Date }); }
            if (f.To is not null) { w.Add("o.order_date < :d_to"); b.Add(new("d_to", OracleDbType.Date) { Value = f.To.Value.Date.AddDays(1) }); }
            if (!string.IsNullOrWhiteSpace(f.Q)) { w.Add("o.order_no LIKE '%' || UPPER(:q) || '%'"); b.Add(new("q", f.Q.Trim())); }
            return (w.Count == 0 ? "1 = 1" : string.Join("\n   AND ", w), b);
        }

        var (where, binds) = Build(withStatus: true);
        var sql = $"""
            SELECT o.order_id, o.order_no, o.order_date, o.customer_id, c.full_name, o.status,
                   (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.order_id)          AS item_count,
                   o.total_amount,
                   (SELECT NVL(SUM(p.amount), 0) FROM payments p
                     WHERE p.order_id = o.order_id AND p.status = 'PAID')                     AS paid_amount,
                   (SELECT MAX(s.carrier) KEEP (DENSE_RANK LAST ORDER BY s.shipment_id)
                      FROM shipments s WHERE s.order_id = o.order_id)                         AS carrier
              FROM orders o
              JOIN customers c ON c.customer_id = o.customer_id
             WHERE {where}
             ORDER BY o.order_date DESC
             OFFSET :off ROWS FETCH NEXT :n ROWS ONLY
            """;

        await using var conn = await db.OpenAsync(ct: ct);

        // 1) Trang dữ liệu
        var items = new List<OrderListItem>();
        await using (var cmd = new OracleCommand(sql, conn) { BindByName = true })
        {
            cmd.Parameters.AddRange(binds.ToArray());
            cmd.Parameters.Add(new OracleParameter("off", (page - 1) * pageSize));
            cmd.Parameters.Add(new OracleParameter("n", pageSize));
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
                items.Add(new OrderListItem(r.GetInt64(0), r.GetString(1), r.GetDateTime(2), r.GetInt64(3),
                    r.GetString(4), r.GetString(5), r.GetInt32(6), r.GetDecimal(7), r.GetDecimal(8),
                    r.IsDBNull(9) ? null : r.GetString(9)));
        }

        // 2) Tổng số đơn khớp bộ lọc (để phân trang)
        int total;
        var (w2, b2) = Build(withStatus: true);
        await using (var cmd = new OracleCommand($"SELECT COUNT(*) FROM orders o WHERE {w2}", conn) { BindByName = true })
        {
            cmd.Parameters.AddRange(b2.ToArray());
            total = Convert.ToInt32(await cmd.ExecuteScalarAsync(ct));
        }

        // 3) Số đơn theo từng trạng thái (cùng bộ lọc, trừ điều kiện trạng thái) -> các nút lọc nhanh
        var counts = new Dictionary<string, int>();
        var (w3, b3) = Build(withStatus: false);
        await using (var cmd = new OracleCommand(
            $"SELECT o.status, COUNT(*) FROM orders o WHERE {w3} GROUP BY o.status", conn) { BindByName = true })
        {
            cmd.Parameters.AddRange(b3.ToArray());
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct)) counts[r.GetString(0)] = r.GetInt32(1);
        }

        return new OrderListResult(total, page, pageSize, sql, counts, items);
    }

    /// <summary>Các dòng của đơn trong 5 bảng nền; null nếu không có đơn này.</summary>
    public async Task<Dictionary<string, TableRows>?> GetRelationalAsync(long id, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(ct: ct);
        var result = new Dictionary<string, TableRows>();
        foreach (var (table, sql) in RelationalQueries)
        {
            await using var cmd = new OracleCommand(sql, conn);
            cmd.Parameters.Add(new OracleParameter("id", id));
            await using var r = await cmd.ExecuteReaderAsync(ct);
            var cols = Enumerable.Range(0, r.FieldCount).Select(r.GetName).ToList();
            var rows = new List<Dictionary<string, object?>>();
            while (await r.ReadAsync(ct))
            {
                var row = new Dictionary<string, object?>();
                for (var i = 0; i < r.FieldCount; i++)
                    row[cols[i]] = r.IsDBNull(i) ? null : r.GetValue(i);
                rows.Add(row);
            }
            if (table == "orders" && rows.Count == 0) return null;
            result[table] = new TableRows(sql, cols, rows);
        }
        return result;
    }
}
