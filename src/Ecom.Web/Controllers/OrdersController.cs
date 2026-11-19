using Microsoft.AspNetCore.Mvc;

namespace Ecom.Web.Controllers;

/// <summary>Các trang đơn hàng. View chỉ là khung HTML; dữ liệu do JavaScript gọi /api/orders.</summary>
public class OrdersController : Controller
{
    /// <summary>M3 – Danh sách đơn / Đơn của tôi.</summary>
    public IActionResult Index() => View();

    /// <summary>M2 – Tạo đơn: gửi cả đơn bằng MỘT tài liệu JSON.</summary>
    public IActionResult Create() => View();

    /// <summary>M4 – Chi tiết đơn, hai tab: tài liệu JSON (ORDER_DV) và các dòng trong bảng quan hệ.</summary>
    public IActionResult Details(long id)
    {
        ViewData["OrderId"] = id;
        return View();
    }
}
