// api/visitors.js — List all active visitors (for dashboard)

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const DASH_PASS = process.env.DASHBOARD_PASSWORD || 'security123';

async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const json = await res.json();
  if (!json.result) return null;
  try { return JSON.parse(json.result); } catch { return json.result; }
}

async function kvLrange(key, start, end) {
  const res = await fetch(`${KV_URL}/lrange/${encodeURIComponent(key)}/${start}/${end}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const json = await res.json();
  return json.result || [];
}

export default async function handler(req, res) {
  const auth = req.headers['x-dashboard-key'];
  if (auth !== DASH_PASS) return res.status(401).json({ error: 'Unauthorized' });

  // Get list of visitor IDs registered today
  const today   = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const listKey = `visitors:${today}`;
  const ids     = await kvLrange(listKey, 0, 100);

  const visitors = [];
  for (const id of ids) {
    const v = await kvGet(`visitor:${id}`);
    if (v) visitors.push(v);
  }

  // Sort: pending first, then checked-in, then checked-out
  const order = { 'pending': 0, 'checked-in': 1, 'checked-out': 2 };
  visitors.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));

  return res.status(200).json(visitors);
}
