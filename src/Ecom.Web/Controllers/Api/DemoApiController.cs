using Ecom.Web.Infrastructure;
using Ecom.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers.Api;

/// <summary>Yêu cầu chạy demo: sản phẩm, tồn kho đặt lại, số khách mua cùng lúc (mỗi khách mua 1 cái).</summary>
public record ConcurrencyRequest(long ProductId, int Stock, int Buyers);

/// <summary>Danh sách đơn demo cần huỷ.</summary>
public record CancelDemoRequest(List<long> OrderIds);

/// <summary>
/// Demo "nhiều khách cùng mua" (TC-10, BR-04) – chỉ quản trị:
///   POST /api/demo/concurrency          đặt lại tồn kho rồi tạo N đơn SONG SONG, trả kết quả từng đơn
///   POST /api/demo/concurrency/cancel   huỷ các đơn vừa tạo (sp_cancel_order -> hoàn kho)
/// </summary>
[ApiController]
[Route("api/demo")]
[RequireRole(RoleKind.Admin)]
public class DemoApiController(ConcurrencyDemo demo) : ControllerBase
{
    /// <summary>N khách cùng mua một sản phẩm còn ít hàng: đúng "tồn kho" đơn thành công, còn lại ORA-20001, không bán vượt.</summary>
    [HttpPost("concurrency")]
    public async Task<IActionResult> Run([FromBody] ConcurrencyRequest req, CancellationToken ct)
    {
        if (req.Buyers is < 1 or > ConcurrencyDemo.MaxBuyers || req.Stock is < 0 or > 1000 || req.ProductId <= 0)
            return Problem(statusCode: 400, title: "Tham số không hợp lệ",
                           detail: $"Số khách 1–{ConcurrencyDemo.MaxBuyers}, tồn kho 0–1000.");
        var result = await demo.RunAsync(req.ProductId, req.Stock, req.Buyers, HttpContext.CurrentUser(), ct);
        return result is null
            ? Problem(statusCode: 422, title: "Sản phẩm không tồn tại hoặc đã ngừng bán")
            : Ok(result);
    }

    /// <summary>Huỷ các đơn demo vừa tạo; trigger hoàn kho nên tồn kho trở lại như trước lượt demo.</summary>
    [HttpPost("concurrency/cancel")]
    public async Task<IActionResult> Cancel([FromBody] CancelDemoRequest req, CancellationToken ct)
    {
        var (cancelled, stockAfter) = await demo.CancelAsync(req.OrderIds ?? [], HttpContext.CurrentUser(), ct);
        return Ok(new { cancelled, stockAfter });
    }
}
