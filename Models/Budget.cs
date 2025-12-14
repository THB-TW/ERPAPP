using System;
using System.Collections.Generic;

namespace ERPAPP.Models;

public partial class Budget
{
    public DateTime Date { get; set; }

    public int? Food { get; set; }

    public int? Car { get; set; }

    public int? Fun { get; set; }

    public int? Study { get; set; }

    public int? Cloth { get; set; }

    public int? Articles { get; set; }

    public int? Furniture { get; set; }

    public int? Hair { get; set; }

    public int? Health { get; set; }

    public int? Other { get; set; }

    public int? Total { get; set; }

    public int? Expenditure { get; set; }

    public int? Gete { get; set; }

    public DateTime Inputdate { get; set; }
}
