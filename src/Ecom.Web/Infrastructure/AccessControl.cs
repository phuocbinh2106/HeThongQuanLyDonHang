using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Ecom.Web.Infrastructure;

/// <summary>Bốn loại người dùng của sàn. Guest = chưa chọn vai trò.</summary>
public enum RoleKind { Guest, Customer, Seller, Admin }

/// <summary>
/// Vai trò của người đang thao tác, đọc từ cookie "ecom_user" ("customer:3", "seller:2", "admin").
/// Đăng nhập vẫn là MÔ PHỎNG (chọn vai trò ở trang chủ), nhưng QUYỀN được kiểm tra ở server:
/// mọi API và mọi trang đều dựa vào vai trò này, không tin việc giao diện có ẩn nút hay không.
/// Cookie sai định dạng / giả mạo kiểu "customer:abc" bị coi là Guest.
/// </summary>
public sealed record CurrentRole(RoleKind Kind, long? Id)
{
    public bool IsAdmin => Kind == RoleKind.Admin;
    public bool IsCustomer(long id) => Kind == RoleKind.Customer && Id == id;
    public bool IsSeller(long id) => Kind == RoleKind.Seller && Id == id;

    public string Display => Kind switch
    {
        RoleKind.Customer => $"Khách hàng #{Id}",
        RoleKind.Seller => $"Người bán #{Id}",
        RoleKind.Admin => "Quản trị sàn",
        _ => "Khách vãng lai (chưa chọn vai trò)",
    };

    public static CurrentRole Parse(string? cookie)
    {
        if (string.IsNullOrWhiteSpace(cookie)) return Guest;
        var v = Uri.UnescapeDataString(cookie.Trim());
        if (v == "admin") return new(RoleKind.Admin, null);
        var parts = v.Split(':');
        if (parts.Length == 2 && long.TryParse(parts[1], out var id) && id > 0)
        {
            if (parts[0] == "customer") return new(RoleKind.Customer, id);
            if (parts[0] == "seller") return new(RoleKind.Seller, id);
        }
        return Guest;
    }

    public static readonly CurrentRole Guest = new(RoleKind.Guest, null);
}

public static class AccessControl
{
    public static CurrentRole Role(this HttpContext ctx) => CurrentRole.Parse(ctx.Request.Cookies["ecom_user"]);

    /// <summary>Tên vai trò tiếng Việt để ghi vào thông báo lỗi.</summary>
    public static string Names(IEnumerable<RoleKind> roles) => string.Join(", ", roles.Select(r => r switch
    {
        RoleKind.Customer => "khách hàng",
        RoleKind.Seller => "người bán",
        RoleKind.Admin => "quản trị",
        _ => "khách vãng lai",
    }));

    /// <summary>ProblemDetails 401 (chưa chọn vai trò) / 403 (không đủ quyền) cho API.</summary>
    public static ObjectResult Denied(CurrentRole role, string detail)
    {
        var status = role.Kind == RoleKind.Guest ? 401 : 403;
        var title = status == 401 ? "Chưa chọn vai trò" : "Không có quyền";
        return new ObjectResult(new ProblemDetails
        {
            Status = status, Title = title,
            Detail = status == 401 ? "Hãy chọn vai trò ở trang chủ trước. " + detail : detail,
        }) { StatusCode = status };
    }

    /// <summary>
    /// So sánh tài liệu client gửi lên với tài liệu hiện tại, trả về các trường GHI ĐƯỢC đã bị đổi.
    /// Trường chỉ đọc / NOUPDATE (orderNo, status, subtotal...) không tính vì CSDL tự bỏ qua.
    /// Dòng hàng chỉ so (orderItemId, productId, quantity): sku, productName, unitPrice là chỉ đọc.
    /// </summary>
    public static List<string> ChangedFields(JsonObject current, JsonObject incoming, IEnumerable<string> writable)
    {
        static JsonNode? Items(JsonNode? n) => n is JsonArray a
            ? new JsonArray(a.Select(i => (JsonNode?)new JsonObject
              {
                  ["orderItemId"] = i?["orderItemId"]?.DeepClone(),
                  ["productId"] = i?["productId"]?.DeepClone(),
                  ["quantity"] = i?["quantity"]?.DeepClone(),
              }).ToArray())
            : n?.DeepClone();
        var changed = new List<string>();
        foreach (var key in writable)
        {
            var a = key == "items" ? Items(current[key]) : current[key];
            var b = key == "items" ? Items(incoming[key]) : incoming[key];
            if (!JsonNode.DeepEquals(a, b)) changed.Add(key);
        }
        return changed;
    }
}

/// <summary>
/// [RequireRole(...)] gắn lên controller / action: vai trò không nằm trong danh sách thì
///  - API (ControllerBase): trả JSON ProblemDetails 401 / 403
///  - Trang MVC (Controller): trả trang "Không có quyền" (Views/Shared/Forbidden.cshtml) với mã 401 / 403
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class RequireRoleAttribute(params RoleKind[] roles) : ActionFilterAttribute
{
    public RoleKind[] Roles { get; } = roles;

    public override void OnActionExecuting(ActionExecutingContext context)
    {
        var role = context.HttpContext.Role();
        if (Roles.Contains(role.Kind)) return;
        var detail = $"Chức năng này dành cho: {AccessControl.Names(Roles)}. Vai trò hiện tại: {role.Display}.";
        context.Result = context.Controller is Controller mvc
            ? Forbidden(mvc, role, detail)
            : AccessControl.Denied(role, detail);
    }

    internal static ViewResult Forbidden(Controller mvc, CurrentRole role, string detail)
    {
        mvc.ViewData["Title"] = role.Kind == RoleKind.Guest ? "Chưa chọn vai trò" : "Không có quyền";
        mvc.ViewData["Detail"] = detail;
        mvc.ViewData["IsGuest"] = role.Kind == RoleKind.Guest;
        var v = mvc.View("Forbidden");
        v.StatusCode = role.Kind == RoleKind.Guest ? 401 : 403;
        return v;
    }
}
