export type CacheTtl = '5m' | '1h'

declare module 'claude-code' {
  interface PluginState {
    'cache-timer': {
      /** When the main thread's last request touching the cache was sent (epoch ms). */
      lastHitAt: number
      /** Prompt tokens that request carried: the prefix the next one hopes to read. */
      lastPromptTokens: number
      /** Prompt tokens of the session's first request: roughly the prefix shared with other sessions. */
      firstPromptTokens: number
      /** The TTL this session has learned, from the engine or from what the cache did. */
      ttl: CacheTtl
    }
  }
}
