namespace Ecom.Web.Infrastructure;

public static class HttpContextExtensions
{
    /// <summary>
    /// Người đang thao tác (mô phỏng, không đăng nhập thật): đọc cookie "ecom_user" do trang
    /// chọn vai trò đặt, ví dụ "seller:1", "customer:2", "admin". Mặc định "web".
    /// Giá trị này được gửi xuống Oracle qua CLIENT_IDENTIFIER để ghi lịch sử.
    /// </summary>
    public static string CurrentUser(this HttpContext ctx)
    {
        var v = ctx.Request.Cookies["ecom_user"];
        return string.IsNullOrWhiteSpace(v) ? "web" : v.Length > 60 ? v[..60] : v;
    }
}
