export function parseCsv(csv) {
  const lines = String(csv || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0]).map((header) => header.trim())
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() || '']))
  })
}

function splitCsvLine(line) {
  const values = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]
    if (char === '"' && quoted && next === '"') {
      current += '"'
      i += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      values.push(current)
      current = ''
    } else {
      current += char
    }
  }
  values.push(current)
  return values
}
