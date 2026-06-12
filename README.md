# 商品库存分析

本项目是一个本地网页工具，用于上传 Excel 表格并按款色与尺码分析商品库存、销售表现、断码风险、周转压力和补货处理建议。

## 功能

- 上传 `.xlsx` 表格并在本地完成分析。
- 按 `唯品款号 + 颜色` 聚合款色数据。
- 按 `商品条形码 + 尺码` 展示 SKU 明细。
- 统计总览指标：款号数、商品款色数、总库存、近30天销量、近30天销售金额、长售龄款色数、断码款色数、畅销断码款色数、低价预警款色数、周转压力款色数、总库存周转月数。
- 支持组合筛选：长售龄 + 断码 + 滞销款、长售龄 + 断码 + 平销款、畅销款 + 断码。
- 针对畅销款和平销款中的高销量尺码，输出 30 天、60 天、90 天补货建议。
- 导出 Excel 报告，包含总览和商品分析明细。

## 目录结构

```text
.
├─ public/              # 前端静态页面
├─ server/
│  ├─ src/              # 后端服务、导入、分析和导出逻辑
│  └─ tests/            # Node.js 测试
├─ data/                # 运行时分析结果，默认不提交
├─ uploads/             # 上传文件，默认不提交
├─ outputs/             # 导出报告，默认不提交
├─ work/                # 临时验证文件，默认不提交
├─ package.json
└─ package-lock.json
```

## 安装与运行

```powershell
npm ci
npm run dev
```

打开：

```text
http://127.0.0.1:5173/
```

也可以双击项目根目录下的 `start-local.bat` 一键启动本地开发服务。脚本会自动进入当前项目目录、执行 `npm run dev`，并在本地页面可访问后打开默认地址：

```text
http://127.0.0.1:5173/
```

`127.0.0.1` 是本机开发地址，只能用于当前电脑本地测试。电脑关机、重启，或关闭运行 `npm run dev` 的终端窗口后，本地服务会停止。

重新开机后，需要再次运行：

```powershell
start-local.bat
```

或：

```powershell
npm run dev
```

首次启动可能需要几十秒。如果 `5173` 端口被占用，Vite 会在终端里输出新的实际访问地址，请以终端显示为准。项目未完成前先使用本地地址测试，完成后再部署。

## 环境变量

本地可复制 `.env.example` 为 `.env` 后按需调整；`.env` 不提交到 Git。

| 变量 | 默认值 | 说明 |
|---|---:|---|
| `PORT` | `3000` | 服务监听端口；Railway 会自动注入。 |
| `RUNTIME_DIR` | 项目根目录 | 上传文件、分析结果、导出报告的运行目录。 |
| `RAILWAY_VOLUME_MOUNT_PATH` | 空 | Railway 绑定 Volume 后自动注入；未设置 `RUNTIME_DIR` 时优先使用。 |
| `MAX_UPLOAD_BYTES` | `2147483648` | 单个 `.xlsx` 上传文件大小限制，默认 2GB。 |
| `REQUEST_TIMEOUT_MS` | `1800000` | 请求超时时间，默认 30 分钟。 |

## Railway 部署

项目已包含 `railway.json`，Railway 会使用 Railpack 构建，并通过 `npm start` 启动 Express 服务。

### Railway 配置建议

- Start Command：`npm start`
- Healthcheck Path：`/health`
- Volume Mount Path：`/app/runtime`
- 环境变量：

```text
MAX_UPLOAD_BYTES=2147483648
REQUEST_TIMEOUT_MS=1800000
```

`PORT` 不需要手动设置，Railway 会自动注入。绑定 Volume 后，Railway 会注入 `RAILWAY_VOLUME_MOUNT_PATH`，项目会自动把 `uploads/`、`data/`、`outputs/` 写入该挂载目录。未绑定 Volume 时，这些运行数据会写入容器文件系统，重新部署后可能丢失。

### Railway 操作步骤

1. 打开 Railway，选择 `New Project`。
2. 选择 `Deploy from GitHub repo`，授权并选择 `xiaowei88-zheng/inventory-analysis`。
3. 创建服务后进入 `Variables`，新增：

```text
MAX_UPLOAD_BYTES=2147483648
REQUEST_TIMEOUT_MS=1800000
```

4. 进入 `Settings` 或 `Volumes`，新增 Volume，挂载到：

```text
/app/runtime
```

5. Volume 绑定完成后，Railway 会自动生成 `RAILWAY_VOLUME_MOUNT_PATH=/app/runtime`。如果没有自动生成，则在 `Variables` 手动新增：

```text
RUNTIME_DIR=/app/runtime
```

6. 确认部署配置：

```text
Start Command: npm start
Healthcheck Path: /health
```

7. 等待部署完成，打开 Railway 生成的公网域名。
8. 上传小体积 `.xlsx` 文件验证：开始分析、查看总览、导出报告。

### 生产注意事项

- 大文件上传会占用较多内存、CPU 和磁盘，Railway 套餐资源不足时需要升级实例规格。
- 导出报告目前通过 `/outputs` 静态访问；公网使用时建议后续增加登录鉴权或导出文件访问控制。
- `uploads/`、`data/`、`outputs/` 都必须落在 Volume 中，才能保证 Railway 重启或重新部署后文件不丢失。
- 分析任务状态仍保存在进程内存中，服务重启会丢失进行中的任务状态；已完成结果和导出报告会保存在 Volume 中。

## Excel 字段

必需字段：

- `三级分类`
- `唯品款号`
- `颜色`
- `商品条形码`
- `尺码`
- `首次上架时间`
- `近30天销量`
- `ERP库存`
- `最终到手价`

建议字段：

- `原款号`
- `近30天销售金额`
- `成本价`

可选字段：

- `近7天销量`
- `近7天商品详情UV`
- `近7天转化率`
- `近7天CTR`
- `近7天曝光UV`
- `市场价`
- `折扣比`
- `唯品价`
- `当前活动价`
- `补贴金额`
- `颜色图片` 或 `图片链接`

## 分析口径

- 主粒度：`唯品款号 + 颜色`
- 明细粒度：`商品条形码 + 尺码`
- 销售分层：同一三级分类内按近30天销量分位划分，Top 20% 为畅销款，其余为平销款；滞销款不再按分位直接产生，必须满足单独的滞销规则。
- 上架天数：按分析日期与 `首次上架时间` 的自然日差计算；上架 ≤7 天标记为“新品观察期”，上架 8~30 天按新品保护展示，不标记滞销。
- 滞销规则：滞销款必须同时满足上架超过 30 天、近 7 天销量为 0、当前有库存且周转天数为空或大于 90 天；上架 30 天内的新品在页面和导出报告中显示为“新品”，不显示“滞销款”。
- 断码：同一唯品款号下推断应有尺码；某颜色缺少该尺码或该尺码 ERP 库存为 0，则该尺码断码。
- 总库存周转月数：`总库存 / 近30天销量`。
- SKU 周转天数：`当前尺码库存 / (当前尺码近30天销量 / 30)`。
- 近30天销售金额：按尺码汇总实际销售金额，金额为 0 或缺失时不估算。
- 补货建议：只针对畅销款和平销款；滞销款不输出补货数量建议。

## 验证

```powershell
npm test
npm run check
```

## Git 提交说明

以下目录只作为本地运行数据使用，不提交到 Git：

- `node_modules/`
- `uploads/`
- `data/`
- `outputs/`
- `work/`
- `.env` / `.env.*`
