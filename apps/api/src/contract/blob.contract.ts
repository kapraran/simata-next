import { describe, expect, it } from "vitest";
import type { BlobStore } from "../ports";

/** Behaviour every BlobStore must have. */
export function blobContract(name: string, make: () => Promise<BlobStore>) {
  describe(`BlobStore contract: ${name}`, () => {
    it("round-trips bytes and content type", async () => {
      const blobs = await make();
      const body = new Uint8Array([0, 1, 2, 255, 254]);
      await blobs.put("media/abc.jpg", { body, contentType: "image/jpeg" });
      const got = await blobs.get("media/abc.jpg");
      expect(got?.contentType).toBe("image/jpeg");
      expect([...(got?.body ?? [])]).toEqual([...body]);
    });

    it("overwrites", async () => {
      const blobs = await make();
      await blobs.put("bank.json", { body: new Uint8Array([1]), contentType: "application/json" });
      await blobs.put("bank.json", { body: new Uint8Array([2]), contentType: "application/json" });
      expect([...((await blobs.get("bank.json"))?.body ?? [])]).toEqual([2]);
    });

    it("returns null for a missing key", async () => {
      expect(await (await make()).get("media/nope.jpg")).toBeNull();
    });

    it("rejects path tricks", async () => {
      const blobs = await make();
      for (const key of ["../secret", "media/../../x", "/abs", "a//b", "", "a b", "media/.."]) {
        expect(await blobs.get(key)).toBeNull();
        await expect(
          blobs.put(key, { body: new Uint8Array(1), contentType: "x/y" }),
        ).rejects.toThrow();
      }
    });
  });
}
