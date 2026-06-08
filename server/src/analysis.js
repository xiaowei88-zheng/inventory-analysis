import { dateToIso } from "./normalizers.js";

export const SALES_TIERS = {
  HOT: "畅销款",
  NORMAL: "平销款",
  SLOW: "滞销款"
};

export const SLOW_SALE_RULE_DESCRIPTION =
  "滞销款必须同时满足：上架超过30天、近7天销量为0、当前有库存且周转天数为空或大于90天；上架30天内按新品保护，不标记滞销。";

const NEW_OBSERVATION_DAYS = 7;
const NEW_PROTECTION_DAYS = 30;
const SLOW_TURNOVER_DAYS = 90;

const LISTING_STAGES = {
  NEW_OBSERVATION: "new_observation",
  NEW: "new",
  MATURE: "mature",
  UNKNOWN: "unknown"
};

const LISTING_STAGE_LABELS = {
  [LISTING_STAGES.NEW_OBSERVATION]: "新品观察期",
  [LISTING_STAGES.NEW]: "新品",
  [LISTING_STAGES.MATURE]: "",
  [LISTING_STAGES.UNKNOWN]: ""
};

const LOW_PRICE_RULES = [
  { keywords: ["文胸"], floor: 59 },
  { keywords: ["女士家居服", "睡裙"], floor: 69 },
  { keywords: ["女士内裤"], floor: 30 },
  { keywords: ["女士吊带背心"], floor: 69 }
];

