import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SyncDetails from '../SyncDetails.vue'
import { dashboardAnalysis, successStatus } from './fixtures'

describe('SyncDetails', () => {
  it('keeps synchronization details collapsed until requested', async () => {
    const wrapper = mount(SyncDetails, {
      attachTo: document.body,
      props: {
        status: successStatus,
        analysis: dashboardAnalysis,
        canManage: true,
        syncing: false,
        error: '',
      },
    })

    expect(wrapper.find('[data-sync-details]').isVisible()).toBe(false)
    await wrapper.get('[data-action="toggle-sync-details"]').trigger('click')

    expect(
      wrapper.get('[data-action="toggle-sync-details"]').attributes(
        'aria-expanded',
      ),
    ).toBe('true')
    expect(wrapper.get('[data-sync-details]').isVisible()).toBe(true)
    expect(wrapper.text()).toContain('本地 MySQL 快照')
    wrapper.unmount()
  })

  it('preserves role-based synchronization permissions', async () => {
    const wrapper = mount(SyncDetails, {
      props: {
        status: successStatus,
        analysis: dashboardAnalysis,
        canManage: false,
        syncing: false,
        error: '',
      },
    })

    await wrapper.get('[data-action="toggle-sync-details"]').trigger('click')

    expect(
      wrapper.get('[data-action="sync-consumption"]').attributes(),
    ).toHaveProperty('disabled')
    expect(wrapper.text()).toContain('仅管理员和经理可手动同步')
  })
})
