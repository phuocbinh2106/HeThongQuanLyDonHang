using System.Text.Json.Nodes;
using Ecom.Web.Data;
using Ecom.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers.Api;

/// <summary>
/// REST API đơn hàng — đường JSON qua Duality View ORDER_DV.
///   POST /api/orders        -> tạo CẢ MỘT ĐƠN (khách, địa chỉ giao, nhiều dòng hàng) bằng MỘT
///                              tài liệu JSON = MỘT câu INSERT INTO order_dv (TH-1, TH-3)
///   GET  /api/orders/{id}   -> đọc cả đơn (khách, dòng hàng, thanh toán, vận đơn, lịch sử) + ETag
///
/// API cố ý KHÔNG lọc bỏ các trường giả client gửi (status, subtotal, totalAmount, unitPrice...):
/// CSDL tự bỏ qua / tự tính lại bằng trigger (TH-4, TC-02). Quy tắc nằm ở bảng nền nên đúng
/// cho mọi kênh ghi, không phụ thuộc API có kiểm tra hay không.
/// </summary>
[ApiController]
[Route("api/orders")]
public class OrdersApiController(DualityViewStore store, OrderRepository orders) : ControllerBase
{
    /// <summary>
    /// GET /api/orders/{id}/relational : CÙNG đơn đó nhưng đọc thẳng các dòng trong 5 bảng nền
    /// (orders, order_items, payments, shipments, order_status_history) — tab "Dạng bảng quan hệ" ở M4.
    /// </summary>
    [HttpGet("{id:long}/relational")]
    public async Task<IActionResult> GetRelational(long id, CancellationToken ct)
    {
        var tables = await orders.GetRelationalAsync(id, ct);
        return tables is null ? Problem(statusCode: 404, title: "Không tìm thấy đơn hàng") : Ok(tables);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] JsonObject doc, CancellationToken ct)
    {
        // Kiểm tra tối thiểu ở tầng API (thông báo sớm, dễ hiểu); quy tắc thật vẫn ở CSDL
        if (doc["items"] is not JsonArray items || items.Count == 0)
            return Problem(statusCode: 422, title: "Đơn phải có ít nhất một dòng hàng");
        if (doc["customer"]?["customerId"] is null)
            return Problem(statusCode: 422, title: "Thiếu customer.customerId");

        doc.Remove("_id");        // order_id do identity sinh
        doc.Remove("_metadata");

        var (id, created) = await store.InsertAsync(DualityView.ORDER_DV, doc.ToJsonString(),
                                                    HttpContext.CurrentUser(), ct);
        Response.Headers.ETag = DocEtag.FromDoc(created);
        Response.Headers.Location = $"/api/orders/{id}";
        return new ContentResult { StatusCode = 201, Content = created, ContentType = "application/json" };
    }

    [HttpGet("{id:long}")]
    public async Task<IActionResult> Get(long id, CancellationToken ct)
    {
        var doc = await store.GetAsync(DualityView.ORDER_DV, id, ct);
        if (doc is null) return Problem(statusCode: 404, title: "Không tìm thấy đơn hàng");
        Response.Headers.ETag = DocEtag.FromDoc(doc);
        return Content(doc, "application/json");
    }
}
