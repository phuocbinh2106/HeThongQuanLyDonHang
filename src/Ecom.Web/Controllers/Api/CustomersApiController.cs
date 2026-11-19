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
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct) => Ok(await repo.ListAsync(ct));

    [HttpGet("{id:long}")]
    public async Task<IActionResult> Get(long id, CancellationToken ct)
    {
        var doc = await repo.GetDocAsync(id, ct);
        if (doc is null) return Problem(statusCode: 404, title: "Không tìm thấy khách hàng");
        Response.Headers.ETag = DocEtag.FromDoc(doc);
        return Content(doc, "application/json");
    }

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
}
