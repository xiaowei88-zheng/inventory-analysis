import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { importExcel } from "../src/excelImport.js";

test("imports xlsx headers and runs the analysis pipeline", async () => {
  const filePath = path.join(os.tmpdir(), `inventory-sample-${Date.now()}.xlsx`);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("data");
  sheet.addRow(["三级分类", "唯品款号", "颜色", "商品条形码", "尺码", "首次上架时间", "近30天销量", "近30天销售金额", "ERP库存", "最终到手价"]);
  sheet.addRow(["文胸", "D64006", "中国红", "400620001132", "75C", "2026-01-01", 12, 708, 0, 59]);
  sheet.addRow(["文胸", "D64006", "中国红", "400620001133", "80C", "2026-01-01", 8, 472, 4, 59]);
  sheet.addRow(["文胸", "D64006", "黑色", "400620001134", "75C", "2026-01-01", 1, 59, 3, 59]);
  sheet.addRow(["文胸", "D64006", "黑色", "400620001135", "80C", "2026-01-01", 1, 59, 3, 59]);
  await workbook.xlsx.writeFile(filePath);

  const result = await importExcel(filePath);
  assert.equal(result.meta.importedRows, 4);
  assert.equal(result.dashboard.productCount, 2);
  assert.equal(result.products[0].vipStyleNo, "D64006");
});

test("accepts two-digit near-day sales quantity headers as sales30 fallback", async () => {
  const filePath = path.join(os.tmpdir(), `inventory-fallback-${Date.now()}.xlsx`);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("data");
  sheet.addRow(["三级分类", "唯品款号", "颜色", "商品条形码", "尺码", "首次上架时间", "近30天销售额", "近00天销量", "ERP库存", "最终到手价"]);
  sheet.addRow(["文胸", "D64006", "中国红", "400620001132", "75C", "2026-01-01", 100, 3, 2, 59]);
  await workbook.xlsx.writeFile(filePath);

  const result = await importExcel(filePath);
  assert.equal(result.meta.importedRows, 1);
  assert.equal(result.dashboard.sales30, 3);
  assert.equal(result.dashboard.salesAmount30, 100);
});
