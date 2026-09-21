import { describe, it, expectTypeOf } from 'vitest'
import type { Invoke, PushEvents } from './ipc'
import type { CurrentGame, Hit } from './types'

describe('ipc contract', () => {
  it('game:update payload matches game:get result', () => {
    expectTypeOf<PushEvents['game:update']>().toEqualTypeOf<Invoke['game:get']['result']>()
    expectTypeOf<PushEvents['game:update']['game']>().toEqualTypeOf<CurrentGame | null>()
    expectTypeOf<PushEvents['game:update']['hits']>().toEqualTypeOf<Hit[]>()
  })
})
