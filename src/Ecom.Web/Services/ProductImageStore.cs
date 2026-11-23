namespace Ecom.Web.Services;

/// <summary>
/// Ảnh sản phẩm lưu trên đĩa, đặt tên theo mã sản phẩm (không lưu trong CSDL – xem THAY_DOI_THIET_KE.md, Đ16):
///   - Ảnh người bán tải lên : App_Data/uploads/products/{id}.jpg|png|webp  (không commit, xoá khi reset)
///   - Ảnh mẫu của seed      : wwwroot/img/products/{id}.jpg                 (có nguồn trong img/CREDITS.md)
/// Ảnh tải lên được ưu tiên hơn ảnh mẫu.
/// </summary>
public class ProductImageStore(IWebHostEnvironment env)
{
    public const long MaxBytes = 2 * 1024 * 1024;   // 2 MB
    private static readonly Dictionary<string, string> Types = new()
    {
        [".jpg"] = "image/jpeg", [".png"] = "image/png", [".webp"] = "image/webp",
    };

    private string UploadDir => Path.Combine(env.ContentRootPath, "App_Data", "uploads", "products");
    private string SeedDir => Path.Combine(env.WebRootPath, "img", "products");

    /// <summary>Đường dẫn + kiểu ảnh của sản phẩm, null nếu chưa có ảnh.</summary>
    public (string Path, string ContentType)? Find(long id)
    {
        foreach (var dir in new[] { UploadDir, SeedDir })
            foreach (var (ext, type) in Types)
            {
                var p = Path.Combine(dir, $"{id}{ext}");
                if (File.Exists(p)) return (p, type);
            }
        return null;
    }

    /// <summary>Lưu ảnh tải lên. Kiểm tra kích thước và "chữ ký" đầu tệp (không tin phần mở rộng / Content-Type client gửi).
    /// Trả về thông báo lỗi, hoặc null nếu thành công.</summary>
    public async Task<string?> SaveAsync(long id, IFormFile file, CancellationToken ct)
    {
        if (file.Length == 0) return "Tệp ảnh rỗng.";
        if (file.Length > MaxBytes) return $"Ảnh tối đa {MaxBytes / 1024 / 1024} MB.";

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms, ct);
        var ext = Sniff(ms.GetBuffer().AsSpan(0, (int)Math.Min(ms.Length, 16)));
        if (ext is null) return "Chỉ nhận ảnh JPG, PNG hoặc WEBP.";

        Directory.CreateDirectory(UploadDir);
        foreach (var e in Types.Keys) File.Delete(Path.Combine(UploadDir, $"{id}{e}"));   // bỏ ảnh cũ khác định dạng
        await File.WriteAllBytesAsync(Path.Combine(UploadDir, $"{id}{ext}"), ms.ToArray(), ct);
        return null;
    }

    private static string? Sniff(ReadOnlySpan<byte> b)
    {
        if (b.Length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return ".jpg";
        if (b.Length >= 8 && b[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A })) return ".png";
        if (b.Length >= 12 && b[..4].SequenceEqual("RIFF"u8) && b[8..12].SequenceEqual("WEBP"u8)) return ".webp";
        return null;
    }
}
