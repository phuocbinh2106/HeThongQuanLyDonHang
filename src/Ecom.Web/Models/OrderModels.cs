namespace Ecom.Web.Models;

/// <summary>Bộ lọc danh sách đơn (GET /api/orders).</summary>
public class OrderFilter
{
    public long? CustomerId { get; set; }   // "Đơn của tôi" = truy vấn Q1
    public string? Status { get; set; }
    public DateTime? From { get; set; }
    public DateTime? To { get; set; }
    public string? Q { get; set; }          // tìm theo số đơn
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}

/// <summary>Một dòng trong danh sách đơn (đọc từ bảng quan hệ, không qua Duality View).</summary>
public record OrderListItem(
    long OrderId, string OrderNo, DateTime OrderDate, long CustomerId, string CustomerName,
    string Status, int ItemCount, decimal TotalAmount, decimal PaidAmount, string? Carrier);

public record OrderListResult(int Total, int Page, int PageSize, string Sql,
                              Dictionary<string, int> StatusCounts, List<OrderListItem> Items);
