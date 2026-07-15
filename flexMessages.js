// flexMessages.js
// 負責產生各種 Flex Message(分類選單、商品卡片、購物車)

/**
 * 主選單 - 顯示分類按鈕
 * @param {Array} categories - 分類清單
 * @param {String} headerText - 卡片上方說明文字(選填)
 */
function buildCategoryMenu(categories, headerText) {
  const buttons = categories.map((cat) => ({
    type: 'button',
    style: 'primary',
    color: '#06C755',
    action: {
      type: 'postback',
      label: cat,
      data: `action=showCategory&category=${encodeURIComponent(cat)}`,
      displayText: `查看「${cat}」商品`,
    },
    margin: 'sm',
  }));

  // 若有說明文字，加在 header 下方
  const headerContents = [
    {
      type: 'text',
      text: '🛒 我們的濾掛品項',
      weight: 'bold',
      size: 'xl',
    },
    {
      type: 'text',
      text: '請選擇您想購買的濾掛選項',
      size: 'sm',
      color: '#999999',
      margin: 'sm',
    },
  ];

  if (headerText) {
    headerContents.push({ type: 'separator', margin: 'md' });
    headerContents.push({
      type: 'text',
      text: headerText,
      size: 'xs',
      color: '#555555',
      wrap: true,
      margin: 'md',
    });
  }

  return {
    type: 'flex',
    altText: '請選擇濾掛品項',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: headerContents,
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: buttons,
      },
    },
  };
}

/**
 * 商品列表 - 依分類顯示商品卡片(Carousel,最多10個)
 */
function buildProductCarousel(products, category) {
  const bubbles = products.slice(0, 10).map((p) => ({
    type: 'bubble',
    size: 'micro',
    hero: {
      type: 'image',
      url: p.image || 'https://via.placeholder.com/300x300?text=No+Image',
      size: 'full',
      aspectRatio: '1:1',
      aspectMode: 'cover',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: p.name,
          weight: 'bold',
          size: 'sm',
          wrap: true,
        },
        {
          type: 'text',
          text: `NT$ ${p.price}`,
          size: 'sm',
          color: '#06C755',
          weight: 'bold',
          margin: 'sm',
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
          height: 'sm',
          action: {
            type: 'postback',
            label: '加入購物車',
            data: `action=addToCart&productId=${encodeURIComponent(p.id)}`,
            displayText: `將「${p.name}」加入購物車`,
          },
        },
      ],
    },
  }));

  return {
    type: 'flex',
    altText: `${category} 商品列表`,
    contents: {
      type: 'carousel',
      contents: bubbles,
    },
  };
}

/**
 * 購物車內容顯示
 */
function buildCartSummary(cartItems, totalAmount) {
  if (!cartItems || cartItems.length === 0) {
    return {
      type: 'text',
      text: '您的購物車目前是空的喔!輸入「我要買」開始選購吧 🛍️',
    };
  }

  const itemRows = cartItems.map((item) => ({
    type: 'box',
    layout: 'vertical',
    margin: 'md',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'text',
            text: item.name,
            size: 'sm',
            flex: 3,
            wrap: true,
          },
          {
            type: 'text',
            text: `NT$ ${item.price * item.quantity}`,
            size: 'sm',
            align: 'end',
            flex: 2,
          },
        ],
      },
      {
        type: 'box',
        layout: 'horizontal',
        margin: 'sm',
        alignItems: 'center',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            flex: 0,
            action: {
              type: 'postback',
              label: '－',
              data: `action=decreaseQty&productId=${encodeURIComponent(item.id)}`,
              displayText: `減少「${item.name}」數量`,
            },
          },
          {
            type: 'text',
            text: `${item.quantity}`,
            align: 'center',
            gravity: 'center',
            flex: 1,
          },
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            flex: 0,
            action: {
              type: 'postback',
              label: '＋',
              data: `action=increaseQty&productId=${encodeURIComponent(item.id)}`,
              displayText: `增加「${item.name}」數量`,
            },
          },
        ],
      },
      { type: 'separator', margin: 'md' },
    ],
  }));

  return {
    type: 'flex',
    altText: '購物車明細',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🛒 購物車明細',
            weight: 'bold',
            size: 'lg',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          ...itemRows,
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              { type: 'text', text: '總計', weight: 'bold' },
              {
                type: 'text',
                text: `NT$ ${totalAmount}`,
                weight: 'bold',
                align: 'end',
                color: '#06C755',
              },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#06C755',
            action: {
              type: 'postback',
              label: '前往結帳',
              data: 'action=checkout',
              displayText: '我要結帳',
            },
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '清空購物車',
              data: 'action=clearCart',
              displayText: '清空購物車',
            },
          },
        ],
      },
    },
  };
}

