using System.Text.Json;
using System.Text.Json.Nodes;
using Ecom.Web.Data;
using Ecom.Web.Infrastructure;
using Ecom.Web.Models;
using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers.Api;

/// <summary>
/// REST API sản phẩm, đọc/ghi qua Duality View PRODUCT_DV.
///   GET  /api/products?categoryId=&brand=&minRamGb=&minStorageGb=&size=&q=&activeOnly=
///   GET  /api/products/{id}              -> tài liệu + header ETag
///   PUT  /api/products/{id}  (If-Match)  -> ghi đè tài liệu; sai ETag -> 412
///   POST /api/products                   -> tạo sản phẩm từ một tài liệu JSON
///   GET  /api/products/facets?categoryId=  -> cây danh mục, thương hiệu, thuộc tính JSON (dataguide)
/// Lỗi Oracle (ORA-40875 sai JSON Schema, ORA-42699 sai ETag...) do OracleExceptionFilter đổi sang HTTP.
/// </summary>
[ApiController]
[Route("api/products")]
public class ProductsApiController(ProductRepository repo) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] ProductFilter filter, CancellationToken ct)
    {
        var (items, count, whereSql) = await repo.ListAsync(filter, ct);
        // Bọc mảng tài liệu kèm câu lọc đã dùng (để giao diện hiển thị, phục vụ demo/vấn đáp).
        // "items" là chuỗi JSON nguyên bản do Oracle sinh, chèn thẳng, không parse lại.
        var json = $"{{\"count\":{count},\"filterSql\":{JsonSerializer.Serialize(whereSql)},\"items\":{items}}}";
        return Content(json, "application/json");
    }

    [HttpGet("{id:long}")]
    public async Task<IActionResult> Get(long id, CancellationToken ct)
    {
        var doc = await repo.GetDocAsync(id, ct);
        if (doc is null) return Problem(statusCode: 404, title: "Không tìm thấy sản phẩm");
        Response.Headers.ETag = DocEtag.FromDoc(doc);
        return Content(doc, "application/json");
    }

    [HttpPut("{id:long}")]
    public async Task<IActionResult> Put(long id, [FromBody] JsonObject doc, CancellationToken ct)
    {
        // Bắt buộc có ETag (header If-Match, hoặc _metadata.etag trong tài liệu) để chống ghi đè
        var etag = DocEtag.Normalize(Request.Headers.IfMatch.ToString())
                   ?? doc["_metadata"]?["etag"]?.GetValue<string>();
        if (etag is null)
            return Problem(statusCode: 428, title: "Thiếu If-Match",
                           detail: "Hãy GET tài liệu để lấy ETag rồi gửi kèm header If-Match.");

        var updated = await repo.UpdateDocAsync(id, DocEtag.PrepareForUpdate(doc, id, etag),
                                                HttpContext.CurrentUser(), ct);
        if (updated is null) return Problem(statusCode: 404, title: "Không tìm thấy sản phẩm");
        Response.Headers.ETag = DocEtag.FromDoc(updated);
        return Content(updated, "application/json");
    }

    [HttpPost]
    public async Task<IActionResult> Post([FromBody] JsonObject doc, CancellationToken ct)
    {
        doc.Remove("_id");        // khoá do identity sinh
        doc.Remove("_metadata");
        var (id, created) = await repo.InsertDocAsync(doc.ToJsonString(), HttpContext.CurrentUser(), ct);
        Response.Headers.ETag = DocEtag.FromDoc(created);
        return new ContentResult { StatusCode = 201, Content = created, ContentType = "application/json" };
    }

    [HttpGet("facets")]
    public async Task<IActionResult> Facets([FromQuery] long? categoryId, CancellationToken ct)
    {
        return Ok(new
        {
            categories = await repo.CategoriesAsync(ct),
            brands = await repo.BrandsAsync(categoryId, ct),
            attributeKeys = await repo.AttributeKeysAsync(categoryId, ct),
        });
    }
}
