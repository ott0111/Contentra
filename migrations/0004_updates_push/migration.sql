CREATE TABLE IF NOT EXISTS "DeviceRegistration" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "platform" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "tokenEncrypted" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "lastSeenAt" TIMESTAMP(3),
  CONSTRAINT "DeviceRegistration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeviceRegistration_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "DeviceRegistration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  CONSTRAINT "DeviceRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "DeviceRegistration_workspaceId_userId_status_idx" ON "DeviceRegistration"("workspaceId","userId","status");
CREATE TABLE IF NOT EXISTS "Release" (
  "id" TEXT NOT NULL, "version" TEXT NOT NULL, "buildNumber" INTEGER, "title" TEXT NOT NULL,
  "changelog" JSONB NOT NULL, "minimumSupportedVersion" TEXT, "platforms" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT', "publishedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Release_pkey" PRIMARY KEY ("id"), CONSTRAINT "Release_version_key" UNIQUE ("version")
);
CREATE INDEX IF NOT EXISTS "Release_status_publishedAt_idx" ON "Release"("status","publishedAt");
