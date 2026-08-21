import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const globalStyles = readFileSync(
  resolve(process.cwd(), 'src/style.css'),
  'utf8',
)
const reportSource = readFileSync(
  resolve(process.cwd(), 'src/views/ConsumptionView.vue'),
  'utf8',
)
const kpiSource = readFileSync(
  resolve(process.cwd(), 'src/components/consumption/KpiSummary.vue'),
  'utf8',
)

describe('responsive application layout', () => {
  it('lets the mobile service rail collapse to its content height', () => {
    expect(globalStyles).toContain('.service-rail{height:auto}')
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
