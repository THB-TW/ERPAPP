using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace ERPAPP.Models;

public partial class Property
{
    public DateTime Date { get; set; }

    public int? Own { get; set; }

    public int? Sparemoney { get; set; }

    public int? Tuitionfee { get; set; }

    public int? Budget { get; set; }

    public int? Totalproperty { get; set; }

    public DateTime Inputdate { get; set; }
}
