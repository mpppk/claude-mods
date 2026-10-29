import type { On, TurnUsage } from 'claude-code'
import { type Engine, expect, mock, test } from 'claude-code/testing'
import { inferTtl, label } from '../hooks/cache'

const USAGE: TurnUsage = {
  model: 'claude',
  input_tokens: 50,
  output_tokens: 200,
  cache_read_input_tokens: 20_000,
  cache_creation_input_tokens: 1_000,
}

/** Stands for the engine beneath the mod: the status line it draws and the responses it streams. */
function engine(on: On, now = 1_000_000) {
  const clock = mock.clock(on, { now })
  mock.store(on)
  const status: { text: string | undefined } = { text: undefined }
  on('ui.status', (_, e) => {
    status.text = e.text
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  on('classic.PostModelSwitch', () => ({}))
  let usage: TurnUsage | null = USAGE
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
  return {
    clock,
    status,
    respondWith(next: TurnUsage | null) {
      usage = next
    },
  }
}

async function step($: Engine, agentId?: string) {
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude', messageCount: 1, ...(agentId ? { agentId } : {}) })
  for await (const _ of stream);
  return stream.result
}

test('labels stay short', () => {
  expect(label(4 * 60_000 + 59_000)).toBe('🟢4m')
  expect(label(59_000)).toBe('🟢<1m')
  expect(label(0)).toBe(undefined)
})

test('a cached request starts the countdown, which runs down and disappears', async ($, on) => {
  const { clock, status } = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(status.text).toBe(undefined)

  await step($)
  expect(status.text).toBe('🟢5m')

  await clock.advance(65_000)
  expect(status.text).toBe('🟢3m')

  await clock.advance(3 * 60_000)
  expect(status.text).toBe('🟢<1m')

  await clock.advance(55_000)
  expect(status.text).toBe(undefined)
})

test('a subagent request or one without cache use leaves the countdown alone', async ($, on) => {
  const { clock, status, respondWith } = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await step($)
  await clock.advance(4 * 60_000 + 5_000)
  expect(status.text).toBe('🟢<1m')

  await step($, 'agent-1')
  expect(status.text).toBe('🟢<1m')

  respondWith({ ...USAGE, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })
  await step($)
  respondWith(null)
  await step($)
  expect(status.text).toBe('🟢<1m')
})

test('a fixed 1h TTL counts down from an hour', { options: { ttl: '1h' } }, async ($, on) => {
  const { status } = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await step($)
  expect(status.text).toBe('🟢60m')
})

test('the TTL the engine names on a model switch is kept, and the switch clears the countdown', async ($, on) => {
  const { status } = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await step($)
  expect(status.text).toBe('🟢5m')

  await $.classic.PostModelSwitch({
    from_model: 'a',
    to_model: 'b',
    requested_model: 'b',
    source: 'command',
    context_tokens: 21_000,
    prompt_cache_warm: true,
    cache_ttl: '1h',
    estimated_cache_write_usd: 0.1,
    pricing: 'catalog',
  })
  expect(status.text).toBe(undefined)

  await step($)
  expect(status.text).toBe('🟢60m')
})

test('a resumed session counts from its last response', async ($, on) => {
  const { status } = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 130, prompt_cache_likely_expired: false })
  expect(status.text).toBe('🟢2m')
})

test('a resumed session the engine calls warm past 5 minutes teaches 1h', async ($, on) => {
  const { status } = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 600, prompt_cache_likely_expired: false })
  expect(status.text).toBe('🟢50m')
})

test('/clear forgets the countdown', async ($, on) => {
  const { status } = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await step($)
  await $.classic.SessionStart({ source: 'clear' })
  expect(status.text).toBe(undefined)
})

test('what the cache served after a gap tells the TTL', () => {
  const base = { firstPromptTokens: 20_000, lastPromptTokens: 60_000 }
  expect(inferTtl({ ...base, gapMs: 10 * 60_000, cacheRead: 59_000 })).toBe('1h')
  expect(inferTtl({ ...base, gapMs: 10 * 60_000, cacheRead: 18_000 })).toBe('5m')
  expect(inferTtl({ ...base, gapMs: 10 * 60_000, cacheRead: 40_000 })).toBe(undefined)
  expect(inferTtl({ ...base, gapMs: 2 * 60_000, cacheRead: 59_000 })).toBe(undefined)
  expect(inferTtl({ ...base, gapMs: 2 * 60 * 60_000, cacheRead: 0 })).toBe(undefined)
  expect(inferTtl({ firstPromptTokens: 20_000, lastPromptTokens: 21_000, gapMs: 10 * 60_000, cacheRead: 21_000 })).toBe(undefined)
})

test('a TTL learned from the cache carries into later countdowns', async ($, on) => {
  const { clock, status, respondWith } = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await step($) // first request: 21,050 prompt tokens
  respondWith({ ...USAGE, cache_read_input_tokens: 21_000, cache_creation_input_tokens: 30_000 })
  await step($) // 51,050 prompt tokens, read warm
  await clock.advance(10 * 60_000)
  expect(status.text).toBe(undefined)

  respondWith({ ...USAGE, cache_read_input_tokens: 51_000, cache_creation_input_tokens: 500 })
  await step($) // the whole prefix was still there after 10 minutes
  expect(status.text).toBe('🟢60m')
})
