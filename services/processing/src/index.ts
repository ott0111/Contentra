export type JobType =
  | "social_sync"
  | "analytics_sync"
  | "website_scan"
  | "content_processing"
  | "trend_processing"
  | "recommendation_generation"
  | "ai_processing"
  | "publishing"
  | "notifications"
  | "push_delivery"
  | "cleanup"
  | "import_processing"
  | "brand_analysis";

export type JobHandler = (payload: unknown) => Promise<void>;

export interface JobQueue {
  enqueue(type: JobType, payload: unknown, idempotencyKey: string, workspaceId?: string): Promise<unknown>;
  runOnce(): Promise<boolean>;
}

export interface ExtractedImport {
  kind: string;
  title?: string;
  text?: string;
  topics: string[];
  metadata: Record<string, unknown>;
}

const STOP = new Set(["the", "and", "with", "that", "this", "from"]);

export function extractImportPayload(kind: string, payload: Record<string, unknown>): ExtractedImport {
  const text = [payload.text, payload.caption, payload.script, payload.body, payload.title]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  const topics = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 4 && !STOP.has(word))
    .slice(0, 12);
  return {
    kind,
    title: typeof payload.title === "string" ? payload.title : undefined,
    text: text.slice(0, 20000) || undefined,
    topics: [...new Set(topics)],
    metadata: {
      mimeType: payload.mimeType,
      url: payload.url,
      platform: payload.platform,
      publishedAt: payload.publishedAt,
    },
  };
}

export class DatabaseJobQueue implements JobQueue {
  constructor(
    private readonly db: {
      job: {
        create(args: unknown): Promise<unknown>;
        findFirst(args: unknown): Promise<any>;
        update(args: unknown): Promise<unknown>;
        updateMany(args: unknown): Promise<{ count: number }>;
      };
    },
    private readonly handlers: Partial<Record<JobType, JobHandler>>,
  ) {}
  enqueue(type: JobType, payload: unknown, idempotencyKey: string, workspaceId?: string) {
    return this.db.job.create({
      data: { type, status: "QUEUED", payload, idempotencyKey, workspaceId },
    });
  }
  async runOnce() {
    const job = await this.db.job.findFirst({
      where: { status: "QUEUED", availableAt: { lte: new Date() } },
      orderBy: { availableAt: "asc" },
    });
    if (!job) return false;
    const claimed = await this.db.job.updateMany({
      where: { id: job.id, status: "QUEUED" },
      data: { status: "PROCESSING", startedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return false;
    try {
      const handler = this.handlers[job.type as JobType];
      if (!handler) throw new Error(`NO_HANDLER:${job.type}`);
      await handler(job.payload);
      await this.db.job.update({
        where: { id: job.id },
        data: { status: "SUCCEEDED", completedAt: new Date() },
      });
    } catch (error) {
      const attempts = job.attempts + 1;
      const retry = attempts < job.maxAttempts;
      await this.db.job.update({
        where: { id: job.id },
        data: {
          status: retry ? "QUEUED" : "FAILED",
          availableAt: new Date(Date.now() + Math.min(3600000, 2 ** attempts * 1000)),
          failedAt: retry ? null : new Date(),
          error: error instanceof Error ? error.message : "JOB_FAILED",
        },
      });
    }
    return true;
  }
}
