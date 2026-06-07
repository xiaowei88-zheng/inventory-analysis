import test from "node:test";
import assert from "node:assert/strict";
import { analyzeRows, SALES_TIERS } from "../src/analysis.js";

test("analyzes products by vip style and color with broken size detection", () => {
  const result = analyzeRows(
    [
      row({ vipStyleNo: "A100", color: "Red", size: "75C", sales30: 80, salesAmount30: 5200, erpStock: 0, finalPrice: 65 }),
      row({ vipStyleNo: "A100", color: "Red", size: "80C", sales30: 20, salesAmount30: 1300, erpStock: 2, finalPrice: 65 }),
      row({ vipStyleNo: "A100", color: "Black", size: "75C", sales30: 10, salesAmount30: 650, erpStock: 8, finalPrice: 65 }),
      row({ vipStyleNo: "A100", color: "Black", size: "80C", sales30: 8, salesAmount30: 520, erpStock: 6, finalPrice: 65 })
    ],
    { analysisDate: "2026-06-06" }
  );

  const red = result.products.find((product) => product.vipStyleNo === "A100" && product.color === "Red");
  assert.equal(red.originalStyleNo, "O-A100");
  assert.equal(red.sales30, 100);
  assert.equal(red.salesAmount30, 6500);
  assert.deepEqual(red.sizeSalesAmount30, { "75C": 5200, "80C": 1300 });
  assert.deepEqual(red.sizeBarcodePairs, [
    { size: "75C", barcodes: ["A100-Red-75C"] },
    { size: "80C", barcodes: ["A100-Red-80C"] }
  ]);
  assert.deepEqual(red.expectedSizes, ["75C", "80C"]);
  assert.deepEqual(red.brokenSizes, ["75C"]);
  assert.equal(red.brokenSizeRatio, 0.5);
});

test("summarizes sales amount by size before product-color totals", () => {
  const result = analyzeRows(
    [
      row({ vipStyleNo: "M1", color: "Red", size: "75C", sales30: 10, salesAmount30: 999, erpStock: 1, finalPrice: 99 }),
      row({ vipStyleNo: "M1", color: "Red", size: "80C", sales30: 8, salesAmount30: 888, erpStock: 1, finalPrice: 99 })
    ],
    { analysisDate: "2026-06-06" }
  );

  const product = find(result, "M1");
  assert.deepEqual(product.sizeSalesAmount30, { "75C": 999, "80C": 888 });
  assert.equal(product.salesAmount30, 1887);
  assert.equal(product.salesAmountMode, "provided_size");
  assert.equal(result.dashboard.salesAmount30, 1887);
});

test("adds style count and filter shares to dashboard", () => {
  const result = analyzeRows(
    [
      row({ vipStyleNo: "A1", color: "Red", sales30: 100, erpStock: 0 }),
      row({ vipStyleNo: "A1", color: "Black", sales30: 10, erpStock: 2 }),
      row({ vipStyleNo: "A2", color: "Red", sales30: 1, erpStock: 3 })
    ],
    { analysisDate: "2026-06-06" }
  );

  assert.equal(result.dashboard.styleCount, 2);
  assert.equal(result.dashboard.productCount, 3);
  assert.equal(result.dashboard.filterStats.total.count, 3);
  assert.ok(result.dashboard.filterStats.issues.broken_size.share >= 0);
  assert.ok(result.dashboard.filterStats.combos.hot_broken.count >= 0);
});

test("keeps dashboard totals aligned with sku-level source data", () => {
  const result = analyzeRows(
    [
      row({ vipStyleNo: "D1", color: "Red", size: "M", sales30: 10, salesAmount30: 100, erpStock: 2 }),
      row({ vipStyleNo: "D1", color: "Red", size: "L", sales30: 5, salesAmount30: 50, erpStock: 3 }),
      row({ vipStyleNo: "D1", color: "Black", size: "M", sales30: 1, salesAmount30: 10, erpStock: 4 })
    ],
    { analysisDate: "2026-06-06" }
  );

  assert.equal(result.dashboard.styleCount, 1);
  assert.equal(result.dashboard.productCount, 2);
  assert.equal(result.dashboard.totalStock, 9);
  assert.equal(result.dashboard.sales30, 16);
  assert.equal(result.dashboard.salesAmount30, 160);
  assert.equal(result.dashboard.inventoryTurnoverMonths, 0.56);
});

