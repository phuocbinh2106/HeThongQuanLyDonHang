namespace Ecom.Web.Infrastructure;

public static class HttpContextExtensions
{
    /// <summary>
    /// Người đang thao tác, dạng chuẩn "customer:2" / "seller:1" / "admin"; chưa chọn vai trò thì "web".
    /// Lấy từ vai trò ĐÃ KIỂM TRA định dạng (AccessControl.Role), nên cookie giả mạo không lọt xuống CSDL.
    /// Giá trị này được gửi xuống Oracle qua CLIENT_IDENTIFIER để trigger ghi cột changed_by của lịch sử.
    /// </summary>
    public static string CurrentUser(this HttpContext ctx)
    {
        var r = ctx.Role();
        return r.Kind switch
        {
            RoleKind.Customer => $"customer:{r.Id}",
            RoleKind.Seller => $"seller:{r.Id}",
            RoleKind.Admin => "admin",
            _ => "web",
        };
    }
}
