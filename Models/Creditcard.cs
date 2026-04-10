using System;

namespace ERPAPP.Models;

public partial class Creditcard
{
    public DateTime Date { get; set; }

    public string? Item { get; set; }

    public int? Amount { get; set; }
}
