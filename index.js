// index.js
// LINE Bot 自動下單系統 - 主程式

require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');

const sheets = require('./sheets');
const ecpay = require('./ecpay');
const flex = require('./flexMessages');
const config = require('./config');

const app = express();

// ===== LINE 設定 =====
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken,
});

// ===== 購物車(暫存於記憶體) =====
// 注意: 這是簡易做法,伺服器重啟會清空購物車。
// 如果需要更穩定的購物車,可改存到 Google Sheets 或資料庫。
const carts = {}; // { userId: [{ id, name, price, quantity }] }

// ===== 使用者狀態(暫存於記憶體) =====
// 可能的值:
//   'AWAITING_SHIPPING_INFO'   - 等待輸入宅配地址
//   'AWAITING_CVS_INFO'        - 等待輸入超商門市資訊
//   'AWAITING_REDEEM'          - 等待輸入兌換包數
//   'AWAITING_NOTE'            - 等待輸入備註(或略過)
//   'AWAITING_REFERRAL_CODE'   - 等待輸入推薦碼(或略過)
const userStates = {};

// ===== 結帳暫存(配送方式、收件資訊,等備註確認後才建立訂單) =====
// { userId: { deliveryMethod, shippingInfo, customerInfo } }
const pendingCheckouts = {};

function getCart(userId) {
  if (!carts[userId]) carts[userId] = [];
  return carts[userId];
}

function calcTotal(cartItems) {
  return cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// ===== Webhook 路由 =====
// 注意: line.middleware 需要原始 body 來驗證簽章,
// 所以這個路由不能放在 express.json() 之後處理同一路徑
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events;
    await Promise.all(events.map(handleEvent));
    res.status(200).end();
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).end();
  }
});

