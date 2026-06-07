import ExcelJS from "exceljs";
import { analyzeRows } from "./analysis.js";
import { buildHeaderMap, getMissingRequiredFields } from "./fieldMap.js";
import { toDate, toNumber, toPercent, toText } from "./normalizers.js";

export async function importExcel(filePath, callbacks = {}) {
  try {
    return await importExcelStreaming(filePath, callbacks);
  } catch (error) {
    if (!isRecoverableStreamingError(error)) {
      throw error;
    }
    callbacks.onProgress?.({ processedRows: 0 });
    return importExcelWorkbook(filePath, callbacks);
  }
}

async function importExcelStreaming(filePath, callbacks) {
  const rows = [];
  let headerMap = null;
  let processedRows = 0;
  let sheetCount = 0;

  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: "emit",
    sharedStrings: "cache",
    styles: "ignore",
    hyperlinks: "ignore",
    worksheets: "emit"
  });

  for await (const worksheetReader of workbookReader) {
    sheetCount += 1;
    if (sheetCount > 1) {
      break;
    }

    for await (const row of worksheetReader) {
      const values = row.values.slice(1);
      if (!headerMap) {
        headerMap = parseHeaderMap(values, callbacks);
        continue;
      }

      const normalized = normalizeRow(values, headerMap);
      if (normalized.vipStyleNo && normalized.color) {
        rows.push(normalized);
      }
      processedRows += 1;

      if (processedRows % 1000 === 0) {
        callbacks.onProgress?.({ processedRows });
      }
    }
  }

  return buildImportResult(rows, processedRows);
}

async function importExcelWorkbook(filePath, callbacks) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("Excel 文件没有可读取的工作表");
  }

  const rows = [];
  let headerMap = null;
  let processedRows = 0;

  worksheet.eachRow((row) => {
    const values = row.values.slice(1);
    if (!headerMap) {
      headerMap = parseHeaderMap(values, callbacks);
      return;
    }

    const normalized = normalizeRow(values, headerMap);
    if (normalized.vipStyleNo && normalized.color) {
      rows.push(normalized);
    }
    processedRows += 1;
    if (processedRows % 1000 === 0) {
      callbacks.onProgress?.({ processedRows });
    }
  });

  return buildImportResult(rows, processedRows);
}

function parseHeaderMap(values, callbacks) {
  const headerMap = buildHeaderMap(values.map((cell) => toText(cell)));
  const missingFields = getMissingRequiredFields(headerMap);
  if (missingFields.length > 0) {
    throw new Error(`缺少必需字段：${missingFields.join(", ")}`);
  }
  callbacks.onHeaders?.({ headerMap });
  return headerMap;
}

function buildImportResult(rows, processedRows) {
  const result = analyzeRows(rows);
  return {
    ...result,
    meta: {
      processedRows,
      importedRows: rows.length,
      generatedAt: new Date().toISOString()
    }
  };
}

function isRecoverableStreamingError(error) {
  return String(error?.message ?? "").includes("sheets");
}

export function normalizeRow(values, headerMap) {
  const value = (field) => values[headerMap[field]];
  const finalPrice = toNumber(value("finalPrice"));
  const currentPrice = toNumber(value("currentPrice"));
  const subsidyAmount = toNumber(value("subsidyAmount"));
  const effectiveFinalPrice = finalPrice || Math.max(0, currentPrice - subsidyAmount);

  return {
    category: toText(value("category")),
    originalStyleNo: toText(value("originalStyleNo")),
    vipStyleNo: toText(value("vipStyleNo")),
    color: toText(value("color")),
    barcode: toText(value("barcode")),
    size: toText(value("size")),
    firstListingDate: toDate(value("firstListingDate")),
    sales30: toNumber(value("sales30")),
    salesAmount30: toNumber(value("salesAmount30")),
    sales7: toNumber(value("sales7")),
    detailUv7: toNumber(value("detailUv7")),
    conversion7: toPercent(value("conversion7")),
    ctr7: toPercent(value("ctr7")),
    exposureUv7: toNumber(value("exposureUv7")),
    erpStock: toNumber(value("erpStock")),
    marketPrice: toNumber(value("marketPrice")),
    discountRate: toPercent(value("discountRate")),
    vipPrice: toNumber(value("vipPrice")),
    costPrice: toNumber(value("costPrice")),
    currentPrice,
    subsidyAmount,
    finalPrice: effectiveFinalPrice,
    image: toText(value("image"))
  };
}
