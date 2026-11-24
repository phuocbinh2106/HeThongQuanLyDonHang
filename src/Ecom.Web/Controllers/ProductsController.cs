using Ecom.Web.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers;

/// <summary>M1 – Trang sản phẩm. View chỉ là khung HTML; dữ liệu do JavaScript gọi /api/products.</summary>
public class ProductsController : Controller
{
    public IActionResult Index() => View();

    /// <summary>Trang chi tiết một sản phẩm (/Products/Details/5) – ai cũng xem được.
    /// View chỉ là khung; JavaScript gọi GET /api/products/{id} (tài liệu PRODUCT_DV) và /api/products/{id}/sales.</summary>
    public IActionResult Details(long id)
    {
        if (id <= 0) return RedirectToAction(nameof(Index));
        ViewData["ProductId"] = id;
        return View();
    }

    /// <summary>Đăng bán sản phẩm: biểu mẫu -> JavaScript ráp MỘT tài liệu JSON -> POST /api/products (INSERT INTO product_dv).
    /// Chỉ người bán (cho shop mình) và quản trị.</summary>
    [RequireRole(RoleKind.Seller, RoleKind.Admin)]
    public IActionResult Create() => View();
}
