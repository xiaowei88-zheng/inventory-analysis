import { CORE_INVENTORY_FIELDS, FIELD_DEFINITIONS } from "../constants/fieldMap.js";
import {
  ISSUE_LABELS,
  SALES_TIERS,
  SLOW_SALE_RULE_DESCRIPTION,
  applyOperatingRules,
  assignSalesTiers,
  buildReplenishmentSuggestions,
  compareSize,
  getListingStage,
  roundMoney,
  roundRatio
} from "../rules/inventoryRules.ts";

export function analyzeInventory(rows, fieldMap) {
  const fieldAvailability = buildFieldAvailability(fieldMap);
  const products = buildProducts(rows);

  assignSalesTiers(products);
  for (const product of products) {
    product.replenishmentSuggestions = buildReplenishmentSuggestions(product);
    applyOperatingRules(product);
  }
  products.sort(compareProduct);

  const items = buildTableItems(products);

  return {
    dashboard: buildDashboard(products),
    validation: buildValidation(rows, fieldMap, fieldAvailability),
    warnings: products.filter((product) => product.issueTags.length > 0),
    items,
    products,
    categoryAnalysis: buildCategoryAnalysis(products, fieldAvailability)
  };
}

function buildProducts(rows) {
  const productGroups = new Map();
  const styleSizes = new Map();

  for (const row of rows) {
    const vipStyleNo = row.vipStyleNo || row.styleNo || row.goodsNo || row.productId || row.sku;
    const color = row.color || "";
    if (!vipStyleNo) continue;

    const productKey = `${vipStyleNo}::${color}`;
    if (!productGroups.has(productKey)) productGroups.set(productKey, []);
    productGroups.get(productKey).push({ ...row, vipStyleNo, color });

    if (!styleSizes.has(vipStyleNo)) styleSizes.set(vipStyleNo, new Set());
    if (row.size) styleSizes.get(vipStyleNo).add(row.size);
  }

  return Array.from(productGroups.entries()).map(([productKey, groupRows]) => buildProduct(productKey, groupRows, styleSizes));
}

