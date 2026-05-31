// api/auth.js — validate dashboard credentials
// DASHBOARD_USERS env var format (JSON):
// [{"username":"john","password":"pass123"},{"username":"mary","password":"pass456"}]

export default async function handler(req, res) {
  const auth = req.headers['x-dashboard-key'];
  if (!auth) return res.status(401).json({ ok: false });

  const [user, pass] = auth.split(':');
  if (!user || !pass) return res.status(401).json({ ok: false });

  let users = [];
  try {
    users = JSON.parse(process.env.DASHBOARD_USERS || '[]');
  } catch {
    // fallback to single user
    const u = process.env.DASHBOARD_USERNAME || 'security';
    const p = process.env.DASHBOARD_PASSWORD || 'security123';
    users = [{ username: u, password: p }];
  }

  const match = users.find(u => u.username === user && u.password === pass);
  if (match) return res.status(200).json({ ok: true, name: match.name || match.username });
  return res.status(401).json({ ok: false });
}
