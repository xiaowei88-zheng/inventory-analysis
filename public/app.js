const state = {
  jobId: "",
  view: "analysis",
  page: 1,
  pageSize: 50,
  lastPageTotal: 0,
  filterStats: null
};

const issueLabels = {
  hot_sale: "畅销款",
  broken_size: "断码",
  long_age: "长售龄",
  slow_sale: "滞销款",
  normal_sale: "平销款",
  low_price: "低价预警",
  turnover_pressure: "周转压力"
};

const comboLabels = {
  long_broken_slow: "长售龄 + 断码 + 滞销款",
  long_broken_normal: "长售龄 + 断码 + 平销款",
  hot_broken: "畅销款 + 断码"
};

const dashboardFields = [
  ["styleCount", "款号数"],
  ["productCount", "商品款色数"],
  ["totalStock", "总库存"],
  ["sales30", "近30天销量"],
  ["salesAmount30", "近30天销售金额"],
  ["longAgeCount", "长售龄款色数"],
  ["brokenSizeCount", "断码款色数"],
  ["hotBrokenCount", "畅销断码款色数"],
  ["lowPriceCount", "低价预警款色数"],
  ["turnoverPressureCount", "周转压力款色数"],
  ["inventoryTurnoverMonths", "总库存周转月数"]
];

const uploadForm = document.querySelector("#uploadForm");
const fileButton = document.querySelector("#fileButton");
const fileInput = document.querySelector("#fileInput");
const fileName = document.querySelector("#fileName");
const jobStatus = document.querySelector("#jobStatus");
const dashboard = document.querySelector("#dashboard");
const exportLink = document.querySelector("#exportLink");
const viewContent = document.querySelector("#viewContent");
const keywordInput = document.querySelector("#keywordInput");
const comboSelect = document.querySelector("#comboSelect");
const issueSelect = document.querySelector("#issueSelect");
const filters = document.querySelector("#filters");

fileButton.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  fileName.textContent = fileInput.files[0]?.name ?? "未选择文件";
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!fileInput.files[0]) {
    setStatus("请先选择 .xlsx 文件");
    return;
  }

  const formData = new FormData();
  formData.append("file", fileInput.files[0]);
  setStatus("正在上传文件");

  const response = await fetch("/api/import", { method: "POST", body: formData });
  const payload = await response.json();
  if (!response.ok) {
    setStatus(payload.error || "上传失败");
    return;
  }

  state.jobId = payload.jobId;
  disableExport();
  pollJob();
});

exportLink.addEventListener("click", (event) => {
  event.preventDefault();
  if (exportLink.getAttribute("aria-disabled") === "true") {
    setStatus("请先上传并完成分析后再导出");
    return;
  }
  exportCurrentReport();
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.view = button.dataset.view;
    state.page = 1;
    loadCurrentView();
  });
});

document.querySelector("#refreshButton").addEventListener("click", () => {
  state.page = 1;
  loadCurrentView();
});

[keywordInput, comboSelect, issueSelect].forEach((control) => {
  control.addEventListener("change", () => {
    state.page = 1;
    loadCurrentView();
  });
});

keywordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    state.page = 1;
    loadCurrentView();
  }
});

async function pollJob() {
  const response = await fetch(`/api/jobs/${state.jobId}`);
  const job = await response.json();
  if (!response.ok) {
    setStatus(job.error || "任务查询失败");
    return;
  }

  setStatus(`${job.message}；已处理 ${job.processedRows ?? 0} 行`);
  if (job.status === "done") {
    setStatus(`分析完成；导入 ${job.importedRows} 行`);
    enableExport(state.jobId);
    await loadDashboard();
    await loadCurrentView();
    return;
  }
  if (job.status === "failed") {
    setStatus(job.error || "分析失败");
    return;
  }

  window.setTimeout(pollJob, 1200);
}

function enableExport(jobId) {
  exportLink.dataset.jobId = jobId;
  exportLink.classList.remove("disabled");
  exportLink.setAttribute("aria-disabled", "false");
  exportLink.textContent = "导出报告";
}

function disableExport() {
  delete exportLink.dataset.jobId;
  exportLink.classList.add("disabled");
  exportLink.setAttribute("aria-disabled", "true");
  exportLink.textContent = "导出报告";
}

async function exportCurrentReport() {
  const jobId = exportLink.dataset.jobId || state.jobId;
  if (!jobId) {
    setStatus("请先上传并完成分析后再导出");
    return;
  }

  try {
    exportLink.textContent = "正在导出...";
    exportLink.setAttribute("aria-busy", "true");
    const response = await fetch(`/api/export/${jobId}`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "导出失败");
    }

    const blob = await response.blob();
    const outputUrl = response.headers.get("X-Output-Url") || "";
    const outputName = outputUrl ? decodeURIComponent(outputUrl.split("/").pop() || "") : "";
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `商品库存分析-${jobId}.xlsx`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus(outputName ? `报告已导出并保存到 outputs/${outputName}` : "报告已导出");
  } catch (error) {
    setStatus(error.message || "导出失败");
  } finally {
    exportLink.textContent = "导出报告";
    exportLink.removeAttribute("aria-busy");
  }
}

