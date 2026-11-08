using ERPAPP.Models;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using ERPAPP.Services;
using System.Text;

// 啟用 Big5(cp950) 等非 Unicode 編碼，供信用卡 CSV 解析使用
Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/Login"; // ���n�J�|�ɦV����
        options.AccessDeniedPath = "/Error/AccessDenied";
        options.ExpireTimeSpan = TimeSpan.FromMinutes(10);
    });
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});

builder.Services.AddControllersWithViews(options=>options.Filters.Add<ERPAPP.Controllers.ClosedPeriodFilter>());

var connectionString = builder.Configuration.GetConnectionString("ErpdbDatabase");
builder.Services.AddDbContext<ErpdbContext>(options =>
options.UseSqlServer(connectionString));

builder.Services.AddScoped<BudgetReportReader>();
builder.Services.AddScoped<CsvImportService>();
builder.Services.AddScoped<InvestmentService>();
builder.Services.AddScoped<ERPAPP.Services.Budgeting.BudgetWorkspace>();

// 讓 AJAX 可用 header 傳送防偽 token
builder.Services.AddAntiforgery(o => o.HeaderName = "RequestVerificationToken");

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error/Index");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();

app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Login}/{action=Index}/{id?}");

app.Run();
