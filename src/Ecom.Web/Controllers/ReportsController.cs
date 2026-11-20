using Ecom.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers;

/// <summary>M6 – Báo cáo doanh thu toàn sàn: chỉ quản trị. Dữ liệu do JavaScript gọi /api/reports/{code}.</summary>
[RequireRole(RoleKind.Admin)]
public class ReportsController : Controller
{
    public IActionResult Index() => View();
}