const CATEGORY_ORDER = [
  ["文胸"],
  ["女士内裤"],
  ["女士睡衣/家居服", "女士睡衣", "女士家居服", "家居服"],
  ["睡裙"],
  ["女士吊带/打底背心", "女士吊带", "女士吊带背心", "打底背心", "吊带背心"]
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

export function analyzeRows(rows, options = {}) {
  const now = options.analysisDate ? new Date(options.analysisDate) : new Date();
  const productGroups = new Map();
  const styleSizes = new Map();

  for (const row of rows) {
    if (!row.vipStyleNo || !row.color) {
      continue;
    }

    const productKey = makeProductKey(row.vipStyleNo, row.color);
    if (!productGroups.has(productKey)) {
      productGroups.set(productKey, []);
    }
    productGroups.get(productKey).push(row);

    if (!styleSizes.has(row.vipStyleNo)) {
      styleSizes.set(row.vipStyleNo, new Set());
    }
    if (row.size) {
      styleSizes.get(row.vipStyleNo).add(row.size);
    }
  }

  const products = [];
  for (const [productKey, groupRows] of productGroups.entries()) {
    products.push(buildProductAnalysis(productKey, groupRows, styleSizes, now));
  }

  assignSalesTiers(products);
  for (const product of products) {
    product.replenishmentSuggestions = buildReplenishmentSuggestions(product);
    applyIssueTags(product);
  }

  products.sort(compareProduct);

  return {
    dashboard: buildDashboard(products),
    products,
    issues: products.filter((product) => product.issueTags.length > 0),
    priceBands: buildPriceBands(products)
  };
}

function buildProductAnalysis(productKey, rows, styleSizes, now) {
  const first = rows[0];
  const expectedSizes = Array.from(styleSizes.get(first.vipStyleNo) ?? []).sort(compareSize);
  const sizeStock = new Map();
  const sizeBarcodes = new Map();
  const sizeSales30 = new Map();
  let totalStock = 0;
  let sales30 = 0;
  let sales7 = 0;
  const sizeSalesAmount30 = new Map();
  const sizeCostPrice = new Map();
  const sizeFinalPrice = new Map();
  let finalPriceSum = 0;
  let finalPriceCount = 0;
  let minFinalPrice = Number.POSITIVE_INFINITY;
  let firstListingDate = null;

  for (const row of rows) {
    const stock = Math.max(0, row.erpStock);
    totalStock += stock;
    sales30 += row.sales30;
    sales7 += row.sales7;
    const rowPrice = row.finalPrice || Math.max(0, row.currentPrice - row.subsidyAmount);
    if (rowPrice > 0) {
      finalPriceSum += rowPrice;
      finalPriceCount += 1;
      minFinalPrice = Math.min(minFinalPrice, rowPrice);
    }

    if (row.salesAmount30 > 0) {
      sizeSalesAmount30.set(row.size, (sizeSalesAmount30.get(row.size) ?? 0) + row.salesAmount30);
    }

    if (row.size) {
      sizeStock.set(row.size, (sizeStock.get(row.size) ?? 0) + stock);
      sizeSales30.set(row.size, (sizeSales30.get(row.size) ?? 0) + row.sales30);
      addAverageValue(sizeCostPrice, row.size, row.costPrice);
      addAverageValue(sizeFinalPrice, row.size, rowPrice);
      if (!sizeBarcodes.has(row.size)) {
        sizeBarcodes.set(row.size, new Set());
      }
      if (row.barcode) {
        sizeBarcodes.get(row.size).add(row.barcode);
      }
    }
    if (row.firstListingDate && (!firstListingDate || row.firstListingDate < firstListingDate)) {
      firstListingDate = row.firstListingDate;
    }
  }

  const brokenSizes = expectedSizes.filter((size) => (sizeStock.get(size) ?? 0) <= 0);
  const inStockSizes = expectedSizes.filter((size) => (sizeStock.get(size) ?? 0) > 0);
  const ageDays = firstListingDate ? Math.max(0, Math.floor((startOfDay(now) - startOfDay(firstListingDate)) / 86400000)) : null;
  const listingStage = getListingStage(ageDays);
  const avgDailySales = sales30 / 30;
  const turnoverDays = avgDailySales > 0 ? totalStock / avgDailySales : totalStock > 0 ? null : 0;
  const finalPrice = finalPriceCount > 0 ? finalPriceSum / finalPriceCount : 0;
  const salesAmount30 = Array.from(sizeSalesAmount30.values()).reduce((total, value) => total + value, 0);
  const sizeBarcodePairs = Array.from(sizeBarcodes.entries())
    .sort(([a], [b]) => compareSize(a, b))
    .map(([size, barcodes]) => ({
      size,
      barcodes: Array.from(barcodes).sort(compareSize)
    }));
  return {
    productKey,
    category: first.category,
    originalStyleNo: first.originalStyleNo,
    vipStyleNo: first.vipStyleNo,
    color: first.color,
    image: first.image,
    firstListingDate: dateToIso(firstListingDate),
    ageDays,
    listingStage,
    listingStageLabel: LISTING_STAGE_LABELS[listingStage],
    skuCount: rows.length,
    totalStock,
    sales30,
    sales7,
    salesAmount30: roundMoney(salesAmount30),
    sizeSalesAmount30: Object.fromEntries(
      Array.from(sizeSalesAmount30.entries())
        .sort(([a], [b]) => compareSize(a, b))
        .map(([size, amount]) => [size, roundMoney(amount)])
    ),
    sizeSales30: Object.fromEntries(Array.from(sizeSales30.entries()).sort(([a], [b]) => compareSize(a, b))),
    sizeCostPrice: mapAverages(sizeCostPrice),
    sizeFinalPrice: mapAverages(sizeFinalPrice),
    sizeBarcodePairs,
    hasEstimatedSalesAmount: false,
    salesAmountMode: "provided_size",
    finalPrice: roundMoney(finalPrice),
    minFinalPrice: Number.isFinite(minFinalPrice) ? roundMoney(minFinalPrice) : 0,
    expectedSizes,
    inStockSizes,
    brokenSizes,
    brokenSizeRatio: expectedSizes.length ? roundRatio(brokenSizes.length / expectedSizes.length) : 0,
    sizeStock: Object.fromEntries(Array.from(sizeStock.entries()).sort(([a], [b]) => compareSize(a, b))),
    turnoverDays: turnoverDays === null ? null : roundRatio(turnoverDays),
    salesTier: SALES_TIERS.NORMAL,
    displaySalesTier: SALES_TIERS.NORMAL,
    replenishmentSuggestions: [],
    issueTags: [],
    recommendation: "",
    priorityScore: 0
  };
}

function assignSalesTiers(products) {
  const byCategory = groupBy(products, (product) => product.category || "未分类");
  for (const categoryProducts of byCategory.values()) {
    const sorted = [...categoryProducts].sort((a, b) => b.sales30 - a.sales30);
    if (sorted.length === 1) {
      sorted[0].salesTier = sorted[0].sales30 > 0 ? SALES_TIERS.HOT : SALES_TIERS.NORMAL;
      if (isSlowSaleCandidate(sorted[0])) {
        sorted[0].salesTier = SALES_TIERS.SLOW;
      }
      sorted[0].displaySalesTier = getDisplaySalesTier(sorted[0]);
      continue;
    }

    const hotCount = Math.max(1, Math.ceil(sorted.length * 0.2));
    sorted.forEach((product, index) => {
      if (index < hotCount) {
        product.salesTier = SALES_TIERS.HOT;
      } else {
        product.salesTier = SALES_TIERS.NORMAL;
      }
      if (isSlowSaleCandidate(product)) {
        product.salesTier = SALES_TIERS.SLOW;
      }
      product.displaySalesTier = getDisplaySalesTier(product);
    });
  }
}

function applyIssueTags(product) {
  const tags = [];
  const isLongAge = product.ageDays !== null && product.ageDays >= 90;
  const isBroken = product.brokenSizes.length > 0;
  const lowPriceFloor = getLowPriceFloor(product.category);
  const isLowPrice = lowPriceFloor !== null && product.minFinalPrice > 0 && product.minFinalPrice < lowPriceFloor;
  const protectedNew = isNewProtected(product);

  if (isBroken) tags.push("broken_size");
  if (product.listingStage === LISTING_STAGES.NEW_OBSERVATION) tags.push("new_observation");
  if (product.salesTier === SALES_TIERS.HOT) tags.push("hot_sale");
  if (product.salesTier === SALES_TIERS.NORMAL) tags.push("normal_sale");
  if (product.salesTier === SALES_TIERS.SLOW) tags.push("slow_sale");
  if (isLongAge && product.salesTier !== SALES_TIERS.HOT) tags.push("long_age");
  if (isLowPrice) tags.push("low_price");
  if (!protectedNew && (product.turnoverDays === null || product.turnoverDays > 90)) tags.push("turnover_pressure");

  product.issueTags = tags;
  product.recommendation = buildRecommendation(product, { isLongAge, isBroken, isLowPrice, lowPriceFloor, protectedNew });
  product.priorityScore = buildPriorityScore(product);
}

function buildRecommendation(product, context) {
  const { isLongAge, isBroken, isLowPrice, lowPriceFloor, protectedNew } = context;

  if (product.salesTier === SALES_TIERS.HOT && isBroken) {
    const urgency = product.turnoverDays !== null && product.turnoverDays < 15 ? "紧急补核心尺码" : "补核心尺码";
    const profitHint = isLowPrice ? `；到手价低于${lowPriceFloor}元，补货前先检查利润空间` : "";
    return `${urgency}，优先处理销售金额高、断码比例高的尺码${profitHint}`;
  }

  if (product.listingStage === LISTING_STAGES.NEW_OBSERVATION) {
    return "新品观察期，暂不做滞销处理；重点观察曝光、点击、加购和首批销量";
  }

  if (protectedNew) {
    return "新品保护期，暂不做滞销处理；继续观察近7天销量和尺码库存结构";
  }

  if (isLongAge && isBroken && product.salesTier === SALES_TIERS.SLOW) {
    return "不建议补码，优先清库存、组合促销或降低库存风险";
  }

  if (isLongAge && isBroken && product.salesTier === SALES_TIERS.NORMAL) {
    return "只补核心尺码；若周转差或毛利差，转清库存处理";
  }

  if (isLowPrice) {
    return `到手价低于${lowPriceFloor}元，检查活动价、补贴和毛利空间`;
  }

  if (product.turnoverDays === null || product.turnoverDays > 90) {
    return "库存压力高，优先检查促销、调价或清库存方案";
  }

  return "保持观察";
}

function buildPriorityScore(product) {
  let score = 0;
  score += product.salesAmount30;
  score += product.sales30 * 10;
  score += product.brokenSizeRatio * 1000;
  if (product.salesTier === SALES_TIERS.HOT && product.brokenSizes.length > 0) score += 100000;
  if (product.ageDays !== null && product.ageDays >= 90 && product.brokenSizes.length > 0) score += 50000;
  if (product.issueTags.includes("low_price")) score += 10000;
  return Math.round(score);
}

function buildReplenishmentSuggestions(product) {
  if (![SALES_TIERS.HOT, SALES_TIERS.NORMAL].includes(product.salesTier)) {
    return [];
  }

  const salesEntries = Object.entries(product.sizeSales30 ?? {}).filter(([, sales30]) => Number(sales30) > 0);
  if (salesEntries.length === 0) {
    return [];
  }

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
        stock,
        turnoverDays: turnoverDays === null ? null : roundRatio(turnoverDays),
        qty30: Math.max(0, Math.ceil(dailySales * 30 - stock)),
        qty60: Math.max(0, Math.ceil(dailySales * 60 - stock)),
        qty90: Math.max(0, Math.ceil(dailySales * 90 - stock))
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.sales30 - a.sales30 || compareSize(a.size, b.size));
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
    longAgeCount: count(products, (product) => product.issueTags.includes("long_age")),
    brokenSizeCount: count(products, (product) => product.issueTags.includes("broken_size")),
    hotBrokenCount: count(products, (product) => product.issueTags.includes("hot_sale") && product.issueTags.includes("broken_size")),
    lowPriceCount: count(products, (product) => product.issueTags.includes("low_price")),
    turnoverPressureCount: count(products, (product) => product.issueTags.includes("turnover_pressure")),
    filterStats: buildFilterStats(products, productCount)
  };
}

