import { SEED } from './types'

function mulberry32(a: number): () => number {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let _rng = mulberry32(SEED)

export function reseed(seed: number = SEED): void {
  _rng = mulberry32(seed)
}

export function random(): number {
  return _rng()
}

export function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min
}

export function randomFloat(min: number, max: number): number {
  return random() * (max - min) + min
}

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(random() * arr.length)]
}

export function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
