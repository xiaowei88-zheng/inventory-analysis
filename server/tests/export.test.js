import test from "node:test";
import assert from "node:assert/strict";
import { analyzeRows } from "../src/analysis.js";
import { createExportWorkbook } from "../src/exportReport.js";

test("exports summary sheet before product analysis sheet with sku rows", async () => {
  const result = analyzeRows(
    [
      row({ originalStyleNo: "O-A1", vipStyleNo: "A1", color: "Red", size: "M", barcode: "BC-M", sales30: 10, salesAmount30: 100, erpStock: 0, costPrice: 30, finalPrice: 80 }),
      row({ vipStyleNo: "A1", color: "Red", size: "L", barcode: "BC-L", sales30: 5, salesAmount30: 50, erpStock: 2, costPrice: 40, finalPrice: 90 })
    ],
    { analysisDate: "2026-06-06" }
  );

  const workbook = await createExportWorkbook(result);
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ["总览", "商品分析"]
  );

  const summary = workbook.getWorksheet("总览");
  assert.equal(summary.getCell("A1").value, "商品库存分析");
  assert.equal(summary.getCell("A3").value, "款号数");
  assert.equal(summary.getCell("B3").value, 1);
  assert.equal(summary.getCell("E4").value, "长售龄款色数");
  assert.equal(summary.getCell("A5").value, "断码款色数");
  assert.equal(summary.getCell("C5").value, "畅销断码款色数");
  assert.equal(summary.getCell("E5").value, "低价预警款色数");
  assert.equal(summary.getCell("A6").value, "周转压力款色数");
  assert.equal(summary.getCell("C6").value, "总库存周转月数");
  assert.equal(summary.getCell("A8").value, "组合筛选");
  assert.equal(summary.getCell("A9").value, "全部商品");
  assert.equal(summary.getCell("C9").value, "100%");
  assert.equal(summary.getCell("D9").value, "全部单项问题");
  assert.equal(summary.getCell("F9").value, "100%");

  const products = workbook.getWorksheet("商品分析");
  const headers = products.getRow(1).values.slice(1);
  assert.equal(headers[1], "原款号");
  assert.equal(headers[2], "唯品款号");
  assert.ok(headers.includes("商品条形码"));
  assert.ok(headers.includes("尺码"));
  assert.ok(headers.includes("30天补货建议"));
  assert.ok(headers.includes("60天补货建议"));
  assert.ok(headers.includes("90天补货建议"));
  assert.equal(headers[13], "成本价");
  assert.equal(headers[14], "最终到手价");
  assert.equal(headers.includes("断码比例"), false);
  assert.equal(headers.includes("应有尺码"), false);
  assert.equal(headers.includes("有库存尺码"), false);
  assert.equal(products.getCell("B2").value, "O-A1");
  assert.equal(products.getCell("C2").value, "A1");
  assert.equal(products.getCell("E2").value, "BC-M");
  assert.equal(products.getCell("F2").value, "M");
  assert.equal(products.getCell("E3").value, "BC-L");
  assert.equal(products.getCell("F3").value, "L");
  assert.equal(products.getCell("J2").value, 10);
  assert.equal(products.getCell("K2").value, 100);
  assert.equal(products.getCell("J3").value, 5);
  assert.equal(products.getCell("K3").value, 50);
  assert.equal(products.getCell("L2").value, 0);
  assert.equal(products.getCell("L3").value, 2);
  assert.equal(products.getCell("M2").value, 0);
  assert.equal(products.getCell("M3").value, 12);
  assert.equal(products.getCell("N2").value, 30);
  assert.equal(products.getCell("O2").value, 80);
  assert.equal(products.getCell("N3").value, 40);
  assert.equal(products.getCell("O3").value, 90);
  assert.equal(products.getCell("P2").value, "M");
  assert.equal(products.getCell("P3").value, "");
  assert.equal(products.getCell("Q2").value, 10);
  assert.equal(products.getCell("R2").value, 20);
  assert.equal(products.getCell("S2").value, 30);
  assert.equal(products.getCell("Q3").value, "");
  assert.equal(products.getCell("R3").value, "");
  assert.equal(products.getCell("S3").value, "");
  assert.match(products.getCell("T2").value, /当前尺码断码/);
  assert.match(products.getCell("U2").value, /当前尺码/);
  assert.equal(products.getRow(2).alignment.wrapText, false);
});

function row(overrides = {}) {
  return {
    category: "文胸",
    originalStyleNo: `O-${overrides.vipStyleNo ?? "A1"}`,
    vipStyleNo: "A1",
    color: "Red",
    barcode: "A1-Red-M",
    size: "M",
    firstListingDate: new Date("2026-01-01"),
    sales30: 0,
    salesAmount30: 0,
    sales7: 0,
    detailUv7: 0,
    conversion7: 0,
    ctr7: 0,
    exposureUv7: 0,
    erpStock: 0,
    marketPrice: 0,
    discountRate: 0,
    vipPrice: 0,
    costPrice: 0,
    currentPrice: 0,
    subsidyAmount: 0,
    finalPrice: 99,
    image: "",
    ...overrides
  };
}
