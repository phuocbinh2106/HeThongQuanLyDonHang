using Oracle.ManagedDataAccess.Client;

namespace Ecom.Web.Data;

/// <summary>Ba Duality View của đồ án. Tên view lấy từ enum (không từ người dùng) nên ghép vào SQL an toàn.</summary>
public enum DualityView { ORDER_DV, PRODUCT_DV, CUSTOMER_DV }

/// <summary>
/// Đọc / thêm / ghi đè TÀI LIỆU trên một JSON Relational Duality View theo khoá "_id".
/// Đây là toàn bộ "đường JSON" của ứng dụng — chỉ 3 câu SQL:
///   Đọc : SELECT JSON_SERIALIZE(d.data RETURNING CLOB) FROM order_dv d WHERE d.data."_id" = :id
///   Thêm: INSERT INTO order_dv (data) VALUES (JSON(:doc)) RETURNING ... INTO :new_id
///   Sửa : UPDATE order_dv d SET d.data = JSON(:doc) WHERE d.data."_id" = :id
/// Oracle tự tách tài liệu ra các bảng nền (orders, order_items, payments...) trong MỘT câu lệnh
/// => nguyên tử: một dòng lỗi (hết hàng...) thì cả tài liệu bị huỷ. Trigger/ràng buộc của bảng
/// nền vẫn chạy như khi ghi bằng SQL thường.
/// Tài liệu JSON được bind như chuỗi CLOB rồi bọc JSON(...) để Oracle chuyển sang kiểu JSON.
/// </summary>
public class DualityViewStore(OracleConnectionFactory db)
{
    public async Task<string?> GetAsync(DualityView view, long id, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(ct: ct);
        return await GetAsync(conn, view, id, ct);
    }

    public static async Task<string?> GetAsync(OracleConnection conn, DualityView view, long id, CancellationToken ct)
    {
        var sql = $"""
            SELECT JSON_SERIALIZE(d.data RETURNING CLOB)
              FROM {view} d
             WHERE d.data."_id" = :id
            """;
        await using var cmd = new OracleCommand(sql, conn);
        cmd.Parameters.Add(new OracleParameter("id", id));
        return await cmd.ExecuteScalarAsync(ct) as string;
    }

    /// <summary>
    /// Thêm NHIỀU tài liệu trong MỘT giao dịch: lần lượt INSERT từng tài liệu trên cùng kết nối / giao dịch, xong hết mới
    /// COMMIT. Tài liệu thứ i lỗi (ràng buộc, JSON Schema, trùng khoá…) thì ROLLBACK toàn bộ và ném BulkInsertException(i)
    /// để API báo đúng tài liệu nào sai. Nguyên tử như TH-3 nhưng ở mức nhiều tài liệu.
    /// </summary>
    public async Task<List<(long Id, string Doc)>> InsertManyAsync(DualityView view, IReadOnlyList<string> docs, string user, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(user, ct);
        await using var tx = conn.BeginTransaction();
        var sql = $"""
            INSERT INTO {view} (data) VALUES (JSON(:doc))
            RETURNING JSON_VALUE(data, '$._id' RETURNING NUMBER) INTO :new_id
            """;
        var ids = new List<long>();
        for (var i = 0; i < docs.Count; i++)
        {
            await using var cmd = new OracleCommand(sql, conn) { BindByName = true, Transaction = tx };
            cmd.Parameters.Add(new OracleParameter("doc", OracleDbType.Clob) { Value = docs[i] });
            var outId = new OracleParameter("new_id", OracleDbType.Int64) { Direction = System.Data.ParameterDirection.Output };
            cmd.Parameters.Add(outId);
            try { await cmd.ExecuteNonQueryAsync(ct); }
            catch (OracleException ex)
            {
                await tx.RollbackAsync(ct);            // huỷ cả các tài liệu đã thêm trước đó trong lô
                throw new BulkInsertException(i, ex);
            }
            ids.Add(Convert.ToInt64(outId.Value.ToString()));
        }
        await tx.CommitAsync(ct);
        var result = new List<(long, string)>();
        foreach (var id in ids) result.Add((id, (await GetAsync(conn, view, id, ct))!));
        return result;
    }

