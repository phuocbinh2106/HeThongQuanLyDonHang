using System.Text;
using System.Text.Json;
using Ecom.Web.Models;
using Oracle.ManagedDataAccess.Client;

namespace Ecom.Web.Data;

/// <summary>
/// Truy cập sản phẩm.
/// ĐƯỜNG JSON: đọc/ghi tài liệu trực tiếp trên Duality View PRODUCT_DV — C# KHÔNG tự ráp JSON
/// từ nhiều bảng; Oracle sinh tài liệu (kèm seller, category, _metadata.etag).
/// LỌC: điều kiện đặt trên bảng nền products bằng SQL/JSON (JSON_VALUE, JSON_EXISTS) với
/// biểu thức giống hệt chỉ mục hàm IX-6, rồi lấy tài liệu của các _id thoả điều kiện.
/// Mọi giá trị người dùng nhập đều đi qua BIND VARIABLE (:name), không nối chuỗi vào SQL.
/// </summary>
public class ProductRepository(OracleConnectionFactory db)
{
    /// <summary>Danh sách tài liệu PRODUCT_DV theo bộ lọc. Trả (mảng JSON, mệnh đề WHERE đã dùng).</summary>
    public async Task<(string JsonArray, int Count, string WhereSql)> ListAsync(ProductFilter f, CancellationToken ct)
    {
        var where = new List<string>();
        var binds = new List<OracleParameter>();

        if (f.CategoryId is not null)
        {
            // Lấy cả danh mục con: truy vấn phân cấp trên cây categories (parent_id)
            where.Add("p.category_id IN (SELECT category_id FROM categories " +
                      "START WITH category_id = :cat CONNECT BY PRIOR category_id = parent_id)");
            binds.Add(new OracleParameter("cat", f.CategoryId));
        }
        if (!string.IsNullOrWhiteSpace(f.Brand))
        {
            // ĐÚNG biểu thức của chỉ mục hàm IX-6 để optimizer dùng được chỉ mục
            where.Add("JSON_VALUE(p.attributes, '$.brand' RETURNING VARCHAR2(60)) = :brand");
            binds.Add(new OracleParameter("brand", f.Brand));
        }
        if (f.MinRamGb is not null)
        {
            where.Add("JSON_VALUE(p.attributes, '$.ramGb' RETURNING NUMBER) >= :ram");
            binds.Add(new OracleParameter("ram", f.MinRamGb));
        }
        if (f.MinStorageGb is not null)
        {
            where.Add("JSON_VALUE(p.attributes, '$.storageGb' RETURNING NUMBER) >= :sto");
            binds.Add(new OracleParameter("sto", f.MinStorageGb));
        }
        if (!string.IsNullOrWhiteSpace(f.Size))
        {
            // size là MẢNG JSON (["S","M","L"]): JSON_EXISTS + bộ lọc ?() + biến $s truyền bằng PASSING
            where.Add("JSON_EXISTS(p.attributes, '$.size[*]?(@ == $s)' PASSING :sz AS \"s\")");
            binds.Add(new OracleParameter("sz", f.Size));
        }
        if (!string.IsNullOrWhiteSpace(f.Q))
        {
            where.Add("UPPER(p.product_name) LIKE '%' || UPPER(:q) || '%'");
            binds.Add(new OracleParameter("q", f.Q));
        }
        if (f.ActiveOnly) where.Add("p.status = 'ACTIVE'");

        var whereSql = where.Count == 0 ? "1 = 1" : string.Join("\n   AND ", where);
        var sql = $"""
            SELECT JSON_SERIALIZE(d.data RETURNING CLOB)
              FROM product_dv d
             WHERE d.data."_id".number() IN (SELECT p.product_id FROM products p
                                              WHERE {whereSql})
             ORDER BY d.data."_id".number()
            """;

        await using var conn = await db.OpenAsync(ct: ct);
        await using var cmd = new OracleCommand(sql, conn) { BindByName = true };
        cmd.Parameters.AddRange(binds.ToArray());

        var sb = new StringBuilder("[");
        var count = 0;
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            if (count++ > 0) sb.Append(',');
            sb.Append(r.GetString(0));   // tài liệu JSON nguyên vẹn do Oracle sinh ra
        }
        sb.Append(']');
        return (sb.ToString(), count, "SELECT p.product_id FROM products p\n WHERE " + whereSql);
    }

    /// <summary>Đọc một tài liệu PRODUCT_DV (null nếu không có).</summary>
    public async Task<string?> GetDocAsync(long id, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(ct: ct);
        return await GetDocAsync(conn, id, ct);
    }

    private static async Task<string?> GetDocAsync(OracleConnection conn, long id, CancellationToken ct)
    {
        const string sql = """
            SELECT JSON_SERIALIZE(d.data RETURNING CLOB)
              FROM product_dv d
             WHERE d.data."_id" = :id
            """;
        await using var cmd = new OracleCommand(sql, conn);
        cmd.Parameters.Add(new OracleParameter("id", id));
        return await cmd.ExecuteScalarAsync(ct) as string;
    }

    /// <summary>
    /// Ghi đè cả tài liệu: UPDATE product_dv SET data = JSON(:doc).
    /// Tài liệu đã được gắn _metadata.etag -> Oracle kiểm tra ETag (sai -> ORA-42699).
    /// Trả về tài liệu mới (etag mới) hoặc null nếu không tồn tại _id.
    /// </summary>
    public async Task<string?> UpdateDocAsync(long id, string doc, string user, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(user, ct);
        await using var tx = conn.BeginTransaction();
        const string sql = """
            UPDATE product_dv d
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
        return await GetDocAsync(conn, id, ct);
    }

    /// <summary>Thêm sản phẩm bằng một tài liệu JSON: INSERT INTO product_dv VALUES (JSON(:doc)).</summary>
    public async Task<(long Id, string Doc)> InsertDocAsync(string doc, string user, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(user, ct);
        await using var tx = conn.BeginTransaction();
        const string sql = """
            INSERT INTO product_dv (data) VALUES (JSON(:doc))
            RETURNING JSON_VALUE(data, '$._id' RETURNING NUMBER) INTO :new_id
            """;
        long newId;
        await using (var cmd = new OracleCommand(sql, conn) { BindByName = true, Transaction = tx })
        {
            cmd.Parameters.Add(new OracleParameter("doc", OracleDbType.Clob) { Value = doc });
            var outId = new OracleParameter("new_id", OracleDbType.Int64) { Direction = System.Data.ParameterDirection.Output };
            cmd.Parameters.Add(outId);
            await cmd.ExecuteNonQueryAsync(ct);
            newId = Convert.ToInt64(outId.Value.ToString());
        }
        await tx.CommitAsync(ct);
        return (newId, (await GetDocAsync(conn, newId, ct))!);
    }

    /// <summary>Cây danh mục (truy vấn phân cấp CONNECT BY) để làm ô lọc.</summary>
    public async Task<List<CategoryItem>> CategoriesAsync(CancellationToken ct)
    {
        const string sql = """
            SELECT category_id, parent_id, category_name, LEVEL,
                   SUBSTR(SYS_CONNECT_BY_PATH(category_name, ' > '), 4) AS path
              FROM categories
             START WITH parent_id IS NULL
             CONNECT BY PRIOR category_id = parent_id
             ORDER SIBLINGS BY category_name
            """;
        await using var conn = await db.OpenAsync(ct: ct);
        await using var cmd = new OracleCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        var list = new List<CategoryItem>();
        while (await r.ReadAsync(ct))
            list.Add(new CategoryItem(r.GetInt64(0), r.IsDBNull(1) ? null : r.GetInt64(1),
                                      r.GetString(2), r.GetInt32(3), r.GetString(4)));
        return list;
    }

    /// <summary>Các thương hiệu hiện có (đọc từ trường brand trong cột JSON).</summary>
    public async Task<List<string>> BrandsAsync(long? categoryId, CancellationToken ct)
    {
        const string sql = """
            SELECT DISTINCT JSON_VALUE(p.attributes, '$.brand' RETURNING VARCHAR2(60)) AS brand
              FROM products p
             WHERE :cat IS NULL
                OR p.category_id IN (SELECT category_id FROM categories
                                      START WITH category_id = :cat
                                      CONNECT BY PRIOR category_id = parent_id)
             ORDER BY brand
            """;
        await using var conn = await db.OpenAsync(ct: ct);
        await using var cmd = new OracleCommand(sql, conn) { BindByName = true };
        cmd.Parameters.Add(new OracleParameter("cat", OracleDbType.Int64) { Value = (object?)categoryId ?? DBNull.Value });
        await using var r = await cmd.ExecuteReaderAsync(ct);
        var list = new List<string>();
        while (await r.ReadAsync(ct)) if (!r.IsDBNull(0)) list.Add(r.GetString(0));
        return list;
    }

    /// <summary>
    /// "Lược đồ động" của cột attributes theo danh mục: JSON_DATAGUIDE quét các tài liệu JSON
    /// và trả về danh sách đường dẫn + kiểu dữ liệu thực tế (TH-6: mỗi ngành hàng một kiểu thuộc tính).
    /// </summary>
    public async Task<List<AttributeKey>> AttributeKeysAsync(long? categoryId, CancellationToken ct)
    {
        const string sql = """
            SELECT JSON_SERIALIZE(JSON_DATAGUIDE(p.attributes, DBMS_JSON.FORMAT_FLAT) RETURNING CLOB)
              FROM products p
             WHERE :cat IS NULL
                OR p.category_id IN (SELECT category_id FROM categories
                                      START WITH category_id = :cat
                                      CONNECT BY PRIOR category_id = parent_id)
            """;
        await using var conn = await db.OpenAsync(ct: ct);
        await using var cmd = new OracleCommand(sql, conn) { BindByName = true };
        cmd.Parameters.Add(new OracleParameter("cat", OracleDbType.Int64) { Value = (object?)categoryId ?? DBNull.Value });
        var json = await cmd.ExecuteScalarAsync(ct) as string;
        var keys = new List<AttributeKey>();
        if (string.IsNullOrEmpty(json)) return keys;
        foreach (var e in JsonDocument.Parse(json).RootElement.EnumerateArray())
        {
            var path = e.GetProperty("o:path").GetString()!;
            if (path == "$") continue;
            keys.Add(new AttributeKey(path, e.GetProperty("type").GetString()!));
        }
        return keys.OrderBy(k => k.Path).ToList();
    }
}
