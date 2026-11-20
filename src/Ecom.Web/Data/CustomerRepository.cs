using Oracle.ManagedDataAccess.Client;

namespace Ecom.Web.Data;

public record CustomerItem(long Id, string FullName, string Email, string? Phone, string Status, int Addresses, int Orders);
/// <summary>Một trang kết quả tìm khách: tổng số khách khớp điều kiện + các dòng của trang hiện tại.</summary>
public record CustomerPage(int Total, List<CustomerItem> Items);

/// <summary>Khách hàng: danh sách đọc bằng SQL quan hệ; hồ sơ + sổ địa chỉ đọc/ghi qua CUSTOMER_DV.</summary>
public class CustomerRepository(OracleConnectionFactory db, DualityViewStore store)
{
    /// <summary>
    /// Tìm khách PHÍA SERVER, có phân trang: không bao giờ tải toàn bộ bảng customers về trình duyệt
    /// (sàn có hàng nghìn khách thì dropdown "tất cả khách" không dùng được).
    ///   q      : khớp mã KH (đúng bằng), hoặc một phần họ tên / email / số điện thoại.
    ///            Họ tên so sánh bằng COLLATE BINARY_AI: bỏ qua dấu và hoa thường ("nguyen" khớp "Nguyễn", "duc" khớp "Đức").
    ///   limit  : số dòng mỗi trang (1..100), offset: bỏ qua bao nhiêu dòng
    /// Truy vấn trong lấy đúng một trang + tổng số dòng khớp (COUNT(*) OVER () tính trước khi cắt trang);
    /// truy vấn ngoài chỉ đếm địa chỉ / đơn cho các dòng của trang đó.
    /// </summary>
    public async Task<CustomerPage> SearchAsync(string? q, int limit, int offset, CancellationToken ct)
    {
        const string sql = """
            SELECT p.customer_id, p.full_name, p.email, p.phone, p.status, p.total,
                   (SELECT COUNT(*) FROM customer_addresses a WHERE a.customer_id = p.customer_id) AS addr_cnt,
                   (SELECT COUNT(*) FROM orders o WHERE o.customer_id = p.customer_id) AS order_cnt
              FROM (SELECT c.customer_id, c.full_name, c.email, c.phone, c.status,
                           COUNT(*) OVER () AS total
                      FROM customers c
                     WHERE :q IS NULL
                        OR TO_CHAR(c.customer_id) = :q
                        OR c.full_name COLLATE BINARY_AI LIKE '%' || :q || '%'
                        OR LOWER(c.email) LIKE '%' || LOWER(:q) || '%'
                        OR c.phone LIKE '%' || :q || '%'
                     ORDER BY c.customer_id
                    OFFSET :off ROWS FETCH NEXT :lim ROWS ONLY) p
             ORDER BY p.customer_id
            """;
        await using var conn = await db.OpenAsync(ct: ct);
        // BindByName: :q xuất hiện nhiều lần nhưng chỉ cần gán một lần
        await using var cmd = new OracleCommand(sql, conn) { BindByName = true };
        cmd.Parameters.Add("q", OracleDbType.Varchar2).Value = string.IsNullOrWhiteSpace(q) ? DBNull.Value : q.Trim();
        cmd.Parameters.Add("off", OracleDbType.Int32).Value = Math.Max(0, offset);
        cmd.Parameters.Add("lim", OracleDbType.Int32).Value = Math.Clamp(limit, 1, 100);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        var list = new List<CustomerItem>();
        int total = 0;
        while (await r.ReadAsync(ct))
        {
            total = r.GetInt32(5);
            list.Add(new CustomerItem(r.GetInt64(0), r.GetString(1), r.GetString(2),
                                      r.IsDBNull(3) ? null : r.GetString(3), r.GetString(4),
                                      r.GetInt32(6), r.GetInt32(7)));
        }
        // Trang rỗng (offset vượt quá) thì không có dòng để đọc total -> trả 0 dòng, total 0 là chấp nhận được
        return new CustomerPage(total, list);
    }

    public Task<string?> GetDocAsync(long id, CancellationToken ct)
        => store.GetAsync(DualityView.CUSTOMER_DV, id, ct);

    public Task<string?> UpdateDocAsync(long id, string doc, string user, CancellationToken ct)
        => store.UpdateAsync(DualityView.CUSTOMER_DV, id, doc, user, ct);

    /// <summary>Tạo khách + sổ địa chỉ bằng MỘT tài liệu: INSERT INTO customer_dv (2 bảng, 1 câu lệnh).</summary>
    public Task<(long Id, string Doc)> InsertDocAsync(string doc, string user, CancellationToken ct)
        => store.InsertAsync(DualityView.CUSTOMER_DV, doc, user, ct);

    /// <summary>Danh sách người bán (cho màn hình chọn vai trò).</summary>
    public async Task<List<SellerItem>> SellersAsync(CancellationToken ct)
    {
        const string sql = """
            SELECT s.seller_id, s.shop_name, s.status,
                   (SELECT COUNT(*) FROM products p WHERE p.seller_id = s.seller_id)
              FROM sellers s
             ORDER BY s.seller_id
            """;
        await using var conn = await db.OpenAsync(ct: ct);
        await using var cmd = new OracleCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        var list = new List<SellerItem>();
        while (await r.ReadAsync(ct))
            list.Add(new SellerItem(r.GetInt64(0), r.GetString(1), r.GetString(2), r.GetInt32(3)));
        return list;
    }
}

public record SellerItem(long Id, string ShopName, string Status, int Products);
