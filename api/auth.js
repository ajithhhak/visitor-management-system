// api/auth.js — validate dashboard password

const DASH_PASS = process.env.DASHBOARD_PASSWORD || 'security123';

export default async function handler(req, res) {
  const auth = req.headers['x-dashboard-key'];
  if (auth === DASH_PASS) return res.status(200).json({ ok: true });
  return res.status(401).json({ ok: false });
}
