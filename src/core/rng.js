// 시드 기반 난수 (mulberry32)
export function makeRng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + (hi - lo) * rng();
  rng.int = (lo, hi) => Math.floor(rng.range(lo, hi + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.weighted = (weights) => {
    // weights: {key: w}
    let total = 0;
    for (const k in weights) total += weights[k];
    let r = rng() * total;
    for (const k in weights) {
      r -= weights[k];
      if (r < 0) return k;
    }
    return Object.keys(weights)[0];
  };
  return rng;
}