function buildProduct(productKey, rows, styleSizes) {
  const first = rows[0];
  const expectedSizes = Array.from(styleSizes.get(first.vipStyleNo) ?? []).sort(compareSize);
  const sizeStock = new Map();
  const sizeSales30 = new Map();
  const sizeSales7 = new Map();
  const sizeSalesAmount30 = new Map();
  const sizeCostPrice = new Map();
  const sizeFinalPrice = new Map();
  const sizeBarcodes = new Map();

  let totalStock = 0;
  let availableStock = 0;
  let sales30 = 0;
  let sales7 = 0;
  let firstListingDate = null;
  let finalPriceSum = 0;
  let finalPriceCount = 0;
  let minFinalPrice = Number.POSITIVE_INFINITY;

  for (const row of rows) {
    const rowStock = Math.max(0, Number(row.stockQty) || 0);
    const rowAvailableStock = Math.max(0, Number(row.availableStock) || 0);
    const rowSales30 = Number(row.sales30) || 0;
    const rowSales7 = Number(row.sales7) || 0;
    const rowSalesAmount30 = Number(row.salesAmount30) || 0;
    const rowPrice = Number(row.retailPrice) || 0;

    totalStock += rowStock;
    availableStock += rowAvailableStock;
    sales30 += rowSales30;
    sales7 += rowSales7;
    if (rowPrice > 0) {
      finalPriceSum += rowPrice;
      finalPriceCount += 1;
      minFinalPrice = Math.min(minFinalPrice, rowPrice);
    }

    if (row.firstListingDate) {
      const date = new Date(row.firstListingDate);
      if (!Number.isNaN(date.getTime()) && (!firstListingDate || date < firstListingDate)) firstListingDate = date;
    }

    if (!row.size) continue;
    sizeStock.set(row.size, (sizeStock.get(row.size) ?? 0) + rowAvailableStock);
    sizeSales30.set(row.size, (sizeSales30.get(row.size) ?? 0) + rowSales30);
    sizeSales7.set(row.size, (sizeSales7.get(row.size) ?? 0) + rowSales7);
    if (rowSalesAmount30 > 0) sizeSalesAmount30.set(row.size, (sizeSalesAmount30.get(row.size) ?? 0) + rowSalesAmount30);
    addAverageValue(sizeCostPrice, row.size, row.costPrice);
    addAverageValue(sizeFinalPrice, row.size, rowPrice);
    if (!sizeBarcodes.has(row.size)) sizeBarcodes.set(row.size, new Set());
    if (row.sku) sizeBarcodes.get(row.size).add(row.sku);
  }

  const brokenSizes = expectedSizes.filter((size) => (sizeStock.get(size) ?? 0) <= 0);
  const ageDays = firstListingDate ? Math.max(0, Math.floor((startOfDay(new Date()) - startOfDay(firstListingDate)) / 86400000)) : null;
  const avgDailySales = sales30 / 30;
  const turnoverDays = avgDailySales > 0 ? totalStock / avgDailySales : totalStock > 0 ? null : 0;
  const salesAmount30 = Array.from(sizeSalesAmount30.values()).reduce((total, value) => total + value, 0);
  const finalPrice = finalPriceCount > 0 ? finalPriceSum / finalPriceCount : 0;

  return {
    productKey,
    category: first.category,
    originalStyleNo: first.originalStyleNo,
    vipStyleNo: first.vipStyleNo,
    color: first.color,
    image: first.image,
    firstListingDate: firstListingDate ? firstListingDate.toISOString().slice(0, 10) : "",
    ageDays,
    listingStage: getListingStage(ageDays),
    totalStock,
    availableStock,
    sales30,
    sales7,
    salesAmount30: roundMoney(salesAmount30),
    finalPrice: roundMoney(finalPrice),
    minFinalPrice: Number.isFinite(minFinalPrice) ? roundMoney(minFinalPrice) : 0,
    expectedSizes,
    brokenSizes,
    brokenSizeRatio: expectedSizes.length ? roundRatio(brokenSizes.length / expectedSizes.length) : 0,
    sizeStock: Object.fromEntries(Array.from(sizeStock.entries()).sort(([a], [b]) => compareSize(a, b))),
    sizeSales30: Object.fromEntries(Array.from(sizeSales30.entries()).sort(([a], [b]) => compareSize(a, b))),
    sizeSales7: Object.fromEntries(Array.from(sizeSales7.entries()).sort(([a], [b]) => compareSize(a, b))),
    sizeSalesAmount30: Object.fromEntries(
      Array.from(sizeSalesAmount30.entries())
        .sort(([a], [b]) => compareSize(a, b))
        .map(([size, amount]) => [size, roundMoney(amount)])
    ),
    sizeCostPrice: mapAverages(sizeCostPrice),
    sizeFinalPrice: mapAverages(sizeFinalPrice),
    sizeBarcodePairs: Array.from(sizeBarcodes.entries())
      .sort(([a], [b]) => compareSize(a, b))
      .map(([size, barcodes]) => ({ size, barcodes: Array.from(barcodes).sort(compareSize) })),
    turnoverDays: turnoverDays === null ? null : roundRatio(turnoverDays),
    salesTier: SALES_TIERS.NORMAL,
    displaySalesTier: SALES_TIERS.NORMAL,
    replenishmentSuggestions: [],
    issueKeys: [],
    issueTags: [],
    recommendation: "保持观察",
    priorityScore: 0
  };
}

function buildTableItems(products) {
  return products.flatMap((product) => {
    const rows = product.sizeBarcodePairs.flatMap((pair) => {
      const barcodes = pair.barcodes.length ? pair.barcodes : [""];
      return barcodes.map((barcode) => buildSkuRow(product, pair.size, barcode));
    });
    return rows.length ? rows : [buildSkuRow(product, "", "")];
  });
}

