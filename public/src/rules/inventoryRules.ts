export const SALES_TIERS = {
  HOT: "畅销款",
  NORMAL: "平销款",
  SLOW: "滞销款"
};

export const RULE_THRESHOLDS = {
  newObservationDays: 7,
  newProtectionDays: 30,
  longAgeDays: 90,
  slowTurnoverDays: 90,
  pressureTurnoverDays: 90,
  replenishmentTargetDays: [30, 60, 90]
};

export const ISSUE_LABELS = {
  new_product: "新品",
  hot_sale: "畅销款",
  broken_size: "断码",
  low_price: "低价预警",
  long_age: "长售龄",
  turnover_pressure: "库存压力",
  slow_sale: "滞销款"
};

export const SLOW_SALE_RULE_DESCRIPTION =
  "滞销款必须同时满足：上架超过30天、近7天销量为0、当前有库存且周转天数为空或大于90天；上架30天内按新品保护，不标记滞销。";

const LOW_PRICE_RULES = [
  { keywords: ["文胸"], floor: 59 },
  { keywords: ["女士家居服", "睡裙"], floor: 69 },
  { keywords: ["女士内裤"], floor: 30 },
  { keywords: ["女士吊带背心"], floor: 69 }
];

const LETTER_SIZE_ORDER = new Map([
  ["F", 0],
  ["均码", 0],
  ["FREE", 0],
  ["S", 1],
  ["M", 2],
  ["L", 3],
  ["XL", 4],
  ["XXL", 5],
  ["2XL", 5],
  ["XXXL", 6],
  ["3XL", 6],
  ["XXXXL", 7],
  ["4XL", 7],
  ["5XL", 8]
]);

export function assignSalesTiers(products) {
  const byCategory = groupBy(products, (product) => product.category || "未分类");
  for (const categoryProducts of byCategory.values()) {
    const sorted = [...categoryProducts].sort((a, b) => b.sales30 - a.sales30);
    if (sorted.length === 1) {
      sorted[0].salesTier = sorted[0].sales30 > 0 ? SALES_TIERS.HOT : SALES_TIERS.NORMAL;
      if (isSlowSaleCandidate(sorted[0])) sorted[0].salesTier = SALES_TIERS.SLOW;
      sorted[0].displaySalesTier = getDisplaySalesTier(sorted[0]);
      continue;
    }

    const hotCount = Math.max(1, Math.ceil(sorted.length * 0.2));
    sorted.forEach((product, index) => {
      product.salesTier = index < hotCount ? SALES_TIERS.HOT : SALES_TIERS.NORMAL;
      if (isSlowSaleCandidate(product)) product.salesTier = SALES_TIERS.SLOW;
      product.displaySalesTier = getDisplaySalesTier(product);
    });
  }
}

export function applyOperatingRules(product) {
  const tags = [];
  const isBroken = isBrokenProduct(product);
  const isLongAge = isLongAgeProduct(product);
  const isLowPrice = isLowPriceProduct(product);
  const protectedNew = isNewProtected(product);
  const isPressure = isTurnoverPressureProduct(product);

  if (protectedNew) tags.push("new_product");
  if (product.salesTier === SALES_TIERS.HOT) tags.push("hot_sale");
  if (product.salesTier === SALES_TIERS.SLOW) tags.push("slow_sale");
  if (isBroken) tags.push("broken_size");
  if (isLongAge) tags.push("long_age");
  if (isLowPrice) tags.push("low_price");
  if (isPressure) tags.push("turnover_pressure");

  product.issueKeys = unique(tags);
  product.issueTags = product.issueKeys.map((key) => ISSUE_LABELS[key]).filter(Boolean);
  product.recommendation = buildOperatingAdvice(product);
  product.priorityScore = buildPriorityScore(product);
}

export function buildOperatingAdvice(product) {
  if (isNewProtected(product)) return "新品保护期，持续观察";
  if (product.salesTier === SALES_TIERS.HOT && product.issueKeys?.includes("broken_size")) return "优先补齐断码尺码";
  if (product.salesTier === SALES_TIERS.HOT) return "保持补货，持续跟进";
  if (product.salesTier === SALES_TIERS.SLOW) return "优先处理滞销库存";
  if (product.issueKeys?.includes("turnover_pressure")) return "控制补货，优先消化库存";
  if (product.issueKeys?.includes("broken_size")) return "按尺码结构适量补货";
  if (product.issueKeys?.includes("low_price")) return "控制补货";
  if (product.sales30 <= 0) return "建议加大曝光";
  return "保持观察";
}

