using System;
using System.Collections.Generic;

namespace ERPAPP.Models;

public partial class Account
{
    public int AccountId { get; set; }

    public string AccountName { get; set; } = null!;

    public decimal Balance { get; set; }
}
