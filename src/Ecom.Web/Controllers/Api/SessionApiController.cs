using Ecom.Web.Data;
using Ecom.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers.Api;

/// <summary>
/// Phiên làm việc MÔ PHỎNG (thay cho đăng nhập thật):
///   GET /api/session                 vai trò hiện tại (đọc cookie ecom_user, đã kiểm tra định dạng)
///   GET /api/session/customers?q=    tìm khách để "vào vai" ở trang chủ – chỉ trả mã và họ tên (tối đa 8),
///                                    khác GET /api/customers (đầy đủ email, SĐT, số đơn) chỉ dành cho quản trị.
/// </summary>
[ApiController]
[Route("api/session")]
public class SessionApiController(CustomerRepository repo) : ControllerBase
{
    /// <summary>Vai trò hiện tại của người dùng.</summary>
    [HttpGet]
    public IActionResult Current()
    {
        var r = HttpContext.Role();
        return Ok(new { kind = r.Kind.ToString().ToLowerInvariant(), id = r.Id, display = r.Display });
    }

    /// <summary>Tìm khách để chọn vai trò: tìm theo mã / họ tên, trả mã + họ tên + trạng thái.</summary>
    [HttpGet("customers")]
    public async Task<IActionResult> Customers([FromQuery] string? q, [FromQuery] int limit = 8, CancellationToken ct = default)
    {
        var page = await repo.SearchAsync(q, Math.Min(limit, 8), 0, ct, nameOnly: true);
        return Ok(new { total = page.Total, items = page.Items.Select(c => new { c.Id, c.FullName, c.Status }) });
    }
}
