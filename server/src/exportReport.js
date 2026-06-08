import ExcelJS from "exceljs";

const ISSUE_LABELS = {
  long_age: "长售龄",
  broken_size: "断码",
  hot_sale: "畅销款",
  normal_sale: "平销款",
  slow_sale: "滞销款",
  new_observation: "新品观察期",
  low_price: "低价预警",
  turnover_pressure: "库存压力"
};

const COMBO_LABELS = {
  long_broken_slow: "长售龄 + 断码 + 滞销款",
  long_broken_normal: "长售龄 + 断码 + 平销款",
  hot_broken: "畅销款 + 断码"
};

export async function createExportWorkbook(result) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Product Inventory Analyzer";
  workbook.created = new Date();

  addSummarySheet(workbook, result.dashboard);
  addProductsSheet(workbook, result.products);
  return workbook;
}

function addSummarySheet(workbook, dashboard) {
  const sheet = workbook.addWorksheet("总览");
  sheet.addRow(["商品库存分析"]);
  sheet.addRow(["滞销规则", dashboard.slowSaleRuleDescription ?? ""]);

  const metrics = [
    ["款号数", dashboard.styleCount],
    ["商品款色数", dashboard.productCount],
    ["总库存", dashboard.totalStock],
    ["近30天销量", dashboard.sales30],
    ["近30天销售金额", dashboard.salesAmount30],
    ["长售龄款色数", dashboard.longAgeCount],
    ["断码款色数", dashboard.brokenSizeCount],
    ["畅销断码款色数", dashboard.hotBrokenCount],
    ["低价预警款色数", dashboard.lowPriceCount],
    ["库存压力款色数", dashboard.turnoverPressureCount],
    ["总库存周转月数", dashboard.inventoryTurnoverMonths ?? ""]
  ];

  for (let index = 0; index < metrics.length; index += 3) {
    const rowMetrics = metrics.slice(index, index + 3);
    sheet.addRow(rowMetrics.flatMap(([label, value]) => [label, value]));
  }

  sheet.addRow([]);
  sheet.addRow(["组合筛选", "数量", "占比", "单项问题", "数量", "占比"]);

  const comboRows = [
    ["全部商品", dashboard.filterStats.total],
    ...Object.entries(COMBO_LABELS).map(([key, label]) => [label, dashboard.filterStats.combos[key]])
  ];
  const issueRows = [
    ["全部单项问题", dashboard.filterStats.total],
    ...Object.entries(ISSUE_LABELS).map(([key, label]) => [label, dashboard.filterStats.issues[key]])
  ];
  const rowCount = Math.max(comboRows.length, issueRows.length);

  for (let index = 0; index < rowCount; index += 1) {
    const [comboLabel, comboStat] = comboRows[index] ?? ["", null];
    const [issueLabel, issueStat] = issueRows[index] ?? ["", null];
    sheet.addRow([
      comboLabel,
      comboStat?.count ?? "",
      comboStat ? formatShare(comboStat.share) : "",
      issueLabel,
      issueStat?.count ?? "",
      issueStat ? formatShare(issueStat.share) : ""
    ]);
  }

  sheet.columns = [
    { width: 24 },
    { width: 12 },
    { width: 12 },
    { width: 24 },
    { width: 12 },
    { width: 12 }
  ];
  styleSummarySheet(sheet);
}

function addProductsSheet(workbook, products) {
  const sheet = workbook.addWorksheet("商品分析");
  const columns = productColumns();
  sheet.columns = columns.map(({ key, width }) => ({ key, width }));
  sheet.addRow(columns.map((column) => column.header));

  for (const product of products) {
    for (const row of toProductRows(product)) {
      sheet.addRow(columns.map((column) => row[column.key]));
    }
  }

  styleProductSheet(sheet);
}

function productColumns() {
  return [
    { header: "三级分类", key: "category", width: 18 },
    { header: "原款号", key: "originalStyleNo", width: 18 },
    { header: "唯品款号", key: "vipStyleNo", width: 18 },
    { header: "颜色", key: "color", width: 14 },
    { header: "商品条形码", key: "barcodeList", width: 24 },
    { header: "尺码", key: "sizeList", width: 16 },
    { header: "首次上架时间", key: "firstListingDate", width: 14 },
    { header: "售龄天数", key: "ageDays", width: 12 },
    { header: "销售分层", key: "salesTier", width: 12 },
    { header: "近30天销量", key: "sales30", width: 14 },
    { header: "近30天销售金额", key: "salesAmount30", width: 18 },
    { header: "ERP库存", key: "erpStock", width: 12 },
    { header: "周转天数", key: "turnoverDays", width: 12 },
    { header: "成本价", key: "costPrice", width: 12 },
    { header: "最终到手价", key: "minFinalPrice", width: 14 },
    { header: "断码尺码", key: "brokenSizes", width: 20 },
    { header: "30天补货建议", key: "replenishment30", width: 16 },
    { header: "60天补货建议", key: "replenishment60", width: 16 },
    { header: "90天补货建议", key: "replenishment90", width: 16 },
    { header: "问题标签", key: "issueTags", width: 28 },
    { header: "建议动作", key: "recommendation", width: 48 }
  ];
}

