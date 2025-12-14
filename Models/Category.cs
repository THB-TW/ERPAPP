using System;
using System.Collections.Generic;

namespace ERPAPP.Models;

public partial class Category
{
    public int CategoryId { get; set; }

    public string CategoryName { get; set; } = null!;

    public string Type { get; set; } = null!;
}
