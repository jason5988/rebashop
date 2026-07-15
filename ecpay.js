// ecpay.js
// 負責產生綠界(ECPay)的付款表單與驗證 callback

const crypto = require('crypto-js');

/**
 * 產生綠界檢查碼(CheckMacValue)
 * 規則: 依官方文件 - 參數依字母排序、組字串、URL encode、轉小寫、SHA256、轉大寫
 */
function generateCheckMacValue(params, hashKey, hashIV) {
  // 1. 依參數名稱字母順序排序
  const sortedKeys = Object.keys(params).sort();

  // 2. 組成 key1=value1&key2=value2... 字串
  let raw = `HashKey=${hashKey}`;
  for (const key of sortedKeys) {
    raw += `&${key}=${params[key]}`;
  }
  raw += `&HashIV=${hashIV}`;

  // 3. URL encode (轉小寫前先做 encode,並做綠界要求的特殊字元置換)
  let encoded = encodeURIComponent(raw)
    .toLowerCase()
    .replace(/%20/g, '+')
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')');

  // 4. SHA256 後轉大寫
  return crypto.SHA256(encoded).toString().toUpperCase();
}

/**
 * 產生綠界訂單付款用的表單參數
 * @param {Object} order - { orderId, totalAmount, itemName }
 * @param {String} baseUrl - 你的服務網址(用於設定 callback)
 * @returns {Object} 包含 action(表單送出網址) 與 params(表單欄位)
 */
function createPaymentForm(order, baseUrl) {
  const merchantId = process.env.ECPAY_MERCHANT_ID;
  const hashKey = process.env.ECPAY_HASH_KEY;
  const hashIV = process.env.ECPAY_HASH_IV;
  const apiUrl = process.env.ECPAY_API_URL;

  // 綠界要求的時間格式: yyyy/MM/dd HH:mm:ss
  const now = new Date();
  const tradeDate = now
    .toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })
    .replace(/年|月/g, '/')
    .replace(/日/g, '')
    .replace(/\//g, '/');

  const params = {
    MerchantID: merchantId,
    MerchantTradeNo: order.orderId, // 限制20字內,英數字
    MerchantTradeDate: formatDate(now),
    PaymentType: 'aio',
    TotalAmount: order.totalAmount,
    TradeDesc: '商品訂購',
    ItemName: order.itemName, // 商品名稱,多項用 # 分隔
    ReturnURL: `${baseUrl}/ecpay/callback`, // 付款結果背景通知
    ChoosePayment: 'ALL', // 開放所有付款方式,可改 Credit / ATM / CVS 等
    ClientBackURL: `${baseUrl}/ecpay/return`, // 付款完成後導回
    EncryptType: 1,
  };

  const checkMacValue = generateCheckMacValue(params, hashKey, hashIV);
  params.CheckMacValue = checkMacValue;

  return {
    action: apiUrl,
    params,
  };
}

/**
 * 將表單參數轉成一個自動送出的 HTML 表單
 * (顯示給客人後會自動跳轉到綠界付款頁)
 */
function buildAutoSubmitForm(formData) {
  const inputs = Object.entries(formData.params)
    .map(([key, value]) => `<input type="hidden" name="${key}" value="${value}">`)
    .join('\n');

  return `
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <title>正在前往付款頁面...</title>
</head>
<body>
  <p>正在前往付款頁面,請稍候...</p>
  <form id="ecpayForm" method="post" action="${formData.action}">
    ${inputs}
  </form>
  <script>
    document.getElementById('ecpayForm').submit();
  </script>
</body>
</html>`;
}

/**
 * 驗證綠界 callback 的檢查碼是否正確(防止偽造請求)
 */
function verifyCallback(body) {
  const hashKey = process.env.ECPAY_HASH_KEY;
  const hashIV = process.env.ECPAY_HASH_IV;

  const receivedCheckMacValue = body.CheckMacValue;
  const paramsWithoutCheckMac = { ...body };
  delete paramsWithoutCheckMac.CheckMacValue;

  const calculated = generateCheckMacValue(paramsWithoutCheckMac, hashKey, hashIV);
  return calculated === receivedCheckMacValue;
}

// 綠界要求的日期格式: yyyy/MM/dd HH:mm:ss
function formatDate(date) {
  const taipei = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const yyyy = taipei.getFullYear();
  const MM = String(taipei.getMonth() + 1).padStart(2, '0');
  const dd = String(taipei.getDate()).padStart(2, '0');
  const HH = String(taipei.getHours()).padStart(2, '0');
  const mm = String(taipei.getMinutes()).padStart(2, '0');
  const ss = String(taipei.getSeconds()).padStart(2, '0');
  return `${yyyy}/${MM}/${dd} ${HH}:${mm}:${ss}`;
}

module.exports = {
  createPaymentForm,
  buildAutoSubmitForm,
  verifyCallback,
};
