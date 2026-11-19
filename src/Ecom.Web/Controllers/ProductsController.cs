using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers;

/// <summary>M1 – Trang sản phẩm. View chỉ là khung HTML; dữ liệu do JavaScript gọi /api/products.</summary>
public class ProductsController : Controller
{
    public IActionResult Index() => View();
}