test("classifies hot normal and slow products within the same category", () => {
  const result = analyzeRows(
    [
      row({ vipStyleNo: "A1", color: "Red", sales30: 100, erpStock: 5 }),
      row({ vipStyleNo: "A2", color: "Red", sales30: 70, erpStock: 5 }),
      row({ vipStyleNo: "A3", color: "Red", sales30: 50, erpStock: 5 }),
      row({ vipStyleNo: "A4", color: "Red", sales30: 20, erpStock: 5 }),
      row({ vipStyleNo: "A5", color: "Red", sales30: 5, erpStock: 5 })
    ],
    { analysisDate: "2026-06-06" }
  );

  assert.equal(find(result, "A1").salesTier, SALES_TIERS.HOT);
  assert.equal(find(result, "A3").salesTier, SALES_TIERS.NORMAL);
  assert.equal(find(result, "A5").salesTier, SALES_TIERS.SLOW);
});

test("flags hot broken products and recommends core size replenishment", () => {
  const result = analyzeRows(
    [
      row({ vipStyleNo: "H1", color: "Red", size: "M", sales30: 100, salesAmount30: 9000, erpStock: 0, finalPrice: 90 }),
      row({ vipStyleNo: "H1", color: "Red", size: "L", sales30: 80, salesAmount30: 7200, erpStock: 2, finalPrice: 90 }),
      row({ vipStyleNo: "H1", color: "Black", size: "M", sales30: 10, salesAmount30: 900, erpStock: 5, finalPrice: 90 }),
      row({ vipStyleNo: "H1", color: "Black", size: "L", sales30: 8, salesAmount30: 720, erpStock: 5, finalPrice: 90 })
    ],
    { analysisDate: "2026-06-06" }
  );

  const product = result.products.find((item) => item.color === "Red");
  assert.equal(product.salesTier, SALES_TIERS.HOT);
  assert.ok(product.issueTags.includes("broken_size"));
  assert.equal(product.issueTags.includes("long_age"), false);
  assert.ok(product.recommendation.includes("补核心尺码"));
  assert.equal(result.dashboard.hotBrokenCount, 1);
});

test("recommends replenishment quantities for hot and normal high-sales sizes only", () => {
  const result = analyzeRows(
    [
      row({ vipStyleNo: "R1", color: "Red", size: "M", sales30: 90, erpStock: 0 }),
      row({ vipStyleNo: "R1", color: "Red", size: "L", sales30: 60, erpStock: 20 }),
      row({ vipStyleNo: "R2", color: "Red", size: "M", sales30: 70, erpStock: 10 }),
      row({ vipStyleNo: "R2", color: "Red", size: "L", sales30: 50, erpStock: 80 }),
      row({ vipStyleNo: "R3", color: "Red", size: "M", sales30: 1, erpStock: 0 }),
      row({ vipStyleNo: "R3", color: "Red", size: "L", sales30: 0, erpStock: 5 })
    ],
    { analysisDate: "2026-06-06" }
  );

  const hot = find(result, "R1");
  const normal = find(result, "R2");
  const slow = find(result, "R3");

  assert.equal(hot.salesTier, SALES_TIERS.HOT);
  assert.deepEqual(hot.replenishmentSuggestions, [
    { size: "M", sales30: 90, stock: 0, turnoverDays: 0, qty30: 90, qty60: 180, qty90: 270 }
  ]);

  assert.equal(normal.salesTier, SALES_TIERS.NORMAL);
  assert.deepEqual(normal.replenishmentSuggestions, [
    { size: "M", sales30: 70, stock: 10, turnoverDays: 4.29, qty30: 60, qty60: 130, qty90: 200 }
  ]);

  assert.equal(slow.salesTier, SALES_TIERS.SLOW);
  assert.deepEqual(slow.replenishmentSuggestions, []);
});

test("sorts product colors next to the same vip style number", () => {
  const result = analyzeRows(
    [
      row({ vipStyleNo: "B2", color: "Red", sales30: 10 }),
      row({ vipStyleNo: "A1", color: "Blue", sales30: 20 }),
      row({ vipStyleNo: "B2", color: "Black", sales30: 30 }),
      row({ vipStyleNo: "A1", color: "Red", sales30: 40 })
    ],
    { analysisDate: "2026-06-06" }
  );

  assert.deepEqual(
    result.products.map((product) => `${product.vipStyleNo}-${product.color}`),
    ["A1-Blue", "A1-Red", "B2-Black", "B2-Red"]
  );
});

test("sorts categories by configured business order", () => {
  const result = analyzeRows(
    [
      row({ category: "睡裙", vipStyleNo: "S1", color: "Red" }),
      row({ category: "女士内裤", vipStyleNo: "U1", color: "Red" }),
      row({ category: "女士吊带/打底背心", vipStyleNo: "V1", color: "Red" }),
      row({ category: "文胸", vipStyleNo: "B1", color: "Red" }),
      row({ category: "女士睡衣/家居服", vipStyleNo: "H1", color: "Red" })
    ],
    { analysisDate: "2026-06-06" }
  );

  assert.deepEqual(
    result.products.map((product) => product.category),
    ["文胸", "女士内裤", "女士睡衣/家居服", "睡裙", "女士吊带/打底背心"]
  );
});

