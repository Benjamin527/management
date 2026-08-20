import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../../stores/auth'
import SyncStatusBar from '../SyncStatusBar.vue'

const { getServiceSyncStatus, runServiceSync } = vi.hoisted(() => ({
  getServiceSyncStatus: vi.fn(),
  runServiceSync: vi.fn(),
}))

vi.mock('../../../api/serviceSync', () => ({ getServiceSyncStatus, runServiceSync }))

const successStatus = {
  enabled: true,
  running: false,
  lastSuccessfulRun: {
    id: 'sync-1', mode: 'RECENT', status: 'SUCCESS', rangeStart: '2026-08-12T16:00:00.000Z', rangeEnd: '2026-08-20T16:00:00.000Z',
    readCount: 120, createdCount: 5, updatedCount: 115, deletedCount: 0, failedCount: 0, errorSummary: null,
    startedAt: '2026-08-20T18:00:00.000Z', finishedAt: '2026-08-20T18:00:06.000Z',
  },
  lastRun: null,
  nextScheduledAt: '2026-08-21T18:00:00.000Z',
  sourceUrl: 'https://example.feishu.cn/wiki/example',
}

function mountStatusBar(role: string) {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = { id: 'user-1', email: 'user@example.com', name: '测试用户', role }
  return mount(SyncStatusBar)
}

describe('SyncStatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServiceSyncStatus.mockResolvedValue(successStatus)
    runServiceSync.mockResolvedValue({ accepted: true, mode: 'recent' })
  })

  it('shows the last success and lets an admin request recent sync', async () => {
    const wrapper = mountStatusBar('ADMIN')
    await flushPromises()

    expect(wrapper.text()).toContain('读取 120')
    await wrapper.get('[data-testid="sync-recent"]').trigger('click')
    await flushPromises()

    expect(runServiceSync).toHaveBeenCalledWith('recent')
    wrapper.unmount()
  })

  it('hides manual synchronization controls from an agent', async () => {
    const wrapper = mountStatusBar('AGENT')
    await flushPromises()

    expect(wrapper.find('[data-testid="sync-recent"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="open-feishu"]').attributes('href')).toBe(successStatus.sourceUrl)
  })
})
