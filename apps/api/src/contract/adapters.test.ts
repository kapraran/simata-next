import { afterAll } from "vitest";
import { blobContract } from "./blob.contract";
import { miniflare, sqliteStores, tempFsBlobs } from "./harness";
import { storesContract } from "./stores.contract";

// Local stack: node:sqlite + folder on disk.
storesContract("node:sqlite", async () => sqliteStores());
blobContract("filesystem", async () => tempFsBlobs());

// Cloud stack: D1 + R2 inside workerd (Miniflare). Same suites, same migration file.
const cloud = await miniflare();
afterAll(() => cloud.dispose());
storesContract("D1 (Miniflare)", async () => cloud);
blobContract("R2 (Miniflare)", async () => cloud.blobs);