function buildSkuRow(product, size, barcode) {
  const stock = Number(product.sizeStock?.[size]) || 0;
  const sales30 = Number(product.sizeSales30?.[size]) || 0;
  const sales7 = Number(product.sizeSales7?.[size]) || 0;
  const dailySales = Math.max(sales30 / 30, sales7 > 0 ? sales7 / 7 : 0);
  const sellableDays = dailySales > 0 ? roundRatio(stock / dailySales) : stock > 0 ? null : 0;
  const suggestion = product.replenishmentSuggestions.find((item) => item.size === size);
  const isBroken = Boolean(size) && stock <= 0;

  return {
    productKey: product.productKey,
    image: product.image,
    category: product.category,
    originalStyleNo: product.originalStyleNo,
    vipStyleNo: product.vipStyleNo,
    styleNo: product.vipStyleNo,
    color: product.color,
    sku: barcode,
    size,
    firstListingDate: product.firstListingDate,
    listingAgeDays: product.ageDays,
    displaySalesTier: product.displaySalesTier,
    salesTier: product.salesTier,
    sales30,
    sales7,
    salesAmount30: Number(product.sizeSalesAmount30?.[size]) || 0,
    availableStock: stock,
    stockQty: stock,
    sellableDays,
    brokenSize: isBroken ? size : "",
    replenishment: suggestion ?? { qty30: null, qty60: null, qty90: null },
    costPrice: Number(product.sizeCostPrice?.[size]) || 0,
    retailPrice: Number(product.sizeFinalPrice?.[size]) || product.minFinalPrice,
    tagKeys: product.issueKeys,
    issueTags: product.issueTags,
    adviceText: buildSkuAdvice(product, { suggestion, isBroken, sellableDays, size }),
    priorityScore: product.priorityScore
  };
}

function buildSkuAdvice(product, sku) {
  if (product.displaySalesTier === "新品") return "新品保护期，持续观察";
  if (product.salesTier === SALES_TIERS.HOT && sku.isBroken && sku.size) return `建议补齐${sku.size}尺码`;
  if (product.salesTier === SALES_TIERS.HOT && product.issueKeys.includes("broken_size")) return "优先补齐断码尺码";
  if (product.salesTier === SALES_TIERS.HOT) return "保持补货，持续跟进";
  if (product.issueKeys.includes("slow_sale")) return "优先处理滞销库存";
  if (sku.suggestion) return "适量补货";
  if (product.issueKeys.includes("turnover_pressure")) return "控制补货，优先消化库存";
  if (sku.isBroken && sku.size) return `建议补齐${sku.size}尺码`;
  if (product.issueKeys.includes("broken_size")) return "按尺码结构适量补货";
  if (product.issueKeys.includes("low_price")) return "控制补货";
  if (product.sales30 <= 0) return "建议加大曝光";
  return product.recommendation || "保持观察";
}

function buildDashboard(products) {
  const productCount = products.length;
  const styleCount = new Set(products.map((product) => product.vipStyleNo).filter(Boolean)).size;
  const totalStock = sum(products, "totalStock");
  const sales30 = sum(products, "sales30");

  return {
    styleCount,
    productCount,
    totalStock,
    sales30,
    salesAmount30: roundMoney(sum(products, "salesAmount30")),
    slowSaleRuleDescription: SLOW_SALE_RULE_DESCRIPTION,
    inventoryTurnoverMonths: sales30 > 0 ? roundRatio(totalStock / sales30) : null,
    longAgeCount: count(products, (product) => product.issueKeys.includes("long_age")),
    brokenSizeCount: count(products, (product) => product.issueKeys.includes("broken_size")),
    hotBrokenCount: count(products, (product) => product.salesTier === SALES_TIERS.HOT && product.issueKeys.includes("broken_size")),
    lowPriceCount: count(products, (product) => product.issueKeys.includes("low_price")),
    turnoverPressureCount: count(products, (product) => product.issueKeys.includes("turnover_pressure")),
    filterStats: buildFilterStats(products, productCount)
  };
}

function buildFilterStats(products, total) {
  const comboPredicates = {
    long_broken_slow: (product) =>
      product.issueKeys.includes("long_age") && product.issueKeys.includes("broken_size") && product.issueKeys.includes("slow_sale"),
    long_broken_normal: (product) =>
      product.issueKeys.includes("long_age") && product.issueKeys.includes("broken_size") && product.issueKeys.includes("normal_sale"),
    hot_broken: (product) => product.salesTier === SALES_TIERS.HOT && product.issueKeys.includes("broken_size")
  };
  const issueKeys = ["hot_sale", "broken_size", "long_age", "slow_sale", "normal_sale", "new_product", "low_price", "turnover_pressure"];

  return {
    total: stat(total, total),
    combos: Object.fromEntries(Object.entries(comboPredicates).map(([key, predicate]) => [key, stat(count(products, predicate), total)])),
    issues: Object.fromEntries(
      issueKeys.map((key) => [
        key,
        stat(count(products, (product) => (key === "normal_sale" ? product.salesTier === SALES_TIERS.NORMAL : product.issueKeys.includes(key))), total)
      ])
    )
  };
}

