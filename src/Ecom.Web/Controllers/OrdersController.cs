using Ecom.Web.Data;
using Ecom.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers;

/// <summary>
/// Các trang đơn hàng. View chỉ là khung HTML; dữ liệu do JavaScript gọi /api/orders (API kiểm tra quyền lại).
/// Chưa chọn vai trò thì không vào được trang đơn hàng.
/// </summary>
[RequireRole(RoleKind.Customer, RoleKind.Seller, RoleKind.Admin)]
public class OrdersController(OrderRepository orders) : Controller
{
    /// <summary>M3 – Danh sách đơn: khách hàng thấy đơn của mình, người bán thấy đơn có sản phẩm của shop.</summary>
    public IActionResult Index() => View();

    /// <summary>M2 – Tạo đơn: khách hàng (cho chính mình) và quản trị; người bán không tạo đơn.</summary>
    [RequireRole(RoleKind.Customer, RoleKind.Admin)]
    public IActionResult Create() => View();

    /// <summary>
    /// M4 – Chi tiết đơn, hai tab: tài liệu JSON (ORDER_DV) và các dòng trong bảng quan hệ.
    /// Kiểm tra quyền trên ĐÚNG đơn này ngay ở server: không phải đơn của mình / của shop mình thì hiện trang 403.
    /// </summary>
    public async Task<IActionResult> Details(long id, CancellationToken ct)
    {
        var role = HttpContext.Role();
        if (!role.IsAdmin)
        {
            var access = await orders.GetAccessAsync(id, ct);
            var ok = access is not null
                     && ((role.Kind == RoleKind.Customer && access.CustomerId == role.Id)
                         || (role.Kind == RoleKind.Seller && role.Id is long sid && access.SellerIds.Contains(sid)));
            if (!ok && access is not null)
                return RequireRoleAttribute.Forbidden(this, role, role.Kind == RoleKind.Customer
                    ? $"Đơn #{id} không phải đơn của {role.Display}."
                    : $"Đơn #{id} không có sản phẩm nào của {role.Display}.");
        }
        ViewData["OrderId"] = id;
        return View();
    }
}
