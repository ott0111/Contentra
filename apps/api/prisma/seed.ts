import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const plans = [
  { code: 'FREE', name: 'Free', monthlyPriceCents: 0, entitlements: { workspaces: 1, team_members: 1, ai_credits: 100 } },
  { code: 'PRO', name: 'Pro', monthlyPriceCents: 1999, entitlements: { workspaces: 5, team_members: 5, ai_credits: 2000 } },
  { code: 'BUSINESS', name: 'Business', monthlyPriceCents: 4999, entitlements: { workspaces: 25, team_members: 50, ai_credits: 10000 } },
];
async function main() {
  for (const plan of plans) {
    const record = await db.plan.upsert({ where: { code: plan.code }, update: { name: plan.name, monthlyPriceCents: plan.monthlyPriceCents }, create: { code: plan.code, name: plan.name, monthlyPriceCents: plan.monthlyPriceCents } });
    for (const [feature, limitValue] of Object.entries(plan.entitlements)) {
      await db.entitlement.upsert({ where: { planId_feature: { planId: record.id, feature } }, update: { limitValue }, create: { planId: record.id, feature, limitValue } });
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
