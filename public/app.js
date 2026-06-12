import { readInventoryFile } from "./src/utils/excel.js";
import { analyzeInventory } from "./src/utils/inventoryAnalysis.js";
import { exportAnalysisWorkbook } from "./src/utils/exportWorkbook.js";

const state = {
  file: null,
  parsed: null,
  result: null,
  keyword: "",
  combo: "",
  issue: "",
  page: 1,
  pageSize: 50
};

const BLOCKED_CALCULATION_TEXT = "缺少近30天销量字段，无法计算";

const metricFields = [
  ["styleCount", "款号数"],
  ["productCount", "商品款色数"],
  ["totalStock", "总库存"],
  ["sales30", "近30天销量"],
  ["salesAmount30", "近30天销售金额"],
  ["longAgeCount", "长售龄款色数"],
  ["brokenSizeCount", "断码款色数"],
  ["hotBrokenCount", "畅销断码款色数"],
  ["lowPriceCount", "低价预警款色数"],
  ["turnoverPressureCount", "库存压力款色数"],
  ["inventoryTurnoverMonths", "总库存周转月数"]
];

const comboFilters = {
  long_broken_slow: "长售龄 + 断码 + 滞销款",
  long_broken_normal: "长售龄 + 断码 + 平销款",
  hot_broken: "畅销款 + 断码"
};

const issueFilters = {
  hot_sale: "畅销款",
  broken_size: "断码",
  long_age: "长售龄",
  slow_sale: "滞销款",
  normal_sale: "平销款",
  new_product: "新品",
  low_price: "低价预警",
  turnover_pressure: "库存压力"
};

const fileButton = document.querySelector("#fileButton");
const fileInput = document.querySelector("#fileInput");
const fileName = document.querySelector("#fileName");
const jobStatus = document.querySelector("#jobStatus");
const dashboard = document.querySelector("#dashboard");
const exportButton = document.querySelector("#exportButton");
const validationPanel = document.querySelector("#validationPanel");
const warningPanel = document.querySelector("#warningPanel");
const categoryPanel = document.querySelector("#categoryPanel");
const viewContent = document.querySelector("#viewContent");
const keywordInput = document.querySelector("#keywordInput");
const comboSelect = document.querySelector("#comboSelect");
const issueSelect = document.querySelector("#issueSelect");
const refreshButton = document.querySelector("#refreshButton");
const slowSaleRulePanel = document.querySelector("#slowSaleRulePanel");
const ruleTrigger = document.querySelector("[data-rule-trigger]");

fileButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  state.file = file;
  state.page = 1;
  fileName.textContent = file.name;
  await runLocalAnalysis(file);
});

exportButton.addEventListener("click", () => {
  if (!state.result) {
    setStatus("请先上传并完成本地分析");
    return;
  }
  exportAnalysisWorkbook(state.result);
  setStatus("分析结果已在浏览器本地导出");
});

keywordInput.addEventListener("input", () => {
  state.keyword = keywordInput.value.trim().toLowerCase();
  state.page = 1;
  renderCurrentView();
});

comboSelect.addEventListener("change", () => {
  state.combo = comboSelect.value;
  state.page = 1;
  renderCurrentView();
});

issueSelect.addEventListener("change", () => {
  state.issue = issueSelect.value;
  state.page = 1;
  renderCurrentView();
});

refreshButton.addEventListener("click", () => {
  state.page = 1;
  if (state.result) renderAll();
});

ruleTrigger.addEventListener("click", () => {
  const shouldOpen = slowSaleRulePanel.classList.contains("hidden");
  slowSaleRulePanel.classList.toggle("hidden", !shouldOpen);
  ruleTrigger.setAttribute("aria-expanded", String(shouldOpen));
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".filter-rule")) {
    slowSaleRulePanel.classList.add("hidden");
    ruleTrigger.setAttribute("aria-expanded", "false");
  }
});

async function runLocalAnalysis(file) {
  try {
    setStatus("正在浏览器本地读取 Excel");
    disableExport();
    const parsed = await readInventoryFile(file);
    setStatus("正在本地识别字段并计算库存指标");
    const result = analyzeInventory(parsed.rows, parsed.fieldMap);
    state.parsed = parsed;
    state.result = result;
    renderAll();
    enableExport();
    setStatus(`本地分析完成：读取 ${parsed.meta.totalRows} 行，导入 ${parsed.meta.importedRows} 行。数据未上传服务器。`);
  } catch (error) {
    state.parsed = null;
    state.result = null;
    renderEmpty(error.message || "分析失败");
    disableExport();
    setStatus(error.message || "分析失败");
  }
}

function renderAll() {
  renderDashboard();
  validationPanel.innerHTML = "";
  warningPanel.innerHTML = "";
  renderCategories();
  renderCurrentView();
}

function renderDashboard() {
  dashboard.innerHTML = metricFields
    .map(
      ([key, label]) =>
        `<div class="metric metric-${key}"><span>${label}</span><strong title="${escapeHtml(formatMetric(state.result.dashboard[key], key))}">${formatMetric(state.result.dashboard[key], key)}</strong></div>`
    )
    .join("");
}

