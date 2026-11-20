using Ecom.Web.Data;
using Ecom.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers.Api;

/// <summary>
/// REST API báo cáo (đường quan hệ, PKG_ORDER_RPT):
///   GET /api/reports/{code}?from=&amp;to=&amp;top=&amp;months=   code = r1..r6
///   GET /api/reports/{code}/source                    mã PL/SQL của hàm báo cáo (từ USER_SOURCE)
/// Tham số sai (top &lt;= 0, từ ngày > đến ngày...) -> ORA-20010 -> HTTP 422.
/// Báo cáo doanh thu toàn sàn: CHỈ QUẢN TRỊ (khách hàng / người bán nhận 403).
/// </summary>
[ApiController]
[Route("api/reports")]
[RequireRole(RoleKind.Admin)]
public class ReportsApiController(ReportRepository repo) : ControllerBase
{
    /// <summary>Chạy báo cáo r1..r6 của PKG_ORDER_RPT (SYS_REFCURSOR) trên bảng chuẩn hoá; trả cột + dòng.</summary>
    [HttpGet("{code}")]
    public async Task<IActionResult> Run(string code, [FromQuery] DateTime? from, [FromQuery] DateTime? to,
                                         [FromQuery] int? top, [FromQuery] int? months, CancellationToken ct)
    {
        code = code.ToLowerInvariant();
        if (!ReportRepository.Exists(code)) return Problem(statusCode: 404, title: "Không có báo cáo " + code);
        return Ok(await repo.RunAsync(code, new(from, to, top, months), ct));
    }

    /// <summary>Mã nguồn PL/SQL của hàm báo cáo (đọc từ USER_SOURCE).</summary>
    [HttpGet("{code}/source")]
    public async Task<IActionResult> Source(string code, CancellationToken ct)
    {
        code = code.ToLowerInvariant();
        if (!ReportRepository.Exists(code)) return Problem(statusCode: 404, title: "Không có báo cáo " + code);
        return Content(await repo.SourceAsync(code, ct), "text/plain; charset=utf-8");
    }
}
