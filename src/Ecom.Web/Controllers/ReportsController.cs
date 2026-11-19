using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers;

/// <summary>M6 – Báo cáo. View là khung HTML; dữ liệu do JavaScript gọi /api/reports/{code}.</summary>
public class ReportsController : Controller
{
    public IActionResult Index() => View();
}
