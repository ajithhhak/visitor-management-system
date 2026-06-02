// api/_auth.js — Shared staff dashboard authentication helper

export function isValidAuth(authHeader) {
  if (!authHeader) return null;
  const [user, pass] = authHeader.split(':');
  if (!user || !pass) return null;

  let users = [];
  try {
    if (process.env.DASHBOARD_USERS) {
      users = JSON.parse(process.env.DASHBOARD_USERS);
    }
  } catch {
    // ignore parsing errors and fallback
  }

  if (!users || users.length === 0) {
    const u = process.env.DASHBOARD_USERNAME || 'security';
    const p = process.env.DASHBOARD_PASSWORD || 'security123';
    users = [{ username: u, password: p }];
  }

  const match = users.find(u => u.username === user && u.password === pass);
  return match || null;
}
