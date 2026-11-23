using Ecom.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers;

/// <summary>Trang "Thống kê shop": người bán xem shop mình, quản trị chọn shop. Dữ liệu do JavaScript gọi /api/seller-stats.</summary>
[RequireRole(RoleKind.Seller, RoleKind.Admin)]
public class SellerController : Controller
{
    public IActionResult Stats() => View();
}
