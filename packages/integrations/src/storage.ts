import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export interface Storage {
  put(key: string, body: Uint8Array, contentType: string): Promise<{ key: string; url?: string }>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
}

export class LocalObjectStorage implements Storage {
  constructor(private readonly root = path.resolve(process.cwd(), ".contentra-storage")) {}
  async put(key: string, body: Uint8Array, _contentType: string) {
    const destination = path.join(this.root, key.replaceAll("..", ""));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, body);
    return { key, url: `file://${destination}` };
  }
  async delete(key: string) {
    await unlink(path.join(this.root, key.replaceAll("..", ""))).catch(() => undefined);
  }
  async getSignedUrl(key: string, _expiresInSeconds: number) {
    return `file://${path.join(this.root, key)}`;
  }
}

export class S3CompatibleStorage implements Storage {
  constructor(
    private readonly endpoint: string,
    private readonly bucket: string,
    private readonly accessKey: string,
    private readonly secretKey: string,
  ) {}
  async put(key: string, body: Uint8Array, contentType: string) {
    const url = `${this.endpoint.replace(/\/$/, "")}/${this.bucket}/${encodeURI(key)}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "content-type": contentType,
        "x-contentra-access-key": this.accessKey,
        "x-contentra-secret": this.secretKey,
      },
      body: body as unknown as BodyInit,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`STORAGE_HTTP_${response.status}`);
    return { key, url };
  }
  async delete(key: string) {
    const url = `${this.endpoint.replace(/\/$/, "")}/${this.bucket}/${encodeURI(key)}`;
    await fetch(url, { method: "DELETE", signal: AbortSignal.timeout(15_000) }).catch(() => undefined);
  }
  async getSignedUrl(key: string, expiresInSeconds: number) {
    const expires = Date.now() + expiresInSeconds * 1000;
    return `${this.endpoint.replace(/\/$/, "")}/${this.bucket}/${encodeURI(key)}?expires=${expires}`;
  }
}

export function createStorage(): Storage {
  if (process.env.STORAGE_ENDPOINT && process.env.STORAGE_ACCESS_KEY && process.env.STORAGE_SECRET_KEY) {
    return new S3CompatibleStorage(
      process.env.STORAGE_ENDPOINT,
      process.env.STORAGE_BUCKET ?? "contentra",
      process.env.STORAGE_ACCESS_KEY,
      process.env.STORAGE_SECRET_KEY,
    );
  }
  if (process.env.NODE_ENV === "production" && process.env.STORAGE_PROVIDER !== "local") {
    throw new Error("STORAGE_NOT_CONFIGURED");
  }
  return new LocalObjectStorage();
}