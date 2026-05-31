// api/bot.js — Visitor Management Bot

const ADMIN_ID  = Number(process.env.ADMIN_TELEGRAM_ID);
const BOT_TOKEN = process.env.BOT_TOKEN;
const KV_URL    = process.env.KV_REST_API_URL;
const KV_TOKEN  = process.env.KV_REST_API_TOKEN;
const APP_URL   = process.env.APP_URL;

// ── KV helpers ────────────────────────────────────────────────────────────────
async function kvSet(key, value, exSeconds) {
  const args = ['SET', key, JSON.stringify(value)];
  if (exSeconds) args.push('EX', String(exSeconds));
  await fetch(`${KV_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([args]),
  });
}
async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const json = await res.json();
  if (!json.result) return null;
  try { return JSON.parse(json.result); } catch { return json.result; }
}
async function kvDel(key) {
  await fetch(`${KV_URL}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
}

// ── Telegram helpers ──────────────────────────────────────────────────────────
async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}
async function getFileUrl(fileId) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
  const json = await res.json();
  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${json.result.file_path}`;
}

// ── Generate unique visitor ID ────────────────────────────────────────────────
function makeVisitorId() {
  const ts  = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VIS-${ts}-${rnd}`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');
  const msg = req.body?.message;
  if (!msg) return res.status(200).send('OK');

  const chatId  = msg.chat.id;
  const text    = (msg.text || '').trim();
  const isAdmin = chatId === ADMIN_ID;
  const isPhoto = !!msg.photo;

  // ══════════════════════════════════════════════════════════════
  // ADMIN COMMANDS
  // ══════════════════════════════════════════════════════════════
  if (isAdmin) {

    // approve <chatId> <hours>
    if (text.toLowerCase().startsWith('approve')) {
      const parts    = text.split(/\s+/);
      const targetId = Number(parts[1]);
      const hours    = Number(parts[2]) || 24;

      if (!targetId) {
        await tg('sendMessage', { chat_id: ADMIN_ID, text: '⚠️ Usage: approve <chatId> <hours>' });
        return res.status(200).send('OK');
      }

      const visitor = await kvGet(`pending:${targetId}`);
      if (!visitor) {
        await tg('sendMessage', { chat_id: ADMIN_ID, text: `⚠️ No pending request for ${targetId}.` });
        return res.status(200).send('OK');
      }

      const visitorId = makeVisitorId();
      const now       = Date.now();
      const expiry    = now + hours * 3600000;

      const record = {
        ...visitor,
        visitorId,
        status: 'pending',  // pending → checked-in → checked-out
        issuedAt: now,
        expiry,
        chatId: targetId,
        hours,
      };

      // Store by visitorId (for dashboard + scanner)
      await addToDaily(visitorId);
      await kvSet(`visitor:${visitorId}`, record, hours * 3600 + 300);
      // Store mapping chatId → visitorId
      await kvSet(`chat:${targetId}`, visitorId, hours * 3600 + 300);
      await kvDel(`pending:${targetId}`);
      await kvSet(`state:${targetId}`, 'approved');

      const link = `${APP_URL}/id?v=${visitorId}`;

      await tg('sendMessage', {
        chat_id: targetId,
        parse_mode: 'Markdown',
        text:
`✅ *Your visitor pass is approved!*

🪪 Visitor ID: \`${visitorId}\`
⏱ Valid for: *${hours} hour${hours > 1 ? 's' : ''}*

🔗 [Open Your Visitor ID](${link})

Show this at the security checkpoint. The barcode will be scanned for entry & exit.`,
      });

      await tg('sendMessage', {
        chat_id: ADMIN_ID,
        text: `✅ Approved ${targetId} as ${visitorId} for ${hours}h.\n🔗 ${link}`,
      });
      return res.status(200).send('OK');
    }

    // reject <chatId> <reason>
    if (text.toLowerCase().startsWith('reject')) {
      const parts    = text.split(/\s+/);
      const targetId = Number(parts[1]);
      const reason   = parts.slice(2).join(' ') || 'Request not approved.';
      if (targetId) {
        await kvDel(`pending:${targetId}`);
        await kvSet(`state:${targetId}`, 'start');
        await tg('sendMessage', { chat_id: targetId, text: `❌ Your visitor request was rejected.\nReason: ${reason}\n\nSend /start to try again.` });
        await tg('sendMessage', { chat_id: ADMIN_ID, text: `❌ Rejected ${targetId}.` });
      }
      return res.status(200).send('OK');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // VISITOR FLOW
  // ══════════════════════════════════════════════════════════════
  const state = (await kvGet(`state:${chatId}`)) || 'start';

  // /start or any first message
  if (state === 'start' || text === '/start') {
    await kvSet(`state:${chatId}`, 'awaiting_photo');
    await tg('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text:
`👋 Welcome to the *Visitor Management System*!

To register your visit, please:

📸 Send a clear *selfie photo* of yourself to get started.`,
    });
    return res.status(200).send('OK');
  }

  // Step 1 — visitor sends selfie
  if (isPhoto && state === 'awaiting_photo') {
    const fileId  = msg.photo[msg.photo.length - 1].file_id;
    await kvSet(`photo:${chatId}`, fileId, 3600);
    await kvSet(`state:${chatId}`, 'awaiting_details');
    await tg('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text:
`✅ Photo received!

Now please fill in your details and send them back:

\`\`\`
name=
phone=
purpose=
visiting=
\`\`\`

Example:
\`\`\`
name=John Doe
phone=9876543210
purpose=Interview
visiting=HR Department
\`\`\``,
    });
    return res.status(200).send('OK');
  }

  // Step 2 — visitor sends details
  if (state === 'awaiting_details' && text.includes('=')) {
    const data = {};
    for (const line of text.split('\n')) {
      const idx = line.indexOf('=');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const val = line.slice(idx + 1).trim();
      if (val) data[key] = val;
    }

    const missing = ['name', 'phone', 'purpose', 'visiting'].filter(k => !data[k]);
    if (missing.length) {
      await tg('sendMessage', {
        chat_id: chatId,
        parse_mode: 'Markdown',
        text: `⚠️ Missing: *${missing.join(', ')}*\n\nPlease resend the complete filled template.`,
      });
      return res.status(200).send('OK');
    }

    const photoFileId = await kvGet(`photo:${chatId}`);
    const photoUrl    = photoFileId ? await getFileUrl(photoFileId) : null;

    const pending = {
      ...data,
      photoFileId,
      photoUrl,
      chatId,
      submittedAt: Date.now(),
    };

    await kvSet(`pending:${chatId}`, pending, 86400);
    await kvSet(`state:${chatId}`, 'awaiting_approval');

    // Forward to admin with photo
    if (photoFileId) {
      await tg('sendPhoto', {
        chat_id: ADMIN_ID,
        photo: photoFileId,
        parse_mode: 'Markdown',
        caption:
`🆕 *New Visitor Request*
Chat ID: \`${chatId}\`

👤 Name: ${data.name}
📞 Phone: ${data.phone}
🎯 Purpose: ${data.purpose}
🏢 Visiting: ${data.visiting}

Reply:
✅ \`approve ${chatId} <hours>\` — approve
❌ \`reject ${chatId} <reason>\` — reject`,
      });
    }

    await tg('sendMessage', {
      chat_id: chatId,
      text: `⏳ Your details have been submitted!\n\nSecurity is reviewing your request. You'll receive your visitor pass shortly.`,
    });
    return res.status(200).send('OK');
  }

  // Catch-all
  if (state === 'awaiting_approval') {
    await tg('sendMessage', { chat_id: chatId, text: `⏳ Your request is being reviewed. Please wait.` });
  } else if (state === 'approved') {
    const visitorId = await kvGet(`chat:${chatId}`);
    if (visitorId) {
      await tg('sendMessage', {
        chat_id: chatId,
        parse_mode: 'Markdown',
        text: `🪪 Your visitor pass: [Open ID](${APP_URL}/id?v=${visitorId})`,
      });
    } else {
      await tg('sendMessage', { chat_id: chatId, text: `Send /start to register a new visit.` });
    }
  } else {
    await tg('sendMessage', { chat_id: chatId, text: `Send /start to begin.` });
  }

  return res.status(200).send('OK');
}

// ── Helper: push visitorId to daily list ──────────────────────────────────────
async function addToDaily(visitorId) {
  const today   = new Date().toISOString().slice(0, 10);
  const listKey = `visitors:${today}`;
  await fetch(`${KV_URL}/rpush/${encodeURIComponent(listKey)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([visitorId]),
  });
  // Set list expiry to 48h
  await fetch(`${KV_URL}/expire/${encodeURIComponent(listKey)}/172800`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
}
