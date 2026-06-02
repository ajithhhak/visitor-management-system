// api/visitors.js — List all active visitors (for dashboard)
import { isValidAuth } from './_auth.js';

const KV_URL    = process.env.KV_REST_API_URL;
const KV_TOKEN  = process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const json = await res.json();
  if (!json.result) return null;
  try { return JSON.parse(json.result); } catch { return json.result; }
}

async function kvLrange(key) {
  // Upstash REST: POST /pipeline with LRANGE command
  const res = await fetch(`${KV_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['LRANGE', key, '0', '200']]),
  });
  const json = await res.json();
  // pipeline returns array of results
  return json?.[0]?.result || [];
}

export default async function handler(req, res) {
  const auth = req.headers['x-dashboard-key'];
  if (!isValidAuth(auth)) return res.status(401).json({ error: 'Unauthorized' });

  const today   = new Date().toISOString().slice(0, 10);
  const listKey = `visitors:${today}`;
  const ids     = await kvLrange(listKey);

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
