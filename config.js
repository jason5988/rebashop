// config.js
// 累積與兌換相關參數，日後要調整直接在這裡修改，不需要動其他程式碼

module.exports = {
  // ===== 功能開關 =====
  // 是否啟用「訂單金額累積包數」與「兌換包數」功能
  // false = 完全關閉(客人看不到點數/兌換相關選項，結帳流程也會跳過)
  POINTS_ENABLED: false,

  // 是否啟用「推薦碼」功能
  // false = 完全關閉(客人看不到推薦碼相關選項，結帳流程也會跳過)
  REFERRAL_ENABLED: false,

  // 是否啟用「看本月活動」指令
  MONTHLY_EVENT_ENABLED: false,

  // 是否啟用「團購辦法」指令
  GROUP_BUY_ENABLED: false,

  // ===== 運費設定 =====
  // 訂單金額(不含運費)未滿此金額時，自動加收運費
  FREE_SHIPPING_THRESHOLD: 1200,

  // 未滿門檻時加收的運費金額
  SHIPPING_FEE: 110,

  // ===== 累積設定 =====
  // 每消費幾元累積1包(尾數捨去)
  // 例如: 360 代表每360元得1包，1800元訂單得5包
  POINTS_PER_AMOUNT: 360,

  // ===== 兌換設定 =====
  // 1包可兌換幾包商品
  REDEEM_ITEMS_PER_POINT: 1,

  // 兌換商品名稱(會顯示在通知訊息與訂單備註中)
  REDEEM_PRODUCT_NAME: '濾掛咖啡',

  // ===== 推薦碼設定 =====
  // 推薦成功後介紹人與被介紹人各獲得的包數
  REFERRAL_BONUS_POINTS: 2,

  // 使用推薦碼的最低訂單金額
  REFERRAL_MIN_ORDER_AMOUNT: 1000,

  // 被介紹人是否限制只能使用一次推薦碼
  // true = 每人限用一次(正式上線用)
  // false = 不限次數(測試期間用)
  REFERRAL_LIMIT_ONCE: true,

  // 推薦碼長度(英數字)
  REFERRAL_CODE_LENGTH: 6,

  // ===== 活動與公告文字(可直接在這裡修改，不需要改程式碼) =====

  // 「看本月活動」指令顯示的文字
  MONTHLY_EVENT_TEXT: `目前尚未推出活動，敬請期待！`,

  // 「團購辦法」指令顯示的文字
  GROUP_BUY_TEXT:`我們提供大量團購🛒
  更優惠的價格💰
  點選圖文選單「跟老闆說說」😄
  讓我們聊聊更滿意的合作方案🛍️`,

  // 「關於我們」指令顯示的文字
  ABOUT_US_TEXT: `
  💎雷巴咖啡
大家好，我們是來自台南的雷巴咖啡
榮獲兩次國際型咖啡烘焙賽事-台灣烘焙冠軍(2019年、2017年)
專注在咖啡領域近三十年
希望能與大家一同沈浸在美好的咖啡香氣`,

  // 「跟老闆說說」按鈕連結網址
  CONTACT_URL: 'https://lin.ee/VQ2Iqkz',

  // 官方帳號連結(分享推薦碼時附上，讓朋友能直接加入)
  OA_LINK_URL: 'https://lin.ee/VQ2Iqkz',

  // 店名(用於分享文字、訊息中顯示)
  SHOP_NAME: '雷巴咖啡',

  // 商品分類卡片上方說明文字(客人點「我要買」時顯示)
  CATEGORY_HEADER_TEXT: `最低單價說明：售價扣除運費後，以100包送10包之平均值計算\n\n「首單」贈送包數將隨本次寄送，累積贈送包數將隨下次訂單兌換時寄送`,

  // ===== 店家設定 =====
  // 店家的 LINE userId，用於接收系統通知(介紹人出貨提醒等)
  // 取得方式：傳訊息給 Bot 後，到 Render Log 找 userId: Uxxxxxxxx
  OWNER_LINE_USER_ID: 'U298c707215240f0c9aed86af216727fa',

  // 推薦活動贈品包數(介紹人與被介紹人各獲得幾包)
  REFERRAL_GIFT_BAGS: 2,

  // ===== 活動1設定 =====
  ACTIVITY1_FIRST_ORDER_ONLY: true,

  // ===== 廣告活動序號設定 =====
  AD_CODES: {
    'IG':      'IG2026',
    'FB':      'FB2026',
    'Threads': 'TH2026',
  },

  // bit.ly API Token（填入後廣告分析會自動抓取點擊數）
  BITLY_TOKEN: '請填入你的 bit.ly API Token',

  // 各平台 bit.ly 短連結 ID
  BITLY_LINKS: {
    'IG':      'gemcoffee-ig',
    'FB':      'gemcoffee-fb',
    'Threads': 'gemcoffee-th',
  },
};
