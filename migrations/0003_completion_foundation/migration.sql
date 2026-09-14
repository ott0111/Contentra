-- Production gap-closure migration: resumable onboarding state.
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "onboardingState" JSONB;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "onboardedAt" TIMESTAMP(3);
