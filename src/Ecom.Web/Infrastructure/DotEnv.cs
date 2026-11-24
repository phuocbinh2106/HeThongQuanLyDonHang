namespace Ecom.Web.Infrastructure;

/// <summary>
/// Nạp file ".env" (dạng KEY=VALUE, nằm ở thư mục gốc repo, đã được .gitignore bỏ qua) làm nguồn cấu hình DỰ PHÒNG.
/// Thứ tự ưu tiên của mật khẩu CSDL: user-secrets / biến môi trường (EcomDb:Password, ECOM_DB_PASSWORD) trước,
/// không có mới lấy ECOM_DB_PASSWORD trong .env. Nhờ vậy chạy "dotnet run" ở terminal nào, môi trường nào cũng
/// có mật khẩu, mà mật khẩu vẫn không nằm trong mã nguồn đẩy lên GitHub.
/// </summary>
public static class DotEnv
{
    public static void AddDotEnvFallback(this WebApplicationBuilder builder)
    {
        var path = FindUp(builder.Environment.ContentRootPath, ".env");
        if (path is null) return;

        var values = new Dictionary<string, string?>();
        foreach (var raw in File.ReadAllLines(path))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;
            var eq = line.IndexOf('=');
            if (eq <= 0) continue;
            values[line[..eq].Trim()] = line[(eq + 1)..].Trim().Trim('"');
        }
        // Chỉ dùng khi chưa có từ user-secrets / biến môi trường
        if (builder.Configuration["EcomDb:Password"] is null
            && Environment.GetEnvironmentVariable("ECOM_DB_PASSWORD") is null
            && values.TryGetValue("ECOM_DB_PASSWORD", out var pwd) && !string.IsNullOrEmpty(pwd))
        {
            builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["EcomDb:Password"] = pwd });
        }
    }

    /// <summary>Tìm tệp từ thư mục cho trước đi ngược lên thư mục cha (src/Ecom.Web -> src -> gốc repo).</summary>
    private static string? FindUp(string start, string fileName)
    {
        for (var dir = new DirectoryInfo(start); dir is not null; dir = dir.Parent)
        {
            var f = Path.Combine(dir.FullName, fileName);
            if (File.Exists(f)) return f;
        }
        return null;
    }
}