// ===== 事件處理 =====
async function handleEvent(event) {
  const userId = event.source.userId;

  // 文字訊息
  if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text.trim();

    // 共用的「跳出流程」指令
    const isEscapeCommand =
      text === '我要買' || text === '選單' || text === '取消' ||
      text === '購物車' || text === 'cart' || text === '我的訂單' ||
      text === '看本月活動' || text === '本月活動' ||
      text === '團購辦法' || text === '團購' ||
      text === '跟老闆說說' || text === '聯絡' ||
      text === '關於我們' ||
      text === '查詢帳戶' || text.startsWith('查詢客人') || text.startsWith('查詢電話');

    // 等待輸入宅配地址
    if (userStates[userId] === 'AWAITING_SHIPPING_INFO') {
      if (isEscapeCommand) {
        userStates[userId] = null;
        pendingCheckouts[userId] = null;
        // 繼續往下執行該指令
      } else {
        return handleShippingInfoInput(event, userId, text);
      }
    }

    // 等待輸入超商門市資訊
    if (userStates[userId] === 'AWAITING_CVS_INFO') {
      if (isEscapeCommand) {
        userStates[userId] = null;
        pendingCheckouts[userId] = null;
        // 繼續往下執行該指令
      } else {
        return handleCvsInfoInput(event, userId, text);
      }
    }

    // 等待輸入備註
    if (userStates[userId] === 'AWAITING_NOTE') {
      if (isEscapeCommand) {
        userStates[userId] = null;
        pendingCheckouts[userId] = null;
        // 繼續往下執行該指令
      } else {
        // 儲存備註，進入推薦碼步驟
        if (pendingCheckouts[userId]) pendingCheckouts[userId].note = text;
        return proceedToReferral(event, userId);
      }
    }

    // 等待輸入兌換包數
    if (userStates[userId] === 'AWAITING_REDEEM') {
      if (isEscapeCommand) {
        userStates[userId] = null;
        pendingCheckouts[userId] = null;
        // 繼續往下執行該指令
      } else {
        return handleRedeemInput(event, userId, text);
      }
    }

    // 等待輸入推薦碼
    if (userStates[userId] === 'AWAITING_REFERRAL_CODE') {
      if (isEscapeCommand) {
        userStates[userId] = null;
        pendingCheckouts[userId] = null;
        // 繼續往下執行該指令
      } else {
        return handleReferralCodeInput(event, userId, text);
      }
    }

    if (text === '我要買' || text === '選單' || text === '商品' || text === '購物') {
      const categories = await sheets.getCategories();
      if (categories.length === 0) {
        return replyText(event.replyToken, '目前尚未上架任何商品,請稍後再來看看!');
      }
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [flex.buildCategoryMenu(
          categories,
          `運費${config.SHIPPING_FEE}元，結帳金額滿${config.FREE_SHIPPING_THRESHOLD}元免運`
        )],
      });
    }

    if (text === '購物車' || text === 'cart') {
      const cartItems = getCart(userId);
      const total = calcTotal(cartItems);
      const message = flex.buildCartSummary(cartItems, total, config);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [message],
      });
    }

    if (text === '我的訂單') {
      const orders = await sheets.getOrdersByUser(userId, 3);
      const message = flex.buildOrderHistory(orders);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [message],
      });
    }

    if (text === '我的點數' || text === '點數') {
      if (!config.POINTS_ENABLED) {
        return replyText(event.replyToken, '此功能目前暫停中，敬請期待！');
      }
      const points = await sheets.getPoints(userId);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [flex.buildPointsInfo(points, config)],
      });
    }

    if (text === '我要推薦碼' || text === '推薦碼') {
      if (!config.REFERRAL_ENABLED) {
        return replyText(event.replyToken, '此功能目前暫停中，敬請期待！');
      }
      let code = await sheets.getReferralCode(userId);
      if (!code) {
        code = generateReferralCode(config.REFERRAL_CODE_LENGTH);
        await sheets.saveReferralCode(userId, code);
      }
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [flex.buildReferralCode(code, config)],
      });
    }

    if (text === '看本月活動' || text === '本月活動') {
      if (!config.MONTHLY_EVENT_ENABLED) {
        return replyText(event.replyToken, '此功能目前暫停中，敬請期待！');
      }
      return replyText(event.replyToken, config.MONTHLY_EVENT_TEXT);
    }

    if (text === '團購辦法' || text === '團購') {
      if (!config.GROUP_BUY_ENABLED) {
        return replyText(event.replyToken, '此功能目前暫停中，敬請期待！');
      }
      return replyText(event.replyToken, config.GROUP_BUY_TEXT);
    }

    if (text === '關於我們') {
      return replyText(event.replyToken, config.ABOUT_US_TEXT);
    }

    if (text === '跟老闆說說' || text === '聯絡') {
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [flex.buildContactButton(config.CONTACT_URL)],
      });
    }

    if (text === '查詢帳戶') {
      console.log('[查詢帳戶] userId:', userId);
      // 客人查詢自己的帳戶
      const customerInfo = await sheets.getCustomerInfo(userId);
      const summary = await sheets.getCustomerSummary(userId);

      const messages = [flex.buildAccountSummary({
        name: customerInfo?.name || '未設定',
        phone: customerInfo?.phone || '未設定',
        points: summary.points,
        referrerBags: summary.referrerBags,
        refereeBags: summary.refereeBags,
        config,
      })];

      // 介紹人待領贈品為 0 時，額外推送推薦碼宣傳訊息
      console.log('[查詢帳戶] referrerBags:', summary.referrerBags);
      if (config.REFERRAL_ENABLED && summary.referrerBags === 0) {
        let code = await sheets.getReferralCode(userId);
        if (!code) {
          code = generateReferralCode(config.REFERRAL_CODE_LENGTH);
          await sheets.saveReferralCode(userId, code);
        }

        // 宣傳訊息 + 一鍵分享按鈕（合併成一則）
        const shareText = `我在「${config.SHOP_NAME}」買咖啡，分享你我的推薦碼：${code}\n下單滿${config.REFERRAL_MIN_ORDER_AMOUNT}元並填入這組推薦碼，雙方都能獲得${config.REFERRAL_BONUS_POINTS}包超級限量的特別版濾掛咖啡！\n\n加入官方帳號開始選購：${config.OA_LINK_URL}`;
        const shareUri = `https://line.me/R/share?text=${encodeURIComponent(shareText)}`;

        messages.push({
          type: 'flex',
          altText: '🎉您獲得限量特殊濾掛的機會只差一步了🤩',
          contents: {
            type: 'bubble',
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: `🎉您獲得限量特殊濾掛的機會只差一步了🤩\n趕快分享自己的💎推薦碼💎給好友，為自己獲得🎁「限量隱藏版」的特殊濾掛咖啡☕ ❗ ❗\n\n您的推薦碼：${code}\n\n長按上方文字即可複製，分享給好友一起享好咖啡！`,
                  wrap: true,
                  size: 'sm',
                  color: '#333333',
                },
              ],
            },
            footer: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'button',
                  style: 'primary',
                  color: '#06C755',
                  action: {
                    type: 'uri',
                    label: '📤 立即分享推薦碼給好友',
                    uri: shareUri,
                  },
                },
              ],
            },
          },
        });
      }

      return client.replyMessage({
        replyToken: event.replyToken,
        messages,
      });
    }

    if (text.startsWith('查詢客人') && userId === config.OWNER_LINE_USER_ID) {
      console.log('[查詢客人] 符合店家條件');
      const name = text.replace('查詢客人', '').trim();
      if (!name) return replyText(event.replyToken, '請輸入姓名，例如：查詢客人 王小明');
      const customers = await sheets.searchCustomerByName(name);
      if (customers.length === 0) {
        return replyText(event.replyToken, `找不到姓名包含「${name}」的客人。`);
      }
      if (customers.length === 1) {
        const summary = await sheets.getCustomerSummary(customers[0].userId);
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [flex.buildAccountSummary({
            name: customers[0].name,
            phone: customers[0].phone,
            points: summary.points,
            referrerBags: summary.referrerBags,
            refereeBags: summary.refereeBags,
            config,
          })],
        });
      }
      // 多筆同名，讓店家選擇
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [flex.buildCustomerSearchResult(customers)],
      });
    }

    if (text.startsWith('查詢電話') && userId === config.OWNER_LINE_USER_ID) {
      // 店家依電話查詢
      const phone = text.replace('查詢電話', '').trim();
      if (!phone) return replyText(event.replyToken, '請輸入電話，例如：查詢電話 0912345678');
      const customer = await sheets.searchCustomerByPhone(phone);
      if (!customer) {
        return replyText(event.replyToken, `找不到電話「${phone}」的客人。`);
      }
      const summary = await sheets.getCustomerSummary(customer.userId);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [flex.buildAccountSummary({
          name: customer.name,
          phone: customer.phone,
          points: summary.points,
          referrerBags: summary.referrerBags,
          refereeBags: summary.refereeBags,
          config,
        })],
      });
    }

    // 預設回覆 - 顯示使用說明
    console.log('[預設回覆] text:', text, 'userId:', userId);
    {
      const menuLines = [
        '歡迎光臨!🛍️',
        '',
        '輸入「我要買」查看商品分類',
        '輸入「購物車」查看目前購物車內容',
        '輸入「我的訂單」查詢歷史訂單(最近三筆)',
      ];
      if (config.MONTHLY_EVENT_ENABLED) {
        menuLines.push('輸入「看本月活動」查看最新活動');
      }
      if (config.GROUP_BUY_ENABLED) {
        menuLines.push('輸入「團購辦法」了解團購優惠');
      }
      menuLines.push('輸入「關於我們」認識我們的故事');
      menuLines.push('輸入「跟老闆說說」聯絡我們');
      return replyText(event.replyToken, menuLines.join('\n'));
    }
  }

  // Postback 事件(按鈕點擊)
  if (event.type === 'postback') {
    const data = new URLSearchParams(event.postback.data);
    const action = data.get('action');

    if (action === 'showCategory') {
      const category = data.get('category');
      const products = await sheets.getProductsByCategory(category);
      if (products.length === 0) {
        return replyText(event.replyToken, '此分類目前沒有商品。');
      }
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [flex.buildProductCarousel(products, category)],
      });
    }

    if (action === 'addToCart') {
      const productId = data.get('productId');
      const product = await sheets.getProductById(productId);
      if (!product) {
        return replyText(event.replyToken, '找不到此商品,可能已下架。');
      }

      const cartItems = getCart(userId);
      const existing = cartItems.find((item) => item.id === product.id);
      if (existing) {
        existing.quantity += 1;
      } else {
        cartItems.push({
          id: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
        });
      }

      return replyText(
        event.replyToken,
        `已將「${product.name}」加入購物車 ✅\n輸入「購物車」查看目前內容,或繼續輸入「我要買」選購其他商品。`
      );
    }

    if (action === 'clearCart') {
      carts[userId] = [];
      return replyText(event.replyToken, '購物車已清空。輸入「我要買」重新選購。');
    }

    if (action === 'increaseQty' || action === 'decreaseQty') {
      const productId = data.get('productId');
      const cartItems = getCart(userId);
      const item = cartItems.find((i) => i.id === productId);

      if (!item) {
        // 商品已不在購物車中(可能已被移除),直接顯示目前購物車狀態
        const total = calcTotal(cartItems);
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [flex.buildCartSummary(cartItems, total, config)],
        });
      }

      if (action === 'increaseQty') {
        item.quantity += 1;
      } else {
        item.quantity -= 1;
        if (item.quantity <= 0) {
          // 數量降為0時,從購物車移除該商品
          carts[userId] = cartItems.filter((i) => i.id !== productId);
        }
      }

      const updatedCart = getCart(userId);
      const total = calcTotal(updatedCart);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [flex.buildCartSummary(updatedCart, total, config)],
      });
    }

    if (action === 'checkout') {
      const cartItems = getCart(userId);
      if (cartItems.length === 0) {
        return replyText(event.replyToken, '購物車是空的,無法結帳。');
      }
      // 第一步:選擇配送方式
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [flex.buildDeliveryChoice()],
      });
    }

    // 購物車未滿免運門檻時，「繼續選購」按鈕 → 跳出商品分類選單
    if (action === 'continueShopping') {
      const categories = await sheets.getCategories();
      if (categories.length === 0) {
        return replyText(event.replyToken, '目前尚未上架任何商品,請稍後再來看看!');
      }
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [flex.buildCategoryMenu(
          categories,
          `運費${config.SHIPPING_FEE}元，結帳金額滿${config.FREE_SHIPPING_THRESHOLD}元免運`
        )],
      });
    }

    // 選擇宅配 → 確認/輸入收件資訊
    if (action === 'selectDelivery' && data.get('method') === 'home') {
      pendingCheckouts[userId] = { deliveryMethod: '宅配' };
      const lastInfo = await sheets.getCustomerInfo(userId);
      if (lastInfo) {
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [flex.buildShippingInfoChoice(lastInfo)],
        });
      }
      userStates[userId] = 'AWAITING_SHIPPING_INFO';
      return replyText(
        event.replyToken,
        '請輸入宅配收件資訊,格式如下(用「/」分隔):\n\n姓名/電話/地址\n\n範例:\n王小明/0912345678/台北市中山區中山路1號'
      );
    }

    // 選擇超商取貨 → 查上次門市資訊 or 選超商品牌
    if (action === 'selectDelivery' && data.get('method') === 'cvs') {
      pendingCheckouts[userId] = { deliveryMethod: '超商取貨' };
      const lastCvsInfo = await sheets.getCvsInfo(userId);
      if (lastCvsInfo) {
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [flex.buildCvsInfoChoice(lastCvsInfo)],
        });
      }
      // 沒有上次資訊 → 直接選超商品牌
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [flex.buildConvenienceStoreChoice()],
      });
    }

    // 使用上次超商門市資訊
    if (action === 'useLastCvsInfo') {
      const lastCvsInfo = await sheets.getCvsInfo(userId);
      if (!lastCvsInfo) {
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [flex.buildConvenienceStoreChoice()],
        });
      }
      if (!pendingCheckouts[userId]) pendingCheckouts[userId] = { deliveryMethod: '超商取貨' };
      pendingCheckouts[userId].shippingInfo = `${lastCvsInfo.brand} ${lastCvsInfo.storeName} / ${lastCvsInfo.name} / ${lastCvsInfo.phone}`;
      pendingCheckouts[userId].cvsInfo = lastCvsInfo;
      return await proceedToRedeemOrNote(event, userId);
    }

    // 輸入新超商門市資訊 → 先選品牌
    if (action === 'enterNewCvsInfo') {
      if (!pendingCheckouts[userId]) pendingCheckouts[userId] = { deliveryMethod: '超商取貨' };
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [flex.buildConvenienceStoreChoice()],
      });
    }

    // 選擇超商品牌 → 請輸入門市資訊
    if (action === 'selectCVS') {
      const brand = data.get('brand');
      if (!pendingCheckouts[userId]) pendingCheckouts[userId] = { deliveryMethod: '超商取貨' };
      pendingCheckouts[userId].cvsBrand = brand;
      userStates[userId] = 'AWAITING_CVS_INFO';
      return replyText(
        event.replyToken,
        `請輸入 ${brand} 的取貨門市資訊,格式如下(用「/」分隔):\n\n姓名/電話/門市名稱或店號\n\n範例:\n王小明/0912345678/台南成功店`
      );
    }

    // 使用上次收件資訊(宅配)
    if (action === 'useLastShippingInfo') {
      const lastInfo = await sheets.getCustomerInfo(userId);
      if (!lastInfo) {
        userStates[userId] = 'AWAITING_SHIPPING_INFO';
        return replyText(
          event.replyToken,
          '找不到上次的收件資訊,請重新輸入:\n\n姓名/電話/地址\n\n範例:\n王小明/0912345678/台北市中山區中山路1號'
        );
      }
      if (!pendingCheckouts[userId]) pendingCheckouts[userId] = { deliveryMethod: '宅配' };
      pendingCheckouts[userId].shippingInfo = `${lastInfo.name} / ${lastInfo.phone} / ${lastInfo.address}`;
      pendingCheckouts[userId].customerInfo = lastInfo;
      return await proceedToRedeemOrNote(event, userId);
    }

    // 輸入新收件資訊(宅配)
    if (action === 'enterNewShippingInfo') {
      if (!pendingCheckouts[userId]) pendingCheckouts[userId] = { deliveryMethod: '宅配' };
      userStates[userId] = 'AWAITING_SHIPPING_INFO';
      return replyText(
        event.replyToken,
        '請輸入宅配收件資訊,格式如下(用「/」分隔):\n\n姓名/電話/地址\n\n範例:\n王小明/0912345678/台北市中山區中山路1號'
      );
    }

    // 略過備註 → 進入推薦碼詢問步驟
    if (action === 'skipNote') {
      if (pendingCheckouts[userId]) pendingCheckouts[userId].note = '';
      return proceedToReferral(event, userId);
    }

    // 略過點數兌換 → 進入備註步驟
    if (action === 'skipRedeem') {
      if (pendingCheckouts[userId]) pendingCheckouts[userId].redeemItems = 0;
      userStates[userId] = 'AWAITING_NOTE';
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [flex.buildNoteChoice()],
      });
    }

    // 店家點選同名客人列表後，依電話查詢
    if (action === 'ownerQueryByPhone' && userId === config.OWNER_LINE_USER_ID) {
      const phone = data.get('phone');
      const customer = await sheets.searchCustomerByPhone(phone);
      if (!customer) {
        return replyText(event.replyToken, `找不到電話「${phone}」的客人。`);
      }
      const summary = await sheets.getCustomerSummary(customer.userId);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [flex.buildAccountSummary({
          name: customer.name,
          phone: customer.phone,
          points: summary.points,
          referrerBags: summary.referrerBags,
          refereeBags: summary.refereeBags,
          config,
        })],
      });
    }

    // 略過推薦碼 → 直接建立訂單
    if (action === 'skipReferral') {
      const note = pendingCheckouts[userId]?.note || '';
      return finalizeOrder(event, userId, note);
    }

    // 複製推薦碼 → 回傳方便長按複製的純文字
    if (action === 'copyReferralCode') {
      const code = data.get('code');
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [flex.buildReferralCodeCopyText(code, config)],
      });
    }
  }

  return Promise.resolve(null);
}

