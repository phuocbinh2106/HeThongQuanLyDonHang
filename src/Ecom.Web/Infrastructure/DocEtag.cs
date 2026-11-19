using System.Text.Json.Nodes;

namespace Ecom.Web.Infrastructure;

/// <summary>
/// Hỗ trợ ETag cho tài liệu Duality View.
/// Mỗi tài liệu Oracle trả về có "_metadata": { "etag": "...", "asof": "..." }.
/// - Khi ĐỌC: lấy etag này đưa vào header HTTP "ETag".
/// - Khi GHI: client gửi lại header "If-Match"; ta chép giá trị đó vào _metadata.etag của tài
///   liệu. Oracle tự so với etag hiện tại trong CSDL; nếu khác (đã có người sửa) -> ORA-42699
///   -> HTTP 412 Precondition Failed. Đây là khoá lạc quan (optimistic locking) chống lost update.
/// </summary>
public static class DocEtag
{
    /// <summary>Lấy etag từ tài liệu JSON (chuỗi). Trả về dạng có ngoặc kép theo chuẩn HTTP.</summary>
    public static string? FromDoc(string json)
    {
        var etag = JsonNode.Parse(json)?["_metadata"]?["etag"]?.GetValue<string>();
        return etag is null ? null : $"\"{etag}\"";
    }

    /// <summary>Bỏ ngoặc kép / tiền tố W/ của header If-Match.</summary>
    public static string? Normalize(string? header)
    {
        if (string.IsNullOrWhiteSpace(header)) return null;
        var s = header.Trim();
        if (s.StartsWith("W/")) s = s[2..];
        return s.Trim('"');
    }

    /// <summary>
    /// Chuẩn bị tài liệu trước khi UPDATE: gán _id theo URL (không cho client đổi khoá) và
    /// gán _metadata.etag = etag client đang giữ.
    /// </summary>
    public static string PrepareForUpdate(JsonObject doc, long id, string etag)
    {
        doc["_id"] = id;
        doc["_metadata"] = new JsonObject { ["etag"] = etag };
        return doc.ToJsonString();
    }
}
