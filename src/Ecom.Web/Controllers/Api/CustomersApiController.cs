using System.Text.Json.Nodes;
using Ecom.Web.Data;
using Ecom.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers.Api;

/// <summary>
///   GET /api/customers            -> danh sách khách (SQL quan hệ)
///   GET /api/customers/{id}       -> tài liệu CUSTOMER_DV (hồ sơ + addresses[]) + ETag
///   PUT /api/customers/{id}       -> ghi đè hồ sơ + sổ địa chỉ (thêm/sửa/xoá địa chỉ trong mảng)
/// </summary>
[ApiController]
[Route("api/customers")]
public class CustomersApiController(CustomerRepository repo) : ControllerBase
{
    /// <summary>
    /// Tìm khách phía server, có phân trang: ?q=&amp;limit=20&amp;offset=0. q khớp mã KH, hoặc một phần họ tên /
    /// email / số điện thoại. Trả { total, items } – giao diện dùng cho ô "gõ để tìm khách" thay vì dropdown tất cả khách.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? q, [FromQuery] int limit = 20, [FromQuery] int offset = 0,
                                          CancellationToken ct = default)
        => Ok(await repo.SearchAsync(q, limit, offset, ct));

    /// <summary>Đọc tài liệu CUSTOMER_DV (hồ sơ + addresses[]); header ETag.</summary>
    [HttpGet("{id:long}")]
    public async Task<IActionResult> Get(long id, CancellationToken ct)
    {
        var doc = await repo.GetDocAsync(id, ct);
        if (doc is null) return Problem(statusCode: 404, title: "Không tìm thấy khách hàng");
        Response.Headers.ETag = DocEtag.FromDoc(doc);
        return Content(doc, "application/json");
    }

    /// <summary>Ghi đè hồ sơ và sổ địa chỉ (thêm / sửa / xoá phần tử addresses[]) bằng một câu UPDATE customer_dv – cần If-Match.</summary>
    [HttpPut("{id:long}")]
    public async Task<IActionResult> Put(long id, [FromBody] JsonObject doc, CancellationToken ct)
    {
        var etag = DocEtag.Normalize(Request.Headers.IfMatch.ToString())
                   ?? doc["_metadata"]?["etag"]?.GetValue<string>();
        if (etag is null)
            return Problem(statusCode: 428, title: "Thiếu If-Match",
                           detail: "Hãy GET tài liệu để lấy ETag rồi gửi kèm header If-Match.");
        var updated = await repo.UpdateDocAsync(id, DocEtag.PrepareForUpdate(doc, id, etag),
                                                HttpContext.CurrentUser(), ct);
        if (updated is null) return Problem(statusCode: 404, title: "Không tìm thấy khách hàng");
        Response.Headers.ETag = DocEtag.FromDoc(updated);
        return Content(updated, "application/json");
    }

    /// <summary>POST /api/customers: tạo khách kèm addresses[] bằng một tài liệu CUSTOMER_DV.</summary>
    [HttpPost]
    public async Task<IActionResult> Post([FromBody] JsonObject doc, CancellationToken ct)
    {
        doc.Remove("_id");
        doc.Remove("_metadata");
        var (id, created) = await repo.InsertDocAsync(doc.ToJsonString(), HttpContext.CurrentUser(), ct);
        Response.Headers.ETag = DocEtag.FromDoc(created);
        Response.Headers.Location = $"/api/customers/{id}";
        return new ContentResult { StatusCode = 201, Content = created, ContentType = "application/json" };
    }

    /// <summary>GET /api/sellers: danh sách người bán (màn hình chọn vai trò).</summary>
    [HttpGet("/api/sellers")]
    public async Task<IActionResult> Sellers(CancellationToken ct) => Ok(await repo.SellersAsync(ct));
}
