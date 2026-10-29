import type { EngineInterface, Register } from 'claude-code'
import type { CacheTtl } from '../types'
import { TTL_MS, inferTtl, label } from './cache'

const lastHitAt = { plugin: 'cache-timer', key: 'lastHitAt' } as const
const lastPromptTokens = { plugin: 'cache-timer', key: 'lastPromptTokens' } as const
const firstPromptTokens = { plugin: 'cache-timer', key: 'firstPromptTokens' } as const
const learnedTtl = { plugin: 'cache-timer', key: 'ttl' } as const

const TICK_MS = 5_000

/** The TTL the user fixed in the mod's options; undefined under `auto`. */
let fixedTtl: CacheTtl | undefined
/** What the status line holds now, so a tick that changes nothing draws nothing. */
let shown: string | undefined

async function currentTtl($: EngineInterface): Promise<CacheTtl> {
  if (fixedTtl) return fixedTtl
  const { value } = await $.state.get(learnedTtl)
  if (value) return value
  return (await $.store.get('ttl')) === '1h' ? '1h' : '5m'
}

async function learn($: EngineInterface, value: CacheTtl) {
  if (fixedTtl) return
  await $.state.set(learnedTtl, value)
  await $.store.set('ttl', value)
}

async function refresh($: EngineInterface) {
  const { value: at = 0 } = await $.state.get(lastHitAt)
  const text = at === 0 ? undefined : label(at + TTL_MS[await currentTtl($)] - (await $.clock.now()))
  if (text === shown) return
  shown = text
  $.ui.status(text)
}

async function forget($: EngineInterface) {
  await $.state.set(lastHitAt, 0)
  await $.state.set(lastPromptTokens, 0)
  await $.state.set(firstPromptTokens, 0)
  await refresh($)
}

export const register: Register = (on, options) => {
  fixedTtl = options.ttl === '5m' || options.ttl === '1h' ? options.ttl : undefined
  shown = undefined

  on('session.start', async ($, e, next) => {
    $.clock.every(TICK_MS, () => refresh($))
    await refresh($)
    return next(e)
  })

  // Each main-thread request that reads or writes the cache restarts its TTL.
  on('turn.step', async function* ($, e, next) {
    const sentAt = await $.clock.now()
    const response = yield* next(e)
    const usage = response.usage
    if (e.agentId !== undefined || usage === null) return response

    const read = usage.cache_read_input_tokens
    const written = usage.cache_creation_input_tokens
    if (read + written === 0) return response
    const promptTokens = usage.input_tokens + read + written

    const { value: at = 0 } = await $.state.get(lastHitAt)
    const { value: first = 0 } = await $.state.get(firstPromptTokens)
    const { value: last = 0 } = await $.state.get(lastPromptTokens)
    if (first === 0) {
      await $.state.set(firstPromptTokens, promptTokens)
    } else if (at > 0) {
      const seen = inferTtl({ gapMs: sentAt - at, lastPromptTokens: last, firstPromptTokens: first, cacheRead: read })
      if (seen) await learn($, seen)
    }

    await $.state.set(lastHitAt, sentAt)
    await $.state.set(lastPromptTokens, promptTokens)
    await refresh($)
    return response
  })

  // A resumed transcript arrives with the time since its last response, and
  // the engine's own judgement of whether that outlived the TTL.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear') {
      await forget($)
    } else if (e.seconds_since_last_response !== undefined) {
      const gapMs = e.seconds_since_last_response * 1000
      if (e.prompt_cache_likely_expired === false && gapMs > TTL_MS['5m']) await learn($, '1h')
      if (e.prompt_cache_likely_expired === true && gapMs < TTL_MS['1h']) await learn($, '5m')
      await $.state.set(lastHitAt, (await $.clock.now()) - gapMs)
      await refresh($)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // The engine names the TTL it caches with when the model changes, and the
  // switch itself leaves the new model's cache cold.
  on('classic.PostModelSwitch', async ($, e, next) => {
    await learn($, e.cache_ttl)
    await $.state.set(lastHitAt, (await $.clock.now()) - TTL_MS['1h'])
    await refresh($)
    return next(e)
  }).catch(($, e, next) => next(e))
}
