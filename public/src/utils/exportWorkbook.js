import * as XLSX from "xlsx";

const BLOCKED_CALCULATION_TEXT = "缺少近30天销量字段，无法计算";

export function exportAnalysisWorkbook(result) {
  const workbook = XLSX.utils.book_new();
  const hasSales30 = result.validation.hasSales30;
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(toOverviewRows(result, hasSales30)), "库存总览");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(toWarningRows(result.warnings, hasSales30)), "库存预警");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(toItemRows(result.items, hasSales30)), "商品诊断");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(toCategoryRows(result.categoryAnalysis, hasSales30)), "分类库存分析");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(toRawRows(result.items, hasSales30)), "原始标准化数据");
  XLSX.writeFile(workbook, `库存分析结果-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function toOverviewRows(result, hasSales30) {
  const dashboard = result.dashboard;
  return [
    ["款号数", dashboard.styleCount],
    ["商品款色数", dashboard.productCount],
    ["总库存", dashboard.totalStock],
    ["近30天销量", formatOptionalNumber(dashboard.sales30)],
    ["近30天销售金额", dashboard.salesAmount30],
    ["长售龄款色数", dashboard.longAgeCount],
    ["断码款色数", dashboard.brokenSizeCount],
    ["畅销断码款色数", dashboard.hotBrokenCount],
    ["低价预警款色数", dashboard.lowPriceCount],
    ["库存压力款色数", dashboard.turnoverPressureCount],
    ["总库存周转月数", dashboard.inventoryTurnoverMonths ?? (hasSales30 ? "无销量" : BLOCKED_CALCULATION_TEXT)]
  ].map(([metric, value]) => ({ 指标: metric, 数值: value }));
}

function toWarningRows(items, hasSales30) {
  return toItemRows(items, hasSales30);
}

function toItemRows(items, hasSales30) {
  return items.map((item) => ({
    图片: item.image,
    三级分类: item.category,
    原款号: item.originalStyleNo,
    唯品款号: item.vipStyleNo,
    颜色: item.color,
    商品条形码: item.sku,
    尺码: item.size,
    售龄: item.listingAgeDays,
    销售分层: item.displaySalesTier,
    近30天销量: formatOptionalNumber(item.sales30),
    近30天销售金额: item.salesAmount30,
    库存: item.availableStock,
    周转天数: formatSellableDays(item.sellableDays, hasSales30),
    断码: item.brokenSize,
    "30天补货建议": formatReplenishment(item.replenishment?.qty30),
    "60天补货建议": formatReplenishment(item.replenishment?.qty60),
    "90天补货建议": formatReplenishment(item.replenishment?.qty90),
    成本价: item.costPrice,
    最终到手价: item.retailPrice,
    首次上架时间: item.firstListingDate,
    问题标签: item.issueTags.join("、"),
    建议动作: item.adviceText
  }));
}

function toCategoryRows(items, hasSales30) {
  return items.map((item) => ({
    分类: item.category,
    商品数: item.productCount,
    可售库存: item.availableStock,
    可售天数: formatSellableDays(item.sellableDays, hasSales30),
    滞销: item.slowSaleCount
  }));
}

function toRawRows(items, hasSales30) {
  return items.map((item) => ({
    productKey: item.productKey,
    originalStyleNo: item.originalStyleNo,
    vipStyleNo: item.vipStyleNo,
    color: item.color,
    sku: item.sku,
    size: item.size,
    category: item.category,
    stockQty: item.stockQty,
    availableStock: item.availableStock,
    sales7: formatOptionalNumber(item.sales7),
    sales30: formatOptionalNumber(item.sales30),
    salesAmount30: item.salesAmount30,
    sellableDays: formatSellableDays(item.sellableDays, hasSales30),
    costPrice: item.costPrice,
    retailPrice: item.retailPrice,
    firstListingDate: item.firstListingDate,
    displaySalesTier: item.displaySalesTier,
    issueTags: item.issueTags.join("、"),
    adviceText: item.adviceText
  }));
}

function formatOptionalNumber(value) {
  return value === null || value === undefined ? "缺少字段" : value;
}

function formatDailySales(value, hasSales30) {
  if (value === null || value === undefined) return hasSales30 ? "无销量" : BLOCKED_CALCULATION_TEXT;
  return value;
}

function formatSellableDays(value, hasSales30) {
  if (value === null || value === undefined) return hasSales30 ? "无销量" : BLOCKED_CALCULATION_TEXT;
  return value;
}

function formatReplenishment(value) {
  return value === null || value === undefined || Number(value) <= 0 ? "-" : value;
}
