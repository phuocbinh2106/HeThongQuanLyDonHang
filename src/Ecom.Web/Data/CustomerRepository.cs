using Oracle.ManagedDataAccess.Client;

namespace Ecom.Web.Data;

public record CustomerItem(long Id, string FullName, string Email, string Status, int Addresses, int Orders);

/// <summary>Khách hàng: danh sách đọc bằng SQL quan hệ; hồ sơ + sổ địa chỉ đọc/ghi qua CUSTOMER_DV.</summary>
public class CustomerRepository(OracleConnectionFactory db, DualityViewStore store)
{
    public async Task<List<CustomerItem>> ListAsync(CancellationToken ct)
    {
        const string sql = """
            SELECT c.customer_id, c.full_name, c.email, c.status,
                   (SELECT COUNT(*) FROM customer_addresses a WHERE a.customer_id = c.customer_id),
                   (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.customer_id)
              FROM customers c
             ORDER BY c.customer_id
            """;
        await using var conn = await db.OpenAsync(ct: ct);
        await using var cmd = new OracleCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        var list = new List<CustomerItem>();
        while (await r.ReadAsync(ct))
            list.Add(new CustomerItem(r.GetInt64(0), r.GetString(1), r.GetString(2), r.GetString(3),
                                      r.GetInt32(4), r.GetInt32(5)));
        return list;
    }

    public Task<string?> GetDocAsync(long id, CancellationToken ct)
        => store.GetAsync(DualityView.CUSTOMER_DV, id, ct);

    public Task<string?> UpdateDocAsync(long id, string doc, string user, CancellationToken ct)
        => store.UpdateAsync(DualityView.CUSTOMER_DV, id, doc, user, ct);
}