/**
 * 處理宅配收件資訊輸入
 */
async function handleShippingInfoInput(event, userId, text) {
  const parts = text.split('/').map((s) => s.trim());
  if (parts.length !== 3 || parts.some((p) => p === '')) {
    return replyText(
      event.replyToken,
      '格式不正確,請依照「姓名/電話/地址」的格式重新輸入。\n\n範例:\n王小明/0912345678/台北市中山區中山路1號'
    );
  }
  const [name, phone, address] = parts;
  if (!pendingCheckouts[userId]) pendingCheckouts[userId] = { deliveryMethod: '宅配' };
  pendingCheckouts[userId].shippingInfo = `${name} / ${phone} / ${address}`;
  pendingCheckouts[userId].customerInfo = { name, phone, address };
  return await proceedToRedeemOrNote(event, userId);
}

/**
 * 處理超商門市資訊輸入
 */
async function handleCvsInfoInput(event, userId, text) {
  const parts = text.split('/').map((s) => s.trim());
  if (parts.length !== 3 || parts.some((p) => p === '')) {
    return replyText(
      event.replyToken,
      '格式不正確,請依照「姓名/電話/門市名稱或店號」的格式重新輸入。\n\n範例:\n王小明/0912345678/台南成功店'
    );
  }
  const [name, phone, storeName] = parts;
  const brand = pendingCheckouts[userId]?.cvsBrand || '超商';
  if (!pendingCheckouts[userId]) pendingCheckouts[userId] = { deliveryMethod: '超商取貨' };
  pendingCheckouts[userId].shippingInfo = `${brand} ${storeName} / ${name} / ${phone}`;
  pendingCheckouts[userId].customerInfo = { name, phone, address: `${brand} ${storeName}` };
  pendingCheckouts[userId].cvsInfo = { brand, storeName, name, phone };
  return await proceedToRedeemOrNote(event, userId);
}

