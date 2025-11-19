// Little Junkers Facebook Messenger Bot
// Stores conversation memory in Vercel KV
// Responds in warm Southern style and handles lead extraction

import { kv } from '@vercel/kv';
import fetch from 'node-fetch';

const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export default async function handler(req, res) {
  // --- Facebook verification handshake ---
  if (req.method === "GET") {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }

  // --- Incoming message ---
  if (req.method === "POST") {
    const body = req.body;

    if (body.object === "page") {
      for (const entry of body.entry) {
        const event = entry.messaging?.[0];
        if (!event) continue;

        const senderId = event.sender.id;
        const messageText = event.message?.text;

        if (!messageText) continue;

        // ---- Retrieve or initialize memory ----
        const memoryKey = `conv:${senderId}`;
        let chatHistory = (await kv.get(memoryKey)) || [];

        // ---- Profanity 3-strike system ----
        const profanity = /(fuck|shit|bitch|pendejo|idiot|asshole)/i;
        let strikes = await kv.get(`strike:${senderId}`) || 0;

        if (profanity.test(messageText)) {
          strikes += 1;
          await kv.set(`strike:${senderId}`, strikes);

          if (strikes >= 3) {
            await sendFB(senderId, "I'm here to help, but I can’t keep chatting if that language continues. We'll stop here for now.");
            return res.sendStatus(200);
          }

          await sendFB(senderId, "I’m happy to help, but please keep the language clean for me.");
          return res.sendStatus(200);
        }

        // ---- Build ChatGPT prompt ----
        chatHistory.push({ role: "user", content: messageText });

        const systemPrompt = `
You are Little Junkers’ automated assistant.
Speak with warm, friendly Southern hospitality.
Always keep replies short and conversational.

If user writes Spanish → answer in Spanish.
Collect:
- name
- phone
- email
- delivery address
- dumpster size
- city and dates

But DO NOT book jobs yourself — instead reply:

"Once you're ready, I’ll send you a secure Stripe link so you can lock in your dumpster and get priority scheduling."

Also classify message into:
- Dumpster Rental Request
- Pricing Question
- Availability Question
- Junk Removal / Pickup
- Wrong Business / Spam
- Customer Complaint
- Inappropriate (handled separately)
`;

        // ---- Send to ChatGPT ----
        const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-4.1",
            messages: [
              { role: "system", content: systemPrompt },
              ...chatHistory
            ]
          })
        }).then(r => r.json());

        const botReply = openaiResponse.choices?.[0]?.message?.content || "Hey there! How can I help you today? 😊";

        // ---- Save memory ----
        chatHistory.push({ role: "assistant", content: botReply });
        await kv.set(memoryKey, chatHistory);

        // ---- Send reply back to Facebook ----
        await sendFB(senderId, botReply);

      }

      return res.sendStatus(200);
    }

    return res.sendStatus(404);
  }
}


// Utility: Send message back to Messenger
async function sendFB(senderId, text) {
  await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: senderId },
      message: { text }
    })
  });
}
