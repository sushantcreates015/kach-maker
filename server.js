const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { db, seedAdmin } = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const PROTECTED_DIR = path.join(__dirname, 'protected');
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'replace-me-cookie-secret';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const ADMIN_LOGIN_PATH = process.env.ADMIN_LOGIN_PATH || '/owner-auth-portal-2026';
const ADMIN_DASHBOARD_PATH = process.env.ADMIN_DASHBOARD_PATH || '/owner-access-dashboard-2026';
const SESSION_MAX_HOURS = Math.max(1, Number(process.env.SESSION_MAX_HOURS || 24));
const secureCookie = process.env.NODE_ENV === 'production';

seedAdmin(ADMIN_USER, ADMIN_PASS);

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '250kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser(COOKIE_SECRET));

app.use((req, res, next) => {
  if (!req.signedCookies.device_id) {
    res.cookie('device_id', randomId(), {
      httpOnly: true,
      signed: true,
      sameSite: 'lax',
      secure: secureCookie,
      maxAge: 1000 * 60 * 60 * 24 * 365 * 2,
    });
  }

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(express.static(PUBLIC_DIR));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
});

function randomId() {
  return crypto.randomBytes(24).toString('hex');
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip || '')).digest('hex');
}

function durationToMs(value, unit) {
  const v = Math.max(1, Number(value || 1));
  const u = String(unit || 'hour').toLowerCase();

  if (u === 'minute') return v * 60 * 1000;
  if (u === 'day') return v * 24 * 60 * 60 * 1000;
  if (u === 'month') return v * 30 * 24 * 60 * 60 * 1000;
  return v * 60 * 60 * 1000;
}

function normalizeUnit(unit) {
  const u = String(unit || 'hour').toLowerCase();
  return ['minute', 'hour', 'day', 'month'].includes(u) ? u : 'hour';
}

function getSession(req) {
  const sid = req.signedCookies.sid;
  if (!sid) return null;

  const session = db.prepare('SELECT * FROM sessions WHERE sid = ?').get(sid);
  if (!session) return null;

  if (session.expires_at <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
    return null;
  }

  return session;
}