    /// <summary>
    /// Đọc tài liệu như nó đã là tại SCN cho trước (Flashback Query: … FROM order_dv AS OF SCN n …).
    /// Oracle dựng lại tài liệu từ dữ liệu undo của các bảng nền tại đúng thời điểm đó.
    /// Trả (tài liệu hoặc null nếu lúc đó chưa có, thời điểm của SCN).
    /// LƯU Ý: SCN được ghi thẳng vào câu SQL dưới dạng SỐ (không dùng bind variable :scn) vì trên Oracle 23.26.3
    /// "order_dv AS OF SCN :scn" làm đứt phiên (ORA-03113) và "AS OF TIMESTAMP :ts" báo ORA-00932 – đã thử thật.
    /// An toàn trước SQL injection vì tham số có kiểu long (đã ép kiểu ở C#), chuỗi chèn vào chỉ có thể là chữ số.
    /// </summary>
    public async Task<(string? Doc, DateTime? At)> GetAsOfAsync(DualityView view, long id, long scn, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(ct: ct);
        var scnText = scn.ToString(System.Globalization.CultureInfo.InvariantCulture);
        var sql = $"""
            SELECT JSON_SERIALIZE(d.data RETURNING CLOB)
              FROM {view} AS OF SCN {scnText} d
             WHERE d.data."_id" = :id
            """;
        string? doc;
        await using (var cmd = new OracleCommand(sql, conn))
        {
            cmd.Parameters.Add(new OracleParameter("id", id));
            doc = await cmd.ExecuteScalarAsync(ct) as string;
        }
        // Thời điểm tương ứng với SCN (hàm thường, bind được); không đổi được thì để trống
        DateTime? at = null;
        try
        {
            await using var t = new OracleCommand("SELECT CAST(SCN_TO_TIMESTAMP(:scn) AS DATE) FROM dual", conn);
            t.Parameters.Add(new OracleParameter("scn", scn));
            at = await t.ExecuteScalarAsync(ct) as DateTime?;
        }
        catch (OracleException) { /* SCN quá cũ để đổi ra thời gian: bỏ qua */ }
        return (doc, at);
    }

    /// <summary>SCN ứng với "n phút trước" (TIMESTAMP_TO_SCN, có bind bình thường).</summary>
    public async Task<long> ScnMinutesAgoAsync(int minutes, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(ct: ct);
        await using var cmd = new OracleCommand(
            "SELECT TIMESTAMP_TO_SCN(SYSTIMESTAMP - NUMTODSINTERVAL(:m, 'MINUTE')) FROM dual", conn);
        cmd.Parameters.Add(new OracleParameter("m", minutes));
        return Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
    }

    /// <summary>Thêm một tài liệu. Trả về (_id mới, tài liệu đầy đủ do Oracle sinh lại).</summary>
    public async Task<(long Id, string Doc)> InsertAsync(DualityView view, string doc, string user, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(user, ct);
        await using var tx = conn.BeginTransaction();
        var sql = $"""
            INSERT INTO {view} (data) VALUES (JSON(:doc))
            RETURNING JSON_VALUE(data, '$._id' RETURNING NUMBER) INTO :new_id
            """;
        long newId;
        await using (var cmd = new OracleCommand(sql, conn) { BindByName = true, Transaction = tx })
        {
            cmd.Parameters.Add(new OracleParameter("doc", OracleDbType.Clob) { Value = doc });
            var outId = new OracleParameter("new_id", OracleDbType.Int64)
                { Direction = System.Data.ParameterDirection.Output };
            cmd.Parameters.Add(outId);
            await cmd.ExecuteNonQueryAsync(ct);
            newId = Convert.ToInt64(outId.Value.ToString());
        }
        await tx.CommitAsync(ct);
        return (newId, (await GetAsync(conn, view, newId, ct))!);
    }

    /// <summary>
    /// Ghi đè cả tài liệu. Tài liệu phải mang _metadata.etag -> Oracle kiểm tra ETag (sai -> ORA-42699).
    /// Trả về tài liệu mới (etag mới), hoặc null nếu không có _id này.
    /// </summary>
    public async Task<string?> UpdateAsync(DualityView view, long id, string doc, string user, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(user, ct);
        await using var tx = conn.BeginTransaction();
        var sql = $"""
            UPDATE {view} d
               SET d.data = JSON(:doc)
             WHERE d.data."_id" = :id
            """;
        await using (var cmd = new OracleCommand(sql, conn) { BindByName = true, Transaction = tx })
        {
            cmd.Parameters.Add(new OracleParameter("doc", OracleDbType.Clob) { Value = doc });
            cmd.Parameters.Add(new OracleParameter("id", id));
            if (await cmd.ExecuteNonQueryAsync(ct) == 0) { await tx.RollbackAsync(ct); return null; }
        }
        await tx.CommitAsync(ct);
        return await GetAsync(conn, view, id, ct);
    }
}

/// <summary>Lỗi Oracle ở tài liệu thứ Index (đếm từ 0) khi thêm nhiều tài liệu; cả lô đã rollback.</summary>
public class BulkInsertException(int index, OracleException inner) : Exception(inner.Message, inner)
{
    public int Index { get; } = index;
    public OracleException Oracle { get; } = inner;
}
