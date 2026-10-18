import type { Blob, BlobStore } from "../ports";
import { validKey } from "./fs-blob";

// Structural slice of Cloudflare's R2 binding, so this file needs no workers types.
type R2ObjectBodyLike = {
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: { contentType?: string };
};
export type R2Like = {
  get(key: string): Promise<R2ObjectBodyLike | null>;
  put(
    key: string,
    value: Uint8Array,
    opts?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
};

export class R2BlobStore implements BlobStore {
  constructor(
    private readonly bucket: R2Like,
    private readonly prefix = "",
  ) {}

  async get(key: string): Promise<Blob | null> {
    if (!validKey(key)) return null;
    const obj = await this.bucket.get(this.prefix + key);
    if (!obj) return null;
    return {
      body: new Uint8Array(await obj.arrayBuffer()),
      contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
    };
  }

  async put(key: string, blob: Blob): Promise<void> {
    if (!validKey(key)) throw new Error(`invalid blob key: ${key}`);
    await this.bucket.put(this.prefix + key, blob.body, {
      httpMetadata: { contentType: blob.contentType },
    });
  }
}