test("sorts bra sizes by cup first and band second", () => {
  const result = analyzeRows(
    [
      row({ vipStyleNo: "B1", color: "Red", size: "75B", barcode: "75B" }),
      row({ vipStyleNo: "B1", color: "Red", size: "70A", barcode: "70A" }),
      row({ vipStyleNo: "B1", color: "Red", size: "75A", barcode: "75A" }),
      row({ vipStyleNo: "B1", color: "Red", size: "70B", barcode: "70B" }),
      row({ vipStyleNo: "B1", color: "Red", size: "80A", barcode: "80A" })
    ],
    { analysisDate: "2026-06-06" }
  );

  assert.deepEqual(result.products[0].sizeBarcodePairs.map((item) => item.size), ["70A", "75A", "80A", "70B", "75B"]);
});

test("sorts letter sizes by configured order", () => {
  const result = analyzeRows(
    [
      row({ category: "女士睡衣/家居服", vipStyleNo: "L1", color: "Red", size: "XL", barcode: "XL" }),
      row({ category: "女士睡衣/家居服", vipStyleNo: "L1", color: "Red", size: "F", barcode: "F" }),
      row({ category: "女士睡衣/家居服", vipStyleNo: "L1", color: "Red", size: "M", barcode: "M" }),
      row({ category: "女士睡衣/家居服", vipStyleNo: "L1", color: "Red", size: "S", barcode: "S" }),
      row({ category: "女士睡衣/家居服", vipStyleNo: "L1", color: "Red", size: "L", barcode: "L" }),
      row({ category: "女士睡衣/家居服", vipStyleNo: "L1", color: "Red", size: "2XL", barcode: "2XL" })
    ],
    { analysisDate: "2026-06-06" }
  );

  assert.deepEqual(result.products[0].sizeBarcodePairs.map((item) => item.size), ["F", "S", "M", "L", "XL", "2XL"]);
});

test("flags long-age broken slow products and low price rules", () => {
  const result = analyzeRows(
    [
      row({ category: "文胸", vipStyleNo: "S1", color: "Red", size: "75C", sales30: 1, erpStock: 0, finalPrice: 45 }),
      row({ category: "文胸", vipStyleNo: "S1", color: "Red", size: "80C", sales30: 0, erpStock: 3, finalPrice: 45 }),
      row({ category: "文胸", vipStyleNo: "S1", color: "Black", size: "75C", sales30: 50, erpStock: 5, finalPrice: 69 }),
      row({ category: "文胸", vipStyleNo: "S1", color: "Black", size: "80C", sales30: 45, erpStock: 5, finalPrice: 69 })
    ],
    { analysisDate: "2026-06-06" }
  );

  const product = result.products.find((item) => item.color === "Red");
  assert.ok(product.issueTags.includes("long_age"));
  assert.ok(product.issueTags.includes("broken_size"));
  assert.ok(product.issueTags.includes("low_price"));
  assert.ok(product.recommendation.includes("清仓"));
});

test("does not estimate zero sales amount from sales and final price", () => {
  const result = analyzeRows([row({ vipStyleNo: "E1", sales30: 3, salesAmount30: 0, finalPrice: 88 })], {
    analysisDate: "2026-06-06"
  });

  const product = find(result, "E1");
  assert.equal(product.salesAmount30, 0);
  assert.equal(product.hasEstimatedSalesAmount, false);
  assert.deepEqual(product.sizeSalesAmount30, {});
});

test("adds sales amount and quantity shares to price bands", () => {
  const result = analyzeRows(
    [
      row({ vipStyleNo: "P1", color: "Red", sales30: 10, salesAmount30: 1000, finalPrice: 55, erpStock: 2 }),
      row({ vipStyleNo: "P2", color: "Red", sales30: 30, salesAmount30: 3000, finalPrice: 75, erpStock: 2 })
    ],
    { analysisDate: "2026-06-06" }
  );

  const band = result.priceBands.find((item) => item.priceBand === "70-79");
  assert.equal(band.salesAmountShare, 0.75);
  assert.equal(band.salesQuantityShare, 0.75);
});

function row(overrides = {}) {
  return {
    category: "文胸",
    originalStyleNo: `O-${overrides.vipStyleNo ?? "A100"}`,
    vipStyleNo: "A100",
    color: "Red",
    barcode: `${overrides.vipStyleNo ?? "A100"}-${overrides.color ?? "Red"}-${overrides.size ?? "M"}`,
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

function find(result, vipStyleNo) {
  return result.products.find((product) => product.vipStyleNo === vipStyleNo);
}
