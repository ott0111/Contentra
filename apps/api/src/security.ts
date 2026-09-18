import crypto from 'node:crypto';

export function hashApiKey(raw: string) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function generateApiKey() {
  const secret = crypto.randomBytes(32).toString('base64url');
  const raw = `ctr_${secret}`;
  return { raw, prefix: `ctr_${secret.slice(0, 8)}`, hash: hashApiKey(raw) };
}

export function signWebhook(payload: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function timingSafeEqualHex(a: string, b: string) {
  const aa = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export function hashToken(raw: string) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function encryptSecret(plaintext: string, key: string) {
  const keyBytes = crypto.createHash('sha256').update(key).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptSecret(encoded: string, key: string) {
  const [ivRaw, tagRaw, ciphertextRaw] = encoded.split('.');
  if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error('Invalid encrypted secret');
  const keyBytes = crypto.createHash('sha256').update(key).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes, Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, 'base64url')), decipher.final()]).toString('utf8');
}

export function parseCookies(header?: string) {
  const cookies: Record<string, string> = {};
  for (const part of header?.split(';') ?? []) {
    const i = part.indexOf('=');
    if (i > 0) cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return cookies;
}

export function sessionCookie(token: string, maxAgeSeconds: number) {
  return `contentra_session=${encodeURIComponent(token)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; ${cookiePolicy()}`;
}

export function clearSessionCookie() {
  return `contentra_session=; Max-Age=0; Path=/; HttpOnly; ${cookiePolicy()}`;
}

export function adminSessionCookie(token: string, maxAgeSeconds: number) {
  return `contentra_admin=${encodeURIComponent(token)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; ${cookiePolicy()}`;
}

export function clearAdminSessionCookie() {
  return `contentra_admin=; Max-Age=0; Path=/; HttpOnly; ${cookiePolicy()}`;
}

function cookiePolicy() {
  // Production is cross-site: the web app (Vercel) and the API (Render) live on
  // different registrable domains, so the session cookie must be SameSite=None.
  // Browsers require Secure alongside None, and Render serves HTTPS. Local
  // development runs both apps on localhost (same-site) over HTTP, where None
  // would be rejected, so Lax is kept there.
  //
  // Partitioned (CHIPS) additionally scopes the cookie to the (Vercel, Render)
  // partition. Partitioned cookies are exempt from third-party cookie blocking
  // (Safari ITP, Firefox ETP, Chrome private windows, privacy extensions), so
  // sessions keep working exactly where a plain None cookie is silently
  // discarded. Browsers without CHIPS support ignore the attribute and keep
  // the prior behavior. HttpOnly and Secure are unchanged.
  return process.env.NODE_ENV === "production" ? "SameSite=None; Secure; Partitioned" : "SameSite=Lax";
}

export function verifyWebhookSignature(payload: string, signatureHeader: string, secret: string, toleranceSeconds = 300) {
  const parts = Object.fromEntries(signatureHeader.split(',').map(part => part.split('=').map(x => x.trim()) as [string,string]));
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!Number.isFinite(timestamp) || !signature || Math.abs(Date.now()/1000 - timestamp) > toleranceSeconds) return false;
  const expected = signWebhook(`${timestamp}.${payload}`, secret);
  return timingSafeEqualHex(expected, signature);
}

export function signOpaqueState(payload: Record<string, unknown>, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signWebhook(encoded, secret)}`;
}

export function verifyOpaqueState<T>(state: string, secret: string): T | null {
  const [encoded, signature] = state.split('.');
  if (!encoded || !signature || !timingSafeEqualHex(signWebhook(encoded, secret), signature)) return null;
  try { return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T; } catch { return null; }
}
