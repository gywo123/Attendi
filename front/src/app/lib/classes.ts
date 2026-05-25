export type StudentClassSource = {
  classId?: number | null
  className?: string | null
}

export type ClassOption = {
  id: number
  name: string
  label: string
}

export function classShort(name: string) {
  const parsed = parseClassName(name)
  return parsed ? `${parsed.grade}-${parsed.classNum}` : name
}

export function studentClassOptions(rows: StudentClassSource[]) {
  const byId = new Map<number, ClassOption>()
  for (const row of rows) {
    if (!row.classId || !row.className) continue
    byId.set(Number(row.classId), {
      id: Number(row.classId),
      name: row.className,
      label: classShort(row.className),
    })
  }
  return Array.from(byId.values()).sort((a, b) => compareClassNames(a.name, b.name))
}

export function sortClassLabels(labels: string[]) {
  return [...labels].sort(compareClassNames)
}

export function compareClassNames(a: string, b: string) {
  const left = parseClassName(a)
  const right = parseClassName(b)
  if (left && right) {
    if (left.grade !== right.grade) return left.grade - right.grade
    if (left.classNum !== right.classNum) return left.classNum - right.classNum
  }
  return a.localeCompare(b, 'ko-KR', { numeric: true })
}

function parseClassName(value: string) {
  const raw = String(value || '').trim()
  const full = raw.match(/^(\d+)학년\s*(\d+)반$/)
  if (full) return { grade: Number(full[1]), classNum: Number(full[2]) }
  const dashed = raw.match(/^(\d+)-(\d+)$/)
  if (dashed) return { grade: Number(dashed[1]), classNum: Number(dashed[2]) }
  return null
}
