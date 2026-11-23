using System.Text.Json.Nodes;
using Ecom.Web.Data;
using Ecom.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers.Api;

/// <summary>
/// REST API đơn hàng — đường JSON qua Duality View ORDER_DV và đường quan hệ qua PKG_ORDER.
/// API cố ý KHÔNG lọc bỏ các trường giả client gửi (status, subtotal, totalAmount, unitPrice...):
/// CSDL tự bỏ qua / tự tính lại bằng trigger (TH-4, TC-02).
///
/// PHÂN QUYỀN (kiểm tra ở server, xem Infrastructure/AccessControl.cs):
///   - Khách hàng: chỉ tạo đơn cho chính mình, chỉ xem / sửa đơn của mình (địa chỉ, dòng hàng, thanh toán),
///     chỉ được huỷ, không tự đổi trạng thái.
///   - Người bán: chỉ xem đơn có sản phẩm của shop mình; được đổi trạng thái, huỷ, thêm vận đơn (shipments[]).
///   - Quản trị: toàn quyền.  - Chưa chọn vai trò: 401.
/// </summary>
[ApiController]
[Route("api/orders")]
[RequireRole(RoleKind.Customer, RoleKind.Seller, RoleKind.Admin)]
public class OrdersApiController(DualityViewStore store, OrderRepository orders) : ControllerBase
{
    // Các trường GHI ĐƯỢC của tài liệu ORDER_DV và vai trò nào được đổi trường nào khi PUT
    private static readonly string[] Writable =
        ["shipReceiver", "shipPhone", "shipAddress", "shippingFee", "discount", "items", "payments", "shipments"];
    private static readonly string[] CustomerFields = ["shipReceiver", "shipPhone", "shipAddress", "items", "payments"];
    private static readonly string[] SellerFields = ["shipments"];

    /// <summary>
    /// GET /api/orders?customerId=&amp;status=&amp;from=&amp;to=&amp;q=&amp;page=&amp;pageSize= : danh sách đơn (M3), đọc từ bảng quan hệ.
    /// Khách hàng luôn chỉ thấy đơn của mình (bỏ qua customerId client gửi); người bán chỉ thấy đơn có sản phẩm của shop.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Models.OrderFilter filter, CancellationToken ct)
    {
        var role = HttpContext.Role();
        if (role.Kind == RoleKind.Customer) { filter.CustomerId = role.Id; filter.SellerId = null; }
        if (role.Kind == RoleKind.Seller) filter.SellerId = role.Id;
        return Ok(await orders.ListAsync(filter, ct));
    }

    /// <summary>
    /// GET /api/orders/{id}/relational : CÙNG đơn đó nhưng đọc thẳng các dòng trong 5 bảng nền — tab "Dạng bảng quan hệ" ở M4.
    /// </summary>
    [HttpGet("{id:long}/relational")]
    public async Task<IActionResult> GetRelational(long id, CancellationToken ct)
    {
        if (await CheckAccess(id, ct) is { } denied) return denied;
        var tables = await orders.GetRelationalAsync(id, ct);
        return tables is null ? Problem(statusCode: 404, title: "Không tìm thấy đơn hàng") : Ok(tables);
    }

    /// <summary>
    /// Tạo CẢ MỘT ĐƠN bằng một tài liệu JSON = một câu INSERT INTO order_dv (TH-1). Một dòng lỗi → cả đơn rollback (TH-3);
    /// giá / tổng / trạng thái do CSDL quyết định (TH-4). Khách hàng chỉ đặt cho chính mình; người bán không tạo đơn.
    /// </summary>
    [HttpPost]
    [RequireRole(RoleKind.Customer, RoleKind.Admin)]
    public async Task<IActionResult> Create([FromBody] JsonObject doc, CancellationToken ct)
    {
        // Kiểm tra tối thiểu ở tầng API (thông báo sớm, dễ hiểu); quy tắc thật vẫn ở CSDL
        if (doc["items"] is not JsonArray items || items.Count == 0)
            return Problem(statusCode: 422, title: "Đơn phải có ít nhất một dòng hàng");

        var role = HttpContext.Role();
        if (role.Kind == RoleKind.Customer)
        {
            // Khách hàng: thiếu customerId thì gán chính mình; đặt hộ người khác thì từ chối
            long? given = doc["customer"]?["customerId"] is JsonValue jv && jv.TryGetValue<long>(out var g) ? g : null;
            if (given is not null && given != role.Id)
                return AccessControl.Denied(role, $"Khách hàng #{role.Id} không được đặt đơn cho khách #{given}.");
            doc["customer"] = new JsonObject { ["customerId"] = role.Id };
        }
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
        if (await CheckAccess(id, ct) is { } denied) return denied;
        var doc = await store.GetAsync(DualityView.ORDER_DV, id, ct);
        if (doc is null) return Problem(statusCode: 404, title: "Không tìm thấy đơn hàng");
        return Doc(doc);
    }