/**
 * 收件資訊填完後，判斷是否有點數可兌換
 * 有點數 → 進入兌換步驟；沒有 → 直接進入備註步驟
 */
async function proceedToRedeemOrNote(event, userId) {
  if (!config.POINTS_ENABLED) {
    userStates[userId] = 'AWAITING_NOTE';
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [flex.buildNoteChoice()],
    });
  }
  const points = await sheets.getPoints(userId);
  if (points > 0) {
    userStates[userId] = 'AWAITING_REDEEM';
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [flex.buildRedeemChoice(points, config)],
    });
  }
  // 沒有點數，直接進入備註步驟
  userStates[userId] = 'AWAITING_NOTE';
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [flex.buildNoteChoice()],
  });
}

/**
 * 處理客人輸入的兌換包數
 */
async function handleRedeemInput(event, userId, text) {
  const num = parseInt(text, 10);
  const points = await sheets.getPoints(userId);
  const maxRedeemable = Math.floor(points * config.REDEEM_ITEMS_PER_POINT);

  if (isNaN(num) || num < 0) {
    return replyText(
      event.replyToken,
      `請輸入數字(0 到 ${maxRedeemable})，例如輸入「3」代表兌換3包${config.REDEEM_PRODUCT_NAME}。`
    );
  }

  if (num > maxRedeemable) {
    return replyText(
      event.replyToken,
      `您最多只能兌換 ${maxRedeemable} 包，請重新輸入(0 到 ${maxRedeemable})。`
    );
  }

  if (!pendingCheckouts[userId]) pendingCheckouts[userId] = {};
  pendingCheckouts[userId].redeemItems = num;

  // 進入備註步驟
  userStates[userId] = 'AWAITING_NOTE';
  if (num === 0) {
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [flex.buildNoteChoice()],
    });
  }
  // 有兌換 → 先告知再進備註
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [
      {
        type: 'text',
        text: `已記錄兌換 ${num} 包${config.REDEEM_PRODUCT_NAME}，將加入訂單備註隨貨寄出。✅`,
      },
      flex.buildNoteChoice(),
    ],
  });
}