/**
 * 詢問客人是否使用上次的收件資訊
 */
function buildShippingInfoChoice(customerInfo) {
  return {
    type: 'flex',
    altText: '請選擇收件資訊',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '📦 收件資訊',
            weight: 'bold',
            size: 'lg',
          },
          {
            type: 'text',
            text: '是否使用上次的收件資訊?',
            size: 'sm',
            color: '#999999',
            margin: 'md',
          },
          { type: 'separator', margin: 'md' },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            spacing: 'xs',
            contents: [
              { type: 'text', text: `姓名: ${customerInfo.name}`, size: 'sm', wrap: true },
              { type: 'text', text: `電話: ${customerInfo.phone}`, size: 'sm', wrap: true },
              { type: 'text', text: `地址: ${customerInfo.address}`, size: 'sm', wrap: true },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#06C755',
            action: {
              type: 'postback',
              label: '使用上次資訊',
              data: 'action=useLastShippingInfo',
              displayText: '使用上次的收件資訊',
            },
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '輸入新資訊',
              data: 'action=enterNewShippingInfo',
              displayText: '我要輸入新的收件資訊',
            },
          },
        ],
      },
    },
  };
}

/**
 * 顯示客人的歷史訂單清單
 */
function buildOrderHistory(orders) {
  if (!orders || orders.length === 0) {
    return {
      type: 'text',
      text: '目前查無訂單紀錄。輸入「我要買」開始選購吧 🛍️',
    };
  }

  const statusColor = (status) => {
    if (status === '已付款') return '#06C755';
    if (status === '付款失敗') return '#FF334B';
    return '#999999'; // 待付款或其他
  };

  const bubbles = orders.map((order) => ({
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      contents: [
        {
          type: 'text',
          text: order.orderId,
          weight: 'bold',
          size: 'sm',
        },
        {
          type: 'text',
          text: order.time || '',
          size: 'xxs',
          color: '#999999',
        },
        { type: 'separator', margin: 'sm' },
        {
          type: 'text',
          text: order.itemsText || '',
          size: 'xs',
          wrap: true,
          margin: 'sm',
        },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'md',
          contents: [
            { type: 'text', text: '總金額', size: 'sm' },
            {
              type: 'text',
              text: `NT$ ${order.totalAmount}`,
              size: 'sm',
              align: 'end',
              weight: 'bold',
            },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '狀態', size: 'sm' },
            {
              type: 'text',
              text: order.status || '',
              size: 'sm',
              align: 'end',
              color: statusColor(order.status),
              weight: 'bold',
            },
          ],
        },
      ],
    },
  }));

  return {
    type: 'flex',
    altText: '我的訂單',
    contents: {
      type: 'carousel',
      contents: bubbles,
    },
  };
}

/**
 * 詢問客人是否使用上次的超商門市資訊
 */
function buildCvsInfoChoice(cvsInfo) {
  return {
    type: 'flex',
    altText: '請選擇取貨門市資訊',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🏪 取貨門市資訊',
            weight: 'bold',
            size: 'lg',
          },
          {
            type: 'text',
            text: '是否使用上次的取貨資訊?',
            size: 'sm',
            color: '#999999',
            margin: 'md',
          },
          { type: 'separator', margin: 'md' },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            spacing: 'xs',
            contents: [
              { type: 'text', text: `超商: ${cvsInfo.brand}`, size: 'sm', wrap: true },
              { type: 'text', text: `門市: ${cvsInfo.storeName}`, size: 'sm', wrap: true },
              { type: 'text', text: `姓名: ${cvsInfo.name}`, size: 'sm', wrap: true },
              { type: 'text', text: `電話: ${cvsInfo.phone}`, size: 'sm', wrap: true },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#06C755',
            action: {
              type: 'postback',
              label: '使用上次門市資訊',
              data: 'action=useLastCvsInfo',
              displayText: '使用上次的取貨門市資訊',
            },
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '輸入新門市資訊',
              data: 'action=enterNewCvsInfo',
              displayText: '我要輸入新的取貨門市資訊',
            },
          },
        ],
      },
    },
  };
}

/**
 * 顯示客人目前可兌換包數
 */