function createSession(res, payload) {
  const sid = randomId();
  const now = Date.now();
  const expiresAt = now + SESSION_MAX_HOURS * 60 * 60 * 1000;

  db.prepare(`
    INSERT INTO sessions (
      sid, user_id, is_admin, admin_username, device_id, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    sid,
    payload.userId || null,
    payload.isAdmin ? 1 : 0,
    payload.adminUsername || null,
    payload.deviceId || null,
    now,
    expiresAt
  );

  res.cookie('sid', sid, {
    httpOnly: true,
    signed: true,
    sameSite: 'lax',
    secure: secureCookie,
    maxAge: SESSION_MAX_HOURS * 60 * 60 * 1000,
  });
}

function clearSession(req, res) {
  const sid = req.signedCookies.sid;
  if (sid) {
    db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
  }
  res.clearCookie('sid');
}

function requireUserApi(req, res, next) {
  const session = getSession(req);
  if (!session || session.is_admin) {
    return res.status(401).json({ ok: false, message: 'Login required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  if (!user || !user.enabled) {
    return res.status(403).json({ ok: false, message: 'Access denied.' });
  }

  if (user.expires_at && Date.now() > user.expires_at) {
    return res.status(403).json({ ok: false, message: 'Access expired.' });
  }

  req.user = user;
  req.session = session;
  next();
}

function requireUserPage(req, res, next) {
  const session = getSession(req);

  if (!session || session.is_admin) {
    return res.redirect('/');
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);

  if (!user || !user.enabled || (user.expires_at && Date.now() > user.expires_at)) {
    clearSession(req, res);
    return res.redirect('/');
  }

  req.user = user;
  next();
}

function requireAdminApi(req, res, next) {
  const session = getSession(req);
  if (!session || !session.is_admin) {
    return res.status(401).json({ ok: false, message: 'Admin login required.' });
  }

  req.session = session;
  next();
}

function requireAdminPage(req, res, next) {
  const session = getSession(req);
  if (!session || !session.is_admin) {
    return res.redirect(ADMIN_LOGIN_PATH);
  }

  req.session = session;
  next();
}

function sanitizeUser(row) {
  const devices = db.prepare(`
    SELECT device_id, user_agent, first_seen_at, last_seen_at
    FROM devices
    WHERE user_id = ?
    ORDER BY last_seen_at DESC
  `).all(row.id);

  const durationUnit = normalizeUnit(row.duration_unit || 'hour');
  const durationValue = Math.max(
    1,
    Number(row.duration_value || (row.duration_minutes ? Math.round(row.duration_minutes / 60) : row.duration_hours || 24))
  );
  const durationMs = Math.max(
    60000,
    Number(row.duration_minutes || (row.duration_hours || 24) * 60) * 60000
  );

  return {
    id: row.id,
    userId: row.user_id,
    maxDevices: row.max_devices,
    durationValue,
    durationUnit,
    durationMs,
    firstLoginAt: row.first_login_at,
    expiresAt: row.expires_at,
    enabled: !!row.enabled,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    devices,
  };
}

app.get('/', (req, res) => {
  const session = getSession(req);
  if (session && !session.is_admin) {
    return res.redirect('/index.html');
  }

  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

app.get(ADMIN_LOGIN_PATH, (req, res) => {
  const session = getSession(req);
  if (session && session.is_admin) {
    return res.redirect(ADMIN_DASHBOARD_PATH);
  }

  res.sendFile(path.join(PUBLIC_DIR, 'admin-login.html'));
});

app.get(ADMIN_DASHBOARD_PATH, requireAdminPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const userId = String(req.body.userId || '');
  const password = String(req.body.password || '');
  const deviceId = req.signedCookies.device_id;

  if (!userId || !password || !deviceId) {
    return res.status(400).json({ ok: false, message: 'Missing login details.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);

  if (!user || !user.enabled) {
    return res.status(401).json({ ok: false, message: 'Invalid user ID or password.' });
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ ok: false, message: 'Invalid user ID or password.' });
  }

  const now = Date.now();

  if (!user.first_login_at) {
    const durationMs = Math.max(
      60000,
      Number(user.duration_minutes || (user.duration_hours || 24) * 60) * 60000
    );
    const expiresAt = now + durationMs;

    db.prepare(`
      UPDATE users
      SET first_login_at = ?, expires_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, expiresAt, now, user.id);

    user.first_login_at = now;
    user.expires_at = expiresAt;
  }

  if (user.expires_at && now > user.expires_at) {
    return res.status(403).json({ ok: false, message: 'This access has expired.' });
  }

  const existingDevice = db.prepare(`
    SELECT * FROM devices WHERE user_id = ? AND device_id = ?
  `).get(user.id, deviceId);

  const deviceCount = db.prepare(`
    SELECT COUNT(*) AS count FROM devices WHERE user_id = ?
  `).get(user.id).count;

  if (!existingDevice && deviceCount >= user.max_devices) {
    return res.status(403).json({
      ok: false,
      message: 'Device limit reached. Ask the owner to remove an old device.'
    });
  }

  const ua = req.get('user-agent') || 'Unknown device';
  const ipHash = hashIp(req.ip);

  if (!existingDevice) {
    db.prepare(`
      INSERT INTO devices (user_id, device_id, user_agent, ip_hash, first_seen_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(user.id, deviceId, ua, ipHash, now, now);
  } else {
    db.prepare(`
      UPDATE devices
      SET last_seen_at = ?, user_agent = ?, ip_hash = ?
      WHERE id = ?
    `).run(now, ua, ipHash, existingDevice.id);
  }

  db.prepare('DELETE FROM sessions WHERE user_id = ? AND device_id = ?').run(user.id, deviceId);
  createSession(res, { userId: user.id, isAdmin: false, deviceId });

  res.json({ ok: true, redirectTo: '/index.html' });
});

app.post('/api/auth/logout', requireUserApi, (req, res) => {
  clearSession(req, res);
  res.json({ ok: true });
});

app.get('/api/auth/session', requireUserApi, (req, res) => {
  const remainingMs = Math.max(0, (req.user.expires_at || 0) - Date.now());
  res.json({
    ok: true,
    expiresAt: req.user.expires_at,
    firstLoginAt: req.user.first_login_at,
    remainingMs
  });
});

app.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ ok: false, message: 'Invalid admin credentials.' });
  }

  clearSession(req, res);
  createSession(res, { isAdmin: true, adminUsername: username });

  res.json({ ok: true, redirectTo: ADMIN_DASHBOARD_PATH });
});

app.post('/api/admin/logout', requireAdminApi, (req, res) => {
  clearSession(req, res);
  res.json({ ok: true });
});

app.get('/api/admin/session', requireAdminApi, (req, res) => {
  res.json({ ok: true, admin: req.session.admin_username });
});

app.get('/api/admin/users', requireAdminApi, (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY updated_at DESC').all();
  res.json({ ok: true, users: rows.map(sanitizeUser) });
});

app.post('/api/admin/users', requireAdminApi, (req, res) => {
  const userId = String(req.body.userId || '');
  const password = String(req.body.password || '');
  const notes = String(req.body.notes || '').trim();
  const maxDevices = Math.max(1, Number(req.body.maxDevices || 1));
  const durationValue = Math.max(1, Number(req.body.durationValue || 24));
  const durationUnit = normalizeUnit(req.body.durationUnit || 'hour');
  const durationMinutes = Math.max(1, Math.round(durationToMs(durationValue, durationUnit) / 60000));
  const enabled = req.body.enabled === false ? 0 : 1;

  if (!userId || !password) {
    return res.status(400).json({ ok: false, message: 'User ID and password are required.' });
  }

  const now = Date.now();
  const hash = bcrypt.hashSync(password, 12);
  const existing = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);

  if (!existing) {
    db.prepare(`
      INSERT INTO users (
        user_id, password_hash, max_devices, duration_hours,
        duration_value, duration_unit, duration_minutes,
        enabled, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      hash,
      maxDevices,
      Math.max(1, Math.ceil(durationMinutes / 60)),
      durationValue,
      durationUnit,
      durationMinutes,
      enabled,
      notes,
      now,
      now
    );
  } else {
    db.prepare(`
      UPDATE users
      SET password_hash = ?, max_devices = ?, duration_hours = ?,
          duration_value = ?, duration_unit = ?, duration_minutes = ?,
          enabled = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      hash,
      maxDevices,
      Math.max(1, Math.ceil(durationMinutes / 60)),
      durationValue,
      durationUnit,
      durationMinutes,
      enabled,
      notes,
      now,
      existing.id
    );
  }

  const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  res.json({ ok: true, user: sanitizeUser(user) });
});

app.post('/api/admin/users/:id/toggle', requireAdminApi, (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

  if (!user) {
    return res.status(404).json({ ok: false, message: 'User not found.' });
  }

  const nextEnabled = user.enabled ? 0 : 1;
  db.prepare('UPDATE users SET enabled = ?, updated_at = ? WHERE id = ?').run(nextEnabled, Date.now(), id);

  if (!nextEnabled) {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  }

  const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.json({ ok: true, user: sanitizeUser(refreshed) });
});

app.post('/api/admin/users/:id/reset-window', requireAdminApi, (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

  if (!user) {
    return res.status(404).json({ ok: false, message: 'User not found.' });
  }

  db.prepare(`
    UPDATE users
    SET first_login_at = NULL, expires_at = NULL, updated_at = ?
    WHERE id = ?
  `).run(Date.now(), id);

  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM devices WHERE user_id = ?').run(id);

  const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.json({ ok: true, user: sanitizeUser(refreshed) });
});

app.post('/api/admin/users/:id/extend', requireAdminApi, (req, res) => {
  const id = Number(req.params.id);
  const durationValue = Math.max(1, Number(req.body.durationValue || 1));
  const durationUnit = normalizeUnit(req.body.durationUnit || 'hour');
  const addMs = durationToMs(durationValue, durationUnit);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ ok: false, message: 'User not found.' });
  }

  const base = user.expires_at && user.expires_at > Date.now() ? user.expires_at : Date.now();
  const nextExpiry = base + addMs;
  const firstLoginAt = user.first_login_at || Date.now();

  db.prepare(`
    UPDATE users
    SET first_login_at = ?, expires_at = ?, updated_at = ?
    WHERE id = ?
  `).run(firstLoginAt, nextExpiry, Date.now(), id);

  const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.json({ ok: true, user: sanitizeUser(refreshed) });
});

app.post('/api/admin/users/:id/remove-device', requireAdminApi, (req, res) => {
  const id = Number(req.params.id);
  const deviceId = String(req.body.deviceId || '');

  db.prepare('DELETE FROM devices WHERE user_id = ? AND device_id = ?').run(id, deviceId);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND device_id = ?').run(id, deviceId);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ ok: false, message: 'User not found.' });
  }

  res.json({ ok: true, user: sanitizeUser(user) });
});

app.get('/index.html', requireUserPage, (req, res) => {
  res.sendFile(path.join(PROTECTED_DIR, 'index.html'));
});

app.get('/pay.html', requireUserPage, (req, res) => {
  res.sendFile(path.join(PROTECTED_DIR, 'pay.html'));
});

/*
  NEW ADDITION:
  This automatically serves any .html file from the protected folder.
  Example:
  /profile.html
  /card.html
  /savings.html
  /activity.html
  /contact-pay.html
  /payment-result.html
*/
app.get('/:page.html', requireUserPage, (req, res, next) => {
  const fileName = `${req.params.page}.html`;
  const fullPath = path.join(PROTECTED_DIR, fileName);

  if (!fullPath.startsWith(PROTECTED_DIR)) {
    return res.status(403).send('Forbidden');
  }

  res.sendFile(fullPath, (err) => {
    if (err) next();
  });
});

app.use((req, res) => {
  res.status(404).send('Not found');
});

app.listen(PORT, () => {
  console.log(`Secure site running on http://localhost:${PORT}`);
  console.log(`Admin login path: ${ADMIN_LOGIN_PATH}`);
  console.log(`Admin dashboard path: ${ADMIN_DASHBOARD_PATH}`);
});