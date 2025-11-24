using ERPAPP.Dto;
using ERPAPP.Models;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
namespace ERPAPP.Controllers
{
    [AllowAnonymous]
    public class LoginController : Controller
    {
        private readonly ErpdbContext _context;

        public LoginController(ErpdbContext context)
        {
            _context = context;
        }
        public IActionResult Index()
        {
            HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return View();
        }

        [HttpPost]
        public IActionResult Index(LoginDto value)
        {
            //if (value.Account.ToLower() == "handsome".ToLower() && value.Password == "123456")
            //{
            //    var claims = new List<Claim>
            //    {
            //        new Claim(ClaimTypes.Name, value.Account),
            //        new Claim("FullName", "kai")
            //    };
            var employee = _context.Employee
                .FirstOrDefault(e => e.Account.ToLower() == value.Account.ToLower()
                && e.Password == value.Password);

            if (employee != null)
            {
                var claims = new List<Claim>
                {
                    new Claim(ClaimTypes.Name, employee.Account),
                    new Claim("FullName", employee.Name)
                };

                var roles = _context.Role
                    .Where(r => r.EmployeeId == employee.EmployeeId)
                    .Select(r => r.Name);

                foreach (var role in roles)
                {
                    claims.Add(new Claim(ClaimTypes.Role, role));
                }

                var claimsIdentity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
                HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(claimsIdentity));

                return RedirectToAction("Index", "Home");
            }
            else
            {
                ViewBag.Message = "帳號或密碼錯誤";
                return View(value);
            }
        }
    }
}
