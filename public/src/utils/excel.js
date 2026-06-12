import * as XLSX from "xlsx";
import { FIELD_DEFINITIONS, FIELD_KEYS, getHeaderMatchScore } from "../constants/fieldMap.js";
import { dateToIso, round, toDate, toNumber, toText } from "./normalizers.js";

export async function readInventoryFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Excel 文件没有可读取的工作表");
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rows.length < 2) {
    throw new Error("Excel 至少需要包含表头和一行数据");
  }

  const headers = rows[0].map(toText);
  const fieldMap = buildFieldMap(headers);
  const fieldMatchRows = buildFieldMatchRows(headers, fieldMap);
  console.table(
    fieldMatchRows.map((row) => ({
      原始字段名: row.rawHeader,
      匹配结果: row.matched ? "已识别" : "未识别",
      标准字段: row.standardField
    }))
  );
  const dataRows = rows.slice(1).filter((row) => row.some((cell) => toText(cell)));
  const normalizedRows = dataRows.map((row, index) => normalizeInventoryRow(row, fieldMap, index + 2));

  return {
    sheetName,
    headers,
    fieldMap,
    fieldMatchRows,
    rows: normalizedRows,
    meta: {
      totalRows: dataRows.length,
      importedRows: normalizedRows.length,
      generatedAt: new Date().toISOString()
    }
  };
}

export function buildFieldMap(headers) {
  const map = {};
  const candidates = [];

  headers.forEach((header, index) => {
    for (const key of FIELD_KEYS) {
      for (const alias of FIELD_DEFINITIONS[key].aliases) {
        const score = getHeaderMatchScore(header, alias);
        if (score > 0) {
          candidates.push({
            key,
            index,
            score,
            aliasLength: String(alias).length
          });
        }
      }
    }
  });

  candidates.sort((a, b) => b.score - a.score || b.aliasLength - a.aliasLength);

  const usedIndexes = new Set();
  const usedKeys = new Set();
  for (const candidate of candidates) {
    if (usedIndexes.has(candidate.index) || usedKeys.has(candidate.key)) continue;
    map[candidate.key] = candidate.index;
    usedIndexes.add(candidate.index);
    usedKeys.add(candidate.key);
  }
  return map;
}

export function buildFieldMatchRows(headers, fieldMap) {
  const byIndex = new Map(Object.entries(fieldMap).map(([key, index]) => [index, key]));
  return headers.map((header, index) => {
    const key = byIndex.get(index);
    return {
      rawHeader: header,
      matched: Boolean(key),
      standardKey: key || "",
      standardField: key ? FIELD_DEFINITIONS[key].label : ""
    };
  });
}

function normalizeInventoryRow(row, fieldMap, sourceRowNumber) {
  const hasField = (field) => fieldMap[field] !== undefined;
  const value = (field) => (fieldMap[field] === undefined ? "" : row[fieldMap[field]]);
  const hasSales30 = hasField("sales30");
  const sales7 = hasField("sales7") ? toNumber(value("sales7")) : null;
  const sales30 = hasSales30 ? toNumber(value("sales30")) : null;
  const dailySales = hasSales30 ? toNumber(value("dailySales")) || (sales30 > 0 ? sales30 / 30 : 0) : null;
  const stockQty = Math.max(0, toNumber(value("stockQty")));
  const lockedStock = Math.max(0, toNumber(value("lockedStock")));
  const availableStock = fieldMap.availableStock === undefined ? Math.max(0, stockQty - lockedStock) : Math.max(0, toNumber(value("availableStock")));
  const costPrice = toNumber(value("costPrice"));
  const stockAmount = toNumber(value("stockAmount")) || round(stockQty * costPrice);
  const sellableDays = hasSales30
    ? toNumber(value("sellableDays")) || (dailySales > 0 ? round(availableStock / dailySales) : availableStock > 0 ? null : 0)
    : null;
  const firstListingDate = toDate(value("firstListingDate"));

  return {
    sourceRowNumber,
    productId: toText(value("productId")),
    productName: toText(value("productName")),
    goodsNo: toText(value("goodsNo")),
    originalStyleNo: toText(value("originalStyleNo")),
    vipStyleNo: toText(value("vipStyleNo")),
    styleNo: toText(value("styleNo")) || toText(value("vipStyleNo")) || toText(value("originalStyleNo")),
    color: toText(value("color")),
    sku: toText(value("sku")),
    size: toText(value("size")),
    image: toText(value("image")),
    category: toText(value("category")) || "未分类",
    stockQty,
    availableStock,
    lockedStock,
    inTransitStock: Math.max(0, toNumber(value("inTransitStock"))),
    salesQty: toNumber(value("salesQty")),
    sales7,
    sales30,
    salesAmount30: toNumber(value("salesAmount30")),
    dailySales: dailySales === null ? null : round(dailySales),
    sellableDays,
    costPrice,
    retailPrice: toNumber(value("retailPrice")),
    tagPrice: toNumber(value("tagPrice")),
    stockAmount,
    firstListingDate: dateToIso(firstListingDate),
    listingAgeDays: firstListingDate ? Math.max(0, Math.floor((startOfDay(new Date()) - startOfDay(firstListingDate)) / 86400000)) : null,
    productStatus: toText(value("productStatus"))
  };
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