/**
 * 備註完成後進入推薦碼詢問步驟
 */
async function proceedToReferral(event, userId) {
  if (!config.REFERRAL_ENABLED) {
    const note = pendingCheckouts[userId]?.note || '';
    return finalizeOrder(event, userId, note);
  }
  const alreadyUsed = config.REFERRAL_LIMIT_ONCE
    ? await sheets.checkUserUsedReferral(userId)
    : false;
  if (alreadyUsed) {
    const note = pendingCheckouts[userId]?.note || '';
    return finalizeOrder(event, userId, note);
  }

  userStates[userId] = 'AWAITING_REFERRAL_CODE';
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [flex.buildReferralCodeInput(config)],
  });
}

/**
 * 處理客人輸入的推薦碼
 */
async function handleReferralCodeInput(event, userId, text) {
  const code = text.trim().toUpperCase();

  const referral = await sheets.getReferralByCode(code);
  if (!referral) {
    return replyText(
      event.replyToken,
      '找不到此推薦碼，請確認是否輸入正確。\n若沒有推薦碼請輸入「略過」，或點下方按鈕。'
    );
  }

  if (referral.referrerId === userId) {
    return replyText(
      event.replyToken,
      '無法使用自己的推薦碼，請輸入朋友給您的推薦碼，或點下方「略過」。'
    );
  }

  if (pendingCheckouts[userId]) {
    pendingCheckouts[userId].referralCode = code;
    pendingCheckouts[userId].referrerId = referral.referrerId;
    pendingCheckouts[userId].referralSuccess = true;
  }

  userStates[userId] = null;
  const note = pendingCheckouts[userId]?.note || '';
  return finalizeOrder(event, userId, note);
}

/**
 * 產生隨機英數字推薦碼
 */
