using System.Data;
using Oracle.ManagedDataAccess.Client;
using Oracle.ManagedDataAccess.Types;

namespace Ecom.Web.Data;

/// <summary>Kết quả một báo cáo: lời gọi PL/SQL đã chạy, tên cột, các dòng.</summary>
public record ReportResult(string Code, string Call, List<string> Columns, List<Dictionary<string, object?>> Rows);

/// <summary>
/// M6 – BÁO CÁO: gọi các hàm của package PKG_ORDER_RPT (chạy trên BẢNG QUAN HỆ chuẩn hoá).
/// Mỗi hàm trả SYS_REFCURSOR; ODP.NET nhận về dạng OracleRefCursor rồi đọc như một bảng.
/// Lời gọi:  BEGIN :rc := pkg_order_rpt.fn_r1_revenue_by_month(:p_from, :p_to); END;
/// Chỉ cho chạy các báo cáo khai báo sẵn trong danh sách trắng bên dưới (không nhận tên hàm từ client).
/// </summary>
public class ReportRepository(OracleConnectionFactory db)
{
    /// <summary>Tham số báo cáo nhận từ query string.</summary>
    public record ReportArgs(DateTime? From, DateTime? To, int? Top, int? Months);

    // Danh sách trắng: mã báo cáo -> tên hàm + cách tạo tham số
    private static readonly Dictionary<string, (string Function, Func<ReportArgs, OracleParameter[]> Params)> Reports = new()
    {
        ["r1"] = ("fn_r1_revenue_by_month", a => [DateParam("p_from", a.From), DateParam("p_to", a.To)]),
        ["r2"] = ("fn_r2_revenue_seller_category", a => [DateParam("p_from", a.From), DateParam("p_to", a.To)]),
        ["r3"] = ("fn_r3_top_products", a => [new OracleParameter("p_top", a.Top ?? 3)]),
        ["r4"] = ("fn_r4_status_matrix", a => [new OracleParameter("p_months", a.Months ?? 12)]),
        ["r5"] = ("fn_r5_cancel_return_rate", _ => []),
        ["r6"] = ("fn_r6_revenue_by_brand", _ => []),
    };

    private static OracleParameter DateParam(string name, DateTime? v) =>
        new(name, OracleDbType.Date) { Value = v.HasValue ? v.Value.Date : DBNull.Value };

    public static bool Exists(string code) => Reports.ContainsKey(code);

    public async Task<ReportResult> RunAsync(string code, ReportArgs args, CancellationToken ct)
    {
        var (function, makeParams) = Reports[code];
        var ps = makeParams(args);
        var call = $"BEGIN :rc := pkg_order_rpt.{function}({string.Join(", ", ps.Select(p => ":" + p.ParameterName))}); END;";

        await using var conn = await db.OpenAsync(ct: ct);
        await using var cmd = new OracleCommand(call, conn) { BindByName = true };
        var rc = new OracleParameter("rc", OracleDbType.RefCursor) { Direction = ParameterDirection.Output };
        cmd.Parameters.Add(rc);
        cmd.Parameters.AddRange(ps);
        await cmd.ExecuteNonQueryAsync(ct);

        await using var r = ((OracleRefCursor)rc.Value).GetDataReader();
        // NUMBER không khai báo độ chính xác có thể vượt kiểu decimal của .NET -> cho phép làm tròn
        r.SuppressGetDecimalInvalidCastException = true;
        var cols = Enumerable.Range(0, r.FieldCount).Select(r.GetName).ToList();
        var rows = new List<Dictionary<string, object?>>();
        while (await r.ReadAsync(ct))
        {
            var row = new Dictionary<string, object?>();
            for (var i = 0; i < r.FieldCount; i++)
                row[cols[i]] = r.IsDBNull(i) ? null
                             : r.GetFieldType(i) == typeof(decimal) ? r.GetDecimal(i) : r.GetValue(i);
            rows.Add(row);
        }
        return new ReportResult(code, call, cols, rows);
    }

    /// <summary>
    /// Mã nguồn PL/SQL của hàm báo cáo, đọc từ từ điển dữ liệu USER_SOURCE (đúng mã đang chạy trong CSDL).
    /// Lấy các dòng của PACKAGE BODY từ "FUNCTION fn_xxx" tới "END fn_xxx;".
    /// </summary>
    public async Task<string> SourceAsync(string code, CancellationToken ct)
    {
        var function = Reports[code].Function;
        const string sql = """
            SELECT text FROM user_source
             WHERE name = 'PKG_ORDER_RPT' AND type = 'PACKAGE BODY'
             ORDER BY line
            """;
        await using var conn = await db.OpenAsync(ct: ct);
        await using var cmd = new OracleCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        var sb = new System.Text.StringBuilder();
        var inside = false;
        while (await r.ReadAsync(ct))
        {
            var line = r.GetString(0);
            if (!inside && line.Contains($"FUNCTION {function}", StringComparison.OrdinalIgnoreCase)) inside = true;
            if (inside) sb.Append(line);
            if (inside && line.Contains($"END {function};", StringComparison.OrdinalIgnoreCase)) break;
        }
        return sb.ToString();
    }
}