async function loadDashboard() {
  if (!state.jobId) return;
  const response = await fetch(`/api/dashboard/${state.jobId}`);
  const payload = await response.json();
  if (!response.ok) {
    setStatus(payload.error || "读取看板失败");
    return;
  }

  dashboard.innerHTML = dashboardFields
    .map(([key, label]) => `<div class="metric"><span>${label}</span><strong>${formatDashboardValue(payload.dashboard[key])}</strong></div>`)
    .join("");
  state.filterStats = payload.dashboard.filterStats;
  updateFilterLabels();
}

async function loadCurrentView() {
  if (!state.jobId) return;
  await loadProductTable();
}

async function loadProductTable() {
  const query = new URLSearchParams({
    page: String(state.page),
    pageSize: String(state.pageSize),
    keyword: keywordInput.value.trim(),
    combo: comboSelect.value,
    issue: issueSelect.value
  });
  const response = await fetch(`/api/products/${state.jobId}?${query}`);
  const payload = await response.json();
  if (!response.ok) {
    setStatus(payload.error || "读取数据失败");
    return;
  }
  state.lastPageTotal = payload.total;

  viewContent.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>图片</th>
          <th>三级分类</th>
          <th>原款号</th>
          <th>唯品款号</th>
          <th>颜色</th>
          <th>商品条形码</th>
          <th>尺码</th>
          <th>售龄</th>
          <th>销售分层</th>
          <th>销量/金额</th>
          <th>库存/周转</th>
          <th>断码</th>
          <th>30天补货建议</th>
          <th>60天补货建议</th>
          <th>90天补货建议</th>
          <th>成本价</th>
          <th>最终到手价</th>
          <th>问题标签</th>
          <th>建议动作</th>
        </tr>
      </thead>
      <tbody>${payload.items.flatMap(renderProductRows).join("")}</tbody>
    </table>
    ${renderPager(payload)}
  `;
  bindPager();
}

function renderProductRows(product) {
  const pairs = product.sizeBarcodePairs ?? [];
  const skuRows = pairs.flatMap((pair) =>
    pair.barcodes.length
      ? pair.barcodes.map((barcode) => renderProductRow(product, pair.size, barcode))
      : [renderProductRow(product, pair.size, "")]
  );
  return skuRows.length ? skuRows : [renderProductRow(product, "", "")];
}

function renderProductRow(product, size, barcode) {
  const img = product.image ? `<img class="thumbnail" src="${escapeHtml(product.image)}" alt="">` : `<div class="thumbnail"></div>`;
  const sizeStock = Number(product.sizeStock?.[size]) || 0;
  const sizeSales30 = Number(product.sizeSales30?.[size]) || 0;
  const sizeSalesAmount30 = Number(product.sizeSalesAmount30?.[size]) || 0;
  const sizeTurnoverDays = sizeSales30 > 0 ? Math.round((sizeStock / (sizeSales30 / 30)) * 100) / 100 : null;
  const sizeCostPrice = Number(product.sizeCostPrice?.[size]) || 0;
  const sizeFinalPrice = Number(product.sizeFinalPrice?.[size]) || product.minFinalPrice;
  const isBrokenSize = Boolean(size) && sizeStock <= 0;
  const suggestion = (product.replenishmentSuggestions ?? []).find((item) => item.size === size);
  const issueTags = buildSizeIssueTags(product, {
    sales30: sizeSales30,
    turnoverDays: sizeTurnoverDays,
    isBroken: isBrokenSize,
    suggestion
  });
  const recommendation = buildSizeRecommendation(product, {
    size,
    sales30: sizeSales30,
    stock: sizeStock,
    turnoverDays: sizeTurnoverDays,
    isBroken: isBrokenSize,
    suggestion
  });
  return `
    <tr>
      <td>${img}</td>
      <td>${escapeHtml(product.category)}</td>
      <td>${escapeHtml(product.originalStyleNo)}</td>
      <td>${escapeHtml(product.vipStyleNo)}</td>
      <td>${escapeHtml(product.color)}</td>
      <td>${escapeHtml(barcode)}</td>
      <td>${escapeHtml(size)}</td>
      <td>${product.ageDays ?? "-"} 天<br>${escapeHtml(product.firstListingDate || "")}</td>
      <td>${escapeHtml(product.salesTier)}</td>
      <td>${formatNumber(sizeSales30)} 件<br>${formatMoney(sizeSalesAmount30)}</td>
      <td>${formatNumber(sizeStock)} 件<br>${sizeTurnoverDays === null ? "无销量" : `${sizeTurnoverDays} 天`}</td>
      <td>${isBrokenSize ? escapeHtml(size) : "无"}</td>
      <td class="replenishment">${suggestion ? formatNumber(suggestion.qty30) : "-"}</td>
      <td class="replenishment">${suggestion ? formatNumber(suggestion.qty60) : "-"}</td>
      <td class="replenishment">${suggestion ? formatNumber(suggestion.qty90) : "-"}</td>
      <td>${formatMoney(sizeCostPrice)}</td>
      <td>${formatMoney(sizeFinalPrice)}</td>
      <td><div class="tag-list">${issueTags.map(renderTag).join("")}</div></td>
      <td class="recommendation">${escapeHtml(recommendation)}</td>
    </tr>
  `;
}

function buildSizeIssueTags(product, sku) {
  const tags = [product.salesTier];
  if (sku.isBroken) tags.push("当前尺码断码");
  if (sku.suggestion) tags.push("建议补货");
  if (sku.turnoverDays !== null && sku.turnoverDays < 30) tags.push("周转小于30天");
  if (sku.turnoverDays !== null && sku.turnoverDays > 90) tags.push("周转偏慢");
  if (!sku.sales30) tags.push("近30天无销量");
  if (product.issueTags.includes("low_price")) tags.push("low_price");
  if (product.issueTags.includes("long_age")) tags.push("long_age");
  return [...new Set(tags.filter(Boolean))];
}

function buildSizeRecommendation(product, sku) {
  if (!sku.size) {
    return product.recommendation;
  }

  const profitHint = product.issueTags.includes("low_price") ? "；价格低于底线，补货前先检查利润空间" : "";

  if (product.issueTags.includes("slow_sale")) {
    if (sku.isBroken) {
      return "当前尺码断码，滞销款不建议补货，优先清仓、组合促销或降低库存风险";
    }
    if (!sku.sales30 || sku.turnoverDays === null || sku.turnoverDays > 90) {
      return "当前尺码周转慢，优先促销、调价或清库存";
    }
    return "滞销款不建议补货，保持观察";
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

  if (sku.turnoverDays !== null && sku.turnoverDays > 90) {
    return "当前尺码周转偏慢，优先消化库存";
  }

  return "当前尺码库存暂可观察";
}

function renderTag(tag) {
  const label = issueLabels[tag] ?? tag;
  const cls = tag === "low_price" || tag === "turnover_pressure" || tag === "周转偏慢" ? "warn" : tag === "broken_size" || tag === "当前尺码断码" ? "danger" : "";
  return `<span class="tag ${cls}">${label}</span>`;
}

function renderPager(payload) {
  const pageCount = Math.max(1, Math.ceil(payload.total / payload.pageSize));
  return `
    <div class="pager">
      <span>第 ${payload.page} / ${pageCount} 页，共 ${payload.total} 条</span>
      <button id="prevPage" type="button" ${payload.page <= 1 ? "disabled" : ""}>上一页</button>
      <button id="nextPage" type="button" ${payload.page >= pageCount ? "disabled" : ""}>下一页</button>
    </div>
  `;
}

function bindPager() {
  document.querySelector("#prevPage")?.addEventListener("click", () => {
    state.page -= 1;
    loadCurrentView();
  });
  document.querySelector("#nextPage")?.addEventListener("click", () => {
    state.page += 1;
    loadCurrentView();
  });
}

function updateFilterLabels() {
  const stats = state.filterStats;
  if (!stats) return;

  comboSelect.innerHTML = [
    `<option value="">全部商品 ${formatPercent(stats.total.share)}（${formatNumber(stats.total.count)}）</option>`,
    ...Object.entries(comboLabels).map(([value, label]) => {
      const item = stats.combos[value] ?? { count: 0, share: 0 };
      return `<option value="${value}">${label} ${formatPercent(item.share)}（${formatNumber(item.count)}）</option>`;
    })
  ].join("");

  issueSelect.innerHTML = [
    `<option value="">全部单项问题 ${formatPercent(stats.total.share)}（${formatNumber(stats.total.count)}）</option>`,
    ...Object.entries(issueLabels).map(([value, label]) => {
      const item = stats.issues[value] ?? { count: 0, share: 0 };
      return `<option value="${value}">${label} ${formatPercent(item.share)}（${formatNumber(item.count)}）</option>`;
    })
  ].join("");
}

function setStatus(text) {
  jobStatus.textContent = text;
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(value ?? 0);
}

function formatDashboardValue(value) {
  return value === null || value === undefined ? "-" : formatNumber(value);
}

function formatMoney(value) {
  return `¥${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value ?? 0)}`;
}

function formatPercent(value) {
  return `${Math.round((value ?? 0) * 100)}%`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
