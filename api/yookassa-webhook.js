const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramMessage(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('Telegram не настроен');
    return;
  }

  try {
    console.log('Отправка уведомления в Telegram...');
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      }
    );
    console.log('Уведомление отправлено в Telegram');
  } catch (error) {
    console.error('Ошибка отправки в Telegram:', error.response?.data || error.message);
  }
}

function formatDeliveries(deliveriesStr) {
  try {
    const deliveries = JSON.parse(deliveriesStr);
    return deliveries
      .map((delivery, index) => `
<b>Доставка ${index + 1}</b>
Дата: <b>${delivery.date}</b>
Событие: <b>${delivery.event}</b>
Получатель: <b>${delivery.recipientName}</b>
Телефон: <b>${delivery.recipientPhone}</b>
Адрес: <b>${delivery.recipientAddress}</b>
Пожелания: ${delivery.wishes || 'Нет'}
━━━━━━━━━━━━━━━━━━━━━━━━━`)
      .join('\n');
  } catch (e) {
    console.error('Ошибка парсинга доставок:', e.message);
    return 'Ошибка парсинга доставок';
  }
}

function buildSuccessMessage({ metadata, amount, paymentId, paymentMethod, createdAt, deliveriesInfo }) {
  return `<b>ПЛАТЁЖ УСПЕШНО ПРОВЕДЁН!</b>

<b>ИНФОРМАЦИЯ О ЗАКАЗЧИКЕ</b>
Имя: <b>${metadata.customer_name || 'Не указано'}</b>
Телефон: <b>${metadata.customer_phone || 'Не указан'}</b>
Email: <b>${metadata.customer_email || 'Не указан'}</b>

━━━━━━━━━━━━━━━━━━━━━━━━━

<b>ДЕТАЛИ ПЛАТЕЖА</b>
Сумма: <b>${amount.value} ${amount.currency}</b>
ID платежа: <b>${paymentId}</b>
Номер заказа: <b>${metadata.order_id || 'Нет данных'}</b>
Способ оплаты: <b>${paymentMethod?.type || 'Неизвестно'}</b>
Статус: <b>УСПЕШНО ОПЛАЧЕН</b>

━━━━━━━━━━━━━━━━━━━━━━━━━

<b>ГРАФИКИ ДОСТАВОК</b>${deliveriesInfo}

━━━━━━━━━━━━━━━━━━━━━━━━━

Время: <b>${new Date(createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}</b>

Заказ готов к обработке!`;
}

module.exports = async (req, res) => {
  console.log('Webhook получен от ЮKassa');
  console.log('Method:', req.method);
  console.log('Body:', req.body);

  if (req.method !== 'POST') {
    console.log('Неподдерживаемый метод:', req.method);
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { event, object } = req.body || {};

    if (!event || !object) {
      console.log('Неверный формат webhook');
      return res.status(400).send('Bad Request');
    }

    console.log(`Событие: ${event}, Платёж: ${object.id}`);

    switch (event) {
      case 'payment.succeeded': {
        const {
          id: paymentId,
          amount = {},
          metadata = {},
          payment_method: paymentMethod = {},
          created_at: createdAt
        } = object;

        const deliveriesInfo = metadata.deliveries ? formatDeliveries(metadata.deliveries) : '';
        const message = buildSuccessMessage({
          metadata,
          amount,
          paymentId,
          paymentMethod,
          createdAt,
          deliveriesInfo
        });

        await sendTelegramMessage(message);
        break;
      }
      case 'payment.canceled': {
        const message = `<b>ПЛАТЁЖ ОТМЕНЁН</b>

Номер заказа: <b>${object.metadata?.order_id || 'Нет данных'}</b>
Сумма: <b>${object.amount?.value} ${object.amount?.currency}</b>
ID платежа: <b>${object.id}</b>

Клиент отменил платёж`;

        await sendTelegramMessage(message);
        break;
      }
      case 'refund.succeeded': {
        const message = `<b>ВОЗВРАТ СРЕДСТВ ВЫПОЛНЕН</b>

ID платежа: <b>${object.payment_id}</b>
Сумма возврата: <b>${object.amount?.value} ${object.amount?.currency}</b>
ID возврата: <b>${object.id}</b>`;

        await sendTelegramMessage(message);
        break;
      }
      default:
        console.log('Необработанный тип события:', event);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Ошибка обработки webhook:', error.message);
    res.status(500).send('Error');
  }
};
