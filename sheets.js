// sheets.js
// 負責讀取商品清單、寫入訂單到 Google Sheets

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// 建立認證
function getAuth() {
  return new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// 取得試算表物件
async function getDoc() {
  const auth = getAuth();
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
  await doc.loadInfo();
  return doc;
}

/**
 * 讀取所有商品
 * 預期 Sheet 名稱: "商品"
 * 欄位: 分類 | 商品編號 | 商品名稱 | 價格 | 圖片網址 | 說明 | 上架狀態
 * 上架狀態填 "上架" 才會顯示給客人
 */
async function getProducts() {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['商品'];
  const rows = await sheet.getRows();

  return rows
    .filter((row) => row.get('上架狀態') === '上架')
    .map((row) => ({
      category: row.get('分類'),
      id: row.get('商品編號'),
      name: row.get('商品名稱'),
      price: Number(row.get('價格')),
      image: row.get('圖片網址'),
      description: row.get('說明') || '',
    }));
}

/**
 * 取得所有分類(去重複,保持原順序)
 */
async function getCategories() {
  const products = await getProducts();
  const categories = [];
  for (const p of products) {
    if (!categories.includes(p.category)) {
      categories.push(p.category);
    }
  }
  return categories;
}

/**
 * 依分類取得商品
 */
async function getProductsByCategory(category) {
  const products = await getProducts();
  return products.filter((p) => p.category === category);
}

/**
 * 依商品編號取得單一商品
 */
async function getProductById(id) {
  const products = await getProducts();
  return products.find((p) => p.id === id);
}

/**
 * 寫入一筆新訂單
 * Sheet 名稱: "訂單"
 * 欄位: 訂單編號 | 時間 | LINE使用者ID | 商品明細 | 總金額 | 付款狀態 | 付款方式 | 配送方式 | 姓名 | 電話 | 地址/門市 | 備註 | 出貨備註 | 出貨狀態
 */
async function createOrder(order) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['訂單'];

  await sheet.addRow({
    訂單編號: order.orderId,
    時間: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
    LINE使用者ID: order.userId,
    商品明細: order.itemsText,
    總金額: order.totalAmount,
    付款狀態: order.paymentStatus || '待付款',
    付款方式: '',
    配送方式: order.deliveryMethod || '',
    姓名: order.name || '',
    電話: order.phone || '',
    地址門市: order.addressOrStore || '',
    備註: order.note || '',
    出貨備註: '',       // 付款成功後由 callback 更新
    出貨狀態: '待出貨', // 你出貨後手動在 Sheets 下拉選單改為「已出貨」
  });
}

/**
 * 更新訂單付款狀態(由綠界 callback 呼叫)
 */
async function updateOrderStatus(orderId, status, paymentMethod) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['訂單'];
  const rows = await sheet.getRows();

  const target = rows.find((row) => row.get('訂單編號') === orderId);
  if (target) {
    target.set('付款狀態', status);
    if (paymentMethod) target.set('付款方式', paymentMethod);
    // 付款成功時，若出貨狀態為空則補填「待出貨」
    if (status === '已付款' && !target.get('出貨狀態')) {
      target.set('出貨狀態', '待出貨');
    }
    await target.save();
    return target;
  }
  return null;
}

/**
 * 依訂單編號取得訂單(用於查詢 LINE 使用者 ID 等)
 */
async function getOrderById(orderId) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['訂單'];
  const rows = await sheet.getRows();
  const target = rows.find((row) => row.get('訂單編號') === orderId);
  if (!target) return null;

  return {
    orderId: target.get('訂單編號'),
    userId: target.get('LINE使用者ID'),
    name: target.get('姓名') || '',
    phone: target.get('電話') || '',
    deliveryMethod: target.get('配送方式') || '',
    addressOrStore: target.get('地址門市') || '',
    itemsText: target.get('商品明細'),
    totalAmount: target.get('總金額'),
    status: target.get('付款狀態'),
    note: target.get('備註') || '',
  };
}

/**
 * 取得某位客人的歷史訂單(最新的在前面)
 * @param {String} userId - LINE 使用者ID
 * @param {Number} limit - 最多回傳幾筆,預設5筆
 */
async function getOrdersByUser(userId, limit = 5) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['訂單'];
  const rows = await sheet.getRows();

  const orders = rows
    .filter((row) => row.get('LINE使用者ID') === userId)
    .map((row) => ({
      orderId: row.get('訂單編號'),
      time: row.get('時間'),
      itemsText: row.get('商品明細'),
      totalAmount: row.get('總金額'),
      status: row.get('付款狀態'),
    }));

  return orders.reverse().slice(0, limit);
}