function buildPointsInfo(points, config) {
  const redeemable = Math.floor(points * config.REDEEM_ITEMS_PER_POINT);
  const statusText = points > 0
    ? `可兌換 ${redeemable} 包${config.REDEEM_PRODUCT_NAME}`
    : '尚無可兌換的包數，快來下單累積吧！';

  return {
    type: 'flex',
    altText: `您目前可兌換 ${redeemable} 包`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '⭐ 我的兌換包數',
            weight: 'bold',
            size: 'lg',
          },
          { type: 'separator', margin: 'md' },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'lg',
            contents: [
              { type: 'text', text: '累積包數', size: 'md' },
              {
                type: 'text',
                text: `${redeemable} 包`,
                size: 'md',
                align: 'end',
                weight: 'bold',
                color: '#06C755',
              },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
              { type: 'text', text: '兌換商品', size: 'sm', color: '#999999' },
              {
                type: 'text',
                text: config.REDEEM_PRODUCT_NAME,
                size: 'sm',
                align: 'end',
                color: '#999999',
              },
            ],
          },
          {
            type: 'text',
            text: statusText,
            size: 'xs',
            color: '#aaaaaa',
            margin: 'md',
            wrap: true,
          },
        ],
      },
    },
  };
}

/**
 * 詢問客人是否要兌換包數
 */
function buildRedeemChoice(points, config) {
  const maxRedeemable = Math.floor(points * config.REDEEM_ITEMS_PER_POINT);
  return {
    type: 'flex',
    altText: '您有可兌換的包數！',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🎁 兌換包數',
            weight: 'bold',
            size: 'lg',
          },
          {
            type: 'text',
            text: `您目前可兌換最多 ${maxRedeemable} 包${config.REDEEM_PRODUCT_NAME}。\n\n請直接輸入想兌換的包數\n(輸入 0 表示不兌換)`,
            size: 'sm',
            color: '#555555',
            margin: 'md',
            wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '不兌換，直接結帳',
              data: 'action=skipRedeem',
              displayText: '不兌換',
            },
          },
        ],
      },
    },
  };
}

/**
 * 顯示推薦碼卡片，含「分享給LINE好友」與「複製推薦碼」兩個按鈕
 */
function buildReferralCode(code, config) {
  // LINE 分享文字訊息給好友的 URI scheme
  const shareText = `我在「${config.SHOP_NAME}」買咖啡，分享你我的推薦碼：${code}\n下單滿${config.REFERRAL_MIN_ORDER_AMOUNT}元並填入這組推薦碼，雙方都能獲得${config.REFERRAL_BONUS_POINTS}包超級限量的特別版濾掛咖啡！\n\n加入官方帳號開始選購：${config.OA_LINK_URL}`;
  const shareUri = `https://line.me/R/share?text=${encodeURIComponent(shareText)}`;

  return {
    type: 'flex',
    altText: `您的推薦碼：${code}`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🎁 您的專屬推薦碼',
            weight: 'bold',
            size: 'lg',
          },
          { type: 'separator', margin: 'md' },
          {
            type: 'text',
            text: code,
            weight: 'bold',
            size: 'xxl',
            align: 'center',
            color: '#06C755',
            margin: 'lg',
          },
          { type: 'separator', margin: 'lg' },
          {
            type: 'text',
            text: `將推薦碼分享給朋友，朋友下單 ${config.REFERRAL_MIN_ORDER_AMOUNT} 元以上並填入推薦碼，付款成功後：\n\n・您將獲得 ${config.REFERRAL_BONUS_POINTS} 包超級限量的特別版濾掛咖啡\n・朋友也獲得 ${config.REFERRAL_BONUS_POINTS} 包超級限量的特別版濾掛咖啡\n\n感謝您！`,
            size: 'sm',
            color: '#555555',
            wrap: true,
            margin: 'md',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#06C755',
            action: {
              type: 'uri',
              label: '📤 分享給LINE好友',
              uri: shareUri,
            },
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '📋 複製推薦碼',
              data: `action=copyReferralCode&code=${encodeURIComponent(code)}`,
              displayText: '複製推薦碼',
            },
          },
        ],
      },
    },
  };
}

/**
 * 複製推薦碼用的純文字訊息(客人點「複製推薦碼」按鈕後回傳)
 */
function buildReferralCodeCopyText(code, config) {
  return {
    type: 'text',
    text: `我的推薦碼：${code}\n下單滿${config.REFERRAL_MIN_ORDER_AMOUNT}元並填入這組推薦碼，雙方都能獲得${config.REFERRAL_BONUS_POINTS}包超級限量的特別版濾掛咖啡！\n\n加入官方帳號開始選購：${config.OA_LINK_URL}\n\n👆 長按以上文字即可複製，貼給朋友使用！`,
  };
}

/**
 * 詢問是否有推薦碼(結帳時)
 */
