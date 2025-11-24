using System;
using System.ComponentModel.DataAnnotations;

namespace ERPAPP.Models
{
    public partial class Transaction
    {
        public int Id { get; set; }

        [DataType(DataType.Date)]
        [Display(Name = "日期")]
        public DateTime Date { get; set; }

        [Display(Name = "類別")]
        [Required(ErrorMessage = "請選取類別")]
        public string? Category { get; set; }

        [Display(Name = "金額")]
        [Required(ErrorMessage = "請輸入金額")]
        [Range(0.01, double.MaxValue, ErrorMessage = "金額必須大於0")]
        public int Amount { get; set; } // 將 double 改為 decimal

        [Display(Name = "成員")]
        [Required(ErrorMessage = "請輸入成員")]
        public string? Member { get; set; }

        [Display(Name = "帳戶")]
        [Required(ErrorMessage = "請輸入帳戶")]
        public string? Account { get; set; }

        [Display(Name = "收支")]
        public string? TransactionType { get; set; }
    }
}