/**
 * 判斷此訂單是否為該客人的第一筆已付款訂單
 * 用於廣告贈品判斷（只有首單才送）
 */
async function isFirstPaidOrder(userId, orderId) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['訂單'];
  const rows = await sheet.getRows();

  const paidOrders = rows.filter(
    (row) => row.get('LINE使用者ID') === userId && row.get('付款狀態') === '已付款'
  );

  // 只有一筆已付款訂單，且就是這筆，才算首單
  return paidOrders.length === 1 && paidOrders[0].get('訂單編號') === orderId;
}

/**
 * 取得客人上次儲存的收件資訊
 * Sheet 名稱: "客人資料"
 * 欄位: LINE使用者ID | 姓名 | 電話 | 地址 | 更新時間
 * 回傳 null 代表此客人尚無儲存的資訊
 */
async function getCustomerInfo(userId) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['客人資料'];
  if (!sheet) return null; // 尚未建立此分頁時,直接視為沒有資料

  const rows = await sheet.getRows();
  const target = rows.find((row) => row.get('LINE使用者ID') === userId);
  if (!target) return null;

  const name = target.get('姓名');
  const phone = target.get('電話');
  const address = target.get('地址');

  if (!name || !phone || !address) return null;

  return { name, phone, address };
}

/**
 * 儲存或更新客人的收件資訊(每位客人只保留最新一筆)
 */
async function saveCustomerInfo(userId, { name, phone, address }) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['客人資料'];
  if (!sheet) return; // 尚未建立此分頁時,略過儲存(不影響主流程)

  const rows = await sheet.getRows();
  const target = rows.find((row) => row.get('LINE使用者ID') === userId);
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

  if (target) {
    target.set('姓名', name);
    target.set('電話', phone);
    target.set('地址', address);
    target.set('更新時間', now);
    await target.save();
  } else {
    await sheet.addRow({
      LINE使用者ID: userId,
      姓名: name,
      電話: phone,
      地址: address,
      更新時間: now,
    });
  }
}

module.exports = {
  getProducts,
  getCategories,
  getProductsByCategory,
  getProductById,
  createOrder,
  updateOrderStatus,
  updateOrderShippingRemark,
  getOrderById,
  getOrdersByUser,
  isFirstPaidOrder,
  getCustomerInfo,
  saveCustomerInfo,
  getCvsInfo,
  saveCvsInfo,
  getPoints,
  updatePoints,
  getReferralCode,
  saveReferralCode,
  getReferralByCode,
  checkUserUsedReferral,
  checkReferralProcessed,
  saveReferralUsage,
  addGiftPending,
  getPendingGifts,
  markGiftShipped,
  searchCustomerByName,
  searchCustomerByPhone,
  getCustomerSummary,
};

/**
 * 付款成功後，更新「訂單」分頁的出貨備註欄位
 */
async function updateOrderShippingRemark(orderId, shippingRemark) {
  try {
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle['訂單'];
    const rows = await sheet.getRows();
    const target = rows.find((row) => row.get('訂單編號') === orderId);
    if (target) {
      target.set('出貨備註', shippingRemark);
      // 同時確保出貨狀態為「待出貨」（修補舊訂單空白的問題）
      if (!target.get('出貨狀態')) {
        target.set('出貨狀態', '待出貨');
      }
      await target.save();
      console.log('[updateOrderShippingRemark] 更新成功:', orderId, shippingRemark);
    } else {
      console.error('[updateOrderShippingRemark] 找不到訂單:', orderId);
    }
  } catch (err) {
    console.error('[updateOrderShippingRemark] 更新失敗:', err.message);
  }
}

/**
/**
 * 檢查某筆訂單是否已處理過推薦獎勵(防止重複)
 * 用於 ECPay callback 重試時避免重複發贈品
 */
async function checkReferralProcessed(orderId) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['推薦紀錄'];
  if (!sheet) return false;
  const rows = await sheet.getRows();
  return rows.some((row) => row.get('訂單編號') === orderId);
}

/**
 * 新增一筆贈品待寄紀錄
 * Sheet 名稱: "贈品待寄"
 * 欄位: LINE使用者ID | 姓名 | 身份 | 包數 | 來源訂單 | 狀態 | 建立時間 | 備註
 * 身份: 介紹人 / 被介紹人
 * 狀態: 待寄出 / 已寄出
 */
async function addGiftPending({ userId, name, role, bags, sourceOrderId, note }) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['贈品待寄'];
  if (!sheet) return;

  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  await sheet.addRow({
    LINE使用者ID: userId,
    姓名: name || '',
    身份: role,
    包數: bags,
    來源訂單: sourceOrderId,
    狀態: '待寄出',
    建立時間: now,
    備註: note || '',
  });
}

