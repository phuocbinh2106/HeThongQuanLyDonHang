using Ecom.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Oracle.ManagedDataAccess.Client;

namespace Ecom.Web.Infrastructure;

/// <summary>
/// Bộ lọc toàn cục: mọi OracleException ném ra từ API controller được đổi thành JSON
/// dạng ProblemDetails với mã HTTP phù hợp (409, 412, 422...). Nhờ vậy controller không cần
/// try/catch lặp lại, còn JavaScript phía giao diện chỉ cần đọc "title" và "detail".
/// </summary>
public class OracleExceptionFilter(ILogger<OracleExceptionFilter> logger) : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        if (context.Exception is not OracleException ex) return;

        var err = OracleErrorMapper.Map(ex);
        logger.LogWarning("Oracle {Code} -> HTTP {Status}: {Detail}", err.Code, err.Status, err.Detail);

        var problem = new ProblemDetails
        {
            Status = err.Status,
            Title = err.Title,
            Detail = err.Detail,
        };
        problem.Extensions["oraCode"] = err.Code;
        // Chuỗi lỗi gốc đầy đủ: phục vụ demo / vấn đáp (thấy rõ ORA-42692 bọc ORA-200xx)
        problem.Extensions["oraMessage"] = ex.Message;

        context.Result = new ObjectResult(problem) { StatusCode = err.Status };
        context.ExceptionHandled = true;
    }
}
