/**
 * Deterministic, non-cryptographic hashing for weighted splits.
 *
 * Implements MurmurHash3 (x86, 32-bit). Same input → same output across runs,
 * machines, and processes — never use `Math.random()` for bucketing. Zero deps;
 * safe in the request path.
 *
 * @module
 */

/**
 * MurmurHash3 x86 32-bit. Returns an unsigned 32-bit integer.
 *
 * @param input - UTF-8 string to hash.
 * @param seed - Optional seed (default 0).
 */
export function murmur3(input: string, seed = 0): number {
  const data = new TextEncoder().encode(input);
  const len = data.length;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  let h1 = seed >>> 0;
  const nblocks = len - (len % 4);

  for (let i = 0; i < nblocks; i += 4) {
    let k1 =
      (data[i]! & 0xff) |
      ((data[i + 1]! & 0xff) << 8) |
      ((data[i + 2]! & 0xff) << 16) |
      ((data[i + 3]! & 0xff) << 24);

    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);

    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = (Math.imul(h1, 5) + 0xe6546b64) | 0;
  }

  let k1 = 0;
  const tail = len & 3;
  if (tail === 3) k1 ^= (data[nblocks + 2]! & 0xff) << 16;
  if (tail >= 2) k1 ^= (data[nblocks + 1]! & 0xff) << 8;
  if (tail >= 1) {
    k1 ^= data[nblocks]! & 0xff;
    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);
    h1 ^= k1;
  }

  h1 ^= len;
  // fmix32
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;

  return h1 >>> 0;
}

/**
 * Map a string deterministically onto the half-open unit interval `[0, 1)`.
 * Used to pick a bucket within a split's cumulative weight range.
 */
export function hashToUnitInterval(input: string, seed = 0): number {
  // Divide by 2^32 so the result is always < 1.
  return murmur3(input, seed) / 0x100000000;
}
