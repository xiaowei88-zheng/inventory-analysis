import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import multer from "multer";
import { importExcel } from "./excelImport.js";
import { createExportWorkbook } from "./exportReport.js";
import { ensureRuntimeDirs, loadJobResult, outputsDir, rootDir, saveJobResult, uploadDir } from "./storage.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const maxUploadBytes = parsePositiveInteger(process.env.MAX_UPLOAD_BYTES, 2 * 1024 * 1024 * 1024);
const requestTimeoutMs = parsePositiveInteger(process.env.REQUEST_TIMEOUT_MS, 30 * 60 * 1000);
const jobs = new Map();

await ensureRuntimeDirs();

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
    }
  }),
  limits: {
    fileSize: maxUploadBytes
  },
  fileFilter: (_req, file, cb) => {
    if (/\.xlsx$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("只支持 .xlsx 文件"));
    }
  }
});

app.use(express.json());
app.use(express.static(path.join(rootDir, "public")));
app.use("/outputs", express.static(outputsDir));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/import", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "请上传 Excel 文件" });
    return;
  }

  const jobId = crypto.randomUUID();
  const job = {
    id: jobId,
    status: "running",
    fileName: req.file.originalname,
    processedRows: 0,
    importedRows: 0,
    message: "开始解析 Excel",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  jobs.set(jobId, job);

  runImportJob(jobId, req.file.path);
  res.json({ jobId });
});

app.get("/api/jobs/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "任务不存在" });
    return;
  }
  res.json(job);
});

app.get("/api/dashboard/:jobId", async (req, res, next) => {
  try {
    const result = await loadJobResult(req.params.jobId);
    res.json({ dashboard: result.dashboard, meta: result.meta });
  } catch (error) {
    next(error);
  }
});

app.get("/api/products/:jobId", async (req, res, next) => {
  try {
    const result = await loadJobResult(req.params.jobId);
    const filtered = filterProducts(result.products, req.query);
    res.json(paginate(filtered, req.query));
  } catch (error) {
    next(error);
  }
});

app.get("/api/issues/:jobId", async (req, res, next) => {
  try {
    const result = await loadJobResult(req.params.jobId);
    const filtered = filterProducts(result.issues, req.query);
    res.json(paginate(filtered, req.query));
  } catch (error) {
    next(error);
  }
});

app.get("/api/price-bands/:jobId", async (req, res, next) => {
  try {
    const result = await loadJobResult(req.params.jobId);
    res.json({ items: result.priceBands });
  } catch (error) {
    next(error);
  }
});

app.get("/api/export/:jobId", async (req, res, next) => {
  try {
    const result = await loadJobResult(req.params.jobId);
    const workbook = await createExportWorkbook(result);
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `商品库存分析-${req.params.jobId}.xlsx`;
    const outputPath = path.join(outputsDir, fileName);
    await fs.writeFile(outputPath, Buffer.from(buffer));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader("X-Output-Url", `/outputs/${encodeURIComponent(fileName)}`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  if (error.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: `文件超过上传限制：${formatBytes(maxUploadBytes)}` });
    return;
  }
  res.status(500).json({ error: error.message || "服务器错误" });
});

const server = app.listen(port, () => {
  console.log(`Inventory analyzer is running at http://localhost:${port}`);
});
server.requestTimeout = requestTimeoutMs;

async function runImportJob(jobId, filePath) {
  const job = jobs.get(jobId);
  try {
    const result = await importExcel(filePath, {
      onProgress: ({ processedRows }) => {
        updateJob(jobId, { processedRows, message: `已解析 ${processedRows} 行` });
      },
      onHeaders: () => updateJob(jobId, { message: "字段识别完成，正在读取数据" })
    });
    await saveJobResult(jobId, result);
    Object.assign(job, {
      status: "done",
      processedRows: result.meta.processedRows,
      importedRows: result.meta.importedRows,
      message: "分析完成",
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    Object.assign(job, {
      status: "failed",
      error: error.message,
      message: "分析失败",
      updatedAt: new Date().toISOString()
    });
  }
}

function updateJob(jobId, patch) {
  const job = jobs.get(jobId);
  if (job) {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  }
}

function filterProducts(products, query) {
  const keyword = String(query.keyword ?? "").trim().toLowerCase();
  const issue = String(query.issue ?? "").trim();
  const combo = String(query.combo ?? "").trim();
  const tier = String(query.tier ?? "").trim();
  const category = String(query.category ?? "").trim();

  return products.filter((product) => {
    if (keyword) {
      const haystack = [product.category, product.vipStyleNo, product.color, product.recommendation].join(" ").toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    if (issue && !product.issueTags.includes(issue)) return false;
    if (combo && !matchesCombo(product, combo)) return false;
    if (tier && product.salesTier !== tier) return false;
    if (category && product.category !== category) return false;
    return true;
  });
}

function matchesCombo(product, combo) {
  const tags = new Set(product.issueTags);
  if (combo === "long_broken_slow") {
    return tags.has("long_age") && tags.has("broken_size") && tags.has("slow_sale");
  }
  if (combo === "long_broken_normal") {
    return tags.has("long_age") && tags.has("broken_size") && tags.has("normal_sale");
  }
  if (combo === "hot_broken") {
    return tags.has("hot_sale") && tags.has("broken_size");
  }
  return true;
}

function paginate(items, query) {
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const pageSize = Math.min(200, Math.max(10, Number.parseInt(query.pageSize ?? "50", 10) || 50));
  const start = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    total: items.length,
    items: items.slice(start, start + pageSize)
  };
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatBytes(bytes) {
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)}GB`;
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)}MB`;
}