function buildFilterStats(products, total) {
  const comboPredicates = {
    long_broken_slow: (product) =>
      product.issueTags.includes("long_age") && product.issueTags.includes("broken_size") && product.issueTags.includes("slow_sale"),
    long_broken_normal: (product) =>
      product.issueTags.includes("long_age") && product.issueTags.includes("broken_size") && product.issueTags.includes("normal_sale"),
    hot_broken: (product) => product.issueTags.includes("hot_sale") && product.issueTags.includes("broken_size")
  };
  const issueKeys = ["hot_sale", "broken_size", "long_age", "slow_sale", "normal_sale", "new_observation", "low_price", "turnover_pressure"];

  return {
    total: stat(total, total),
    combos: Object.fromEntries(Object.entries(comboPredicates).map(([key, predicate]) => [key, stat(count(products, predicate), total)])),
    issues: Object.fromEntries(issueKeys.map((key) => [key, stat(count(products, (product) => product.issueTags.includes(key)), total)]))
  };
}

function stat(value, total) {
  return {
    count: value,
    share: total ? roundRatio(value / total) : 0
  };
}

function buildPriceBands(products) {
  const byCategory = groupBy(products.filter((product) => product.minFinalPrice > 0), (product) => product.category || "未分类");
  const bands = [];

  for (const [category, categoryProducts] of byCategory.entries()) {
    const bandMap = new Map();
    const categorySales30 = sum(categoryProducts, "sales30");
    const categorySalesAmount30 = sum(categoryProducts, "salesAmount30");
    for (const product of categoryProducts) {
      const band = makePriceBand(product.minFinalPrice);
      if (!bandMap.has(band)) {
        bandMap.set(band, {
          category,
          priceBand: band,
          productCount: 0,
          sales30: 0,
          salesAmount30: 0,
          totalStock: 0,
          avgTurnoverDays: 0,
          turnoverCount: 0,
          hotCount: 0
        });
      }
      const entry = bandMap.get(band);
      entry.productCount += 1;
      entry.sales30 += product.sales30;
      entry.salesAmount30 += product.salesAmount30;
      entry.totalStock += product.totalStock;
      if (product.turnoverDays !== null) {
        entry.avgTurnoverDays += product.turnoverDays;
        entry.turnoverCount += 1;
      }
      if (product.salesTier === SALES_TIERS.HOT) {
        entry.hotCount += 1;
      }
    }

    for (const entry of bandMap.values()) {
      entry.salesAmount30 = roundMoney(entry.salesAmount30);
      entry.salesAmountShare = categorySalesAmount30 ? roundRatio(entry.salesAmount30 / categorySalesAmount30) : 0;
      entry.salesQuantityShare = categorySales30 ? roundRatio(entry.sales30 / categorySales30) : 0;
      entry.avgTurnoverDays = entry.turnoverCount ? roundRatio(entry.avgTurnoverDays / entry.turnoverCount) : 0;
      delete entry.turnoverCount;
      bands.push(entry);
    }
  }

  return bands.sort((a, b) => b.salesAmount30 - a.salesAmount30);
}

