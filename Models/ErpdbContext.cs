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

//    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
//#warning To protect potentially sensitive information in your connection string, you should move it out of source code. You can avoid scaffolding the connection string by using the Name= syntax to read it from configuration - see https://go.microsoft.com/fwlink/?linkid=2131148. For more guidance on storing connection strings, see https://go.microsoft.com/fwlink/?LinkId=723263.
//        => optionsBuilder.UseSqlServer("Server=(localdb)\\MSSQLLocalDB;Database=ERPDB;User ID=handsome;Password=123;TrustServerCertificate=true");

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Account>(entity =>
        {
            // 資料表名稱：Accounts -> accounts
            entity.ToTable("accounts");

            // 主鍵：AccountId -> accountid
            entity.HasKey(e => e.AccountId).HasName("pk__accounts__349da5a6019313fa");
            entity.Property(e => e.AccountId).HasColumnName("accountid");

            // 欄位名稱：AccountName -> accountname
            entity.Property(e => e.AccountName)
                .HasMaxLength(50)
                .HasColumnName("accountname");

            // 欄位名稱：Balance -> balance
            entity.Property(e => e.Balance)
                .HasColumnType("money")
                .HasColumnName("balance");
        });

        modelBuilder.Entity<Budget>(entity =>
        {
            entity.HasNoKey().ToTable("budget");

            entity.Property(e => e.Date).HasColumnName("date");
            entity.Property(e => e.Food).HasColumnName("food");
            entity.Property(e => e.Car).HasColumnName("car");
            entity.Property(e => e.Fun).HasColumnName("fun");
            entity.Property(e => e.Study).HasColumnName("study");
            entity.Property(e => e.Cloth).HasColumnName("cloth");
            entity.Property(e => e.Articles).HasColumnName("articles");
            entity.Property(e => e.Furniture).HasColumnName("furniture");
            entity.Property(e => e.Hair).HasColumnName("hair");
            entity.Property(e => e.Health).HasColumnName("health");
            entity.Property(e => e.Other).HasColumnName("other");
            entity.Property(e => e.Total).HasColumnName("total");
            entity.Property(e => e.Expenditure).HasColumnName("expenditure");
            entity.Property(e => e.Gete).HasColumnName("gete");
            entity.Property(e => e.Inputdate).HasColumnName("inputdate");
        });

        modelBuilder.Entity<Category>(entity =>
        {
            entity.ToTable("categories");
            entity.HasKey(e => e.CategoryId).HasName("PK__categori__19093A0B16F69806");
            entity.Property(e => e.CategoryId).HasColumnName("categoryid");

            entity.Property(e => e.CategoryName).HasMaxLength(50).HasColumnName("categoryname");
            entity.Property(e => e.Type).HasMaxLength(10).HasColumnName("type");
        });

        modelBuilder.Entity<Property>(entity =>
        {
            entity.HasNoKey().ToTable("property");

            entity.Property(e => e.Date).HasColumnName("date");
            entity.Property(e => e.Own).HasColumnName("own");
            entity.Property(e => e.Sparemoney).HasColumnName("sparemoney");
            entity.Property(e => e.Tuitionfee).HasColumnName("tuitionfee");
            entity.Property(e => e.Budget).HasColumnName("budget");
            entity.Property(e => e.Totalproperty).HasColumnName("totalproperty");
            entity.Property(e => e.Inputdate).HasColumnName("inputdate");
        });

        modelBuilder.Entity<Member>(entity =>
        {
            entity.ToTable("members");
            entity.HasKey(e => e.MemberId).HasName("PK__members__0CF04B1815F7BEB1");
            entity.Property(e => e.MemberId).HasColumnName("memberid");
            entity.Property(e => e.MemberName).HasMaxLength(50).HasColumnName("membername");
        });

        modelBuilder.Entity<Transaction>(entity =>
        {
            entity.ToTable("transactions");
            entity.HasKey(e => e.Id).HasName("PK__transact__3214EC07D8814338");
            entity.Property(e => e.Id).HasColumnName("id");

            entity.Property(e => e.Date).HasColumnName("date");
            entity.Property(e => e.Category).HasMaxLength(50).HasColumnName("category");
            entity.Property(e => e.Amount).HasColumnType("int").HasColumnName("amount");
            entity.Property(e => e.Member).HasMaxLength(50).HasColumnName("member");
            entity.Property(e => e.Account).HasMaxLength(50).HasColumnName("account");
            entity.Property(e => e.TransactionType).HasMaxLength(10).HasColumnName("transactiontype");
        });

        modelBuilder.Entity<Employee>(entity =>
        {
            entity.ToTable("employee");
            entity.HasKey(e => e.EmployeeId).HasName("PK_employee_employeeid");
            entity.Property(e => e.EmployeeId).HasColumnName("employeeid");

            entity.Property(e => e.Name).IsRequired().HasMaxLength(50).HasColumnName("name");
            entity.Property(e => e.DepartmentId).HasColumnName("departmentid");
            entity.Property(e => e.Account).HasMaxLength(50).HasColumnName("account");

            entity.Property(e => e.Password).HasMaxLength(100).HasColumnName("password");
        });

        modelBuilder.Entity<Role>(entity =>
        {
            entity.ToTable("role");
            entity.HasKey(r => r.RoleId).HasName("pk_role_roleid");
            entity.Property(r => r.RoleId).HasColumnName("roleid");

            entity.Property(r => r.Name).HasMaxLength(50).HasColumnName("name");
            entity.Property(r => r.EmployeeId).HasColumnName("employeeid");
        });
        OnModelCreatingPartial(modelBuilder);
    }
    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);

}
