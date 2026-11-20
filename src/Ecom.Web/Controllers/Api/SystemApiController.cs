using Ecom.Web.Data;
using Microsoft.AspNetCore.Mvc;
using Oracle.ManagedDataAccess.Client;

namespace Ecom.Web.Controllers.Api;

/// <summary>
/// GET /api/system/health : kiểm tra luồng API -> Oracle.
/// Trả về phiên bản Oracle, PDB đang kết nối, CLIENT_IDENTIFIER (chứng minh ClientId được gửi
/// xuống CSDL), danh sách Duality View, số đối tượng lỗi và số dòng các bảng chính.
/// </summary>
[ApiController]
[Route("api/system")]
public class SystemApiController(OracleConnectionFactory db) : ControllerBase
{
    /// <summary>Kiểm tra luồng API → Oracle: phiên bản, PDB, CLIENT_IDENTIFIER, Duality View, số đối tượng INVALID, số dòng.</summary>
    [HttpGet("health")]
    public async Task<IActionResult> Health(CancellationToken ct)
    {
        await using var conn = await db.OpenAsync("health-check", ct);

        // Một truy vấn đọc nhiều thông tin; mọi giá trị đều từ CSDL, không có tham số người dùng
        const string sql = """
            SELECT (SELECT banner_full FROM v$version FETCH FIRST 1 ROWS ONLY)          AS banner,
                   SYS_CONTEXT('USERENV', 'CON_NAME')                                   AS pdb,
                   SYS_CONTEXT('USERENV', 'SESSION_USER')                               AS db_user,
                   SYS_CONTEXT('USERENV', 'CLIENT_IDENTIFIER')                          AS client_id,
                   (SELECT LISTAGG(view_name, ', ') WITHIN GROUP (ORDER BY view_name)
                      FROM user_json_duality_views)                                     AS duality_views,
                   (SELECT COUNT(*) FROM user_objects WHERE status <> 'VALID')          AS invalid_objects,
                   (SELECT COUNT(*) FROM orders)                                        AS orders,
                   (SELECT COUNT(*) FROM products)                                      AS products,
                   (SELECT COUNT(*) FROM customers)                                     AS customers
              FROM dual
            """;
        await using var cmd = new OracleCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        await r.ReadAsync(ct);

        return Ok(new
        {
            ok = true,
            dataSource = db.DataSource,
            banner = r.GetString(0),
            pdb = r.GetString(1),
            dbUser = r.GetString(2),
            clientIdentifier = r.IsDBNull(3) ? null : r.GetString(3),
            dualityViews = r.IsDBNull(4) ? "" : r.GetString(4),
            invalidObjects = r.GetInt32(5),
            counts = new { orders = r.GetInt32(6), products = r.GetInt32(7), customers = r.GetInt32(8) },
        });
    }
}
