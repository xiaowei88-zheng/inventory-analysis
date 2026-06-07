const excelEpoch = new Date(Date.UTC(1899, 11, 30));

export function toText(value) {
  const raw = unwrapCellValue(value);
  if (raw === null || raw === undefined) {
    return "";
  }
  return String(raw).trim();
}

export function toNumber(value) {
  const raw = unwrapCellValue(value);
  if (raw === null || raw === undefined || raw === "") {
    return 0;
  }

  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : 0;
  }

  const text = String(raw)
    .replace(/,/g, "")
    .replace(/￥/g, "")
    .replace(/¥/g, "")
    .replace(/%/g, "")
    .trim();
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toDate(value) {
  const raw = unwrapCellValue(value);
  if (!raw) {
    return null;
  }

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw;
  }

  if (typeof raw === "number") {
    const date = new Date(excelEpoch.getTime() + raw * 24 * 60 * 60 * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const text = String(raw).trim();
  const normalized = text.replace(/\./g, "-").replace(/\//g, "-");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toPercent(value) {
  const raw = unwrapCellValue(value);
  if (raw === null || raw === undefined || raw === "") {
    return 0;
  }
  if (typeof raw === "number") {
    return raw <= 1 ? raw : raw / 100;
  }
  const text = String(raw).trim();
  const numeric = toNumber(text);
  return text.includes("%") || numeric > 1 ? numeric / 100 : numeric;
}

export function unwrapCellValue(value) {
  if (value && typeof value === "object") {
    if (value.result !== undefined) {
      return value.result;
    }
    if (value.text !== undefined) {
      return value.text;
    }
    if (value.richText && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? "").join("");
    }
    if (value.hyperlink && value.text) {
      return value.text;
    }
  }
  return value;
}

export function dateToIso(date) {
  if (!date) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}
