export const INVENTORY_THRESHOLDS = {
  newProtectionDays: 30,
  newObservationDays: 7,
  outOfStock: 0,
  lowStockDays: 7,
  highStockDays: 90,
  highStockQty: 100,
  slowSales7: 0,
  slowSales30: 2,
  goodSales30: 30
};

export const TAG_LABELS = {
  out_of_stock: "缺货风险",
  low_stock: "低库存预警",
  high_stock: "库存压力",
  slow_sale: "滞销风险",
  new_low_stock: "新品库存不足",
  hot_low_stock: "销量好但库存不足",
  high_stock_low_sales: "库存多但销量低",
  short_sellable_days: "可售天数过短",
  long_sellable_days: "库存压力"
};

export const ADVICE_LABELS = {
  replenish: "建议补货",
  control_replenishment: "建议控制补货",
  clearance: "建议清仓促销",
  increase_exposure: "建议加大曝光",
  check_sync: "建议检查库存同步",
  handle_slow_sale: "建议优先处理滞销款",
  observe_new: "新品保护期，先观察转化和首批销量"
};

export function diagnoseItem(item, fieldAvailability = {}) {
  const tags = [];
  const advice = [];
  const stock = item.availableStock;
  const totalStock = item.stockQty;
  const days = item.sellableDays;
  const age = item.listingAgeDays;
  const isNew = age !== null && age <= INVENTORY_THRESHOLDS.newProtectionDays;
  const hasStockMismatch = totalStock > 0 && stock <= 0;
  const canAnalyzeSales = fieldAvailability.hasSales30 && item.sales30 !== null;
  const hasSales7 = fieldAvailability.hasSales7 && item.sales7 !== null;
  const hasGoodSales = canAnalyzeSales && (item.sales30 >= INVENTORY_THRESHOLDS.goodSales30 || item.dailySales >= 1);
  const lowSales30 = canAnalyzeSales && item.sales30 <= INVENTORY_THRESHOLDS.slowSales30;
  const lowSales7 = hasSales7 && item.sales7 <= INVENTORY_THRESHOLDS.slowSales7;
  const lowSales = lowSales30 && lowSales7;
  const highStockByQty = stock > INVENTORY_THRESHOLDS.highStockQty;
  const highStockByDays = days !== null && days > INVENTORY_THRESHOLDS.highStockDays;
  const highStock = canAnalyzeSales && highStockByQty && lowSales30;
  const lowStock = canAnalyzeSales && stock > 0 && days !== null && days < INVENTORY_THRESHOLDS.lowStockDays;

  if (stock <= INVENTORY_THRESHOLDS.outOfStock) tags.push("out_of_stock");
  if (lowStock) tags.push("low_stock");
  if (highStock && !isNew) tags.push("high_stock");
  if (!isNew && highStock && lowSales) tags.push("slow_sale");
  if (isNew && stock <= 0) tags.push("new_low_stock");
  if (hasGoodSales && (stock <= 0 || lowStock)) tags.push("hot_low_stock");
  if (!isNew && highStock && lowSales) tags.push("high_stock_low_sales");
  if (lowStock) tags.push("short_sellable_days");
  if (canAnalyzeSales && !isNew && highStockByDays) tags.push("long_sellable_days");

  if (tags.includes("hot_low_stock") || tags.includes("low_stock") || tags.includes("out_of_stock")) {
    advice.push("replenish");
  }
  if (tags.includes("high_stock")) {
    advice.push("control_replenishment");
  }
  if (tags.includes("slow_sale") || tags.includes("high_stock_low_sales")) {
    advice.push("clearance", "handle_slow_sale");
  }
  if (canAnalyzeSales && lowSales && stock > 0) {
    advice.push("increase_exposure");
  }
  if (hasStockMismatch || item.lockedStock > item.stockQty) {
    advice.push("check_sync");
  }
  if (isNew && !tags.includes("new_low_stock") && !tags.includes("hot_low_stock")) {
    advice.push("observe_new");
  }

  return {
    tagKeys: unique(tags),
    tags: unique(tags).map((key) => TAG_LABELS[key]),
    adviceKeys: unique(advice),
    advice: unique(advice).map((key) => ADVICE_LABELS[key])
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
