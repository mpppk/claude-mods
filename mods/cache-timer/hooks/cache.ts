import type { CacheTtl } from '../types'

export const TTL_MS: Record<CacheTtl, number> = {
  '5m': 5 * 60_000,
  '1h': 60 * 60_000,
}

/** How the cache reads in the status line: short enough to sit beside the engine's own notices. */
export function label(remainingMs: number): string {
  if (remainingMs <= 0) return 'cache cold'
  if (remainingMs < 60_000) return 'cache <1m'
  return `cache ${Math.floor(remainingMs / 60_000)}m`
}

export type Observation = {
  /** Time between the previous cache hit and this request. */
  gapMs: number
  /** Prompt tokens the previous hit carried. */
  lastPromptTokens: number
  /** Prompt tokens of the session's first request: an upper bound on what a cold cache can still serve (system prompt, tools). */
  firstPromptTokens: number
  /** What this request read from the cache. */
  cacheRead: number
}

const MARGIN_MS = 30_000
const MIN_CONVERSATION_TOKENS = 2_000

/**
 * What a request sent between 5 minutes and 1 hour after the last hit says
 * about the TTL: a warm read of the whole previous prompt means 1h, a read no
 * larger than the shared prefix means 5m. Anything else says nothing.
 */
export function inferTtl(o: Observation): CacheTtl | undefined {
  if (o.gapMs < TTL_MS['5m'] + MARGIN_MS || o.gapMs > TTL_MS['1h'] - MARGIN_MS) return undefined
  if (o.lastPromptTokens < o.firstPromptTokens + MIN_CONVERSATION_TOKENS) return undefined
  if (o.cacheRead >= o.lastPromptTokens * 0.95) return '1h'
  if (o.cacheRead <= o.firstPromptTokens) return '5m'
  return undefined
}
