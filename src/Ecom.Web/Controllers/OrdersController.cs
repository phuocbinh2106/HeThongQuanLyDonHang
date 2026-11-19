using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers;

/// <summary>Các trang đơn hàng. View chỉ là khung HTML; dữ liệu do JavaScript gọi /api/orders.</summary>
public class OrdersController : Controller
{
    /// <summary>M2 – Tạo đơn: gửi cả đơn bằng MỘT tài liệu JSON.</summary>
    public IActionResult Create() => View();
}
