import { describe, expect, it } from "vitest";
import type { SessionStore, UserStore } from "../ports";

let n = 0;
/** Ids must be unique across a shared database (D1 is one instance for the whole suite). */
const uniq = (p: string) => `${p}-${Date.now()}-${n++}`;

const newUser = (id = uniq("user"), keyHash = uniq("hash")) => ({
  id,
  keyHash,
  name: "",
  createdAt: 1_700_000_000_000,
});

/** Behaviour every UserStore/SessionStore implementation must have, whatever database is behind it. */
export function authContract(
  name: string,
  make: () => Promise<{ users: UserStore; sessions: SessionStore }>,
) {
  describe(`UserStore contract: ${name}`, () => {
    it("round-trips a user by id and by key hash", async () => {
      const { users } = await make();
      const u = newUser();
      await users.insert(u);
      expect(await users.byId(u.id)).toMatchObject({ id: u.id, keyHash: u.keyHash });
      expect(await users.byKeyHash(u.keyHash)).toMatchObject({ id: u.id });
      expect(await users.byId(uniq("missing"))).toBeNull();
      expect(await users.byKeyHash(uniq("missing"))).toBeNull();
    });

    it("lists users oldest first, without the key hash", async () => {
      const { users } = await make();
      const a = { ...newUser(), createdAt: 1, name: "A" };
      const b = { ...newUser(), createdAt: 2, name: "B" };
      await users.insert(b);
      await users.insert(a);
      const mine = (await users.list()).filter((x) => x.id === a.id || x.id === b.id);
      expect(mine.map((x) => x.name)).toEqual(["A", "B"]);
      expect(mine[0]).not.toHaveProperty("keyHash");
    });

    it("updates name, key hash, disabled and last seen", async () => {
      const { users } = await make();
      const u = newUser();
      await users.insert(u);
      await users.setName(u.id, "Maria");
      const rotated = uniq("hash");
      await users.setKeyHash(u.id, rotated);
      await users.setDisabled(u.id, true);
      await users.touch(u.id, 42);
      expect(await users.byId(u.id)).toMatchObject({
        name: "Maria",
        keyHash: rotated,
        disabled: true,
        lastSeenAt: 42,
      });
    });

    it("removes a user", async () => {
      const { users } = await make();
      const u = newUser();
      await users.insert(u);
      await users.remove(u.id);
      expect(await users.byId(u.id)).toBeNull();
    });
  });

  describe(`SessionStore contract: ${name}`, () => {
    const mkUser = (id = uniq("su")) => newUser(id, uniq("hash"));
    const session = (userId: string, tokenHash = uniq("tok")) => ({
      tokenHash,
      userId,
      createdAt: 100,
      expiresAt: 1000,
      lastSeenAt: 100,
    });

    it("round-trips a session", async () => {
      const { users, sessions } = await make();
      const u = mkUser();
      const s = session(u.id);
      await users.insert(u);
      await sessions.insert(s);
      expect(await sessions.get(s.tokenHash)).toEqual({
        userId: u.id,
        expiresAt: 1000,
        lastSeenAt: 100,
      });
      expect(await sessions.get(uniq("tok"))).toBeNull();
    });

    it("slides the expiry on touch", async () => {
      const { users, sessions } = await make();
      const u = mkUser();
      const s = session(u.id);
      await users.insert(u);
      await sessions.insert(s);
      await sessions.touch(s.tokenHash, 500, 5000);
      expect(await sessions.get(s.tokenHash)).toEqual({
        userId: u.id,
        expiresAt: 5000,
        lastSeenAt: 500,
      });
    });

    it("deletes by token and by user", async () => {
      const { users, sessions } = await make();
      const u1 = mkUser();
      const u2 = mkUser();
      await users.insert(u1);
      await users.insert(u2);
      const a = session(u1.id);
      const b = session(u1.id);
      const c = session(u2.id);
      await sessions.insert(a);
      await sessions.insert(b);
      await sessions.insert(c);
      await sessions.removeByToken(a.tokenHash);
      expect(await sessions.get(a.tokenHash)).toBeNull();
      await sessions.removeByUser(u1.id);
      expect(await sessions.get(b.tokenHash)).toBeNull();
      expect(await sessions.get(c.tokenHash)).not.toBeNull();
    });

    it("purges only expired sessions", async () => {
      const { users, sessions } = await make();
      const u1 = mkUser();
      const u2 = mkUser();
      await users.insert(u1);
      await users.insert(u2);
      const old = session(u1.id);
      const live = { ...session(u2.id), expiresAt: 9000 };
      await sessions.insert(old);
      await sessions.insert(live);
      await sessions.purgeExpired(2000);
      expect(await sessions.get(old.tokenHash)).toBeNull();
      expect(await sessions.get(live.tokenHash)).not.toBeNull();
    });

    it("removing a user removes their sessions", async () => {
      const { users, sessions } = await make();
      const u = mkUser();
      const s = session(u.id);
      await users.insert(u);
      await sessions.insert(s);
      await users.remove(u.id);
      expect(await sessions.get(s.tokenHash)).toBeNull();
    });
  });
}
