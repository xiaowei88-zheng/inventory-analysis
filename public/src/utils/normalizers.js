const excelEpoch = new Date(Date.UTC(1899, 11, 30));

export function toText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value)
    .replace(/,/g, "")
    .replace(/￥|¥/g, "")
    .replace(/%/g, "")
    .trim();
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const text = String(value).trim();
  const parsed = new Date(text.replace(/\./g, "-").replace(/\//g, "-"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function dateToIso(date) {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}
