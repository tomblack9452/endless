// Seeded random numbers for world generation (mulberry32). Seeding before a
// run makes its layout reproducible: same seed, same course, however the ship
// is flown (see tests/courses.test.ts and tests/determinism.test.ts).

let state = (Math.random() * 2 ** 32) >>> 0;
// A second stream from the same seed, for what came later (risk lanes, gate
// runs): its draws never move the first stream's, so every older part of a
// course is laid out exactly as it was.
let extra = (state ^ 0x9e3779b9) >>> 0;

export function seed(n: number): void {
  state = n >>> 0;
  extra = (Math.imul(n >>> 0, 0x85ebca6b) ^ 0x9e3779b9) >>> 0;
}

/** 0 <= rand() < 1, like Math.random(). */
export function rand(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** 0 <= featureRand() < 1, the second stream (risk lanes and gate runs). */
export function featureRand(): number {
  extra = (extra + 0x6d2b79f5) >>> 0;
  let t = extra;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A fresh random seed for a new run. */
export function newSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0;
}
