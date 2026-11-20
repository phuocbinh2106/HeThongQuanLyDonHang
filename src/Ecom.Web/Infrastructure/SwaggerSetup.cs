using System.Reflection;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace Ecom.Web.Infrastructure;

/// <summary>
/// Tài liệu REST API (OpenAPI 3) + giao diện Swagger UI tại /api-docs.
/// Swashbuckle đọc các API controller (attribute route /api/...) và chú thích XML (///) để sinh mô tả.
/// Các trang MVC (route quy ước) không xuất hiện vì ApiExplorer chỉ lấy action có attribute route.
/// </summary>
public static class SwaggerSetup
{
    // Tên nhóm hiển thị cho từng controller
    private static readonly Dictionary<string, string> Tags = new()
    {
        ["OrdersApi"] = "Đơn hàng (ORDER_DV + PKG_ORDER)",
        ["ProductsApi"] = "Sản phẩm (PRODUCT_DV)",
        ["CustomersApi"] = "Khách hàng (CUSTOMER_DV)",
        ["ReportsApi"] = "Báo cáo (PKG_ORDER_RPT)",
        ["SystemApi"] = "Hệ thống",
    };

    public static IServiceCollection AddShopiaSwagger(this IServiceCollection services)
    {
        services.AddEndpointsApiExplorer();
        services.AddSwaggerGen(o =>
        {
            o.SwaggerDoc("v1", new OpenApiInfo
            {
                Title = "Shopia REST API",
                Version = "v1",
                Description = """
                    REST API của sàn **Shopia** – đồ án *Hệ thống quản lý đơn hàng* trên **Oracle Database 23ai**.

                    **Hai đường dữ liệu trên cùng một nguồn:**
                    - *Đường JSON*: đọc / ghi tài liệu trực tiếp trên JSON Relational Duality View
                      (`ORDER_DV`, `PRODUCT_DV`, `CUSTOMER_DV`) – một request = một câu SELECT / INSERT / UPDATE.
                    - *Đường quan hệ*: gọi package PL/SQL `PKG_ORDER` (đổi trạng thái, huỷ, thanh toán)
                      và `PKG_ORDER_RPT` (báo cáo) trên bảng chuẩn hoá.

                    **Chống ghi đè (ETag):** mọi GET tài liệu trả header `ETag`. Khi PUT, gửi lại giá trị đó trong
                    header `If-Match`; nếu tài liệu đã bị người khác sửa, Oracle báo ORA-42699 → **412**.

                    **Mã lỗi** (body dạng ProblemDetails: `title`, `detail`, `oraCode`, `oraMessage`):

                    | HTTP | Mã Oracle | Ý nghĩa |
                    |---|---|---|
                    | 409 | ORA-20001 | Hết hàng (cả đơn bị rollback) |
                    | 409 | ORA-20004 | Đơn đã khoá, không sửa dòng hàng |
                    | 409 | ORA-00001 | Trùng giá trị UNIQUE (ví dụ email) |
                    | 404 | ORA-20006 | Không tìm thấy đơn |
                    | 412 | ORA-42699 | ETag không khớp (lost update bị chặn) |
                    | 422 | ORA-20002 / 20003 / 20005 / 20007 / 20010 | Sai trạng thái / SP ngừng bán / thanh toán vượt tổng / giảm giá vượt / tham số báo cáo sai |
                    | 422 | ORA-40875, ORA-02290 | Thuộc tính JSON sai JSON Schema |
                    | 428 | – | PUT thiếu If-Match |

                    Vai trò người thao tác lấy từ cookie `ecom_user` (chọn ở trang chủ) và được gửi xuống Oracle qua
                    `CLIENT_IDENTIFIER`; nếu không có cookie thì ghi là `web`.
                    """,
            });

            // Chú thích XML (///) của controller -> mô tả từng endpoint
            var xml = Path.Combine(AppContext.BaseDirectory, $"{Assembly.GetExecutingAssembly().GetName().Name}.xml");
            if (File.Exists(xml)) o.IncludeXmlComments(xml);

            o.TagActionsBy(api =>
            {
                var c = (api.ActionDescriptor as ControllerActionDescriptor)?.ControllerName ?? "API";
                return [Tags.GetValueOrDefault(c, c)];
            });
            o.OrderActionsBy(api => api.RelativePath);
            o.OperationFilter<ShopiaOperationFilter>();
        });
        return services;
    }

    public static WebApplication UseShopiaSwagger(this WebApplication app)
    {
        // Tài liệu JSON: /api-docs/v1/swagger.json ; giao diện: /api-docs
        app.UseSwagger(o => o.RouteTemplate = "api-docs/{documentName}/swagger.json");
        app.UseSwaggerUI(o =>
        {
            o.RoutePrefix = "api-docs";
            o.SwaggerEndpoint("/api-docs/v1/swagger.json", "Shopia REST API v1");
            o.DocumentTitle = "Shopia API Docs";
            o.DefaultModelsExpandDepth(-1);
            o.DisplayRequestDuration();
            o.EnableTryItOutByDefault();
            o.InjectStylesheet("/css/swagger-shopia.css");
        });
        return app;
    }
}

