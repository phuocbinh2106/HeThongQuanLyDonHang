using Ecom.Web.Data;
using Ecom.Web.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// MVC (Controller + View) và API Controller dùng chung; bộ lọc toàn cục đổi OracleException
// thành JSON ProblemDetails với mã HTTP đúng nghiệp vụ (409/412/422...).
builder.Services.AddControllersWithViews(o => o.Filters.Add<OracleExceptionFilter>());

// Một factory dùng cho cả ứng dụng; bản thân kết nối được ODP.NET gom pool.
builder.Services.AddSingleton<OracleConnectionFactory>();
builder.Services.AddScoped<DualityViewStore>();
builder.Services.AddScoped<ProductRepository>();
builder.Services.AddScoped<CustomerRepository>();
builder.Services.AddScoped<OrderRepository>();
builder.Services.AddScoped<ReportRepository>();

// Tài liệu REST API (OpenAPI) + Swagger UI tại /api-docs (xem Infrastructure/SwaggerSetup.cs)
builder.Services.AddShopiaSwagger();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
}

app.UseShopiaSwagger();   // /api-docs (giao diện) và /api-docs/v1/swagger.json (tài liệu)

app.UseRouting();
app.UseAuthorization();
app.MapStaticAssets();

// API: route khai báo bằng [Route] trên từng controller (/api/...)
app.MapControllers();
// Trang MVC: /{controller}/{action}/{id?}
app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();

app.Run();