/**
 * 取得某位客人所有「待寄出」的贈品紀錄
 */
async function getPendingGifts(userId) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['贈品待寄'];
  if (!sheet) {
    console.error('[getPendingGifts] 找不到「贈品待寄」分頁！');
    return [];
  }

  const rows = await sheet.getRows();
  console.log(`[getPendingGifts] 查詢 userId: ${userId}，共 ${rows.length} 筆資料`);

  const result = rows
    .filter((row) => row.get('LINE使用者ID') === userId && row.get('狀態') === '待寄出')
    .map((row) => ({
      rowIndex: row.rowNumber,
      role: row.get('身份'),
      bags: parseInt(row.get('包數') || '0', 10),
      sourceOrderId: row.get('來源訂單'),
      note: row.get('備註'),
      // _row 保留但不序列化，另外存
      _rowRef: row,
    }));

  console.log(`[getPendingGifts] 符合條件的待寄贈品: ${result.length} 筆`);
  return result;
}

/**
 * 將某筆贈品紀錄標記為已寄出
 */
async function markGiftShipped(userId, sourceOrderId) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['贈品待寄'];
  if (!sheet) return;

  const rows = await sheet.getRows();
  const targets = rows.filter(
    (row) =>
      row.get('LINE使用者ID') === userId &&
      row.get('來源訂單') === sourceOrderId &&
      row.get('狀態') === '待寄出'
  );
  for (const row of targets) {
    row.set('狀態', '已寄出');
    await row.save();
  }
}

/**
 * 取得客人已有的推薦碼
 * Sheet 名稱: "推薦碼"
 * 欄位: LINE使用者ID | 推薦碼 | 建立時間 | 使用次數
 */
async function getReferralCode(userId) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['推薦碼'];
  if (!sheet) return null;

  const rows = await sheet.getRows();
  const target = rows.find((row) => row.get('LINE使用者ID') === userId);
  return target ? target.get('推薦碼') : null;
}

/**
 * 儲存新推薦碼
 */
async function saveReferralCode(userId, code) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['推薦碼'];
  if (!sheet) return;

  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  await sheet.addRow({
    LINE使用者ID: userId,
    推薦碼: code,
    建立時間: now,
    使用次數: 0,
  });
}

/**
 * 依推薦碼查詢介紹人 userId
 * 回傳 { referrerId, code, usageCount } 或 null
 */
async function getReferralByCode(code) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['推薦碼'];
  if (!sheet) return null;

  const rows = await sheet.getRows();
  const target = rows.find((row) => row.get('推薦碼') === code.toUpperCase());
  if (!target) return null;

  return {
    referrerId: target.get('LINE使用者ID'),
    code: target.get('推薦碼'),
    usageCount: parseInt(target.get('使用次數') || '0', 10),
  };
}

/**
 * 檢查某位客人是否已使用過推薦碼(每位被介紹人只能用一次)
 * Sheet 名稱: "推薦紀錄"
 * 欄位: 被介紹人ID | 介紹人ID | 推薦碼 | 訂單編號 | 時間 | 狀態
 */
async function checkUserUsedReferral(userId) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['推薦紀錄'];
  if (!sheet) return false;

  const rows = await sheet.getRows();
  return rows.some(
    (row) =>
      row.get('被介紹人ID') === userId &&
      row.get('狀態') === '已發點'
  );
}

/**
 * 寫入推薦紀錄並更新推薦碼使用次數
 */
async function saveReferralUsage({ referrerId, refereeId, code, orderId }) {
  const doc = await getDoc();
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

  // 寫入推薦紀錄
  const recordSheet = doc.sheetsByTitle['推薦紀錄'];
  if (recordSheet) {
    await recordSheet.addRow({
      被介紹人ID: refereeId,
      介紹人ID: referrerId,
      推薦碼: code,
      訂單編號: orderId,
      時間: now,
      狀態: '已發點',
    });
  }

  // 更新推薦碼使用次數
  const codeSheet = doc.sheetsByTitle['推薦碼'];
  if (codeSheet) {
    const rows = await codeSheet.getRows();
    const target = rows.find((row) => row.get('推薦碼') === code);
    if (target) {
      const current = parseInt(target.get('使用次數') || '0', 10);
      target.set('使用次數', current + 1);
      await target.save();
    }
  }
}


/**
 * 取得客人目前累積點數
 * 點數儲存在「客人資料」分頁的「累積點數」欄位
 * 回傳數字，若查無資料回傳 0
 */