function getLowPriceFloor(category) {
  const text = String(category ?? "");
  const rule = LOW_PRICE_RULES.find((item) => item.keywords.some((keyword) => text.includes(keyword)));
  return rule ? rule.floor : null;
}

function makePriceBand(price) {
  const start = Math.floor(price / 10) * 10;
  return `${start}-${start + 9}`;
}

function makeProductKey(vipStyleNo, color) {
  return `${vipStyleNo}::${color}`;
}

function getListingStage(ageDays) {
  if (ageDays === null) return LISTING_STAGES.UNKNOWN;
  if (ageDays <= NEW_OBSERVATION_DAYS) return LISTING_STAGES.NEW_OBSERVATION;
  if (ageDays <= NEW_PROTECTION_DAYS) return LISTING_STAGES.NEW;
  return LISTING_STAGES.MATURE;
}

function getDisplaySalesTier(product) {
  return isNewProtected(product) ? "新品" : product.salesTier;
}

function isNewProtected(product) {
  return [LISTING_STAGES.NEW_OBSERVATION, LISTING_STAGES.NEW].includes(product.listingStage);
}

function isSlowSaleCandidate(product) {
  const isListedOver30Days = product.ageDays !== null && product.ageDays > NEW_PROTECTION_DAYS;
  const isLowRecentSales = product.sales7 <= 0;
  const isHighInventory = product.totalStock > 0 && (product.turnoverDays === null || product.turnoverDays > SLOW_TURNOVER_DAYS);
  return isListedOver30Days && isLowRecentSales && isHighInventory;
}