function buildCategoryAnalysis(products, fieldAvailability) {
  const map = new Map();
  for (const product of products) {
    const key = product.category || "未分类";
    if (!map.has(key)) {
      map.set(key, {
        category: key,
        productCount: 0,
        totalStock: 0,
        availableStock: 0,
        sales30: fieldAvailability.hasSales30 ? 0 : null,
        dailySales: fieldAvailability.hasSales30 ? 0 : null,
        slowSaleCount: 0
      });
    }
    const entry = map.get(key);
    entry.productCount += 1;
    entry.totalStock += product.totalStock;
    entry.availableStock += product.availableStock;
    if (fieldAvailability.hasSales30) {
      entry.sales30 += product.sales30;
      entry.dailySales += product.sales30 / 30;
    }
    if (product.issueKeys.includes("slow_sale")) entry.slowSaleCount += 1;
  }

  return Array.from(map.values())
    .map((entry) => ({
      ...entry,
      dailySales: entry.dailySales === null ? null : roundRatio(entry.dailySales),
      sellableDays: fieldAvailability.hasSales30 && entry.dailySales > 0 ? roundRatio(entry.availableStock / entry.dailySales) : null
    }))
    .sort((a, b) => b.availableStock - a.availableStock || b.totalStock - a.totalStock);
}

function buildValidation(rows, fieldMap, fieldAvailability) {
  const matchedFields = Object.entries(fieldMap).map(([key]) => FIELD_DEFINITIONS[key]?.label ?? key);
  const missingImportantFields = ["stockQty", "availableStock", "sales7", "sales30", "dailySales", "costPrice", "firstListingDate"].filter(
    (key) => fieldMap[key] === undefined
  );
  const coreFieldStatus = CORE_INVENTORY_FIELDS.map((key) => ({
    key,
    label: FIELD_DEFINITIONS[key].label,
    matched: fieldMap[key] !== undefined
  }));
  const messages = [
    `已识别 ${matchedFields.length} 个字段`,
    missingImportantFields.length ? `建议补充字段：${missingImportantFields.map((key) => FIELD_DEFINITIONS[key].label).join("、")}` : "关键字段识别完整",
    "数据仅在浏览器本地内存中处理，刷新页面后清空"
  ];
  if (!fieldAvailability.hasSales30) {
    messages.push("缺少近30天销量字段，无法计算滞销、库存可售天数和日均销量");
  }

  return {
    importedRows: rows.length,
    matchedFields,
    coreFieldStatus,
    missingImportantFields: missingImportantFields.map((key) => FIELD_DEFINITIONS[key].label),
    messages,
    ...fieldAvailability
  };
}

function buildFieldAvailability(fieldMap) {
  return {
    hasSales30: fieldMap.sales30 !== undefined,
    hasSales7: fieldMap.sales7 !== undefined,
    hasAvailableStock: fieldMap.availableStock !== undefined,
    hasDailySales: fieldMap.dailySales !== undefined
  };
}

function compareProduct(a, b) {
  return b.priorityScore - a.priorityScore || b.salesAmount30 - a.salesAmount30 || b.sales30 - a.sales30;
}

function stat(value, total) {
  return {
    count: value,
    share: total ? roundRatio(value / total) : 0
  };
}

function sum(items, field) {
  return items.reduce((total, item) => total + (Number(item[field]) || 0), 0);
}

function count(items, predicate) {
  return items.reduce((total, item) => total + (predicate(item) ? 1 : 0), 0);
}

function addAverageValue(map, key, value) {
  const number = Number(value) || 0;
  if (!key || number <= 0) return;
  const current = map.get(key) ?? { total: 0, count: 0 };
  current.total += number;
  current.count += 1;
  map.set(key, current);
}

function mapAverages(map) {
  return Object.fromEntries(
    Array.from(map.entries())
      .sort(([a], [b]) => compareSize(a, b))
      .map(([key, value]) => [key, roundMoney(value.count ? value.total / value.count : 0)])
  );
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export { ISSUE_LABELS };
