using Ecom.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers;

/// <summary>M1 – Trang sản phẩm. View chỉ là khung HTML; dữ liệu do JavaScript gọi /api/products.</summary>
public class ProductsController : Controller
{
    public IActionResult Index() => View();

    /// <summary>Đăng bán sản phẩm: biểu mẫu -> JavaScript ráp MỘT tài liệu JSON -> POST /api/products (INSERT INTO product_dv).
    /// Chỉ người bán (cho shop mình) và quản trị.</summary>
    [RequireRole(RoleKind.Seller, RoleKind.Admin)]
    public IActionResult Create() => View();
}
