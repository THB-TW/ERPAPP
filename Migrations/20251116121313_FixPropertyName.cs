using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERPAPP.Migrations
{
    /// <inheritdoc />
    public partial class FixPropertyName : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "可用餘額",
                table: "Property");

            migrationBuilder.DropColumn(
                name: "學費",
                table: "Property");

            migrationBuilder.DropColumn(
                name: "當月收入",
                table: "Property");

            migrationBuilder.DropColumn(
                name: "總財產",
                table: "Property");

            migrationBuilder.DropColumn(
                name: "輸入日期",
                table: "Property");

            migrationBuilder.DropColumn(
                name: "預算金",
                table: "Property");

            migrationBuilder.DropColumn(
                name: "輸入日期",
                table: "budget");

            migrationBuilder.RenameColumn(
                name: "飲食",
                table: "budget",
                newName: "Total");

            migrationBuilder.RenameColumn(
                name: "醫療保健",
                table: "budget",
                newName: "Study");

            migrationBuilder.RenameColumn(
                name: "美容美髮",
                table: "budget",
                newName: "Other");

            migrationBuilder.RenameColumn(
                name: "總預算",
                table: "budget",
                newName: "Health");

            migrationBuilder.RenameColumn(
                name: "總開銷",
                table: "budget",
                newName: "Hair");

            migrationBuilder.RenameColumn(
                name: "盈餘",
                table: "budget",
                newName: "Gete");

            migrationBuilder.RenameColumn(
                name: "汽車",
                table: "budget",
                newName: "Furniture");

            migrationBuilder.RenameColumn(
                name: "服飾",
                table: "budget",
                newName: "Fun");

            migrationBuilder.RenameColumn(
                name: "日常用品",
                table: "budget",
                newName: "Food");

            migrationBuilder.RenameColumn(
                name: "學習深造",
                table: "budget",
                newName: "Expenditure");

            migrationBuilder.RenameColumn(
                name: "娛樂",
                table: "budget",
                newName: "Cloth");

            migrationBuilder.RenameColumn(
                name: "大型器具",
                table: "budget",
                newName: "Car");

            migrationBuilder.RenameColumn(
                name: "其他",
                table: "budget",
                newName: "Articles");

            migrationBuilder.AlterColumn<DateTime>(
                name: "date",
                table: "Property",
                type: "datetime2",
                nullable: false,
                oldClrType: typeof(DateOnly),
                oldType: "date");

            migrationBuilder.AddColumn<int>(
                name: "Budget",
                table: "Property",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "Inputdate",
                table: "Property",
                type: "datetime2",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<int>(
                name: "Own",
                table: "Property",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Spare_money",
                table: "Property",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Totalproperty",
                table: "Property",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Tuitionfee",
                table: "Property",
                type: "int",
                nullable: true);

            migrationBuilder.AlterColumn<DateTime>(
                name: "date",
                table: "budget",
                type: "datetime2",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified),
                oldClrType: typeof(DateOnly),
                oldType: "date",
                oldNullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "Inputdate",
                table: "budget",
                type: "datetime2",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Budget",
                table: "Property");

            migrationBuilder.DropColumn(
                name: "Inputdate",
                table: "Property");

            migrationBuilder.DropColumn(
                name: "Own",
                table: "Property");

            migrationBuilder.DropColumn(
                name: "Spare_money",
                table: "Property");

            migrationBuilder.DropColumn(
                name: "Totalproperty",
                table: "Property");

            migrationBuilder.DropColumn(
                name: "Tuitionfee",
                table: "Property");

            migrationBuilder.DropColumn(
                name: "Inputdate",
                table: "budget");

            migrationBuilder.RenameColumn(
                name: "Total",
                table: "budget",
                newName: "飲食");

            migrationBuilder.RenameColumn(
                name: "Study",
                table: "budget",
                newName: "醫療保健");

            migrationBuilder.RenameColumn(
                name: "Other",
                table: "budget",
                newName: "美容美髮");

            migrationBuilder.RenameColumn(
                name: "Health",
                table: "budget",
                newName: "總預算");

            migrationBuilder.RenameColumn(
                name: "Hair",
                table: "budget",
                newName: "總開銷");

            migrationBuilder.RenameColumn(
                name: "Gete",
                table: "budget",
                newName: "盈餘");

            migrationBuilder.RenameColumn(
                name: "Furniture",
                table: "budget",
                newName: "汽車");

            migrationBuilder.RenameColumn(
                name: "Fun",
                table: "budget",
                newName: "服飾");

            migrationBuilder.RenameColumn(
                name: "Food",
                table: "budget",
                newName: "日常用品");

            migrationBuilder.RenameColumn(
                name: "Expenditure",
                table: "budget",
                newName: "學習深造");

            migrationBuilder.RenameColumn(
                name: "Cloth",
                table: "budget",
                newName: "娛樂");

            migrationBuilder.RenameColumn(
                name: "Car",
                table: "budget",
                newName: "大型器具");

            migrationBuilder.RenameColumn(
                name: "Articles",
                table: "budget",
                newName: "其他");

            migrationBuilder.AlterColumn<DateOnly>(
                name: "date",
                table: "Property",
                type: "date",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "datetime2");

            migrationBuilder.AddColumn<int>(
                name: "可用餘額",
                table: "Property",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "學費",
                table: "Property",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "當月收入",
                table: "Property",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "總財產",
                table: "Property",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateOnly>(
                name: "輸入日期",
                table: "Property",
                type: "date",
                nullable: false,
                defaultValue: new DateOnly(1, 1, 1));

            migrationBuilder.AddColumn<int>(
                name: "預算金",
                table: "Property",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AlterColumn<DateOnly>(
                name: "date",
                table: "budget",
                type: "date",
                nullable: true,
                oldClrType: typeof(DateTime),
                oldType: "datetime2");

            migrationBuilder.AddColumn<DateOnly>(
                name: "輸入日期",
                table: "budget",
                type: "date",
                nullable: true);
        }
    }
}
