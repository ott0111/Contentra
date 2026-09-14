-- Part 3 production hardening migration.
-- Apply after the baseline schema has been created by Prisma.
CREATE TABLE IF NOT EXISTS "VerificationToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VerificationToken_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "VerificationToken_userId_expiresAt_idx" ON "VerificationToken"("userId","expiresAt");

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasswordResetToken_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId","expiresAt");

CREATE INDEX IF NOT EXISTS "SocialAccount_workspaceId_platform_idx" ON "SocialAccount"("workspaceId","platform");
CREATE INDEX IF NOT EXISTS "Website_workspaceId_idx" ON "Website"("workspaceId");
CREATE INDEX IF NOT EXISTS "Content_workspaceId_updatedAt_idx" ON "Content"("workspaceId","updatedAt");
CREATE INDEX IF NOT EXISTS "CalendarItem_workspaceId_scheduledFor_status_idx" ON "CalendarItem"("workspaceId","scheduledFor","status");

ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

CREATE TABLE IF NOT EXISTS "WorkspaceInvite" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "email" TEXT NOT NULL, "role" "WorkspaceRole" NOT NULL, "tokenHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "acceptedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id"), CONSTRAINT "WorkspaceInvite_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "WorkspaceInvite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "WorkspaceInvite_workspaceId_email_idx" ON "WorkspaceInvite"("workspaceId","email");
