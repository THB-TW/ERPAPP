using ERPAPP.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace ERPAPP.Controllers;

public sealed class ClosedPeriodFilter : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        if(context.Exception is not (ClosedPeriodException or InvalidTransactionException)) return;
        context.Result=new JsonResult(new {message=context.Exception.Message})
            {StatusCode=context.Exception is ClosedPeriodException ? StatusCodes.Status409Conflict : StatusCodes.Status400BadRequest};
        context.ExceptionHandled=true;
    }
}