function generateReferralCode(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去除容易混淆的 0/O/1/I
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * 最終建立訂單(收件資訊與備註都確認後)
 */
async function finalizeOrder(event, userId, note) {
  const checkout = pendingCheckouts[userId];
  const cartItems = getCart(userId);

  if (!checkout || cartItems.length === 0) {
    userStates[userId] = null;
    pendingCheckouts[userId] = null;
    return replyText(event.replyToken, '購物車是空的,無法結帳。請輸入「我要買」重新選購。');
  }

  const subtotal = calcTotal(cartItems);
  const shippingFee = subtotal < config.FREE_SHIPPING_THRESHOLD ? config.SHIPPING_FEE : 0;
  const total = subtotal + shippingFee;
  const orderId = generateOrderId();
  const itemsText = cartItems.map((item) => `${item.name} x${item.quantity}`).join(', ');
  const itemNameForEcpay = shippingFee > 0
    ? cartItems.map((item) => `${item.name} x${item.quantity}`).join('#') + `#運費 x1`
    : cartItems.map((item) => `${item.name} x${item.quantity}`).join('#');

  // 從 checkout 取出拆分後的收件資訊
  const isCVS = checkout.deliveryMethod === '超商取貨';
  const recipientName = isCVS ? checkout.cvsInfo?.name : checkout.customerInfo?.name;
  const recipientPhone = isCVS ? checkout.cvsInfo?.phone : checkout.customerInfo?.phone;
  const addressOrStore = isCVS
    ? `${checkout.cvsInfo?.brand || ''} ${checkout.cvsInfo?.storeName || ''}`.trim()
    : checkout.customerInfo?.address || '';

  // 處理點數兌換：記錄兌換包數供出貨備註使用，但不寫入訂單備註欄
  const redeemItems = checkout.redeemItems || 0;
  let finalNote = note || '';

  // 推薦碼資訊加入備註(出貨備註需要從這裡解析，所以保留)
  const referralCode = checkout.referralCode || '';
  const referralSuccess = checkout.referralSuccess || false;
  if (referralCode) {
    const referralNote = `推薦碼:${referralCode}`;
    finalNote = finalNote ? `${finalNote}、${referralNote}` : referralNote;
  }
  // 兌換包數也記錄在備註供出貨備註解析(但格式改為隱藏前綴避免客人看到)
  if (redeemItems > 0) {
    const redeemNote = `兌換:${redeemItems}`;
    finalNote = finalNote ? `${finalNote}、${redeemNote}` : redeemNote;
  }

  // 寫入訂單到 Google Sheets
  await sheets.createOrder({
    orderId,
    userId,
    itemsText,
    totalAmount: total,
    deliveryMethod: checkout.deliveryMethod,
    name: recipientName || '',
    phone: recipientPhone || '',
    addressOrStore,
    note: finalNote,
    paymentStatus: '待付款',
  });

  // 儲存/更新客人收件資訊
  if (checkout.customerInfo) {
    await sheets.saveCustomerInfo(userId, checkout.customerInfo);
  }
  // 儲存/更新客人超商門市資訊
  if (checkout.cvsInfo) {
    await sheets.saveCvsInfo(userId, checkout.cvsInfo);
  }

  // 清空購物車與狀態
  carts[userId] = [];
  userStates[userId] = null;
  pendingCheckouts[userId] = null;

  // 宅配與超商取貨都走綠界線上付款
  const baseUrl = process.env.BASE_URL;
  const paymentForm = ecpay.createPaymentForm({ orderId, totalAmount: total, itemName: itemNameForEcpay }, baseUrl);
  const paymentUrl = `${baseUrl}/pay/${orderId}`;
  pendingPayments[orderId] = paymentForm;

  // 整理顯示給客人的備註（移除系統標記，只保留客人輸入的部分）
  const displayNote = finalNote
    .split('、')
    .filter((part) => !part.startsWith('推薦碼:') && !part.startsWith('兌換:'))
    .join('、');
  const noteText = displayNote ? `備註: ${displayNote}` : '';
  // 若有兌換則顯示給客人
  const redeemText = redeemItems > 0 ? `兌換 ${redeemItems} 包${config.REDEEM_PRODUCT_NAME}（付款後隨貨寄出）` : '';
  const locationLabel = isCVS ? '取貨門市' : '地址';
  const referralMsg = referralSuccess
    ? `🎁 推薦碼「${referralCode}」驗證成功！付款後雙方各獲得 ${config.REFERRAL_GIFT_BAGS} 包濾掛咖啡。`
    : '';

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [
      flex.buildPaymentButton(
        {
          orderId,
          deliveryMethod: checkout.deliveryMethod,
          recipientName,
          recipientPhone,
          locationLabel,
          addressOrStore,
          subtotal,
          shippingFee,
          freeShippingThreshold: config.FREE_SHIPPING_THRESHOLD,
          totalAmount: total,
          noteText: [noteText, redeemText].filter(Boolean).join('\n'),
          referralMsg: referralMsg,
        },
        paymentUrl
      ),
    ],
  });
}

// ===== 暫存付款表單(記憶體) =====
// 同樣是簡易做法,正式環境建議改存資料庫並設定過期時間
const pendingPayments = {};

// ===== 付款頁面路由 =====
// 客人點擊訂單連結後,顯示自動跳轉到綠界的頁面
app.get('/pay/:orderId', (req, res) => {
  const orderId = req.params.orderId;
  const formData = pendingPayments[orderId];

  if (!formData) {
    return res.status(404).send('找不到此訂單,或訂單已過期。');
  }

  const html = ecpay.buildAutoSubmitForm(formData);
  res.send(html);
});

