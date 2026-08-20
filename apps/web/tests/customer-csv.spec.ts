import { describe, expect, it } from 'vitest'
import { parseCustomerCsv } from '../src/utils/customerCsv'

describe('customer CSV parser', () => {
  it('parses Chinese headers, quoted cells, and skips blank rows', () => {
    const result = parseCustomerCsv('客户名称,行业,客户级别,状态\n"太保,总部",保险,战略客户,服务中\n\n云桥科技,互联网,成长客户,风险')

    expect(result.errors).toEqual([])
    expect(result.rows).toEqual([
      { name: '太保,总部', industry: '保险', level: '战略客户', status: 'ACTIVE' },
      { name: '云桥科技', industry: '互联网', level: '成长客户', status: 'AT_RISK' },
    ])
  })

  it('accepts English headers and reports rows without a customer name', () => {
    const result = parseCustomerCsv('name,industry,level,status\nAcme,Software,Key,active\n,Finance,Standard,active')

    expect(result.rows[0]).toEqual({ name: 'Acme', industry: 'Software', level: 'Key', status: 'ACTIVE' })
    expect(result.errors).toEqual(['第 3 行缺少客户名称'])
  })

  it('requires a recognized customer name column', () => {
    const result = parseCustomerCsv('公司,行业\n太保,保险')
    expect(result.rows).toEqual([])
    expect(result.errors).toEqual(['未找到“客户名称”或“name”列'])
  })
})