function buildReferralCodeInput(config) {
  return {
    type: 'flex',
    altText: '是否有推薦碼？',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🎁 推薦碼',
            weight: 'bold',
            size: 'lg',
          },
          {
            type: 'text',
            text: '如果朋友有給您推薦碼，請直接輸入推薦碼文字。\n沒有的話請點選「略過」。',
            size: 'sm',
            color: '#555555',
            margin: 'md',
            wrap: true,
          },
          {
            type: 'text',
            text: `⚠️ 推薦碼需訂單滿 ${config ? config.REFERRAL_MIN_ORDER_AMOUNT : 1000} 元才生效`,
            size: 'xs',
            color: '#e8a000',
            margin: 'sm',
            wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '略過，沒有推薦碼',
              data: 'action=skipReferral',
              displayText: '略過推薦碼',
            },
          },
        ],
      },
    },
  };
}

/**
 * 跟老闆說說 - 按鈕連結卡片
 */
function buildContactButton(url) {
  return {
    type: 'flex',
    altText: '跟老闆說說',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '💬 跟老闆說說',
            weight: 'bold',
            size: 'lg',
          },
          {
            type: 'text',
            text: '有任何問題或合作需求，歡迎直接聯絡我們！',
            size: 'sm',
            color: '#555555',
            margin: 'md',
            wrap: true,
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
              label: '點我跟老闆說說',
              uri: url,
            },
          },
        ],
      },
    },
  };
}

module.exports = {
  buildCategoryMenu,
  buildProductCarousel,
  buildCartSummary,
  buildShippingInfoChoice,
  buildCvsInfoChoice,
  buildOrderHistory,
  buildDeliveryChoice,
  buildConvenienceStoreChoice,
  buildNoteChoice,
  buildPointsInfo,
  buildRedeemChoice,
  buildReferralCode,
  buildReferralCodeInput,
  buildReferralCodeCopyText,
  buildAdCodeInput,
  buildContactButton,
  buildPaymentButton,
  buildAccountSummary,
  buildCustomerSearchResult,
};

/**
 * 帳戶摘要卡片（客人查詢自己 / 店家查詢客人）
 */
function buildAccountSummary({ name, phone, points, referrerBags, refereeBags, config }) {
  const redeemable = Math.floor(points * config.REDEEM_ITEMS_PER_POINT);
  const totalPendingBags = referrerBags + refereeBags;

  const rows = [
    { label: '姓名', value: name || '未設定' },
    { label: '電話', value: phone || '未設定' },
  ];

  if (config.POINTS_ENABLED) {
    rows.push({ label: '訂單累贈包數', value: `${redeemable} 包`, highlight: true });
    rows.push({ label: '兌換商品', value: config.REDEEM_PRODUCT_NAME });
  }

  if (config.REFERRAL_ENABLED) {
    if (referrerBags > 0) {
      rows.push({ label: '推薦贈品待領', value: `${referrerBags} 包（下次訂單隨貨寄出）` });
    } else {
      rows.push({ label: '推薦贈品待領', value: '0 包' });
    }
  }

  if (!config.POINTS_ENABLED && !config.REFERRAL_ENABLED) {
    rows.push({ label: '說明', value: '目前無累贈或推薦活動' });
  } else if (totalPendingBags === 0 && points === 0) {
    rows.push({ label: '說明', value: '尚無訂單累贈包數或推薦贈品' });
  }

  const contents = rows.map((row) => ({
    type: 'box',
    layout: 'horizontal',
    margin: 'sm',
    contents: [
      { type: 'text', text: row.label, size: 'sm', color: '#999999', flex: 3, wrap: true },
      {
        type: 'text',
        text: row.value,
        size: 'sm',
        flex: 4,
        align: 'end',
        wrap: true,
        weight: row.highlight ? 'bold' : 'regular',
        color: row.highlight ? '#06C755' : '#333333',
      },
    ],
  }));

  return {
    type: 'flex',
    altText: `${name} 的帳戶摘要`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#06C755',
        contents: [
          { type: 'text', text: '👤 帳戶查詢', weight: 'bold', color: '#ffffff', size: 'lg' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          ...contents,
        ],
      },
    },
  };
}

/**
 * 同名客人列表（讓店家進一步用電話確認）
 */
function buildCustomerSearchResult(customers) {
  const buttons = customers.map((c) => ({
    type: 'button',
    style: 'secondary',
    height: 'sm',
    action: {
      type: 'postback',
      label: `${c.name}　${c.phone || '無電話'}`,
      data: `action=ownerQueryByPhone&phone=${encodeURIComponent(c.phone)}`,
      displayText: `查詢 ${c.name}（${c.phone}）`,
    },
    margin: 'sm',
  }));

  return {
    type: 'flex',
    altText: '找到多位同名客人，請選擇',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '找到多位同名客人', weight: 'bold', size: 'md' },
          { type: 'text', text: '請選擇要查詢的客人：', size: 'sm', color: '#999999', margin: 'sm' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: buttons,
      },
    },
  };
}

