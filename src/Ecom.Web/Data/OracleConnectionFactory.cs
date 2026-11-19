using Oracle.ManagedDataAccess.Client;

namespace Ecom.Web.Data;

/// <summary>
/// Tạo kết nối ODP.NET tới Oracle (PDB ecom, schema ecom_schema).
/// - Chuỗi kết nối KHÔNG chứa mật khẩu (appsettings.json: ConnectionStrings:Ecom).
/// - Mật khẩu đọc từ cấu hình "EcomDb:Password" (dotnet user-secrets hoặc biến môi trường
///   EcomDb__Password) hoặc biến môi trường ECOM_DB_PASSWORD (file .env) -> không lộ lên GitHub.
/// - Mỗi kết nối được gắn ClientId = người đang thao tác. Oracle lưu giá trị này vào
///   SYS_CONTEXT('USERENV','CLIENT_IDENTIFIER'), hàm pkg_order.fn_current_user đọc ra để
///   trigger ghi đúng "changed_by" trong order_status_history.
/// Kết nối do ODP.NET gom (connection pool) nên mở/đóng liên tục vẫn nhanh.
/// </summary>
public class OracleConnectionFactory
{
    private readonly string _connectionString;

    public OracleConnectionFactory(IConfiguration config)
    {
        var baseCs = config.GetConnectionString("Ecom")
            ?? throw new InvalidOperationException("Thiếu ConnectionStrings:Ecom trong appsettings.json");
        var password = config["EcomDb:Password"]
            ?? Environment.GetEnvironmentVariable("ECOM_DB_PASSWORD")
            ?? throw new InvalidOperationException(
                "Chưa cấu hình mật khẩu CSDL. Chạy: dotnet user-secrets set \"EcomDb:Password\" \"<mật khẩu>\"");

        var builder = new OracleConnectionStringBuilder(baseCs) { Password = password };
        _connectionString = builder.ConnectionString;
        DataSource = builder.DataSource;
        UserId = builder.UserID;
    }

    /// <summary>Địa chỉ CSDL (để hiển thị trên trang kiểm tra kết nối, không có mật khẩu).</summary>
    public string DataSource { get; }
    public string UserId { get; }

    /// <summary>Mở kết nối mới. clientId = tên người thao tác (ghi vào lịch sử trạng thái).</summary>
    public async Task<OracleConnection> OpenAsync(string? clientId = null, CancellationToken ct = default)
    {
        var conn = new OracleConnection(_connectionString);
        await conn.OpenAsync(ct);
        // Gán sau khi mở: ODP.NET gửi kèm CLIENT_IDENTIFIER trong lần gọi kế tiếp tới server.
        conn.ClientId = string.IsNullOrWhiteSpace(clientId) ? "web" : clientId;
        return conn;
    }
}
