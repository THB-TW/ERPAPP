
using System;
using System.Collections.Generic;

namespace ERPAPP.Models;

public partial class Role
{
    public int RoleId { get; set; }

    public string Name { get; set; }

    public int EmployeeId { get; set; }
}
