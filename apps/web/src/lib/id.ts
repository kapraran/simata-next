const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32

/** Sortable unique id (ULID layout): 10 chars of time, 16 of randomness. */
export function newId(now = Date.now(), random: () => number = Math.random): string {
  let t = now;
  let time = "";
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let rand = "";
  for (let i = 0; i < 16; i++) rand += ALPHABET[Math.floor(random() * 32)];
  return time + rand;
}
