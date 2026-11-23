using Ecom.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers;

/// <summary>Trang so sánh API C# tự viết với ORDS AutoREST (REST do Oracle tự sinh). Chỉ quản trị.
/// Dữ liệu do JavaScript gọi /api/orders/{id} và /api/ords/order_dv/{id}.</summary>
[RequireRole(RoleKind.Admin)]
public class OrdsController : Controller
{
    public IActionResult Index() => View();
}
