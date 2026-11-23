using System.Text;
using System.Text.RegularExpressions;
using Ecom.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers.Api;

/// <summary>
/// Chuyển tiếp tới ORDS AutoREST (REST do Oracle TỰ SINH cho Duality View) để trang /Ords so sánh với API C#.
///   GET|POST|PUT /api/ords/{view}/{rest}  ->  {Ords:BaseUrl}{view}/{rest}   (ví dụ order_dv/3)
/// Vì sao chuyển tiếp: ORDS chạy ở cổng khác (8181) nên trình duyệt gọi thẳng sẽ bị chặn CORS.
/// Chỉ quản trị; chỉ 3 Duality View; phần đuôi chỉ gồm chữ / số / _ / - (không cho "../" hay URL khác).
/// Trả NGUYÊN mã HTTP, nội dung và ETag của ORDS (kể cả lỗi Oracle do trigger ném ra); header X-Ords-Url = URL gốc.
/// </summary>
[ApiController]
[Route("api/ords")]
[RequireRole(RoleKind.Admin)]
public class OrdsApiController(IHttpClientFactory httpFactory) : ControllerBase
{
    private static readonly HashSet<string> Views = ["order_dv", "product_dv", "customer_dv"];
    private static readonly Regex SafeRest = new("^[0-9A-Za-z_-]*$");

    /// <summary>Gọi ORDS AutoREST cho một Duality View (đọc, thêm, ghi đè tài liệu) và trả nguyên kết quả.</summary>
    [AcceptVerbs("GET", "POST", "PUT")]
    [Route("{view}/{**rest}")]
    public async Task<IActionResult> Forward(string view, string? rest, CancellationToken ct)
    {
        rest ??= "";
        if (!Views.Contains(view) || !SafeRest.IsMatch(rest))
            return Problem(statusCode: 400, title: "Đường dẫn ORDS không hợp lệ",
                           detail: "Chỉ hỗ trợ order_dv, product_dv, customer_dv và mã tài liệu dạng chữ / số.");

        var http = httpFactory.CreateClient("ords");
        var path = $"{view}/{rest}{Request.QueryString}";
        using var req = new HttpRequestMessage(new HttpMethod(Request.Method), path);
        if (Request.Method != "GET")
        {
            using var reader = new StreamReader(Request.Body, Encoding.UTF8);
            req.Content = new StringContent(await reader.ReadToEndAsync(ct), Encoding.UTF8, "application/json");
        }
        if (Request.Headers.IfMatch.Count > 0) req.Headers.TryAddWithoutValidation("If-Match", Request.Headers.IfMatch.ToString());

        HttpResponseMessage res;
        try { res = await http.SendAsync(req, ct); }
        catch (HttpRequestException ex)
        {
            return Problem(statusCode: 503, title: "ORDS chưa chạy",
                           detail: $"Không kết nối được {http.BaseAddress}. Chạy .\\scripts\\ords.ps1 start. ({ex.Message})");
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            return Problem(statusCode: 504, title: "ORDS không trả lời kịp");
        }

        using (res)
        {
            Response.Headers["X-Ords-Url"] = new Uri(http.BaseAddress!, path).ToString();
            if (res.Headers.ETag is { } etag) Response.Headers.ETag = etag.ToString();
            return new ContentResult
            {
                StatusCode = (int)res.StatusCode,
                Content = await res.Content.ReadAsStringAsync(ct),
                ContentType = res.Content.Headers.ContentType?.ToString() ?? "application/json",
            };
        }
    }
}
