using System;
using System.Collections.Generic;

namespace ERPAPP.Models;

public partial class Employee
{
    public int EmployeeId { get; set; }

    public string Name { get; set; }

    public int DepartmentId { get; set; }

    public string Account { get; set; }

    public string Password { get; set; }
}
