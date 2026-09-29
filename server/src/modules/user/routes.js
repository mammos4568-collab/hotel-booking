import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { pool } from '../../db.js';
import {
  clearAuthCookie,
  clearOAuthStateCookie,
  readCookie,
  requireAuth,
  setAuthCookie,
  setOAuthStateCookie,
  signToken,
} from '../../middleware/auth.js';

const router = Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitName(name) {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') || null };
}

function publicUser(row) {
  return {
    id: row.user_id,
    name: [row.first_name, row.last_name].filter(Boolean).join(' '),
    email: row.email,
    role: row.role,
    phone: row.phone_number,
    avatarUrl: row.avatar_url,
  };
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}

function frontendUrl(path) {
  return new URL(path, process.env.CLIENT_URL || 'http://localhost:5173');
}

function oauthStateSignature(encodedPayload) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters');
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function makeOAuthState(nonce, userId) {
  const payload = Buffer.from(JSON.stringify({ nonce, userId, exp: Date.now() + 10 * 60 * 1000 })).toString('base64url');
  return `${payload}.${oauthStateSignature(payload)}`;
}

function parseOAuthState(state) {
  try {
    const [payload, signature, extra] = (state || '').split('.');
    if (!payload || !signature || extra) throw new Error('Invalid OAuth state');

    const expected = Buffer.from(oauthStateSignature(payload));
    const actual = Buffer.from(signature);

    // timingSafeEqual จะ throw ถ้า length ต่างกัน — เช็กก่อนเพื่อป้องกัน
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new Error('Invalid OAuth state');
    }

    // JSON.parse อาจ throw SyntaxError ถ้า payload ถูก tamper
    let data;
    try {
      data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw new Error('Invalid OAuth state');
    }

    if (!data?.nonce || data.exp <= Date.now()) throw new Error('Expired OAuth state');
    return data;
  } catch (err) {
    // Re-throw เฉพาะ error ที่เราสร้างเอง เพื่อไม่ให้ internal error หลุดออกไป
    if (err.message === 'Invalid OAuth state' || err.message === 'Expired OAuth state') throw err;
    throw new Error('Invalid OAuth state');
  }
}

// ---------------------------------------------------------------------------
// Generic OAuth Provider Config
// ---------------------------------------------------------------------------

const PROVIDERS = {
  google: {
    envKeys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scope: 'openid email profile',
    /** Exchange code → { sub, email, name, picture } */
    async getProfile(code) {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: process.env.GOOGLE_CALLBACK_URL,
          grant_type: 'authorization_code',
        }),
      });
      const tokenData = await res.json();
      if (!res.ok || !tokenData.access_token) throw new Error('Google token exchange failed');

      const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = await profileRes.json();
      if (!profileRes.ok || !profile.sub || !profile.email || !profile.email_verified) {
        throw new Error('Google account could not be verified');
      }
      return { id: profile.sub, email: profile.email.toLowerCase(), name: profile.name, avatarUrl: profile.picture || null };
    },
  },

  facebook: {
    envKeys: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET', 'FACEBOOK_CALLBACK_URL'],
    authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    scope: 'email,public_profile',
    async getProfile(code) {
      const tokenRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?${new URLSearchParams({
          client_id: process.env.FACEBOOK_APP_ID,
          client_secret: process.env.FACEBOOK_APP_SECRET,
          redirect_uri: process.env.FACEBOOK_CALLBACK_URL,
          code,
        })}`,
      );
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) throw new Error('Facebook token exchange failed');

      const profileRes = await fetch(
        `https://graph.facebook.com/v19.0/me?fields=id,name,email,picture.type(large)&access_token=${tokenData.access_token}`,
      );
      const profile = await profileRes.json();
      if (!profileRes.ok || !profile.id) throw new Error('Facebook account could not be verified');
      if (!profile.email) throw new Error('Facebook account has no verified email; please add one on Facebook and try again');
      return {
        id: profile.id,
        email: profile.email.toLowerCase(),
        name: profile.name,
        avatarUrl: profile.picture?.data?.url || null,
      };
    },
  },

  github: {
    envKeys: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_CALLBACK_URL'],
    authUrl: 'https://github.com/login/oauth/authorize',
    scope: 'read:user user:email',
    async getProfile(code) {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          redirect_uri: process.env.GITHUB_CALLBACK_URL,
          code,
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) throw new Error('GitHub token exchange failed');

      const headers = { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github+json' };

      const [profileRes, emailsRes] = await Promise.all([
        fetch('https://api.github.com/user', { headers }),
        fetch('https://api.github.com/user/emails', { headers }),
      ]);
      const profile = await profileRes.json();
      if (!profileRes.ok || !profile.id) throw new Error('GitHub account could not be verified');

      // GitHub email may be private — pick primary verified email from /user/emails
      let email = typeof profile.email === 'string' ? profile.email.toLowerCase() : null;
      if (!email && emailsRes.ok) {
        const emails = await emailsRes.json();
        const primary = Array.isArray(emails)
          ? emails.find((e) => e.primary && e.verified)
          : null;
        email = primary?.email?.toLowerCase() ?? null;
      }
      if (!email) throw new Error('GitHub account has no verified email; please add one on GitHub and try again');

      return {
        id: String(profile.id),
        email,
        name: profile.name || profile.login,
        avatarUrl: profile.avatar_url || null,
      };
    },
  },
};