    /// <summary>
    /// PUT /api/orders/{id} + If-Match: ghi đè CẢ tài liệu đơn bằng MỘT câu UPDATE order_dv.
    /// Quyền theo TỪNG TRƯỜNG: khách hàng chỉ đổi địa chỉ giao, dòng hàng và THÊM thanh toán cho đơn mình;
    /// người bán chỉ thêm / sửa vận đơn (shipments[]); quản trị đổi được mọi trường ghi được.
    /// Không ai trừ quản trị đổi được khách của đơn (customer.customerId).
    /// ETag sai -> 412; sửa dòng hàng khi đơn đã khoá -> 409 (ORA-20004 do trigger ném ra).
    /// </summary>
    [HttpPut("{id:long}")]
    public async Task<IActionResult> Put(long id, [FromBody] JsonObject doc, CancellationToken ct)
    {
        if (await CheckAccess(id, ct) is { } denied) return denied;
        var etag = DocEtag.Normalize(Request.Headers.IfMatch.ToString())
                   ?? doc["_metadata"]?["etag"]?.GetValue<string>();
        if (etag is null)
            return Problem(statusCode: 428, title: "Thiếu If-Match",
                           detail: "Hãy GET tài liệu để lấy ETag rồi gửi kèm header If-Match.");

        var role = HttpContext.Role();
        if (!role.IsAdmin)
        {
            var json = await store.GetAsync(DualityView.ORDER_DV, id, ct);
            if (json is null) return Problem(statusCode: 404, title: "Không tìm thấy đơn hàng");
            var current = JsonNode.Parse(json)!.AsObject();

            // (1) So ETag TRƯỚC: client đang sửa bản cũ thì báo đúng nguyên nhân là xung đột (412),
            //     không so từng trường với bản mới rồi báo nhầm thành "không có quyền" (403).
            if (!string.Equals(DocEtag.Normalize(current["_metadata"]?["etag"]?.GetValue<string>()), etag,
                               StringComparison.OrdinalIgnoreCase))
                return Problem(statusCode: 412, title: "Xung đột ETag: tài liệu đã bị người khác sửa, hãy tải lại",
                               detail: "Tài liệu bạn gửi dựa trên phiên bản cũ của đơn. Hãy GET lại rồi sửa trên bản mới.");

            // (2) Các trường ghi được bị đổi phải nằm trong quyền của vai trò
            var allowed = role.Kind == RoleKind.Customer ? CustomerFields : SellerFields;
            var notAllowed = AccessControl.ChangedFields(current, doc, Writable).Except(allowed).ToList();
            // Khách hàng: payments[] chỉ được THÊM dòng mới, không sửa / xoá dòng đã có
            if (role.Kind == RoleKind.Customer && !AccessControl.OnlyAppended(current["payments"], doc["payments"]))
                notAllowed.Add("payments (chỉ được thêm thanh toán mới)");
            // (3) Khách của đơn: Duality View sẽ đổi luôn orders.customer_id nếu client đổi customer.customerId
            if (doc["customer"] is not null && !AccessControl.SameId(doc["customer"]?["customerId"],
                                                                    current["customer"]?["customerId"]?.GetValue<long>()))
                notAllowed.Add("customer");
            if (notAllowed.Count > 0)
                return AccessControl.Denied(role,
                    $"{role.Display} không được sửa: {string.Join(", ", notAllowed)}. Được phép sửa: {string.Join(", ", allowed)}.");
            doc["customer"] = current["customer"]!.DeepClone();   // luôn giữ khách hiện tại của đơn
        }

        var updated = await store.UpdateAsync(DualityView.ORDER_DV, id, DocEtag.PrepareForUpdate(doc, id, etag),
                                              HttpContext.CurrentUser(), ct);
        return updated is null ? Problem(statusCode: 404, title: "Không tìm thấy đơn hàng") : Doc(updated);
    }

