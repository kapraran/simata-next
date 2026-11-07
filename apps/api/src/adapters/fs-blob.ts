import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { Blob, BlobStore } from "../ports";
import { contentTypeFor, validKey } from "./blob-key";

export class FsBlobStore implements BlobStore {
  private readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }

  private path(key: string): string {
    if (!validKey(key)) throw new Error(`invalid blob key: ${key}`);
    const p = resolve(join(this.root, key));
    if (!p.startsWith(this.root + sep)) throw new Error(`invalid blob key: ${key}`);
    return p;
  }

  async get(key: string): Promise<Blob | null> {
    if (!validKey(key)) return null;
    try {
      return {
        body: new Uint8Array(await readFile(this.path(key))),
        contentType: contentTypeFor(key),
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async put(key: string, blob: Blob): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, blob.body);
  }
}