/// <summary>
/// Bổ sung cho từng endpoint những gì Swashbuckle không tự suy ra được:
/// header If-Match cho PUT, ví dụ tài liệu JSON cho body kiểu JsonObject, và các mã lỗi nghiệp vụ.
/// </summary>
public class ShopiaOperationFilter : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        var method = context.ApiDescription.HttpMethod?.ToUpperInvariant();
        var path = "/" + (context.ApiDescription.RelativePath ?? "");

        // PUT tài liệu: header If-Match mang ETag lấy từ lần GET trước
        if (method == "PUT")
        {
            operation.Parameters ??= new List<IOpenApiParameter>();
            operation.Parameters.Add(new OpenApiParameter
            {
                Name = "If-Match",
                In = ParameterLocation.Header,
                Required = false,
                Description = "ETag đang giữ (header `ETag` của lần GET trước). Bỏ trống thì API lấy `_metadata.etag` "
                              + "trong body; thiếu cả hai → 428. ETag cũ → 412 (ORA-42699).",
                Schema = new OpenApiSchema { Type = JsonSchemaType.String },
            });
        }

        // Body JsonObject: đưa ví dụ tài liệu hợp lệ để bấm "Try it out" là chạy được
        var example = (method, path) switch
        {
            ("POST", "/api/orders") => """
                {
                  "customer": { "customerId": 1 },
                  "shipReceiver": "Nguyễn Văn An",
                  "shipPhone": "0900000001",
                  "shipAddress": "12 Nguyễn Huệ, Quận 1, TP.HCM",
                  "shippingFee": 30000,
                  "discount": 0,
                  "items": [
                    { "productId": 1, "quantity": 1 },
                    { "productId": 3, "quantity": 2 }
                  ]
                }
                """,
            ("POST", "/api/products") => """
                {
                  "sku": "SWAGGER-001",
                  "productName": "Sản phẩm thử từ Swagger",
                  "price": 150000,
                  "stockQty": 10,
                  "status": "ACTIVE",
                  "attributes": { "brand": "Shopia", "color": "Xanh", "warrantyMonths": 6 },
                  "seller": { "sellerId": 1 },
                  "category": { "categoryId": 2 }
                }
                """,
            ("POST", "/api/customers") => """
                {
                  "fullName": "Khách thử Swagger",
                  "email": "swagger.test@mail.vn",
                  "phone": "0911222333",
                  "status": "ACTIVE",
                  "addresses": [
                    { "receiverName": "Khách thử Swagger", "receiverPhone": "0911222333",
                      "addressLine": "1 Lê Lợi", "ward": "Bến Nghé", "district": "Quận 1", "city": "TP.HCM", "isDefault": true }
                  ]
                }
                """,
            ("PUT", _) => """
                {
                  "_comment": "Dán NGUYÊN tài liệu vừa GET (kể cả _metadata) rồi sửa vài trường, ví dụ shipPhone"
                }
                """,
            _ => null,
        };
        if (example is not null && operation.RequestBody?.Content is { } content)
        {
            foreach (var media in content.Values.OfType<OpenApiMediaType>())
                media.Example = JsonNode.Parse(example);
            operation.RequestBody.Description = method == "PUT"
                ? "Tài liệu JSON đầy đủ (ghi đè cả tài liệu). Trường chỉ đọc / NOUPDATE do CSDL quyết định."
                : "Một tài liệu JSON = một câu INSERT vào Duality View. Giá, tổng tiền, trạng thái do CSDL tính.";
        }

        // Mã lỗi nghiệp vụ thường gặp (body ProblemDetails)
        operation.Responses ??= new OpenApiResponses();

        // POST tạo tài liệu mới (orders / products / customers) trả 201 + header ETag, Location
        if (method == "POST" && path is "/api/orders" or "/api/products" or "/api/customers")
        {
            operation.Responses.Remove("200");
            operation.Responses["201"] = new OpenApiResponse
            {
                Description = "Đã tạo. Body là tài liệu vừa INSERT (đọc lại từ Duality View, có _id, giá trị CSDL tính); "
                              + "header ETag và Location.",
            };
        }
        void Add(string code, string desc)
        {
            if (!operation.Responses.ContainsKey(code))
                operation.Responses[code] = new OpenApiResponse { Description = desc };
        }
        if (path.Contains("{id}")) Add("404", "Không tìm thấy");
        if (method is "POST" or "PUT")
        {
            Add("409", "Xung đột nghiệp vụ: hết hàng (ORA-20001), đơn đã khoá (ORA-20004), trùng UNIQUE (ORA-00001)");
            Add("422", "Vi phạm quy tắc: sai trạng thái (ORA-20002), SP ngừng bán (ORA-20003), thanh toán vượt (ORA-20005), "
                       + "giảm giá vượt (ORA-20007), sai JSON Schema (ORA-40875 / ORA-02290)");
        }
        if (method == "PUT")
        {
            Add("412", "ETag không khớp – tài liệu đã bị người khác sửa (ORA-42699)");
            Add("428", "Thiếu If-Match / _metadata.etag");
        }
        if (path.StartsWith("/api/reports")) Add("422", "Tham số báo cáo không hợp lệ (ORA-20010)");
    }
}
