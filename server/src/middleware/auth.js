import { createHmac, timingSafeEqual } from 'node:crypto';
import { pool } from '../db.js';

export const AUTH_COOKIE_NAME = 'hotel_session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters');
  }
  return secret;
}

export function signToken(payload, expiresInSeconds = SESSION_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds }));
  const unsigned = `${header}.${body}`;
  const signature = createHmac('sha256', getJwtSecret()).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

export function verifyToken(token) {
  const parts = token?.split('.');
  if (!parts || parts.length !== 3) throw new Error('Invalid token');

  const unsigned = `${parts[0]}.${parts[1]}`;
  const expected = createHmac('sha256', getJwtSecret()).update(unsigned).digest();
  const actual = Buffer.from(parts[2], 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('Invalid token');
  }

  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (header.alg !== 'HS256' || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Expired or invalid token');
  }
  return payload;
}

export function readCookie(req, name) {
  const header = req.headers.cookie || '';
  const cookie = header.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(name.length + 1));
  } catch {
    return null;
  }
}

function cookieOptions(maxAge, path = '/api/auth') {
  return [
    `Path=${path}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
    ...(maxAge === undefined ? [] : [`Max-Age=${maxAge}`]),
  ].join('; ');
}

export function setAuthCookie(res, token) {
  res.append('Set-Cookie', `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieOptions(SESSION_SECONDS, '/')}`);
}

export function clearAuthCookie(res) {
  res.append('Set-Cookie', `${AUTH_COOKIE_NAME}=; ${cookieOptions(0, '/')}`);
}

export function setOAuthStateCookie(res, nonce) {
  res.append('Set-Cookie', `hotel_oauth_state=${encodeURIComponent(nonce)}; ${cookieOptions(600)}`);
}

export function clearOAuthStateCookie(res) {
  res.append('Set-Cookie', `hotel_oauth_state=; ${cookieOptions(0)}`);
}

export async function requireAuth(req, res, next) {
  let payload;
  try {
    const token = readCookie(req, AUTH_COOKIE_NAME);
    if (!token) return res.status(401).json({ message: 'Authentication required' });
    payload = verifyToken(token);
  } catch (error) {
    if (error.message?.startsWith('JWT_SECRET')) return next(error);
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT user_id, first_name, last_name, email, phone_number, avatar_url, role
       FROM users WHERE user_id = $1`,
      [payload.userId]
    );
    if (!rows[0]) return res.status(401).json({ message: 'Authentication required' });

    const user = rows[0];
    req.user = {
      id: user.user_id,
      name: [user.first_name, user.last_name].filter(Boolean).join(' '),
      email: user.email,
      phone: user.phone_number,
      avatarUrl: user.avatar_url,
      role: user.role,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
    next();
  };
}
