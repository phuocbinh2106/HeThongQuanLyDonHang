using System.Text.RegularExpressions;
using Oracle.ManagedDataAccess.Client;

namespace Ecom.Web.Services;

/// <summary>Lỗi đã ánh xạ: mã HTTP + mã ORA + thông báo thân thiện.</summary>
public record ApiError(int Status, string Code, string Title, string Detail);

/// <summary>
/// Ánh xạ lỗi Oracle (ORA-xxxxx) sang mã HTTP để giao diện hiện ĐÚNG nguyên nhân.
///
/// Điểm quan trọng (đã kiểm chứng trên 23.26.3): khi ghi qua Duality View, lỗi nghiệp vụ do
/// trigger/procedure ném ra (ORA-200xx) bị BỌC trong ORA-42692, ví dụ:
///   ORA-42692: Cannot insert into JSON Relational Duality View ... 'ORDER_ITEMS'
///   ORA-20001: Không đủ tồn kho cho sản phẩm 2
/// => Không thể chỉ nhìn OracleException.Number (= 42692). Phải QUÉT TOÀN BỘ chuỗi lỗi,
///    ưu tiên mã nghiệp vụ ORA-200xx đầu tiên tìm thấy.
/// </summary>
public static class OracleErrorMapper
{
    // Bắt "ORA-20001: <thông báo>" tới hết dòng
    private static readonly Regex OraLine = new(@"ORA-(\d{5}):\s*([^\r\n]*)", RegexOptions.Compiled);

    // Mã lỗi tự định nghĩa trong PKG_ORDER / PKG_ORDER_RPT (xem CLAUDE.md mục 5.3)
    private static readonly Dictionary<int, (int Status, string Title)> Business = new()
    {
        [20001] = (409, "Hết hàng"),
        [20002] = (422, "Chuyển trạng thái không hợp lệ"),
        [20003] = (422, "Sản phẩm ngừng bán hoặc không tồn tại"),
        [20004] = (409, "Đơn hàng đã khoá, không được sửa dòng hàng"),
        [20005] = (422, "Tổng thanh toán vượt tổng tiền đơn"),
        [20006] = (404, "Không tìm thấy đơn hàng"),
        [20007] = (422, "Giảm giá vượt tổng tiền hàng"),
        [20010] = (422, "Tham số báo cáo không hợp lệ"),
    };

    // Lỗi hệ thống thường gặp
    private static readonly Dictionary<int, (int Status, string Title)> System = new()
    {
        [42699] = (412, "Xung đột ETag: tài liệu đã bị người khác sửa, hãy tải lại"),
        [40875] = (422, "Thuộc tính JSON không đúng JSON Schema"),
        [2290]  = (422, "Vi phạm ràng buộc CHECK"),
        [1]     = (409, "Trùng giá trị duy nhất (UNIQUE)"),
        [2291]  = (422, "Khoá ngoại không tồn tại (tham chiếu sai ID)"),
        [1400]  = (422, "Thiếu giá trị bắt buộc (NOT NULL)"),
        [42692] = (422, "Không ghi được vào Duality View"),
        [42603] = (422, "Thao tác không được phép trên Duality View"),
        [12541] = (503, "Không kết nối được Oracle (listener chưa chạy)"),
        [12514] = (503, "Không kết nối được Oracle (sai service name)"),
        [1017]  = (503, "Sai tên đăng nhập hoặc mật khẩu CSDL"),
    };

    public static ApiError Map(OracleException ex)
    {
        var lines = OraLine.Matches(ex.Message)
            .Select(m => (Code: int.Parse(m.Groups[1].Value), Text: m.Groups[2].Value.Trim()))
            .ToList();
        if (lines.Count == 0) lines.Add((ex.Number, ex.Message));

        // 1) Ưu tiên lỗi nghiệp vụ ORA-200xx (kể cả khi bị bọc trong ORA-42692)
        foreach (var (code, text) in lines)
            if (Business.TryGetValue(code, out var b))
                return new ApiError(b.Status, $"ORA-{code}", b.Title, text);

        // 2a) Ràng buộc JSON Schema của products.attributes (khai báo trên kiểu cột) báo ORA-02290
        //     kèm tên ràng buộc PRODUCTS_ATTR_CHK -> đổi sang thông báo dễ hiểu
        foreach (var (code, text) in lines)
            if ((code == 2290 && text.Contains("PRODUCTS_ATTR_CHK")) || code == 40875)
                return new ApiError(422, $"ORA-{code:D5}",
                    "Thuộc tính JSON không đúng JSON Schema (bắt buộc có \"brand\" kiểu chuỗi; warrantyMonths là số ≥ 0)", text);

        // 2b) Lỗi hệ thống đã biết: lấy mã "sâu nhất" có trong bảng (bỏ qua 42692 nếu có lỗi cụ thể hơn)
        foreach (var (code, text) in lines.Where(l => l.Code != 42692))
            if (System.TryGetValue(code, out var s))
                return new ApiError(s.Status, $"ORA-{code:D5}", s.Title, text);
        foreach (var (code, text) in lines)
            if (System.TryGetValue(code, out var s))
                return new ApiError(s.Status, $"ORA-{code:D5}", s.Title, text);

        // 3) Không nhận ra: 500, giữ nguyên dòng lỗi đầu tiên để dễ gỡ lỗi khi demo
        var first = lines[0];
        return new ApiError(500, $"ORA-{first.Code:D5}", "Lỗi cơ sở dữ liệu", first.Text);
    }
}
