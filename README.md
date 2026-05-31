# Visitor Management System

A telegram-based visitor check-in system. Visitors register through a bot, security gets a dashboard to approve and track them, and everyone gets a scannable ID that expires automatically.

Built this because most visitor management tools are either enterprise bloatware or paper logbooks. This runs entirely serverless — no backend to maintain, no database bills, records self-delete after expiry.

---

## What it does

1. Visitor messages the Telegram bot and sends a selfie
2. Bot collects name, phone, purpose, and who they're visiting
3. Security gets a Telegram notification with the photo and details
4. Security approves with a custom time window — `approve 123456 8` for 8 hours
5. Visitor gets a link to their digital ID — photo, info, and a Code128 barcode
6. Security opens the dashboard, scans the barcode with their phone camera to check in and out
7. ID expires automatically when the time runs out, record deletes itself from Redis

---

## Stack

- **Telegram Bot API** — webhook-based, no polling, no always-on server
- **Vercel** — serverless functions, deploys on every git push
- **Upstash Redis** — ephemeral key-value store with TTL, free tier is enough
- **Vanilla JS** — no frameworks, just HTML/CSS/JS across all pages
- **JsBarcode** — Code128 barcode generation on the visitor ID
- **ZXing** — camera-based barcode scanning on the security dashboard
- **PWA** — visitor ID page is installable on phone

---

## Setup

You need a Telegram bot token from [@BotFather](https://t.me/BotFather), your Telegram user ID from [@userinfobot](https://t.me/userinfobot), a free Redis database from [Upstash](https://upstash.com), and a [Vercel](https://vercel.com) account.

### 1. Clone and deploy

```bash
git clone https://github.com/yourusername/visitor-management-system
cd visitor-management-system
vercel --prod
```

### 2. Add environment variables in Vercel dashboard

```
BOT_TOKEN               — from @BotFather
ADMIN_TELEGRAM_ID       — your numeric Telegram user ID
KV_REST_API_URL         — Upstash Redis REST URL
KV_REST_API_TOKEN       — Upstash Redis REST token
APP_URL                 — your Vercel deployment URL
DASHBOARD_USERS         — JSON array of staff credentials (see below)
```

**DASHBOARD_USERS format:**
```json
[
  {"username":"john","password":"pass123","name":"John"},
  {"username":"mary","password":"pass456","name":"Mary"}
]
```

Each staff member gets their own login. Their name shows in the dashboard header after signing in.

### 3. Register the Telegram webhook

```
https://api.telegram.org/botYOUR_TOKEN/setWebhook?url=https://your-app.vercel.app/api/bot
```

### 4. Redeploy after adding env vars

---

## Admin commands (Telegram)

```
approve 123456789 8    — approve visitor, valid for 8 hours
reject 123456789 reason — reject with a reason
```

The visitor's chat ID is shown in the notification you receive when they submit their details.

---

## Security dashboard

Open `your-app.vercel.app` and log in with your staff credentials.

- **Scanner tab** — start the camera to scan barcodes, or type a visitor ID manually. Hit Check In when they arrive, Check Out when they leave.
- **Visitors tab** — lists everyone registered today, sorted by status. Click any card to jump to their record in the scanner.

---

## Project structure

```
api/
  bot.js        — telegram webhook, handles the entire visitor registration flow
  visitor.js    — get or update a single visitor record
  visitors.js   — list today's visitors for the dashboard
  auth.js       — validates staff login credentials
public/
  id.html       — visitor ID page with photo, info, and barcode (installable PWA)
  dashboard.html — security dashboard with camera scanner and visitor list
```

---

## Notes

- No data is stored permanently. Everything in Redis has a TTL and deletes itself.
- Telegram photo URLs expire after ~1 hour. For a production deployment you'd want to re-upload photos to your own storage (S3, Cloudflare R2, etc.) on approval.
- The barcode camera scanner works best in good lighting and needs camera permission in the browser. Manual entry always works as a fallback.
- All status update calls to the API require the `x-dashboard-key` header so the visitor ID page can't be used to check itself in.
