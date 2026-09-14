import { prisma } from '../db.js';

export async function getHome(workspaceId: string) {
  const [nba, opportunities, recommendations, content, calendar, metrics] = await Promise.all([
    prisma.nextBestAction.findFirst({ where: { workspaceId, status: 'NEW', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }] }),
    prisma.opportunity.findMany({ where: { workspaceId, status: 'NEW', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: [{ relevanceScore: 'desc' }, { createdAt: 'desc' }], take: 6 }),
    prisma.recommendation.findMany({ where: { workspaceId, status: 'NEW' }, orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }], take: 6 }),
    prisma.content.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' }, take: 8 }),
    prisma.calendarItem.findMany({ where: { workspaceId, scheduledFor: { gte: new Date() } }, orderBy: { scheduledFor: 'asc' }, take: 8 }),
    prisma.socialMetric.findMany({ where: { workspaceId }, orderBy: { capturedAt: 'desc' }, take: 50 }),
  ]);
  return { nba, opportunities, recommendations, recentContent: content, upcomingCalendar: calendar, metrics };
}
