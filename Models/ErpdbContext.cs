using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;

namespace ERPAPP.Models;

public partial class ErpdbContext : DbContext
{
    public ErpdbContext()
    {
    }

    public ErpdbContext(DbContextOptions<ErpdbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Account> Accounts { get; set; }

    public virtual DbSet<Budget> Budgets { get; set; }

    public virtual DbSet<Category> Categories { get; set; }

    public virtual DbSet<Property> Properties { get; set; }

    public virtual DbSet<Transaction> Transactions { get; set; }

    public virtual DbSet<Member> Members { get; set; }

    public DbSet<Employee> Employee { get; set; }

    public DbSet<Role> Role { get; set; }

    public virtual DbSet<Creditcard> Creditcards { get; set; }

    public virtual DbSet<InvestmentHolding> InvestmentHoldings { get; set; }

    public virtual DbSet<InvestmentTransaction> InvestmentTransactions { get; set; }

    public virtual DbSet<InvestmentValuation> InvestmentValuations { get; set; }

    public virtual DbSet<InvestmentOpening> InvestmentOpenings { get; set; }

    public virtual DbSet<BudgetCap> BudgetCaps { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Account>(entity =>
        {
            entity.HasKey(e => e.AccountId).HasName("PK__Accounts__349DA5A6019313FA");

            entity.Property(e => e.AccountName).HasMaxLength(50);
            entity.Property(e => e.Balance).HasColumnType("money");
        });

        modelBuilder.Entity<Budget>(entity =>
        {
            entity
                .HasNoKey()
                .ToTable("budget");

            entity.Property(e => e.Date).HasColumnName("date");
        });

        modelBuilder.Entity<Category>(entity =>
        {
            entity.HasKey(e => e.CategoryId).HasName("PK__Categori__19093A0B16F69806");

            entity.Property(e => e.CategoryName).HasMaxLength(50);
            entity.Property(e => e.Type).HasMaxLength(10);
        });

        modelBuilder.Entity<Property>(entity =>
        {
            entity
                .HasKey(p=>p.Date);
            entity
                .ToTable("Property");

            entity.Property(e => e.Date).HasColumnName("date");
        });

        modelBuilder.Entity<Member>(entity =>
        {
            entity.HasKey(e => e.MemberId).HasName("PK__Members__0CF04B1815F7BEB1");

            entity.Property(e => e.MemberName).HasMaxLength(50);
        });

        modelBuilder.Entity<Transaction>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PK__Transact__3214EC07D8814338");

            entity.Property(e => e.Account).HasMaxLength(50);
            entity.Property(e => e.Category).HasMaxLength(50);
            entity.Property(e => e.Amount).HasColumnType("int");
            entity.Property(e => e.Date).HasColumnName("date");
            entity.Property(e => e.Member).HasMaxLength(50);
            entity.Property(e => e.TransactionType).HasMaxLength(10);
        });

        modelBuilder.Entity<Employee>(entity =>
        {
            entity.HasKey(e => e.EmployeeId).HasName("PK_Employees_EmployeeId");

            entity.Property(e => e.Name)
                .IsRequired()
                .HasMaxLength(50);

            entity.Property(e => e.Account)
                .HasMaxLength(50);

            entity.Property(e => e.Password)
                .HasMaxLength(100);
        });

        modelBuilder.Entity<Role>(entity =>
        {
            entity.HasKey(r => r.RoleId).HasName("PK_Role_RoleId");

            entity.Property(r => r.Name)
                .HasMaxLength(50);
        });

        modelBuilder.Entity<Creditcard>(entity =>
        {
            entity.HasNoKey().ToTable("creditcard");
        });

        // 投資組合四張表：DbSet 名為複數，資料表為單數，必須明寫 ToTable
        //（EF 用 DbSet 名找表）。欄位型別對齊 docs/sql/investment.sql；
        // decimal 一定要指定 (18,4)，否則 EF 預設 (18,2) 會無聲截斷小數。
        modelBuilder.Entity<InvestmentHolding>(entity =>
        {
            entity.ToTable("InvestmentHolding");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.AssetClass).HasMaxLength(20);
            entity.Property(e => e.Symbol).HasMaxLength(20);
            entity.Property(e => e.Name).HasMaxLength(50);
        });

        modelBuilder.Entity<InvestmentTransaction>(entity =>
        {
            entity.ToTable("InvestmentTransaction");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Date).HasColumnType("date");
            entity.Property(e => e.TxType).HasMaxLength(10);
            entity.Property(e => e.Quantity).HasColumnType("decimal(18,4)");
            entity.Property(e => e.FundSource).HasMaxLength(10);
            entity.Property(e => e.Note).HasMaxLength(200);
        });

        modelBuilder.Entity<InvestmentValuation>(entity =>
        {
            entity.ToTable("InvestmentValuation");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.UnitPrice).HasColumnType("decimal(18,4)");
        });

        modelBuilder.Entity<InvestmentOpening>(entity =>
        {
            entity.ToTable("InvestmentOpening");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.AsOfMonth).HasColumnType("date");
            entity.Property(e => e.Note).HasMaxLength(200);
        });

        // 每月預算上限快照（docs/sql/budget-cap.sql）；欄位名與屬性名只差大小寫，資料庫定序不分大小寫
        modelBuilder.Entity<BudgetCap>(entity =>
        {
            entity.ToTable("BudgetCap");
            entity.HasKey(e => e.Month);
            entity.Property(e => e.Month).HasColumnName("month").HasColumnType("date");
            entity.Property(e => e.UpdatedAt).HasColumnName("updatedAt");
        });
        //modelBuilder.Entity<Employee>().HasData(
        //        new Employee { EmployeeId = 1, DepartmentId = 1, Name = "翰陞", Account = "Boss", Password = "123" },
        //        new Employee { EmployeeId = 2, DepartmentId = 2, Name = "林主管", Account = "Manager", Password = "123" },
        //        new Employee { EmployeeId = 3, DepartmentId = 3, Name = "黃大壯", Account = "Visiter", Password = "123" }
        //        );

        //modelBuilder.Entity<Employee>(entity =>
        //{
        //    entity.Property(e => e.Name)
        //        .IsRequired()
        //        .HasMaxLength(50);
        //});

        //modelBuilder.Entity<Role>().HasData(
        //    new Role { EmployeeId = 1, Name = "Select", RoleId = 1 },
        //    new Role { EmployeeId = 1, Name = "Edit", RoleId = 2 },
        //    new Role { EmployeeId = 2, Name = "Select", RoleId = 3 }
        //    );

        OnModelCreatingPartial(modelBuilder);
    }
    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);

}