export function buildReplenishmentSuggestions(product) {
  if (![SALES_TIERS.HOT, SALES_TIERS.NORMAL].includes(product.salesTier)) return [];

  const salesEntries = Object.entries(product.sizeSales30 ?? {}).filter(([, sales30]) => Number(sales30) > 0);
  if (salesEntries.length === 0) return [];

  const averageSizeSales30 = sum(
    salesEntries.map(([size, sales30]) => ({ size, sales30 })),
    "sales30"
  ) / salesEntries.length;

  return salesEntries
    .map(([size, rawSales30]) => {
      const sales30 = Number(rawSales30) || 0;
      const stock = Number(product.sizeStock?.[size]) || 0;
      const dailySales = sales30 / 30;
      const turnoverDays = dailySales > 0 ? stock / dailySales : null;
      const isBroken = stock <= 0;
      const isHighSalesSize = sales30 >= averageSizeSales30;

      if (!isHighSalesSize || (!isBroken && !(turnoverDays !== null && turnoverDays < 30))) {
        return null;
      }

      return {
        size,
        sales30,
        dailySales: roundRatio(dailySales),
        stock,
        turnoverDays: turnoverDays === null ? null : roundRatio(turnoverDays),
        qty30: getReplenishmentQty(30, dailySales, stock),
        qty60: getReplenishmentQty(60, dailySales, stock),
        qty90: getReplenishmentQty(90, dailySales, stock)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.sales30 - a.sales30 || compareSize(a.size, b.size));
}

export function isBrokenProduct(product) {
  return product.brokenSizes.length > 0;
}

export function isLongAgeProduct(product) {
  return product.ageDays !== null && product.ageDays >= RULE_THRESHOLDS.longAgeDays && product.salesTier !== SALES_TIERS.HOT;
}

export function isLowPriceProduct(product) {
  const floor = getLowPriceFloor(product.category);
  return floor !== null && product.minFinalPrice > 0 && product.minFinalPrice < floor;
}

export function isTurnoverPressureProduct(product) {
  return !isNewProtected(product) && (product.turnoverDays === null || product.turnoverDays > RULE_THRESHOLDS.pressureTurnoverDays);
}

export function isSlowSaleCandidate(product) {
  const isListedOver30Days = product.ageDays !== null && product.ageDays > RULE_THRESHOLDS.newProtectionDays;
  const isLowRecentSales = product.sales7 <= 0;
  const isHighInventory = product.totalStock > 0 && (product.turnoverDays === null || product.turnoverDays > RULE_THRESHOLDS.slowTurnoverDays);
  return isListedOver30Days && isLowRecentSales && isHighInventory;
}

export function getListingStage(ageDays) {
  if (ageDays === null) return "unknown";
  if (ageDays <= RULE_THRESHOLDS.newObservationDays) return "new_observation";
  if (ageDays <= RULE_THRESHOLDS.newProtectionDays) return "new";
  return "mature";
}

export function getDisplaySalesTier(product) {
  return isNewProtected(product) ? "新品" : product.salesTier;
}

export function isNewProtected(product) {
  return ["new_observation", "new"].includes(product.listingStage);
}

export function getLowPriceFloor(category) {
  const text = String(category ?? "");
  const rule = LOW_PRICE_RULES.find((item) => item.keywords.some((keyword) => text.includes(keyword)));
  return rule ? rule.floor : null;
}

export function compareSize(a, b) {
  const left = parseSize(a);
  const right = parseSize(b);
  if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
  if (left.value !== right.value) return left.value - right.value;
  return String(a).localeCompare(String(b), "zh-CN", { numeric: true });
}

export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function roundRatio(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function getReplenishmentQty(targetDays, dailySales, stock) {
  return Math.max(0, Math.ceil(targetDays * dailySales - stock));
}

function buildPriorityScore(product) {
  let score = 0;
  score += product.salesAmount30;
  score += product.sales30 * 10;
  score += product.brokenSizeRatio * 1000;
  if (product.salesTier === SALES_TIERS.HOT && product.issueKeys?.includes("broken_size")) score += 100000;
  if (product.issueKeys?.includes("long_age") && product.issueKeys?.includes("broken_size")) score += 50000;
  if (product.issueKeys?.includes("low_price")) score += 10000;
  return Math.round(score);
}

function parseSize(value) {
  const text = String(value ?? "").trim().toUpperCase();
  if (LETTER_SIZE_ORDER.has(text)) return { kind: "letter", value: LETTER_SIZE_ORDER.get(text) };
  const numeric = Number.parseFloat(text.replace(/[^\d.]/g, ""));
  if (Number.isFinite(numeric)) return { kind: "number", value: numeric };
  return { kind: "text", value: 999 };
}

function groupBy(items, getKey) {
  const map = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function sum(items, field) {
  return items.reduce((total, item) => total + (Number(item[field]) || 0), 0);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