/**
 * 配送方式選擇:宅配 or 超商取貨
 */
function buildDeliveryChoice() {
  return {
    type: 'flex',
    altText: '請選擇配送方式',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🚚 配送方式',
            weight: 'bold',
            size: 'lg',
          },
          {
            type: 'text',
            text: '請選擇您希望的取貨方式',
            size: 'sm',
            color: '#999999',
            margin: 'md',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#06C755',
            action: {
              type: 'postback',
              label: '🏠 宅配到府',
              data: 'action=selectDelivery&method=home',
              displayText: '我要宅配到府',
            },
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '🏪 超商取貨',
              data: 'action=selectDelivery&method=cvs',
              displayText: '我要超商取貨',
            },
          },
        ],
      },
    },
  };
}

/**
 * 超商品牌選擇(目前僅支援 7-ELEVEN)
 */
function buildConvenienceStoreChoice() {
  return {
    type: 'flex',
    altText: '超商取貨不付款',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🏪 超商取貨',
            weight: 'bold',
            size: 'lg',
          },
          {
            type: 'text',
            text: '目前支援以下超商取貨(先線上付款)',
            size: 'sm',
            color: '#999999',
            margin: 'md',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#006B3F',
            action: {
              type: 'postback',
              label: '7-ELEVEN',
              data: 'action=selectCVS&brand=7-ELEVEN',
              displayText: '7-ELEVEN 超商取貨',
            },
          },
        ],
      },
    },
  };
}

/**
 * 詢問客人是否有備註(結帳最後一步)
 */
function buildNoteChoice() {
  return {
    type: 'flex',
    altText: '是否有備註?',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '📝 備註',
            weight: 'bold',
            size: 'lg',
          },
          {
            type: 'text',
            text: '如有特殊需求或備註，請直接輸入文字。\n若沒有備註，請點選下方「略過」按鈕。',
            size: 'sm',
            color: '#555555',
            margin: 'md',
            wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '略過，不填備註',
              data: 'action=skipNote',
              displayText: '略過備註',
            },
          },
        ],
      },
    },
  };
}


/**
 * 付款按鈕卡片 - 取代純文字付款連結
 */
function buildPaymentButton(order, paymentUrl) {
  const infoRows = [
    { label: '訂單編號', value: order.orderId },
    { label: '配送方式', value: order.deliveryMethod },
    { label: '姓名', value: order.recipientName },
    { label: '電話', value: order.recipientPhone },
    { label: order.locationLabel, value: order.addressOrStore },
    { label: '總金額', value: `NT$ ${order.totalAmount}` },
  ]
    .filter((row) => row.value)
    .map((row) => ({
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: row.label, size: 'sm', color: '#999999', flex: 2 },
        { type: 'text', text: String(row.value), size: 'sm', flex: 3, wrap: true, align: 'end' },
      ],
    }));

  const extraRows = [];
  if (order.noteText) {
    extraRows.push({
      type: 'text',
      text: order.noteText,
      size: 'xs',
      color: '#aaaaaa',
      wrap: true,
      margin: 'sm',
    });
  }
  if (order.referralMsg) {
    extraRows.push({
      type: 'text',
      text: order.referralMsg,
      size: 'xs',
      color: '#06C755',
      wrap: true,
      margin: 'sm',
    });
  }

  return {
    type: 'flex',
    altText: '訂單已建立，請點擊付款',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#06C755',
        contents: [
          {
            type: 'text',
            text: '📦 訂單已建立！',
            weight: 'bold',
            color: '#ffffff',
            size: 'lg',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          ...infoRows,
          { type: 'separator', margin: 'md' },
          ...extraRows,
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
              label: '💳 立即前往付款',
              uri: paymentUrl,
            },
          },
        ],
      },
    },
  };
}

/**
 * 活動序號輸入卡片
 */
function buildAdCodeInput() {
  return {
    type: 'flex',
    altText: '請輸入活動序號（選填）',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🎟️ 活動序號',
            weight: 'bold',
            size: 'lg',
          },
          {
            type: 'text',
            text: '若您是透過活動廣告加入，請輸入活動序號。\n\n沒有活動序號請點下方「略過」。',
            size: 'sm',
            color: '#555555',
            margin: 'md',
            wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '略過，沒有活動序號',
              data: 'action=skipAdCode',
              displayText: '略過活動序號',
            },
          },
        ],
      },
    },
  };
}
