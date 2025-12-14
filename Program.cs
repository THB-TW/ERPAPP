using ERPAPP.Models;
using ERPAPP.StoredProcedure;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);
var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/Login"; // 未登入會導向此頁
        options.AccessDeniedPath = "/Home/Index";
        options.ExpireTimeSpan = TimeSpan.FromMinutes(10);
    });
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});

builder.Services.AddControllersWithViews();

var connectionString = builder.Configuration.GetConnectionString("ErpdbDatabase");

Console.WriteLine($"*** 連線字串讀取結果: {connectionString} ***");

if (string.IsNullOrEmpty(connectionString))
{
    // 如果讀取不到，我們就直接拋出錯誤，而不是讓 Npgsql 嘗試無效連線
    throw new InvalidOperationException("未找到名為 'ErpdbDatabase' 的連線字串。請檢查 appsettings.json 或 appsettings.Development.json。");
}

builder.Services.AddDbContext<ErpdbContext>(options =>
options.UseNpgsql(connectionString));

builder.Services.AddScoped<FinanceSpExecutor>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();

app.UseRouting();

app.UseAuthorization();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Login}/{action=Index}/{id?}");

app.Run();
