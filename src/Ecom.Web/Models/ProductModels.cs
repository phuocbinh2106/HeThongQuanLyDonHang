namespace Ecom.Web.Models;

/// <summary>Bộ lọc sản phẩm nhận từ query string của GET /api/products.</summary>
public class ProductFilter
{
    public long? CategoryId { get; set; }      // lọc cả danh mục con (CONNECT BY)
    public long? SellerId { get; set; }        // vai trò người bán: "sản phẩm của tôi"
    public string? Brand { get; set; }         // JSON_VALUE(attributes,'$.brand')
    public decimal? MinRamGb { get; set; }     // JSON_VALUE(attributes,'$.ramGb' RETURNING NUMBER)
    public decimal? MinStorageGb { get; set; } // JSON_VALUE(attributes,'$.storageGb' RETURNING NUMBER)
    public string? Size { get; set; }          // JSON_EXISTS(attributes,'$.size[*]?(@ == $s)')
    public string? Q { get; set; }             // tìm trong tên sản phẩm
    public bool ActiveOnly { get; set; }       // chỉ sản phẩm đang bán
}

public record CategoryItem(long Id, long? ParentId, string Name, int Level, string Path);
public record AttributeKey(string Path, string Type);
