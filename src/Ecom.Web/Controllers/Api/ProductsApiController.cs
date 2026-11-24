using System.Text.Json;
using System.Text.Json.Nodes;
using Ecom.Web.Data;
using Ecom.Web.Infrastructure;
using Ecom.Web.Models;
using Ecom.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers.Api;

/// <summary>
/// REST API sản phẩm, đọc/ghi qua Duality View PRODUCT_DV.
///   GET  /api/products?categoryId=&amp;brand=&amp;minRamGb=&amp;minStorageGb=&amp;size=&amp;q=&amp;activeOnly=
///   GET  /api/products/{id}              -> tài liệu + header ETag
///   PUT  /api/products/{id}  (If-Match)  -> ghi đè tài liệu; sai ETag -> 412
///   POST /api/products                   -> tạo sản phẩm từ một tài liệu JSON
///   POST /api/products/bulk              -> tạo NHIỀU sản phẩm từ một mảng tài liệu, trong MỘT giao dịch
///   GET  /api/products/facets?categoryId=  -> cây danh mục, thương hiệu, thuộc tính JSON (dataguide)
///   GET  /api/products/{id}/sales        -> đã bán bao nhiêu (SQL trên bảng order_items + orders)
///   GET  /api/products/{id}/image       -> ảnh sản phẩm (tệp trên đĩa, không nằm trong CSDL)
///   POST /api/products/{id}/image        -> người bán / quản trị tải ảnh lên (multipart, field "file")
/// Lỗi Oracle (ORA-40875 sai JSON Schema, ORA-42699 sai ETag...) do OracleExceptionFilter đổi sang HTTP.
/// </summary>
[ApiController]
[Route("api/products")]
public class ProductsApiController(ProductRepository repo, ProductImageStore images) : ControllerBase
{
    /// <summary>Lọc sản phẩm bằng SQL/JSON (JSON_VALUE, JSON_EXISTS) rồi trả các tài liệu PRODUCT_DV (tối đa 200) kèm câu SQL đã chạy.</summary>
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] ProductFilter filter, CancellationToken ct)
    {
        var (items, count, whereSql) = await repo.ListAsync(filter, ct);
        // Bọc mảng tài liệu kèm câu lọc đã dùng (để giao diện hiển thị, phục vụ demo/vấn đáp).
        // "items" là chuỗi JSON nguyên bản do Oracle sinh, chèn thẳng, không parse lại.
        var json = $"{{\"count\":{count},\"filterSql\":{JsonSerializer.Serialize(whereSql)},\"items\":{items}}}";
        return Content(json, "application/json");
    }

    /// <summary>Đọc một tài liệu PRODUCT_DV (sản phẩm + seller + category + attributes JSON); header ETag.</summary>
    [HttpGet("{id:long}")]
    public async Task<IActionResult> Get(long id, CancellationToken ct)
    {
        var doc = await repo.GetDocAsync(id, ct);
        if (doc is null) return Problem(statusCode: 404, title: "Không tìm thấy sản phẩm");
        Response.Headers.ETag = DocEtag.FromDoc(doc);
        return Content(doc, "application/json");
    }

    /// <summary>Số lượng đã bán / số đơn của một sản phẩm (trang chi tiết sản phẩm). Đọc bảng chuẩn hoá, cùng nguồn dữ liệu với PRODUCT_DV.</summary>
    [HttpGet("{id:long}/sales")]
    public Task<ProductSales> Sales(long id, CancellationToken ct) => repo.SalesAsync(id, ct);

    /// <summary>Ghi đè tài liệu PRODUCT_DV (UPDATE product_dv) – cần If-Match; sai JSON Schema → 422, ETag cũ → 412.</summary>
    [HttpPut("{id:long}")]
    [RequireRole(RoleKind.Seller, RoleKind.Admin)]
    public async Task<IActionResult> Put(long id, [FromBody] JsonObject doc, CancellationToken ct)
    {
        // Người bán chỉ sửa sản phẩm của shop mình và không được chuyển sản phẩm sang shop khác
        var role = HttpContext.Role();
        if (await CheckOwnerAsync(id, ct) is IActionResult denied) return denied;
        if (role.Kind == RoleKind.Seller)
        {
            // Duality View đổi luôn products.seller_id nếu client đổi seller.sellerId -> người bán không được làm vậy.
            // So theo giá trị số (3 / 3.0 / 3e0 như nhau), rồi ghi đè bằng chính người bán đang thao tác.
            if (doc["seller"] is not null && !AccessControl.SameId(doc["seller"]?["sellerId"], role.Id))
                return AccessControl.Denied(role, "Không được chuyển sản phẩm sang người bán khác.");
            doc["seller"] = new JsonObject { ["sellerId"] = role.Id };
        }
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

    /// <summary>Thêm sản phẩm bằng một tài liệu JSON (INSERT INTO product_dv); attributes phải có brand (JSON Schema).</summary>
    [HttpPost]
    [RequireRole(RoleKind.Seller, RoleKind.Admin)]
    public async Task<IActionResult> Post([FromBody] JsonObject doc, CancellationToken ct)
    {
        // Người bán chỉ thêm sản phẩm cho shop mình (thiếu sellerId thì gán chính mình)
        var role = HttpContext.Role();
        if (role.Kind == RoleKind.Seller)
        {
            if (doc["seller"] is not null && !AccessControl.SameId(doc["seller"]?["sellerId"], role.Id))
                return AccessControl.Denied(role, $"{role.Display} chỉ được thêm sản phẩm cho shop của mình.");
            doc["seller"] = new JsonObject { ["sellerId"] = role.Id };
        }
        doc.Remove("_id");        // khoá do identity sinh
        doc.Remove("_metadata");
        var (id, created) = await repo.InsertDocAsync(doc.ToJsonString(), HttpContext.CurrentUser(), ct);
        Response.Headers.ETag = DocEtag.FromDoc(created);
        return new ContentResult { StatusCode = 201, Content = created, ContentType = "application/json" };
    }

    /// <summary>
    /// Thêm nhiều sản phẩm (tối đa 50) bằng một mảng tài liệu PRODUCT_DV, trong MỘT giao dịch:
    /// tài liệu nào lỗi (thiếu brand, trùng SKU, giá âm…) thì không sản phẩm nào được thêm, và lỗi chỉ rõ tài liệu thứ mấy.
    /// </summary>
    [HttpPost("bulk")]
    [RequireRole(RoleKind.Seller, RoleKind.Admin)]
    public async Task<IActionResult> PostBulk([FromBody] JsonNode? body, CancellationToken ct)
    {
        if (body is not JsonArray arr || arr.Count is 0 or > MaxBulk || arr.Any(n => n is not JsonObject))
            return Problem(statusCode: 400, title: "Dữ liệu không hợp lệ",
                           detail: $"Gửi một MẢNG từ 1 đến {MaxBulk} tài liệu sản phẩm (mỗi phần tử là một object).");
        var role = HttpContext.Role();
        var docs = new List<string>();
        for (var i = 0; i < arr.Count; i++)
        {
            var doc = arr[i]!.AsObject();
            if (role.Kind == RoleKind.Seller)
            {
                // giống POST một sản phẩm: người bán chỉ đăng cho shop mình
                if (doc["seller"] is not null && !AccessControl.SameId(doc["seller"]?["sellerId"], role.Id))
                    return AccessControl.Denied(role, $"Sản phẩm #{i + 1}: {role.Display} chỉ được thêm sản phẩm cho shop của mình.");
                doc["seller"] = new JsonObject { ["sellerId"] = role.Id };
            }
            else if (doc["seller"]?["sellerId"] is null)   // quản trị đăng hộ: phải nói rõ shop nào
                return Problem(statusCode: 400, title: "Thiếu người bán",
                               detail: $"Sản phẩm #{i + 1}: quản trị cần ghi \"seller\": {{ \"sellerId\": … }} cho từng sản phẩm.");
            doc.Remove("_id");
            doc.Remove("_metadata");
            docs.Add(doc.ToJsonString());
        }
        try
        {
            var created = await repo.InsertManyDocsAsync(docs, HttpContext.CurrentUser(), ct);
            var json = $"{{\"count\":{created.Count},\"items\":[{string.Join(",", created.Select(c => c.Doc))}]}}";
            return new ContentResult { StatusCode = 201, Content = json, ContentType = "application/json" };
        }
        catch (BulkInsertException ex)
        {
            var e = Services.OracleErrorMapper.Map(ex.Oracle);
            return Problem(statusCode: e.Status, title: e.Title,
                detail: $"Sản phẩm #{ex.Index + 1}: {e.Title} ({e.Code}). Không sản phẩm nào được thêm – cả lô đã rollback.");
        }
    }

    private const int MaxBulk = 50;

    /// <summary>Ảnh sản phẩm: ảnh người bán tải lên, nếu không có thì ảnh mẫu; chưa có ảnh -> 404 (giao diện hiện biểu tượng danh mục).</summary>
    [HttpGet("{id:long}/image")]
    public IActionResult Image(long id)
    {
        if (images.Find(id) is not var (path, type)) return NotFound();
        Response.Headers.CacheControl = "no-cache";   // trình duyệt hỏi lại (304 nếu chưa đổi) -> thấy ngay ảnh mới tải lên
        var info = new FileInfo(path);
        var etag = new Microsoft.Net.Http.Headers.EntityTagHeaderValue($"\"{info.LastWriteTimeUtc.Ticks:x}-{info.Length:x}\"");
        return PhysicalFile(path, type, info.LastWriteTimeUtc, etag);
    }

    /// <summary>Tải ảnh sản phẩm lên (JPG / PNG / WEBP, tối đa 2 MB): người bán của shop sở hữu sản phẩm hoặc quản trị.</summary>
    [HttpPost("{id:long}/image")]
    [RequireRole(RoleKind.Seller, RoleKind.Admin)]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(ProductImageStore.MaxBytes + 64 * 1024)]
    public async Task<IActionResult> UploadImage(long id, IFormFile file, CancellationToken ct)
    {
        if (await CheckOwnerAsync(id, ct) is IActionResult denied) return denied;
        if (await images.SaveAsync(id, file, ct) is string error)
            return Problem(statusCode: 422, title: "Ảnh không hợp lệ", detail: error);
        return Ok(new { productId = id, imageUrl = $"/api/products/{id}/image" });
    }

    /// <summary>Sản phẩm tồn tại không, và người bán hiện tại có sở hữu không (quản trị: luôn được). null = được phép.</summary>
    private async Task<IActionResult?> CheckOwnerAsync(long id, CancellationToken ct)
    {
        var current = await repo.GetDocAsync(id, ct);
        if (current is null) return Problem(statusCode: 404, title: "Không tìm thấy sản phẩm");
        var role = HttpContext.Role();
        if (role.Kind != RoleKind.Seller) return null;
        var owner = SellerOf(JsonNode.Parse(current));
        return owner == role.Id ? null
            : AccessControl.Denied(role, $"Sản phẩm #{id} thuộc người bán #{owner}, không phải của {role.Display}.");
    }

    /// <summary>seller.sellerId trong tài liệu PRODUCT_DV (null nếu không có).</summary>
    private static long? SellerOf(JsonNode? doc)
        => doc?["seller"]?["sellerId"] is JsonValue v && v.TryGetValue<long>(out var id) ? id : null;

    /// <summary>Dữ liệu cho bộ lọc: cây danh mục (CONNECT BY), danh sách thương hiệu, các khoá JSON (JSON_DATAGUIDE).</summary>
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
