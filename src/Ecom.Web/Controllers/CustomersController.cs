using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers;

/// <summary>M7 – Khách hàng: hồ sơ + sổ địa chỉ là MỘT tài liệu CUSTOMER_DV.</summary>
public class CustomersController : Controller
{
    public IActionResult Index() => View();
}