// ---------------------------------------------------------------------------
// Generic OAuth Route Factory
// ---------------------------------------------------------------------------

/**
 * Creates a redirect handler that starts the OAuth flow for the given provider.
 * @param {string} providerName
 * @param {boolean} linking  true = link to existing logged-in user
 */
function startOAuth(providerName, linking = false) {
  return (req, res, next) => {
    try {
      const cfg = PROVIDERS[providerName];
      const [clientIdKey] = cfg.envKeys;
      const [, clientSecretKey] = cfg.envKeys;
      const [, , callbackUrlKey] = cfg.envKeys;

      if (!process.env[clientIdKey] || !process.env[clientSecretKey] || !process.env[callbackUrlKey]) {
        return res.status(503).json({ message: `${providerName} sign-in is not configured` });
      }

      const nonce = randomBytes(32).toString('base64url');
      const state = makeOAuthState(nonce, linking ? req.user.id : null);
      setOAuthStateCookie(res, nonce);

      const url = new URL(cfg.authUrl);
      url.search = new URLSearchParams({
        client_id: process.env[clientIdKey],
        redirect_uri: process.env[callbackUrlKey],
        response_type: 'code',
        scope: cfg.scope,
        state,
      }).toString();
      res.redirect(url.toString());
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Creates a callback handler for the given provider.
 * Handles both: first-time login/register AND account linking.
 */
function handleOAuthCallback(providerName) {
  return async (req, res, next) => {
    clearOAuthStateCookie(res);
    try {
      if (req.query.error || typeof req.query.code !== 'string') {
        throw new Error(`${providerName} authorization failed`);
      }
      const state = parseOAuthState(req.query.state);
      if (state.nonce !== readCookie(req, 'hotel_oauth_state')) throw new Error('OAuth state mismatch');

      const cfg = PROVIDERS[providerName];
      const [clientIdKey, clientSecretKey, callbackUrlKey] = cfg.envKeys;
      if (!process.env[clientIdKey] || !process.env[clientSecretKey] || !process.env[callbackUrlKey]) {
        throw new Error(`${providerName} sign-in is not configured`);
      }

      const profile = await cfg.getProfile(req.query.code);

      let user;

      if (state.userId) {
        // ── Account Linking ────────────────────────────────────────────────
        const existing = await pool.query(
          'SELECT user_id FROM oauth_accounts WHERE provider = $1 AND provider_account_id = $2',
          [providerName, profile.id],
        );
        if (existing.rows[0] && existing.rows[0].user_id !== state.userId) {
          throw new Error(`This ${providerName} account is connected to another user`);
        }
        await pool.query(
          `INSERT INTO oauth_accounts (user_id, provider, provider_account_id)
           VALUES ($1, $2, $3) ON CONFLICT (provider, provider_account_id) DO NOTHING`,
          [state.userId, providerName, profile.id],
        );
        const result = await pool.query(
          `UPDATE users SET avatar_url = COALESCE(avatar_url, $1), updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $2
           RETURNING user_id, first_name, last_name, email, phone_number, avatar_url, role`,
          [profile.avatarUrl, state.userId],
        );
        user = result.rows[0];
        if (!user) throw new Error('User not found');
      } else {
        // ── Login or Register ───────────────────────────────────────────────
        const linked = await pool.query(
          `SELECT u.user_id, u.first_name, u.last_name, u.email, u.phone_number, u.avatar_url, u.role
           FROM oauth_accounts oa JOIN users u ON u.user_id = oa.user_id
           WHERE oa.provider = $1 AND oa.provider_account_id = $2`,
          [providerName, profile.id],
        );
        user = linked.rows[0];

        if (!user) {
          const existingEmail = await pool.query('SELECT user_id FROM users WHERE email = $1', [profile.email]);
          if (existingEmail.rows[0]) {
            throw new Error(`An account with this email exists; sign in and connect ${providerName} from your profile`);
          }
          const { firstName, lastName } = splitName(profile.name || profile.email.split('@')[0]);
          const created = await pool.query(
            `INSERT INTO users (first_name, last_name, email, password_hash, avatar_url, role)
             VALUES ($1, $2, $3, NULL, $4, 'user')
             RETURNING user_id, first_name, last_name, email, phone_number, avatar_url, role`,
            [firstName, lastName, profile.email, profile.avatarUrl],
          );
          user = created.rows[0];
          await pool.query(
            'INSERT INTO oauth_accounts (user_id, provider, provider_account_id) VALUES ($1, $2, $3)',
            [user.user_id, providerName, profile.id],
          );
        }
      }

      setAuthCookie(res, signToken({ userId: user.user_id }));
      res.redirect(frontendUrl(state.userId ? `/profile?${providerName}=connected` : '/').toString());
    } catch (error) {
      const target = frontendUrl('/');
      target.searchParams.set(
        'auth_error',
        error.message.includes('exists') ? `${providerName}_link_required` : `${providerName}_login_failed`,
      );
      res.redirect(target.toString());
    }
  };
}

/**
 * Creates a DELETE handler to disconnect a provider from the current user.
 */
function handleOAuthDisconnect(providerName) {
  return async (req, res, next) => {
    try {
      const methods = await pool.query(
        `SELECT password_hash, (SELECT COUNT(*) FROM oauth_accounts WHERE user_id = $1) AS oauth_count
         FROM users WHERE user_id = $1`,
        [req.user.id],
      );
      if (!methods.rows[0]) return res.status(404).json({ message: 'User not found' });
      if (!methods.rows[0].password_hash && Number(methods.rows[0].oauth_count) <= 1) {
        return res.status(400).json({ message: 'Add a password before disconnecting your only sign-in method' });
      }
      await pool.query('DELETE FROM oauth_accounts WHERE user_id = $1 AND provider = $2', [req.user.id, providerName]);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// Auth routes: Register / Login / Logout / Me / Profile / Password
// ---------------------------------------------------------------------------

router.post('/register', async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body?.password;
    if (!name || name.length > 200) return res.status(400).json({ message: 'Name is required and must be under 200 characters' });
    if (!EMAIL_PATTERN.test(email) || email.length > 255) return res.status(400).json({ message: 'Enter a valid email address' });
    if (!validatePassword(password)) return res.status(400).json({ message: 'Password must be between 8 and 128 characters' });

    const { firstName, lastName } = splitName(name);
    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'user')
       RETURNING user_id, first_name, last_name, email, phone_number, avatar_url, role`,
      [firstName, lastName, email, passwordHash],
    );
    setAuthCookie(res, signToken({ userId: rows[0].user_id }));
    res.status(201).json({ user: publicUser(rows[0]) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'An account with this email already exists' });
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body?.password;
    if (!email || typeof password !== 'string') return res.status(400).json({ message: 'Email and password are required' });

    const { rows } = await pool.query(
      `SELECT user_id, first_name, last_name, email, password_hash, phone_number, avatar_url, role
       FROM users WHERE email = $1`,
      [email],
    );
    const user = rows[0];
    if (!user?.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: 'Email or password is incorrect' });
    }

    setAuthCookie(res, signToken({ userId: user.user_id }));
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.put('/me', requireAuth, async (req, res, next) => {
  try {
    const allowed = ['name', 'phone', 'avatarUrl'];
    const unknown = Object.keys(req.body || {}).filter((key) => !allowed.includes(key));
    if (unknown.length) return res.status(400).json({ message: `Unsupported profile field: ${unknown[0]}` });

    const current = await pool.query(
      'SELECT first_name, last_name, phone_number, avatar_url FROM users WHERE user_id = $1',
      [req.user.id],
    );
    if (!current.rows[0]) return res.status(404).json({ message: 'User not found' });

    const profile = current.rows[0];
    let firstName = profile.first_name;
    let lastName = profile.last_name;
    if (Object.hasOwn(req.body, 'name')) {
      if (typeof req.body.name !== 'string' || !req.body.name.trim() || req.body.name.trim().length > 200) {
        return res.status(400).json({ message: 'Name is required and must be under 200 characters' });
      }
      ({ firstName, lastName } = splitName(req.body.name));
    }

    const phone = Object.hasOwn(req.body, 'phone') ? req.body.phone : profile.phone_number;
    const avatarUrl = Object.hasOwn(req.body, 'avatarUrl') ? req.body.avatarUrl : profile.avatar_url;
    if (phone !== null && phone !== undefined && (typeof phone !== 'string' || phone.length > 50)) {
      return res.status(400).json({ message: 'Phone must be under 50 characters' });
    }
    if (avatarUrl !== null && avatarUrl !== undefined) {
      if (typeof avatarUrl !== 'string' || avatarUrl.length > 2048 || !avatarUrl.startsWith('https://')) {
        return res.status(400).json({ message: 'Avatar URL must be a valid https:// URL under 2048 characters' });
      }
    }

    const { rows } = await pool.query(
      `UPDATE users SET first_name = $1, last_name = $2, phone_number = $3, avatar_url = $4, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $5
       RETURNING user_id, first_name, last_name, email, phone_number, avatar_url, role`,
      [firstName, lastName, phone || null, avatarUrl || null, req.user.id],
    );
    res.json({ user: publicUser(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.put('/password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!validatePassword(newPassword)) {
      return res.status(400).json({ message: 'New password must be between 8 and 128 characters' });
    }

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE user_id = $1', [req.user.id]);
    const existingHash = rows[0]?.password_hash;

    if (existingHash) {
      // มี password เดิมอยู่แล้ว → ต้องตรวจสอบ currentPassword ก่อน
      if (typeof currentPassword !== 'string' || !currentPassword) {
        return res.status(400).json({ message: 'Current password is required' });
      }
      if (!(await bcrypt.compare(currentPassword, existingHash))) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
    }
    // ถ้าไม่มี password_hash (OAuth-only user) → ตั้ง password ครั้งแรกได้เลย

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2', [passwordHash, req.user.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// OAuth routes — Google, Facebook, GitHub (generic handlers)
// ---------------------------------------------------------------------------

// Google
router.get('/google', startOAuth('google'));
router.get('/google/link', requireAuth, startOAuth('google', true));
router.get('/google/callback', handleOAuthCallback('google'));
router.delete('/google', requireAuth, handleOAuthDisconnect('google'));

// Facebook
router.get('/facebook', startOAuth('facebook'));
router.get('/facebook/link', requireAuth, startOAuth('facebook', true));
router.get('/facebook/callback', handleOAuthCallback('facebook'));
router.delete('/facebook', requireAuth, handleOAuthDisconnect('facebook'));

// GitHub
router.get('/github', startOAuth('github'));
router.get('/github/link', requireAuth, startOAuth('github', true));
router.get('/github/callback', handleOAuthCallback('github'));
router.delete('/github', requireAuth, handleOAuthDisconnect('github'));

// ---------------------------------------------------------------------------
// Shared: list all connected OAuth providers for current user
// ---------------------------------------------------------------------------
router.get('/accounts', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT provider FROM oauth_accounts WHERE user_id = $1 ORDER BY provider',
      [req.user.id],
    );
    res.json({ accounts: rows.map((row) => row.provider) });
  } catch (error) {
    next(error);
  }
});


export default router;