function renderValidation() {
  const validation = state.result.validation;
  validationPanel.innerHTML = `
    <div class="section-title">
      <h2>数据校验</h2>
      <span>${formatNumber(validation.importedRows)} 行标准化数据</span>
    </div>
    <div class="validation-grid">
      ${validation.messages.map((message) => `<div class="validation-item">${escapeHtml(message)}</div>`).join("")}
    </div>
    <div class="core-field-list">
      ${validation.coreFieldStatus
        .map(
          (field) =>
            `<span class="field-status ${field.matched ? "ok" : "missing"}">${escapeHtml(field.label)} ${field.matched ? "✅" : "❌"}</span>`
        )
        .join("")}
    </div>
    <div class="field-list">
      ${validation.matchedFields.map((field) => `<span class="tag">${escapeHtml(field)}</span>`).join("")}
    </div>
  `;
}

function renderWarnings() {
  const warnings = state.result.warnings.slice(0, 8);
  warningPanel.innerHTML = `
    <div class="section-title">
      <h2>库存预警</h2>
      <span>优先显示风险最高的商品</span>
    </div>
    <div class="warning-list">
      ${warnings.length ? warnings.map(renderWarningItem).join("") : `<div class="empty-state compact">暂无库存预警</div>`}
    </div>
  `;
}

function renderWarningItem(item) {
  return `
    <div class="warning-item">
      <strong>${escapeHtml(item.productName || item.sku || item.styleNo || "未命名商品")}</strong>
      <span>${escapeHtml(item.category)} · 可售 ${formatNumber(item.availableStock)} · 近30天 ${formatOptionalNumber(item.sales30)}</span>
      <div class="tag-list">${item.issueTags.map((tag) => `<span class="tag warn">${escapeHtml(tag)}</span>`).join("")}</div>
    </div>
  `;
}

function renderCategories() {
  const rows = state.result.categoryAnalysis.slice(0, 8);
  categoryPanel.innerHTML = `
    <div class="section-title">
      <h2>分类库存分析</h2>
      <span>按可售库存排序</span>
    </div>
    <div class="mini-table">
      <table>
        <thead>
          <tr><th>分类</th><th>商品数</th><th>可售库存</th><th>可售天数</th><th>滞销</th></tr>
        </thead>
        <tbody>${rows.map(renderCategoryRow).join("")}</tbody>
      </table>
    </div>
  `;
}

function renderCategoryRow(item) {
  return `
    <tr>
      <td>${escapeHtml(item.category)}</td>
      <td>${formatNumber(item.productCount)}</td>
      <td>${formatNumber(item.availableStock)}</td>
      <td>${formatSellableDays(item.sellableDays)}</td>
      <td>${formatNumber(item.slowSaleCount)}</td>
    </tr>
  `;
}