function toProductRows(product) {
  const pairs = product.sizeBarcodePairs ?? [];
  const baseRow = { ...product, salesTier: product.displaySalesTier ?? product.salesTier };

  const skuRows = pairs.flatMap((pair) =>
    pair.barcodes.length
      ? pair.barcodes.map((barcode) => buildSkuExportFields(product, pair.size, barcode))
      : [buildSkuExportFields(product, pair.size, "")]
  );

  if (skuRows.length === 0) {
    return [{ ...baseRow, ...buildSkuExportFields(product, "", "") }];
  }

  return skuRows.map((skuRow) => ({ ...baseRow, ...skuRow }));
}

function buildSkuExportFields(product, size, barcode) {
  const erpStock = Number(product.sizeStock?.[size]) || 0;
  const sales30 = Number(product.sizeSales30?.[size]) || 0;
  const salesAmount30 = Number(product.sizeSalesAmount30?.[size]) || 0;
  const turnoverDays = sales30 > 0 ? roundNumber(erpStock / (sales30 / 30)) : "";
  const costPrice = Number(product.sizeCostPrice?.[size]) || 0;
  const finalPrice = Number(product.sizeFinalPrice?.[size]) || product.minFinalPrice;
  const isBroken = Boolean(size) && erpStock <= 0;
  const suggestion = (product.replenishmentSuggestions ?? []).find((item) => item.size === size);

  return {
    barcodeList: barcode,
    sizeList: size,
    sales30,
    salesAmount30,
    erpStock,
    turnoverDays,
    costPrice,
    minFinalPrice: finalPrice,
    brokenSizes: isBroken ? size : "",
    replenishment30: suggestion ? suggestion.qty30 : "",
    replenishment60: suggestion ? suggestion.qty60 : "",
    replenishment90: suggestion ? suggestion.qty90 : "",
    issueTags: buildSkuIssueTags(product, { sales30, turnoverDays, isBroken, suggestion }),
    recommendation: buildSkuRecommendation(product, { size, sales30, erpStock, turnoverDays, isBroken, suggestion })
  };
}

function buildSkuIssueTags(product, sku) {
  const isNewProduct = (product.displaySalesTier ?? product.salesTier) === "新品";
  const labels = [product.displaySalesTier ?? product.salesTier];
  if (product.issueTags.includes("new_observation")) labels.push(ISSUE_LABELS.new_observation);
  if (sku.isBroken) labels.push("当前尺码断码");
  if (sku.suggestion) labels.push("建议补货");
  if (!isNewProduct && sku.turnoverDays !== "" && sku.turnoverDays < 30) labels.push("周转小于30天");
  if (!isNewProduct && sku.turnoverDays !== "" && sku.turnoverDays > 90) labels.push("库存消化慢");
  if (!isNewProduct && !sku.sales30) labels.push("近30天无销量");
  if (product.issueTags.includes("low_price")) labels.push(ISSUE_LABELS.low_price);
  if (product.issueTags.includes("long_age")) labels.push(ISSUE_LABELS.long_age);
  return [...new Set(labels.filter(Boolean))].join(", ");
}

function buildSkuRecommendation(product, sku) {
  if (!sku.size) {
    return product.recommendation;
  }

  const profitHint = product.issueTags.includes("low_price") ? "；价格低于底线，补货前先检查利润空间" : "";
  const isNewProduct = (product.displaySalesTier ?? product.salesTier) === "新品";

  if (product.issueTags.includes("slow_sale")) {
    if (sku.isBroken) {
      return "当前尺码断码，但属于滞销款，不建议补货；优先清库存、组合促销或调整价格";
    }
    if (!sku.sales30 || sku.turnoverDays === "" || sku.turnoverDays > 90) {
      return "当前尺码库存消化慢，优先清库存、组合促销或调整价格";
    }
    return "滞销款不建议补货，保持观察";
  }

  if (isNewProduct && !sku.suggestion) {
    if (product.issueTags.includes("new_observation")) {
      return "新品观察期，暂不按滞销处理，先看曝光、点击和首批销量";
    }
    return "新品保护期，暂不按滞销处理，持续观察近7天销量和库存结构";
  }

  if (sku.suggestion) {
    const reason = sku.isBroken ? "当前尺码已断码" : "当前尺码周转小于30天";
    return `${reason}，按30/60/90天建议补货${profitHint}`;
  }

  if (sku.isBroken) {
    return `当前尺码断码，但近30天销量未达到核心尺码补货线，先观察或少量试补${profitHint}`;
  }

  if (!sku.sales30) {
    return "当前尺码近30天无销量，暂不补货";
  }

  if (sku.turnoverDays !== "" && sku.turnoverDays > 90) {
    return "当前尺码库存消化慢，优先清库存或调整促销节奏";
  }

  return "当前尺码库存暂可观察";
}

function styleSummarySheet(sheet) {
  sheet.mergeCells("A1:F1");
  sheet.getCell("A1").font = { bold: true, size: 16 };
  sheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };

  for (let rowNumber = 3; rowNumber <= 6; rowNumber += 1) {
    sheet.getRow(rowNumber).eachCell((cell, colNumber) => {
      if (colNumber % 2 === 1) {
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3EA" } };
      }
    });
  }

  const filterHeader = sheet.getRow(8);
  filterHeader.font = { bold: true };
  filterHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3EA" } };
}

function styleProductSheet(sheet) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: productColumns().length }
  };

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.alignment = { vertical: "middle", wrapText: false };
    }
  });
}

function formatShare(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
