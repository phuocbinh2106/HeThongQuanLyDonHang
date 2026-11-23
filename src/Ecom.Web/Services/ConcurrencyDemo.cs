using System.Diagnostics;
using System.Text.Json.Nodes;
using Ecom.Web.Data;
using Oracle.ManagedDataAccess.Client;

namespace Ecom.Web.Services;

/// <summary>Kết quả của một "khách" trong lượt demo.</summary>
public record DemoBuyResult(int Buyer, long CustomerId, bool Ok, long? OrderId, string? OrderNo, string? Code, string? Message, long Ms);

/// <summary>Kết quả cả lượt demo: tồn trước / sau, số thành công, số hết hàng (ORA-20001), số lỗi khác.</summary>
public record DemoRunResult(long ProductId, string ProductName, int StockBefore, int StockAfter,
                            int Success, int OutOfStock, int Other, long ElapsedMs, List<DemoBuyResult> Results);

/// <summary>
/// Demo TC-10 / BR-04 trên web: nhiều khách CÙNG LÚC mua một sản phẩm sắp hết.
/// Mỗi "khách" là một lần ghi tài liệu đơn vào ORDER_DV (giống hệt POST /api/orders), chạy SONG SONG:
/// mỗi lần lấy một kết nối riêng từ connection pool -> một giao dịch Oracle riêng.
/// Không bán vượt nhờ câu UPDATE nguyên tử trong pkg_order.sp_reserve_stock (… WHERE stock_qty >= :qty);
/// giao dịch nào tới lúc tồn đã hết thì nhận ORA-20001 và cả đơn của nó bị huỷ.
/// </summary>
public class ConcurrencyDemo(OracleConnectionFactory db, DualityViewStore store, OrderRepository orders)
{
    public const int MaxBuyers = 50;   // không vượt Max Pool Size của connection pool

    /// <summary>Đặt lại tồn kho rồi cho <paramref name="buyers"/> khách cùng mua 1 cái. null nếu sản phẩm không tồn tại / ngừng bán.</summary>
    public async Task<DemoRunResult?> RunAsync(long productId, int stock, int buyers, string user, CancellationToken ct)
    {
        // 1) Đặt lại tồn kho của sản phẩm (chỉ sản phẩm đang bán) và lấy danh sách khách để "đóng vai"
        string productName;
        var customers = new List<long>();
        await using (var conn = await db.OpenAsync(user, ct))
        {
            await using var cmd = new OracleCommand("""
                UPDATE products SET stock_qty = :stock
                 WHERE product_id = :id AND status = 'ACTIVE'
                RETURNING product_name INTO :name
                """, conn) { BindByName = true };
            cmd.Parameters.Add("stock", OracleDbType.Int32).Value = stock;
            cmd.Parameters.Add("id", OracleDbType.Int64).Value = productId;
            var name = cmd.Parameters.Add("name", OracleDbType.Varchar2, 200);
            name.Direction = System.Data.ParameterDirection.Output;
            if (await cmd.ExecuteNonQueryAsync(ct) == 0) return null;   // tự commit (autocommit của ODP.NET)
            productName = name.Value.ToString()!;

            await using var q = new OracleCommand(
                "SELECT customer_id FROM customers WHERE status = 'ACTIVE' ORDER BY customer_id FETCH FIRST 10 ROWS ONLY", conn);
            await using var r = await q.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct)) customers.Add(r.GetInt64(0));
        }

        // 2) Tạo các tác vụ mua CÙNG LÚC (chưa await từng cái) rồi chờ tất cả xong
        var total = Stopwatch.StartNew();
        var tasks = Enumerable.Range(1, buyers).Select(async i =>
        {
            var customerId = customers[(i - 1) % customers.Count];
            var doc = new JsonObject
            {
                ["customer"] = new JsonObject { ["customerId"] = customerId },
                ["shipReceiver"] = $"Khách demo {i}",
                ["shipPhone"] = "0900000000",
                ["shipAddress"] = "Demo mua đồng thời",
                ["items"] = new JsonArray(new JsonObject { ["productId"] = productId, ["quantity"] = 1 }),
            };
            var sw = Stopwatch.StartNew();
            try
            {
                var (id, created) = await store.InsertAsync(DualityView.ORDER_DV, doc.ToJsonString(), user, ct);
                var orderNo = JsonNode.Parse(created)?["orderNo"]?.GetValue<string>();
                return new DemoBuyResult(i, customerId, true, id, orderNo, null, null, sw.ElapsedMilliseconds);
            }
            catch (OracleException ex)
            {
                var e = OracleErrorMapper.Map(ex);   // tìm mã ORA-20xxx thật bên trong lỗi bọc ORA-42692
                return new DemoBuyResult(i, customerId, false, null, null, e.Code, e.Title, sw.ElapsedMilliseconds);
            }
        }).ToList();
        var results = (await Task.WhenAll(tasks)).ToList();
        total.Stop();

        var stockAfter = await StockAsync(productId, ct);
        var success = results.Count(x => x.Ok);
        var outOfStock = results.Count(x => x.Code == "ORA-20001");
        return new DemoRunResult(productId, productName, stock, stockAfter, success, outOfStock,
                                 results.Count - success - outOfStock, total.ElapsedMilliseconds, results);
    }

    /// <summary>Huỷ các đơn demo bằng pkg_order.sp_cancel_order (trigger hoàn kho). Trả (số đơn đã huỷ, tồn sau của sản phẩm).</summary>
    public async Task<(int Cancelled, int? StockAfter)> CancelAsync(IReadOnlyList<long> orderIds, string user, CancellationToken ct)
    {
        if (orderIds.Count == 0) return (0, null);
        long? productId = null;
        await using (var conn = await db.OpenAsync(user, ct))
        {
            await using var cmd = new OracleCommand("SELECT MIN(product_id) FROM order_items WHERE order_id = :id", conn);
            cmd.Parameters.Add("id", OracleDbType.Int64).Value = orderIds[0];
            if (await cmd.ExecuteScalarAsync(ct) is decimal d) productId = (long)d;
        }
        var cancelled = 0;
        foreach (var id in orderIds)
        {
            try { await orders.CancelAsync(id, "Huỷ đơn demo mua đồng thời", user, ct); cancelled++; }
            catch (OracleException) { /* đơn đã huỷ / không còn huỷ được: bỏ qua */ }
        }
        return (cancelled, productId is long p ? await StockAsync(p, ct) : null);
    }

    private async Task<int> StockAsync(long productId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(ct: ct);
        await using var cmd = new OracleCommand("SELECT stock_qty FROM products WHERE product_id = :id", conn);
        cmd.Parameters.Add("id", OracleDbType.Int64).Value = productId;
        return Convert.ToInt32(await cmd.ExecuteScalarAsync(ct));
    }
}
