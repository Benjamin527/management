import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../src/stores/auth'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('loads the current session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'u1', email: 'agent@example.com', name: '王雨轩', role: 'AGENT',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const auth = useAuthStore()

    await auth.loadCurrentUser()

    expect(auth.user?.name).toBe('王雨轩')
    expect(auth.ready).toBe(true)
  })

  it('treats a 401 response as signed out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
    const auth = useAuthStore()

    await auth.loadCurrentUser()

    expect(auth.user).toBeNull()
    expect(auth.ready).toBe(true)
  })
})
