import argon2 from 'argon2';
import { prisma } from '../db.js';
import { hashToken, randomToken } from '../security.js';

const SESSION_DAYS = 30;
const VERIFY_HOURS = 24;
const RESET_HOURS = 1;

export async function createSession(userId: string) {
  const raw = randomToken();
  await prisma.session.create({ data: { userId, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000) } });
  return raw;
}

export async function getSession(rawToken?: string) {
  if (!rawToken) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(rawToken) }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  await prisma.user.update({ where: { id: session.userId }, data: { lastActiveAt: new Date() } }).catch(() => undefined);
  return session;
}

export async function destroySession(rawToken?: string) {
  if (!rawToken) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
}

export async function signup(input: { name?: string; email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('ACCOUNT_EXISTS');
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  const user = await prisma.user.create({ data: { name: input.name?.trim() || null, email, preferences: { timezone: 'UTC', language: 'en' } } });
  // Password credentials are stored in Account so the User record never contains a raw password.
  await prisma.account.create({ data: { userId: user.id, provider: 'password', providerAccountId: email, passwordHash, scopes: [] } });
  const token = randomToken();
  await prisma.verificationToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + VERIFY_HOURS * 3600000) } });
  return { user, verificationToken: token };
}

export async function verifyPassword(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return null;
  const account = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider: 'password', providerAccountId: user.email } } });
  if (!account?.passwordHash) return null;
  return (await argon2.verify(account.passwordHash, password)) ? user : null;
}

export async function createPasswordReset(userId: string) {
  const raw = randomToken();
  await prisma.passwordResetToken.create({ data: { userId, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + RESET_HOURS * 3600000) } });
  return raw;
}

export async function resetPassword(rawToken: string, password: string) {
  const token = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!token || token.usedAt || token.expiresAt <= new Date()) throw new Error('INVALID_RESET_TOKEN');
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  await prisma.$transaction([
    prisma.account.update({ where: { provider_providerAccountId: { provider: 'password', providerAccountId: (await prisma.user.findUniqueOrThrow({ where: { id: token.userId } })).email } }, data: { passwordHash: hash } }),
    prisma.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: token.userId } }),
  ]);
}

export async function verifyEmail(rawToken: string) {
  const token = await prisma.verificationToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!token || token.usedAt || token.expiresAt <= new Date()) throw new Error('INVALID_VERIFICATION_TOKEN');
  await prisma.$transaction([
    prisma.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: new Date() } }),
    prisma.verificationToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
  ]);
}
