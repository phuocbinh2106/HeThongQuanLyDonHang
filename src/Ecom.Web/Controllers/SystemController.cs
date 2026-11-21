using Ecom.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers;

/// <summary>Trang "Hệ thống": kiểm tra kết nối Giao diện → API → Oracle. Chỉ quản trị.
/// Dữ liệu do JavaScript gọi GET /api/system/health (API cũng chỉ cho quản trị).</summary>
[RequireRole(RoleKind.Admin)]
public class SystemController : Controller
{
    public IActionResult Index() => View();
}
