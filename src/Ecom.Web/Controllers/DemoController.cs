using Ecom.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers;

/// <summary>Trang demo "nhiều khách cùng mua" (TC-10, BR-04). Chỉ quản trị; dữ liệu do JavaScript gọi /api/demo/concurrency.</summary>
[RequireRole(RoleKind.Admin)]
public class DemoController : Controller
{
    public IActionResult Concurrency() => View();
}