// ===== 綠界 callback(背景通知付款結果) =====
// 注意: 綠界用 application/x-www-form-urlencoded 傳送
app.post('/ecpay/callback', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const body = req.body;
    const isValid = ecpay.verifyCallback(body);

    if (!isValid) {
      console.error('綠界 callback 驗證失敗:', body);
      return res.send('0|ErrorCheckMacValue');
    }

    const orderId = body.MerchantTradeNo;
    const rtnCode = body.RtnCode; // "1" 代表成功
    console.log('[callback] 收到付款通知 orderId:', orderId, 'rtnCode:', rtnCode);

    if (rtnCode === '1') {
      // 先讀取訂單資料(更新狀態前讀，才能正確判斷是否已處理過)
      const order = await sheets.getOrderById(orderId);
      console.log('[callback] 讀取訂單結果:', order ? `找到，status=${order.status}` : '找不到訂單');

      if (order && order.userId) {

        // ===== 防止重複處理(綠界 callback 可能重試) =====
        // 若狀態已是「已付款」，代表已處理過，直接回應
        if (order.status === '已付款') {
          console.log('[callback] 訂單已處理過，跳過:', orderId);
          return res.send('1|OK');
        }

        // 確認非重複後，才更新付款狀態
        await sheets.updateOrderStatus(orderId, '已付款', body.PaymentType);
        console.log('[callback] 付款狀態已更新為已付款');

        // ===== 兌換點數扣除 =====
        let pointsDeducted = 0;
        let redeemItemsCount = 0;
        if (config.POINTS_ENABLED && order.note) {
          // 同時支援新格式「兌換:數字」和舊格式「兌換 數字 包」
          const redeemMatch = order.note.match(/兌換:(\d+)/) || order.note.match(/兌換\s*(\d+)\s*包/);
          if (redeemMatch) {
            redeemItemsCount = parseInt(redeemMatch[1], 10);
            const pointsToDeduct = Math.ceil(redeemItemsCount / config.REDEEM_ITEMS_PER_POINT);
            await sheets.updatePoints(order.userId, -pointsToDeduct);
            pointsDeducted = pointsToDeduct;
          }
        }

        // ===== 累積本次消費點數 =====
        const earnedPoints = config.POINTS_ENABLED
          ? Math.floor(Number(order.totalAmount) / config.POINTS_PER_AMOUNT)
          : 0;
        let updatedPoints = config.POINTS_ENABLED ? await sheets.getPoints(order.userId) : 0;
        if (earnedPoints > 0) {
          updatedPoints = await sheets.updatePoints(order.userId, earnedPoints);
        }

        // ===== 處理推薦碼贈品(含防重複) =====
        let referralCode = '';
        let refereeGiftText = '';
        let referrerGiftText = '';

        if (config.REFERRAL_ENABLED && order.note) {
          const referralMatch = order.note.match(/推薦碼:([A-Z0-9]+)/);
          if (referralMatch) {
            referralCode = referralMatch[1];
            const referral = await sheets.getReferralByCode(referralCode);
            const alreadyUsed = config.REFERRAL_LIMIT_ONCE
              ? await sheets.checkUserUsedReferral(order.userId)
              : false;
            // 防重複：檢查此訂單的推薦獎勵是否已處理
            const referralAlreadyProcessed = await sheets.checkReferralProcessed(orderId);
            const meetsMinAmount = Number(order.totalAmount) >= config.REFERRAL_MIN_ORDER_AMOUNT;

            if (referral && !alreadyUsed && !referralAlreadyProcessed && meetsMinAmount && referral.referrerId !== order.userId) {
              const refereeInfo = await sheets.getCustomerInfo(order.userId);
              const referrerInfo = await sheets.getCustomerInfo(referral.referrerId);

              refereeGiftText = `${config.REFERRAL_GIFT_BAGS} 包(當次寄出)`;
              referrerGiftText = `${config.REFERRAL_GIFT_BAGS} 包(下次訂單寄出)`;

              // 被介紹人：當次隨貨寄出
              await sheets.addGiftPending({
                userId: order.userId,
                name: refereeInfo?.name || '',
                role: '被介紹人',
                bags: config.REFERRAL_GIFT_BAGS,
                sourceOrderId: orderId,
                note: `推薦碼 ${referralCode} 獎勵，當次訂單隨貨寄出`,
              });

              // 介紹人：下次訂單隨貨寄出
              await sheets.addGiftPending({
                userId: referral.referrerId,
                name: referrerInfo?.name || '',
                role: '介紹人',
                bags: config.REFERRAL_GIFT_BAGS,
                sourceOrderId: orderId,
                note: `推薦碼 ${referralCode} 獎勵，下次訂單隨貨寄出`,
              });

              // 記錄推薦紀錄(同時作為防重複旗標)
              await sheets.saveReferralUsage({
                referrerId: referral.referrerId,
                refereeId: order.userId,
                code: referralCode,
                orderId,
              });

              // 通知介紹人（保留，因為這是給另一個人的）
              await client.pushMessage({
                to: referral.referrerId,
                messages: [{
                  type: 'text',
                  text: `🎉 您的推薦碼「${referralCode}」有朋友成功使用！\n您將獲得 ${config.REFERRAL_GIFT_BAGS} 包濾掛咖啡，將於您下次訂單時隨貨寄出。`,
                }],
              });
              // 被介紹人的通知併入付款成功訊息，這裡不再單獨推播
            }
          }
        }

        // ===== 組合出貨備註 =====
        const shippingRemarkParts = [];

        // 1. 兌換包數
        if (redeemItemsCount > 0) {
          shippingRemarkParts.push(`兌換 ${redeemItemsCount} 包${config.REDEEM_PRODUCT_NAME}`);
        }

        // 2. 被介紹人贈品
        if (refereeGiftText) {
          shippingRemarkParts.push(`推薦贈品 ${config.REFERRAL_GIFT_BAGS} 包（被介紹人）`);
        }

        // ===== 檢查介紹人是否有待寄贈品 =====
        const pendingGifts = config.REFERRAL_ENABLED ? await sheets.getPendingGifts(order.userId) : [];
        console.log('[callback] 待寄贈品查詢結果:', pendingGifts.map(g => ({ role: g.role, bags: g.bags, sourceOrderId: g.sourceOrderId })));
        const referrerGifts = pendingGifts.filter((g) => g.role === '介紹人');
        console.log('[callback] 介紹人待寄贈品筆數:', referrerGifts.length);

        let referrerTotalBags = 0;
        if (referrerGifts.length > 0) {
          referrerTotalBags = referrerGifts.reduce((sum, g) => sum + g.bags, 0);
          const sourceOrders = referrerGifts.map((g) => g.sourceOrderId).join('、');

          // 3. 介紹人待寄贈品
          shippingRemarkParts.push(`推薦贈品 ${referrerTotalBags} 包（介紹人，來源訂單：${sourceOrders}）`);

          if (config.OWNER_LINE_USER_ID && config.OWNER_LINE_USER_ID !== '請填入你的LINE userId') {
            await client.pushMessage({
              to: config.OWNER_LINE_USER_ID,
              messages: [{
                type: 'text',
                text: `📦 出貨提醒\n訂單編號：${orderId}\n請記得附上推薦贈品 ${referrerTotalBags} 包濾掛咖啡（來源訂單：${sourceOrders}）`,
              }],
            });
          }

          for (const gift of referrerGifts) {
            await sheets.markGiftShipped(order.userId, gift.sourceOrderId);
          }
        }

        // ===== 推播付款成功通知（整合所有活動資訊）=====
        const activity1Bags = earnedPoints;

        // 組合最終出貨備註並更新
        const shippingRemark = shippingRemarkParts.length > 0
          ? shippingRemarkParts.join('；')
          : '';
        if (shippingRemark) {
          await sheets.updateOrderShippingRemark(orderId, shippingRemark);
        }

        let noticeLines = [];
        noticeLines.push(`付款成功！✅`);
        noticeLines.push(`訂單編號：${orderId}`);
        noticeLines.push(`感謝您的購買，我們將盡快為您出貨。`);
        noticeLines.push(``);
        noticeLines.push(`📦 本次領取`);

        if (redeemItemsCount > 0) {
          noticeLines.push(`・兌換包數：${redeemItemsCount} 包`);
        }
        if (activity1Bags > 0) {
          noticeLines.push(`・下單立馬送（活動1）：${activity1Bags} 包`);
        }
        if (refereeGiftText) {
          noticeLines.push(`・被推薦人禮（活動3）：${config.REFERRAL_GIFT_BAGS} 包`);
        }
        if (referrerTotalBags > 0) {
          noticeLines.push(`・推薦人禮（活動3）：${referrerTotalBags} 包`);
        }

        if (config.POINTS_ENABLED) {
          noticeLines.push(``);
          noticeLines.push(`🌟 尚未領取`);
          noticeLines.push(`・訂單累贈包數（活動2）：${updatedPoints} 包（下次可兌換）`);
        }

        console.log('[callback] 準備推播付款成功通知 to:', order.userId);
        try {
          await client.pushMessage({
            to: order.userId,
            messages: [{
              type: 'text',
              text: noticeLines.join('\n'),
            }],
          });
          console.log('[callback] 推播成功');
        } catch (pushErr) {
          console.error('[callback] 推播失敗:', pushErr.message, pushErr.statusCode);
        }
      }
    } else {
      await sheets.updateOrderStatus(orderId, '付款失敗', body.PaymentType);
    }

    // 綠界要求回應 "1|OK" 才算接收成功,否則會重複通知
    res.send('1|OK');
  } catch (err) {
    console.error('綠界 callback 處理錯誤:', err);
    res.send('0|Error');
  }
});

