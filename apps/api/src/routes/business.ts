import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { hashApiKey } from '../security.js';
import { getSession } from '../services/auth.js';
import { parseCookies } from '../security.js';
import { getMembership } from '../services/workspaces.js';
import { can } from '@contentra/core';
import { assertFeature, EntitlementError } from '../services/entitlements.js';

const fail = (reply: FastifyReply, status: number, code: string, message: string) => reply.status(status).send({ error: { code, message }, requestId: reply.request.id });

type Resolved = { workspaceId: string; via: 'session' | 'apiKey' };

async function external(request: FastifyRequest, reply: FastifyReply, scope: string): Promise<Resolved | null> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    const workspaceId = String(request.headers['x-workspace-id'] ?? '');
    const session = await getSession(parseCookies(request.headers.cookie).contentra_session);
    const permission = scope === 'customers:read' ? 'members.read' : 'analytics.read';
    const membership = workspaceId && session ? await getMembership(session.user.id, workspaceId) : null;
    if (!membership || !can(membership.role, permission)) { fail(reply, 401, 'UNAUTHENTICATED', 'Sign in with a workspace session or provide an API key.'); return null; }
    return { workspaceId, via: 'session' };
  }
  const key = await prisma.aPIKey.findUnique({ where: { keyHash: hashApiKey(header.slice(7)) } });
  if (!key || key.revokedAt || !key.permissions.includes(scope)) { fail(reply, 403, 'FORBIDDEN', 'The API key is not authorized for this resource.'); return null; }
  await prisma.aPIKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return { workspaceId: key.workspaceId, via: 'apiKey' };
}

export async function registerBusinessRoutes(app: FastifyInstance) {
  const routes: Array<[string, string, 'customers'|'leads'|'products'|'orders'|'conversions']> = [
    ['/api/v1/business/customers', 'customers:read', 'customers'],
    ['/api/v1/business/leads', 'leads:read', 'leads'],
    ['/api/v1/business/products', 'products:read', 'products'],
    ['/api/v1/business/orders', 'analytics:read', 'orders'],
    ['/api/v1/business/conversions', 'analytics:read', 'conversions'],
  ];
  for (const [path, scope, table] of routes) {
    app.get(path, async (request, reply) => {
      const key = await external(request, reply, scope); if (!key) return;
      try {
        // Business data is a paid entitlement: sessions need business_intelligence,
        // API keys additionally need business_api. This also rejects direct URL/API
        // access from Free workspaces.
        await assertFeature(key.workspaceId, key.via === 'apiKey' ? 'business_api' : 'business_intelligence');
      } catch (error) {
        if (error instanceof EntitlementError) return fail(reply, 403, error.code, error.message);
        throw error;
      }
      const limit = Math.min(Number((request.query as { limit?: string }).limit ?? 100), 500);
      const where = { workspaceId: key.workspaceId };
      const data = table === 'customers' ? await prisma.businessCustomer.findMany({ where, take: limit, orderBy: { id: 'asc' } })
        : table === 'leads' ? await prisma.businessLead.findMany({ where, take: limit, orderBy: { id: 'asc' } })
        : table === 'products' ? await prisma.businessProduct.findMany({ where, take: limit, orderBy: { id: 'asc' } })
        : table === 'orders' ? await prisma.businessOrder.findMany({ where, take: limit, orderBy: { id: 'asc' } })
        : await prisma.businessConversion.findMany({ where, take: limit, orderBy: { id: 'asc' } });
      return reply.send({ data, requestId: request.id });
    });
  }
}
