export const FIELD_ALIASES = {
  category: ["三级分类", "分类", "品类", "类目"],
  originalStyleNo: ["原款号", "原始款号", "款号"],
  vipStyleNo: ["唯品款号", "唯品款号 ", "唯品商品款号"],
  color: ["颜色", "商品颜色"],
  barcode: ["商品条形码", "条形码", "商品条码", "SKU条码"],
  size: ["尺码", "商品尺码", "规格"],
  firstListingDate: ["首次上架时间", "首次上架日期", "上架时间", "上架日期"],
  sales30: ["近30天销量", "近30天销售量", "30天销量"],
  salesAmount30: ["近30天销售金额", "近30天销售额", "30天销售金额", "销售金额"],
  sales7: ["近7天销量", "近7天销售量", "7天销量"],
  detailUv7: ["近7天商详uv", "近7天商详UV", "近7天商品详情UV"],
  conversion7: ["近7天转化", "近7天转化率"],
  ctr7: ["近7天CTR", "近7天ctr"],
  exposureUv7: ["近7天曝光UV", "近7天曝光uv"],
  erpStock: ["ERP库存", "erp库存", "库存", "可售库存"],
  marketPrice: ["市场价"],
  discountRate: ["折扣比", "折扣率"],
  vipPrice: ["唯品价"],
  costPrice: ["成本价", "成本"],
  currentPrice: ["目前活动价", "活动价"],
  subsidyAmount: ["补贴金额", "补贴"],
  finalPrice: ["最终到手价", "到手价", "最终价"],
  image: ["颜色图片", "商品图片", "图片", "图片链接", "颜色图片链接"]
};

export function buildHeaderMap(headers) {
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));
  const map = {};

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const aliasSet = new Set(aliases.map((alias) => normalizeHeader(alias)));
    const index = normalizedHeaders.findIndex((header) => aliasSet.has(header));
    if (index >= 0) {
      map[field] = index;
    }
  }

  applyFallbackHeaderMap(map, normalizedHeaders);

  return map;
}

function applyFallbackHeaderMap(map, normalizedHeaders) {
  if (map.sales30 === undefined) {
    const index = normalizedHeaders.findIndex((header) => /^近\d{2}天(销量|销售量)$/.test(header));
    if (index >= 0) {
      map.sales30 = index;
    }
  }

  if (map.salesAmount30 === undefined) {
    const index = normalizedHeaders.findIndex((header) => /^近\d{2}天(销售金额|销售额)$/.test(header));
    if (index >= 0) {
      map.salesAmount30 = index;
    }
  }
}

export function normalizeHeader(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/\n/g, "")
    .trim();
}

export const REQUIRED_FIELDS = [
  "category",
  "vipStyleNo",
  "color",
  "barcode",
  "size",
  "firstListingDate",
  "sales30",
  "erpStock",
  "finalPrice"
];

export function getMissingRequiredFields(headerMap) {
  return REQUIRED_FIELDS.filter((field) => headerMap[field] === undefined);
}
