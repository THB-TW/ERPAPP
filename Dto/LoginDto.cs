using System.ComponentModel;

namespace ERPAPP.Dto
{
    public class LoginDto
    {
        [DisplayName("帳號")]
        public string Account { get; set; }


        [DisplayName("密碼")]
        public string Password { get; set; }
    }
}
