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