async function getPoints(userId) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['客人資料'];
  if (!sheet) return 0;

  const rows = await sheet.getRows();
  const target = rows.find((row) => row.get('LINE使用者ID') === userId);
  if (!target) return 0;

  const points = parseInt(target.get('累積點數') || '0', 10);
  return isNaN(points) ? 0 : points;
}

/**
 * 更新客人點數(累加或扣除)
 * @param {String} userId
 * @param {Number} delta - 正數為加點，負數為扣點
 * @returns {Number} 更新後的點數
 */
async function updatePoints(userId, delta) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['客人資料'];
  if (!sheet) return 0;

  const rows = await sheet.getRows();
  const target = rows.find((row) => row.get('LINE使用者ID') === userId);
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

  if (target) {
    const current = parseInt(target.get('累積點數') || '0', 10);
    const updated = Math.max(0, (isNaN(current) ? 0 : current) + delta);
    target.set('累積點數', updated);
    target.set('更新時間', now);
    await target.save();
    return updated;
  } else {
    // 客人資料不存在時，建立新的一列
    const newPoints = Math.max(0, delta);
    await sheet.addRow({
      LINE使用者ID: userId,
      累積點數: newPoints,
      更新時間: now,
    });
    return newPoints;
  }
}

/**
 * 取得客人上次儲存的超商門市資訊
 * 使用同一個「客人資料」分頁，欄位: 超商品牌 | 超商門市 | 超商姓名 | 超商電話
 * 回傳 null 代表此客人尚無儲存的超商資訊
 */
async function getCvsInfo(userId) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['客人資料'];
  if (!sheet) return null;

  const rows = await sheet.getRows();
  const target = rows.find((row) => row.get('LINE使用者ID') === userId);
  if (!target) return null;

  const brand = target.get('超商品牌');
  const storeName = target.get('超商門市');
  const name = target.get('超商姓名');
  const phone = target.get('超商電話');

  if (!brand || !storeName || !name || !phone) return null;

  return { brand, storeName, name, phone };
}

/**
 * 儲存或更新客人的超商門市資訊
 */
async function saveCvsInfo(userId, { brand, storeName, name, phone }) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['客人資料'];
  if (!sheet) return;

  const rows = await sheet.getRows();
  const target = rows.find((row) => row.get('LINE使用者ID') === userId);
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

  if (target) {
    target.set('超商品牌', brand);
    target.set('超商門市', storeName);
    target.set('超商姓名', name);
    target.set('超商電話', phone);
    target.set('更新時間', now);
    await target.save();
  } else {
    await sheet.addRow({
      LINE使用者ID: userId,
      超商品牌: brand,
      超商門市: storeName,
      超商姓名: name,
      超商電話: phone,
      更新時間: now,
    });
  }
}

/**
 * 依姓名搜尋客人(回傳所有符合的客人)
 * 搜尋「客人資料」分頁的「姓名」欄位
 */
async function searchCustomerByName(name) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['客人資料'];
  if (!sheet) return [];
  const rows = await sheet.getRows();
  return rows
    .filter((row) => row.get('姓名') && row.get('姓名').includes(name))
    .map((row) => ({
      userId: row.get('LINE使用者ID'),
      name: row.get('姓名'),
      phone: row.get('電話'),
    }));
}

/**
 * 依電話搜尋客人
 */
async function searchCustomerByPhone(phone) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['客人資料'];
  if (!sheet) return [];
  const rows = await sheet.getRows();
  const target = rows.find((row) => row.get('電話') === phone);
  if (!target) return null;
  return {
    userId: target.get('LINE使用者ID'),
    name: target.get('姓名'),
    phone: target.get('電話'),
  };
}

/**
 * 取得客人的完整帳戶摘要(點數 + 推薦待領贈品)
 */
async function getCustomerSummary(userId) {
  // 取得累積點數
  const points = await getPoints(userId);

  // 取得推薦待領贈品(介紹人身份的待寄贈品)
  const pendingGifts = await getPendingGifts(userId);
  const referrerPending = pendingGifts.filter((g) => g.role === '介紹人');
  const referrerBags = referrerPending.reduce((sum, g) => sum + g.bags, 0);

  // 取得被介紹人待領贈品
  const refereePending = pendingGifts.filter((g) => g.role === '被介紹人');
  const refereeBags = refereePending.reduce((sum, g) => sum + g.bags, 0);

  return {
    points,
    referrerBags,   // 介紹人推薦贈品待寄
    refereeBags,    // 被介紹人推薦贈品待寄
  };
}
