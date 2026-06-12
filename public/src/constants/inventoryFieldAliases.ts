export const INVENTORY_FIELD_ALIASES = {
  productId: {
    label: "商品ID",
    aliases: ["商品ID", "商品id", "商品编号", "商品编码", "SPU ID", "SPUID", "Item ID", "Product ID"]
  },
  productName: {
    label: "商品名称",
    aliases: ["商品名称", "商品名", "产品名称", "宝贝标题", "标题", "品名", "名称", "Product Name", "Item Name", "Goods Name"]
  },
  goodsNo: {
    label: "货号",
    aliases: ["货号", "商品货号", "产品货号", "货品编号", "Goods No", "Item No"]
  },
  originalStyleNo: {
    label: "原款号",
    aliases: ["原款号", "原始款号", "原商品款号", "Original Style No"]
  },
  vipStyleNo: {
    label: "唯品款号",
    aliases: ["唯品款号", "唯品会款号", "VIP款号", "Vip Style No"]
  },
  styleNo: {
    label: "款号",
    aliases: ["款号", "商品款号", "款式编码", "SPU", "Style No", "Style"]
  },
  color: {
    label: "颜色",
    aliases: ["颜色", "商品颜色", "色号", "Color"]
  },
  sku: {
    label: "SKU",
    aliases: ["SKU", "SKU编码", "SKU ID", "商品SKU", "规格编码", "商家编码", "条形码", "商品条形码", "Barcode"]
  },
  size: {
    label: "尺码",
    aliases: ["尺码", "规格", "规格名称", "Size"]
  },
  image: {
    label: "图片",
    aliases: ["图片", "颜色图片", "图片链接", "商品图片", "主图", "Image", "Image URL"]
  },
  category: {
    label: "分类",
    aliases: ["分类", "三级分类", "品类", "类目", "商品分类", "商品类目", "一级分类", "二级分类", "Category", "Product Category"]
  },
  stockQty: {
    label: "库存数量",
    aliases: ["库存数量", "库存", "总库存", "库存数", "库存件数", "ERP库存", "实际库存", "Stock Qty", "Stock Quantity", "Total Stock", "Inventory Qty"]
  },
  availableStock: {
    label: "可售库存",
    aliases: ["可售库存", "可售", "可用库存", "可销售库存", "可卖库存", "现货库存", "Available Stock", "Sellable Stock", "Available Qty"]
  },
  lockedStock: {
    label: "锁定库存",
    aliases: ["锁定库存", "占用库存", "冻结库存", "锁库数量", "Locked Stock", "Reserved Stock", "Frozen Stock"]
  },
  inTransitStock: {
    label: "在途库存",
    aliases: ["在途库存", "在途数量", "采购在途", "调拨在途", "In Transit Stock", "Transit Stock", "On The Way"]
  },
  salesQty: {
    label: "销售量",
    aliases: ["销售量", "销量", "累计销量", "销售数量", "Sales Qty", "Sales Quantity"]
  },
  sales7: {
    label: "近7天销量",
    aliases: ["近7天销量", "7天销量", "近7日销量", "7日销量", "周销量", "近7天销售量", "最近7天销量", "Sales 7", "7 Day Sales", "Last 7 Days Sales", "Sales7"]
  },
  sales30: {
    label: "近30天销量",
    aliases: ["近30天销量", "30天销量", "近30日销量", "30日销量", "月销量", "近30天销售量", "最近30天销量", "Sales 30", "30 Day Sales", "Last 30 Days Sales", "Sales30"]
  },
  salesAmount30: {
    label: "近30天销售金额",
    aliases: ["近30天销售额", "近30天销售金额", "30天销售额", "30日销售额", "月销售额", "Sales Amount 30", "30 Day Sales Amount"]
  },
  dailySales: {
    label: "日均销量",
    aliases: ["日均销量", "日销", "平均日销", "日均销售", "平均日销量", "日均动销", "Daily Sales", "Avg Daily Sales", "Average Daily Sales"]
  },
  sellableDays: {
    label: "库存可售天数",
    aliases: ["库存可售天数", "可售天数", "库存周转天数", "可销售天数", "周转天数", "Sellable Days", "Days Of Supply"]
  },
  costPrice: {
    label: "成本价",
    aliases: ["成本价", "成本", "采购价", "进货价", "Cost Price", "Cost"]
  },
  retailPrice: {
    label: "零售价",
    aliases: ["零售价", "销售价", "售价", "最终到手价", "到手价", "活动价", "Retail Price", "Sale Price"]
  },
  tagPrice: {
    label: "吊牌价",
    aliases: ["吊牌价", "市场价", "标价", "原价", "Tag Price", "List Price"]
  },
  stockAmount: {
    label: "库存金额",
    aliases: ["库存金额", "库存成本金额", "库存价值", "库存成本", "总库存金额", "Stock Amount", "Inventory Amount"]
  },
  firstListingDate: {
    label: "首次上架时间",
    aliases: ["首次上架时间", "首次上架日期", "上架时间", "上架日期", "创建时间", "First Listing Date", "Listing Date", "Created Date"]
  },
  productStatus: {
    label: "商品状态",
    aliases: ["商品状态", "状态", "上下架状态", "售卖状态", "Status", "Product Status"]
  }
};

export const CORE_INVENTORY_FIELDS = ["sales30", "sales7", "availableStock", "dailySales"];
