using Ecom.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers;

/// <summary>
/// M7 – Khách hàng: hồ sơ + sổ địa chỉ là MỘT tài liệu CUSTOMER_DV.
/// Quản trị xem mọi khách; khách hàng chỉ thấy hồ sơ của chính mình (API kiểm tra lại từng hồ sơ).
/// </summary>
[RequireRole(RoleKind.Customer, RoleKind.Admin)]
public class CustomersController : Controller
{
    public IActionResult Index() => View();
}
