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