function renderCurrentView() {
  if (!state.result) return;
  const filtered = filterItems(state.result.items);
  const pageCount = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.page = Math.min(state.page, pageCount);
  const start = (state.page - 1) * state.pageSize;
  const pageItems = filtered.slice(start, start + state.pageSize);

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
      <tbody>${pageItems.map(renderItemRow).join("")}</tbody>
    </table>
    ${renderPager(filtered.length, pageCount)}
  `;
  bindPager();
}

function renderItemRow(item) {
  const image = item.image ? `<img class="thumbnail" src="${escapeHtml(item.image)}" alt="">` : `<div class="thumbnail"></div>`;
  return `
    <tr>
      <td>${image}</td>
      <td>${escapeHtml(item.category)}</td>
      <td>${escapeHtml(item.originalStyleNo || item.goodsNo || "")}</td>
      <td>${escapeHtml(item.vipStyleNo || item.styleNo || "")}</td>
      <td>${escapeHtml(item.color || "")}</td>
      <td>${escapeHtml(item.sku || "")}</td>
      <td>${escapeHtml(item.size || "")}</td>
      <td>${formatAge(item)}</td>
      <td>${escapeHtml(item.displaySalesTier || item.salesTier || "待判断")}</td>
      <td>${formatOptionalNumber(item.sales30)} 件<br>${formatMoney(item.salesAmount30)}</td>
      <td>${formatNumber(item.availableStock)} 件<br>${formatSellableDays(item.sellableDays)}</td>
      <td>${escapeHtml(item.brokenSize || "无")}</td>
      <td class="replenishment">${formatReplenishment(item.replenishment?.qty30)}</td>
      <td class="replenishment">${formatReplenishment(item.replenishment?.qty60)}</td>
      <td class="replenishment">${formatReplenishment(item.replenishment?.qty90)}</td>
      <td>${formatMoney(item.costPrice)}</td>
      <td>${formatMoney(item.retailPrice)}</td>
      <td><div class="tag-list">${item.issueTags.map((tag) => `<span class="tag ${tagClass(tag)}">${escapeHtml(tag)}</span>`).join("") || `<span class="tag">正常</span>`}</div></td>
      <td class="recommendation">${escapeHtml(item.adviceText)}</td>
    </tr>
  `;
}

function filterItems(items) {
  return items.filter((item) => {
    if (state.keyword) {
      const matchedKeyword = [
        item.productId,
        item.productName,
        item.goodsNo,
        item.originalStyleNo,
        item.vipStyleNo,
        item.styleNo,
        item.color,
        item.sku,
        item.size,
        item.category,
        item.displaySalesTier,
        item.issueTags.join(" "),
        item.adviceText
      ]
      .join(" ")
      .toLowerCase()
      .includes(state.keyword);
      if (!matchedKeyword) return false;
    }
    if (state.combo && !matchesCombo(item, state.combo)) return false;
    if (state.issue && !matchesIssue(item, state.issue)) return false;
    return true;
  });
}

function matchesCombo(item, combo) {
  const isLongAge = item.tagKeys.includes("long_age");
  const isBroken = item.tagKeys.includes("broken_size");
  const isSlow = item.tagKeys.includes("slow_sale") || item.displaySalesTier === "滞销款";
  const isNormal = item.displaySalesTier === "平销款";
  const isHot = item.displaySalesTier === "畅销款";
  if (combo === "long_broken_slow") return isLongAge && isBroken && isSlow;
  if (combo === "long_broken_normal") return isLongAge && isBroken && isNormal;
  if (combo === "hot_broken") return isHot && isBroken;
  return true;
}

function matchesIssue(item, issue) {
  if (issue === "hot_sale") return item.tagKeys.includes("hot_sale");
  if (issue === "broken_size") return item.tagKeys.includes("broken_size");
  if (issue === "long_age") return item.tagKeys.includes("long_age");
  if (issue === "slow_sale") return item.tagKeys.includes("slow_sale") || item.displaySalesTier === "滞销款";
  if (issue === "normal_sale") return item.displaySalesTier === "平销款";
  if (issue === "new_product") return item.tagKeys.includes("new_product");
  if (issue === "low_price") return item.tagKeys.includes("low_price");
  if (issue === "turnover_pressure") return item.tagKeys.includes("turnover_pressure");
  return true;
}

function renderPager(total, pageCount) {
  return `
    <div class="pager">
      <span>第 ${state.page} / ${pageCount} 页，共 ${formatNumber(total)} 条</span>
      <button id="prevPage" type="button" ${state.page <= 1 ? "disabled" : ""}>上一页</button>
      <button id="nextPage" type="button" ${state.page >= pageCount ? "disabled" : ""}>下一页</button>
    </div>
  `;
}

function bindPager() {
  document.querySelector("#prevPage")?.addEventListener("click", () => {
    state.page -= 1;
    renderCurrentView();
  });
  document.querySelector("#nextPage")?.addEventListener("click", () => {
    state.page += 1;
    renderCurrentView();
  });
}

function renderEmpty(message = "上传表格后自动解析并展示分析结果") {
  dashboard.innerHTML = "";
  validationPanel.innerHTML = "";
  warningPanel.innerHTML = "";
  categoryPanel.innerHTML = "";
  viewContent.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function enableExport() {
  exportButton.classList.remove("disabled");
  exportButton.setAttribute("aria-disabled", "false");
}

function disableExport() {
  exportButton.classList.add("disabled");
  exportButton.setAttribute("aria-disabled", "true");
}

function setStatus(text) {
  jobStatus.textContent = text;
}

function tagClass(tag) {
  if (tag.includes("缺货") || tag.includes("滞销")) return "danger";
  if (tag.includes("预警") || tag.includes("积压") || tag.includes("过")) return "warn";
  return "";
}

function formatMetric(value, key) {
  if (value === null || value === undefined) {
    if (key === "inventoryTurnoverMonths" && isSales30Missing()) return BLOCKED_CALCULATION_TEXT;
    if (key === "sales30") return "缺少字段";
    return "无销量";
  }
  if (key === "salesAmount30") return formatMoney(value);
  if (key === "inventoryTurnoverMonths") return formatNumber(value);
  return formatNumber(value);
}

function formatOptionalNumber(value) {
  if (value === null || value === undefined) return "缺少字段";
  return formatNumber(value);
}

function formatDailySales(value) {
  if (value === null || value === undefined) return isSales30Missing() ? BLOCKED_CALCULATION_TEXT : "无销量";
  return formatNumber(value);
}

function formatSellableDays(value) {
  if (value === null || value === undefined) return isSales30Missing() ? BLOCKED_CALCULATION_TEXT : "无销量";
  return `${formatNumber(value)} 天`;
}

function formatAge(item) {
  const days = item.listingAgeDays === null || item.listingAgeDays === undefined ? "-" : `${formatNumber(item.listingAgeDays)} 天`;
  return `${days}<br>${escapeHtml(item.firstListingDate || "")}`;
}

function formatReplenishment(value) {
  if (value === null || value === undefined || Number(value) <= 0) return "-";
  return formatNumber(value);
}

function isSales30Missing() {
  return state.result?.validation?.hasSales30 === false;
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value ?? 0);
}

function formatMoney(value) {
  return `¥${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value ?? 0)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

renderEmpty();
