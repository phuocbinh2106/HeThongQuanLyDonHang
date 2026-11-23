using Ecom.Web.Data;
using Ecom.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers.Api;

/// <summary>
/// GET /api/seller-stats?sellerId= : thống kê MỘT shop (trang "Thống kê shop"), chạy 3 hàm PL/SQL trên bảng chuẩn hoá:
///   summary = pkg_order_rpt.fn_s1_seller_summary   byMonth = fn_s2_seller_revenue_by_month   products = fn_s3_seller_products
/// Người bán: luôn là shop của mình (bỏ qua sellerId client gửi). Quản trị: phải chọn sellerId.
/// </summary>
[ApiController]
[Route("api/seller-stats")]
[RequireRole(RoleKind.Seller, RoleKind.Admin)]
public class SellerStatsApiController(ReportRepository repo) : ControllerBase
{
    /// <summary>Tổng quan, doanh thu theo tháng và danh sách sản phẩm (đã bán, hạng, sắp hết) của một shop.</summary>
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] long? sellerId, CancellationToken ct)
    {
        var role = HttpContext.Role();
        var shop = role.Kind == RoleKind.Seller ? role.Id : sellerId;
        if (shop is null) return Problem(statusCode: 400, title: "Hãy chọn người bán (sellerId)");

        var args = new ReportRepository.ReportArgs(null, null, null, null, shop);
        var summary = await repo.RunAsync("s1", args, ct);
        if (summary.Rows.Count == 0) return Problem(statusCode: 404, title: $"Không có người bán #{shop}");
        return Ok(new
        {
            sellerId = shop,
            summary,
            byMonth = await repo.RunAsync("s2", args, ct),
            products = await repo.RunAsync("s3", args, ct),
        });
    }
}