function groupBy(items, getKey) {
  const map = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(item);
  }
  return map;
}

function sum(items, field) {
  return items.reduce((total, item) => total + (Number(item[field]) || 0), 0);
}

function count(items, predicate) {
  return items.reduce((total, item) => total + (predicate(item) ? 1 : 0), 0);
}

function addAverageValue(map, key, value) {
  const number = Number(value) || 0;
  if (!key || number <= 0) {
    return;
  }
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

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function roundRatio(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function compareSize(a, b) {
  const left = parseSize(a);
  const right = parseSize(b);

  if (left.type !== right.type) {
    return left.type - right.type;
  }

  if (left.type === 0) {
    return left.cupRank - right.cupRank || left.band - right.band || compareText(a, b);
  }

  if (left.type === 1) {
    return left.rank - right.rank || compareText(a, b);
  }

  return compareText(a, b);
}

function compareProduct(a, b) {
  return (
    categoryRank(a.category) - categoryRank(b.category) ||
    String(a.category).localeCompare(String(b.category), "zh-Hans-CN", { numeric: true }) ||
    String(a.vipStyleNo).localeCompare(String(b.vipStyleNo), "zh-Hans-CN", { numeric: true }) ||
    String(a.color).localeCompare(String(b.color), "zh-Hans-CN", { numeric: true })
  );
}

function categoryRank(category) {
  const text = String(category ?? "");
  const index = CATEGORY_ORDER.findIndex((keywords) => keywords.some((keyword) => text.includes(keyword)));
  return index >= 0 ? index : CATEGORY_ORDER.length;
}

function parseSize(value) {
  const text = String(value ?? "").trim().toUpperCase();
  const bra = text.match(/^(\d{2,3})([A-Z])$/);
  if (bra) {
    return {
      type: 0,
      band: Number(bra[1]),
      cupRank: bra[2].charCodeAt(0) - "A".charCodeAt(0)
    };
  }

  const letterRank = LETTER_SIZE_ORDER.get(text);
  if (letterRank !== undefined) {
    return {
      type: 1,
      rank: letterRank
    };
  }

  return {
    type: 2
  };
}

function compareText(a, b) {
  return String(a).localeCompare(String(b), "zh-Hans-CN", { numeric: true });
}
