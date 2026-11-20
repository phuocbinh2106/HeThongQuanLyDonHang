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
    /// GET /api/orders?customerId=&amp;status=&amp;from=&amp;to=&amp;q=&amp;page=&amp;pageSize= : danh sách đơn (M3),
    /// đọc từ bảng quan hệ orders (+ đếm dòng hàng, tiền đã trả, hãng vận chuyển).
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Models.OrderFilter filter, CancellationToken ct)
        => Ok(await orders.ListAsync(filter, ct));

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

    /// <summary>Tạo CẢ MỘT ĐƠN bằng một tài liệu JSON = một câu INSERT INTO order_dv (TH-1). Một dòng lỗi → cả đơn rollback (TH-3); giá / tổng / trạng thái do CSDL quyết định (TH-4).</summary>
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

    /// <summary>Đọc cả đơn (khách, dòng hàng, thanh toán, vận đơn, lịch sử) là một tài liệu ORDER_DV; header ETag.</summary>
    [HttpGet("{id:long}")]
    public async Task<IActionResult> Get(long id, CancellationToken ct)
    {
        var doc = await store.GetAsync(DualityView.ORDER_DV, id, ct);
        if (doc is null) return Problem(statusCode: 404, title: "Không tìm thấy đơn hàng");
        return Doc(doc);
    }

    /// <summary>
    /// PUT /api/orders/{id} + If-Match: ghi đè CẢ tài liệu đơn (sửa địa chỉ, thêm/sửa/xoá dòng hàng,
    /// thêm vận đơn/thanh toán vào mảng) bằng MỘT câu UPDATE order_dv.
    /// ETag sai -> 412; sửa dòng hàng khi đơn đã khoá -> 409 (ORA-20004 do trigger ném ra).
    /// </summary>
    [HttpPut("{id:long}")]
    public async Task<IActionResult> Put(long id, [FromBody] JsonObject doc, CancellationToken ct)
    {
        var etag = DocEtag.Normalize(Request.Headers.IfMatch.ToString())
                   ?? doc["_metadata"]?["etag"]?.GetValue<string>();
        if (etag is null)
            return Problem(statusCode: 428, title: "Thiếu If-Match",
                           detail: "Hãy GET tài liệu để lấy ETag rồi gửi kèm header If-Match.");
        var updated = await store.UpdateAsync(DualityView.ORDER_DV, id, DocEtag.PrepareForUpdate(doc, id, etag),
                                              HttpContext.CurrentUser(), ct);
        return updated is null ? Problem(statusCode: 404, title: "Không tìm thấy đơn hàng") : Doc(updated);
    }

    // ----------------------- Đường quan hệ: gọi PKG_ORDER -----------------------

    /// <summary>GET /api/orders/{id}/next-statuses: trạng thái kế tiếp hợp lệ (tính bằng hàm trong CSDL).</summary>
    [HttpGet("{id:long}/next-statuses")]
    public async Task<IActionResult> NextStatuses(long id, CancellationToken ct)
    {
        var r = await orders.NextStatusesAsync(id, ct);
        return r is null ? Problem(statusCode: 404, title: "Không tìm thấy đơn hàng")
                         : Ok(new { current = r.Value.Current, next = r.Value.Next });
    }

    public record StatusRequest(string Status, string? Note);
    public record CancelRequest(string? Reason);
    public record PaymentRequest(string Method, decimal Amount, string? Reference);

    /// <summary>POST /api/orders/{id}/status {status, note} -> pkg_order.sp_change_status</summary>
    [HttpPost("{id:long}/status")]
    public async Task<IActionResult> ChangeStatus(long id, StatusRequest req, CancellationToken ct)
        => Doc(await orders.ChangeStatusAsync(id, req.Status.ToUpperInvariant(), req.Note,
                                              HttpContext.CurrentUser(), ct));

    /// <summary>POST /api/orders/{id}/cancel {reason} -> pkg_order.sp_cancel_order</summary>
    [HttpPost("{id:long}/cancel")]
    public async Task<IActionResult> Cancel(long id, CancelRequest req, CancellationToken ct)
        => Doc(await orders.CancelAsync(id, req.Reason, HttpContext.CurrentUser(), ct));

    /// <summary>POST /api/orders/{id}/payments {method, amount, reference} -> pkg_order.sp_record_payment</summary>
    [HttpPost("{id:long}/payments")]
    public async Task<IActionResult> RecordPayment(long id, PaymentRequest req, CancellationToken ct)
        => Doc(await orders.RecordPaymentAsync(id, req.Method, req.Amount, req.Reference,
                                               HttpContext.CurrentUser(), ct));

    /// <summary>Trả tài liệu JSON nguyên bản kèm header ETag.</summary>
    private ContentResult Doc(string doc)
    {
        Response.Headers.ETag = DocEtag.FromDoc(doc);
        return Content(doc, "application/json");
    }
}