// ===== 付款完成後導回頁面(客人會看到的畫面) =====
app.all('/ecpay/return', express.urlencoded({ extended: false }), (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="zh-Hant">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>付款成功</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          background: #f5f5f5;
          text-align: center;
          padding: 20px;
          box-sizing: border-box;
        }
        .checkmark { font-size: 64px; margin-bottom: 16px; }
        h2 { color: #06C755; margin: 0 0 8px; }
        p { color: #555; margin: 0 0 4px; }
      </style>
    </head>
    <body>
      <div class="checkmark">✅</div>
      <h2>付款成功！</h2>
      <p>感謝您的購買，我們將盡快為您出貨。</p>
      <p>請返回 LINE 查看訂單通知。</p>
    </body>
    </html>
  `);
});

// ===== 健康檢查(Render 會用來確認服務正常) =====
app.get('/', (req, res) => {
  res.send('LINE Bot Shop is running.');
});

// ===== 工具函式 =====
function generateOrderId() {
  // 格式: 日期+隨機碼,限制英數字且不超過20字(綠界要求)
  const now = new Date();
  const dateStr =
    now.getFullYear().toString().slice(2) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  return `ORD${dateStr}${random}`;
}

async function replyText(replyToken, text) {
  return client.replyMessage({
    replyToken,
    messages: [{ type: 'text', text }],
  });
}

// ===== 啟動伺服器 =====
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
