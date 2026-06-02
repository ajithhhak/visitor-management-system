// api/visitor.js — Get visitor record by visitorId
import { isValidAuth } from './_auth.js';

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const json = await res.json();
  if (!json.result) return null;
  try { return JSON.parse(json.result); } catch { return json.result; }
}
async function kvSet(key, value, exSeconds) {
  const args = ['SET', key, JSON.stringify(value)];
  if (exSeconds) args.push('EX', String(exSeconds));
  await fetch(`${KV_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([args]),
  });
}

export default async function handler(req, res) {
  const { v, action } = req.query;
  if (!v) return res.status(400).json({ error: 'Missing visitor ID' });

  const record = await kvGet(`visitor:${v}`);
  if (!record) return res.status(404).json({ error: 'Visitor not found or expired' });

  // Check expiry
  if (Date.now() > record.expiry) {
    return res.status(410).json({ error: 'Visitor pass expired' });
  }

  // PATCH — update status (checkin / checkout)
  if (req.method === 'PATCH' && action) {
    const auth = req.headers['x-dashboard-key'];
    if (!isValidAuth(auth)) return res.status(401).json({ error: 'Unauthorized' });

    if (action === 'checkin' && record.status === 'pending') {
      record.status    = 'checked-in';
      record.checkinAt = Date.now();
    } else if (action === 'checkout' && record.status === 'checked-in') {
      record.status     = 'checked-out';
      record.checkoutAt = Date.now();
    } else {
      return res.status(400).json({ error: `Cannot ${action} from status: ${record.status}` });
    }

    const remainingTtl = Math.floor((record.expiry - Date.now()) / 1000);
    await kvSet(`visitor:${v}`, record, remainingTtl);
    return res.status(200).json({ ok: true, status: record.status });
  }

  // GET — return visitor data
  return res.status(200).json(record);
}
