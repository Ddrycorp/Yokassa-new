const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID;
const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY;
const YOOKASSA_RETURN_URL = process.env.YOOKASSA_RETURN_URL || 'https://your-site.com/success';
const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3';

const TARIFFS = {
  basic: 500,
  standard: 750,
  premium: 1000
};

function validateEnvironment() {
  if (!YOOKASSA_SHOP_ID || !YOOKASSA_SECRET_KEY) {
    throw new Error('Отсутствуют ключи YOOKASSA_SHOP_ID/YOOKASSA_SECRET_KEY');
  }
}

function validateRequestBody(body) {
  const { orderId, customerName, planKey, deliveries } = body;

  if (!orderId || !customerName || !planKey || !deliveries || !Array.isArray(deliveries)) {
    return 'Отсутствуют обязательные параметры';
  }

  if (!TARIFFS[planKey]) {
    return 'Некорректный тарифный план';
  }

  if (deliveries.length === 0) {
    return 'Не переданы графики доставок';
  }

  return null;
}

function buildPaymentData({
  planKey,
  deliveries,
  orderId,
  customerName,
  customerEmail,
  customerPhone
}) {
  const amount = TARIFFS[planKey] * deliveries.length;

  return {
    amount: {
      value: amount.toFixed(2),
      currency: 'RUB'
    },
    confirmation: {
      type: 'redirect',
      return_url: YOOKASSA_RETURN_URL
    },
    capture: true,
    description: `Подписка на цветы - ${deliveries.length} доставок`,
    metadata: {
      order_id: orderId,
      customer_name: customerName,
      customer_email: customerEmail || '',
      customer_phone: customerPhone || '',
      plan: planKey,
      deliveries: JSON.stringify(deliveries)
    }
  };
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    validateEnvironment();

    const {
      orderId,
      customerEmail,
      customerPhone,
      customerName,
      planKey,
      deliveries
    } = req.body || {};

    console.log('Создание платежа ЮKassa:', { orderId, customerName, planKey });

    const validationError = validateRequestBody(req.body || {});
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError
      });
    }

    const paymentData = buildPaymentData({
      planKey,
      deliveries,
      orderId,
      customerName,
      customerEmail,
      customerPhone
    });

    const response = await axios.post(
      `${YOOKASSA_API_URL}/payments`,
      paymentData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotence-Key': uuidv4()
        },
        auth: {
          username: YOOKASSA_SHOP_ID,
          password: YOOKASSA_SECRET_KEY
        }
      }
    );

    console.log('Платёж создан:', response.data.id);

    res.json({
      success: true,
      paymentId: response.data.id,
      paymentUrl: response.data.confirmation.confirmation_url,
      status: response.data.status
    });

  } catch (error) {
    const errorDetails = error.response?.data || error.message;
    console.error('Ошибка создания платежа:', errorDetails);

    res.status(500).json({
      success: false,
      error: error.response?.data?.description || error.message
    });
  }
};
