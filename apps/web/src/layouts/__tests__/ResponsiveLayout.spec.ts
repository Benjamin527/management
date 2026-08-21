import { describe, expect, it } from 'vitest'
import reportSource from '../../views/ConsumptionView.vue?raw'
import kpiSource from '../../components/consumption/KpiSummary.vue?raw'
import layoutSource from '../AppLayout.vue?raw'

describe('responsive application layout', () => {
  it('lets the mobile service rail collapse to its content height', () => {
    expect(layoutSource).toContain('.service-rail{height:auto}')
  })

  it('keeps report sections from shrinking inside the scrolling page', () => {
    expect(reportSource).toContain(
      '.consumption-report>*{flex-shrink:0}',
    )
  })

  it('uses a contained two-column KPI grid on phones', () => {
    expect(kpiSource).toContain(
      '@media(max-width:680px){.kpi-summary{grid-template-columns:repeat(2,minmax(0,1fr))',
    )
  })
})
