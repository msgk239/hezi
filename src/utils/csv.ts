export interface CsvParseResult {
  rows: string[][]
  warning: string
}

export function parseCsv(content: string): CsvParseResult {
  if (!content) return { rows: [], warning: '' }

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]

    if (inQuotes) {
      if (character === '"') {
        if (content[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += character
      }
      continue
    }

    if (character === '"') {
      inQuotes = true
      continue
    }

    if (character === ',') {
      row.push(cell)
      cell = ''
      continue
    }

    if (character === '\r' || character === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      if (character === '\r' && content[index + 1] === '\n') index += 1
      continue
    }

    cell += character
  }

  if (cell || row.length > 0 || content.endsWith(',')) {
    row.push(cell)
    rows.push(row)
  }

  return {
    rows,
    warning: inQuotes ? '文件末尾存在未闭合的双引号，表格可能不完整。' : ''
  }
}