    // ----------------------- Đường quan hệ: gọi PKG_ORDER -----------------------

    /// <summary>GET /api/orders/{id}/next-statuses: trạng thái kế tiếp hợp lệ (tính bằng hàm trong CSDL).</summary>
    [HttpGet("{id:long}/next-statuses")]
    public async Task<IActionResult> NextStatuses(long id, CancellationToken ct)
    {
        if (await CheckAccess(id, ct) is { } denied) return denied;
        var r = await orders.NextStatusesAsync(id, ct);
        return r is null ? Problem(statusCode: 404, title: "Không tìm thấy đơn hàng")
                         : Ok(new { current = r.Value.Current, next = r.Value.Next });
    }

    public record StatusRequest(string Status, string? Note);
    public record CancelRequest(string? Reason);
    public record PaymentRequest(string Method, decimal Amount, string? Reference);

    /// <summary>POST /api/orders/{id}/status {status, note} -> pkg_order.sp_change_status. Chỉ người bán (đơn của shop) và quản trị.</summary>
    [HttpPost("{id:long}/status")]
    [RequireRole(RoleKind.Seller, RoleKind.Admin)]
    public async Task<IActionResult> ChangeStatus(long id, StatusRequest req, CancellationToken ct)
    {
        if (await CheckAccess(id, ct) is { } denied) return denied;
        return Doc(await orders.ChangeStatusAsync(id, req.Status.ToUpperInvariant(), req.Note,
                                                  HttpContext.CurrentUser(), ct));
    }

    /// <summary>POST /api/orders/{id}/cancel {reason} -> pkg_order.sp_cancel_order. Khách (đơn của mình), người bán (đơn của shop), quản trị.</summary>
    [HttpPost("{id:long}/cancel")]
    public async Task<IActionResult> Cancel(long id, CancelRequest req, CancellationToken ct)
    {
        if (await CheckAccess(id, ct) is { } denied) return denied;
        return Doc(await orders.CancelAsync(id, req.Reason, HttpContext.CurrentUser(), ct));
    }

    /// <summary>POST /api/orders/{id}/payments {method, amount, reference} -> pkg_order.sp_record_payment. Khách (đơn của mình) và quản trị.</summary>
    [HttpPost("{id:long}/payments")]
    [RequireRole(RoleKind.Customer, RoleKind.Admin)]
    public async Task<IActionResult> RecordPayment(long id, PaymentRequest req, CancellationToken ct)
    {
        if (await CheckAccess(id, ct) is { } denied) return denied;
        return Doc(await orders.RecordPaymentAsync(id, req.Method, req.Amount, req.Reference,
                                                   HttpContext.CurrentUser(), ct));
    }

    /// <summary>
    /// Quyền trên MỘT đơn: quản trị mọi đơn; khách hàng đơn của mình; người bán đơn có sản phẩm của shop.
    /// Trả null nếu được phép, ngược lại trả 404 / 403.
    /// </summary>
    private async Task<IActionResult?> CheckAccess(long id, CancellationToken ct)
    {
        var role = HttpContext.Role();
        if (role.IsAdmin) return null;
        var access = await orders.GetAccessAsync(id, ct);
        if (access is null) return Problem(statusCode: 404, title: "Không tìm thấy đơn hàng");
        if (access.Allows(role)) return null;
        return AccessControl.Denied(role, role.Kind == RoleKind.Customer
            ? $"Đơn #{id} không phải đơn của {role.Display}."
            : $"Đơn #{id} không có sản phẩm nào của {role.Display}.");
    }

    /// <summary>Trả tài liệu JSON nguyên bản kèm header ETag.</summary>
    private ContentResult Doc(string doc)
    {
        Response.Headers.ETag = DocEtag.FromDoc(doc);
        return Content(doc, "application/json");
    }
}
