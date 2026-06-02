// api/auth.js — validate dashboard credentials
import { isValidAuth } from './_auth.js';

export default async function handler(req, res) {
  const auth = req.headers['x-dashboard-key'];
  const user = isValidAuth(auth);
  if (user) {
    return res.status(200).json({ ok: true, name: user.name || user.username });
  }
  return res.status(401).json({ ok: false });
}
