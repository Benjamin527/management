import type { CustomerDraft, CustomerStatus } from '../api/types'

const statusMap: Record<string, CustomerStatus> = {
  active: 'ACTIVE', 服务中: 'ACTIVE', 正常: 'ACTIVE',
  onboarding: 'ONBOARDING', 交接中: 'ONBOARDING',
  at_risk: 'AT_RISK', risk: 'AT_RISK', 风险: 'AT_RISK',
  paused: 'PAUSED', 暂停: 'PAUSED',
  ended: 'ENDED', 已结束: 'ENDED',
}

function parseRows(source: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]
    if (char === '"' && quoted && next === '"') {
      cell += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(cell.trim())
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1
      row.push(cell.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function headerIndex(headers: string[], names: string[]) {
  return headers.findIndex((header) => names.includes(header.toLowerCase()))
}

export function parseCustomerCsv(source: string): { rows: CustomerDraft[]; errors: string[] } {
  const parsed = parseRows(source.replace(/^\uFEFF/, ''))
  if (!parsed.length) return { rows: [], errors: ['文件中没有可导入的数据'] }
  const headers = parsed[0]
  const nameIndex = headerIndex(headers, ['客户名称', 'name'])
  if (nameIndex < 0) return { rows: [], errors: ['未找到“客户名称”或“name”列'] }
  const industryIndex = headerIndex(headers, ['行业', 'industry'])
  const levelIndex = headerIndex(headers, ['客户级别', '级别', 'level'])
  const statusIndex = headerIndex(headers, ['状态', 'status'])
  const rows: CustomerDraft[] = []
  const errors: string[] = []

  parsed.slice(1).forEach((values, index) => {
    const name = values[nameIndex]?.trim()
    if (!name) {
      errors.push(`第 ${index + 2} 行缺少客户名称`)
      return
    }
    const industry = industryIndex >= 0 ? values[industryIndex]?.trim() : ''
    const level = levelIndex >= 0 ? values[levelIndex]?.trim() : ''
    const rawStatus = statusIndex >= 0 ? values[statusIndex]?.trim() : ''
    rows.push({
      name,
      ...(industry ? { industry } : {}),
      ...(level ? { level } : {}),
      ...(rawStatus ? { status: statusMap[rawStatus.toLowerCase()] ?? 'ACTIVE' } : {}),
    })
  })
  return { rows, errors }
}
