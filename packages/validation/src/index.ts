import {z} from 'zod';
export const idSchema=z.string().uuid();
export const workspaceTypeSchema=z.enum(['CREATOR','PERSONAL_BRAND','BUSINESS','AGENCY']);
export const createWorkspaceSchema=z.object({name:z.string().trim().min(1).max(120),type:workspaceTypeSchema});
export const createContentSchema=z.object({title:z.string().trim().max(300).optional(),description:z.string().max(5000).optional(),format:z.string().min(1).max(50),platform:z.string().min(1).max(50),caption:z.string().max(10000).optional(),script:z.string().max(50000).optional()});
export const aiActionTypes = ['create_content','analyze_content','find_opportunities','recommend_format','recommend_topic','create_calendar_plan','repurpose_content','improve_content','analyze_performance','create_campaign','prepare_publish','schedule_content'] as const;
export const aiActionSchema = z.object({ type: z.enum(aiActionTypes), input: z.record(z.unknown()) });

export const signupSchema = z.object({ name: z.string().trim().max(120).optional(), email: z.string().email().max(320), password: z.string().min(12).max(128) });
export const loginSchema = z.object({ email: z.string().email().max(320), password: z.string().min(1).max(128) });
export const passwordResetRequestSchema = z.object({ email: z.string().email().max(320) });
export const passwordResetSchema = z.object({ token: z.string().min(20).max(200), password: z.string().min(12).max(128) });
export const emailVerificationSchema = z.object({ token: z.string().min(20).max(200) });
export const updateProfileSchema = z.object({ name: z.string().trim().max(120).nullable().optional(), avatarUrl: z.string().url().max(2048).nullable().optional(), preferences: z.record(z.unknown()).optional() });
export const createCalendarItemSchema = z.object({ contentId: idSchema.optional(), campaignId: idSchema.optional(), platform: z.string().max(50).optional(), scheduledFor: z.coerce.date(), status: z.string().min(1).max(30).default('SCHEDULED') });
export const updateContentSchema = createContentSchema.partial().extend({ status: z.enum(['IDEA','DRAFT','READY','SCHEDULED','PUBLISHED','FAILED','ARCHIVED']).optional(), scheduledAt: z.coerce.date().nullable().optional(), campaignId: idSchema.nullable().optional() });
export const onboardingStateSchema = z.object({ currentStep: z.number().int().min(0).max(9), workspaceType: workspaceTypeSchema.optional(), niche: z.string().trim().max(2000).optional(), goals: z.array(z.string().trim().min(1).max(120)).max(20).optional(), connections: z.array(z.string().trim().min(1).max(80)).max(20).optional(), importChoices: z.array(z.string().trim().min(1).max(80)).max(20).optional(), contentPreferences: z.record(z.unknown()).optional(), firstOpportunityId: idSchema.optional(), firstContentId: idSchema.optional(), completed: z.boolean().optional() });
