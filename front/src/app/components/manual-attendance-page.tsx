import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  LogOut,
  RotateCcw,
  Save,
  Search,
  User,
  XCircle,
} from 'lucide-react'
import { apiFetch } from '../lib/api'
import { sortClassLabels } from '../lib/classes'

type AttendanceStatus = 'present' | 'late' | 'absent' | 'early' | 'result' | 'unset'
type ReasonCategory = 'illness' | 'unexcused' | 'other'

type ApiStudent = {
  id: number
  studentNumber: string
  name: string
  className: string
}

type ApiAttendanceRow = {
  studentId: number
  status: AttendanceStatus
  period?: number
  reasonCategory?: ReasonCategory | null
  verifiedAt: string | null
  memo: string | null
}

type Student = {
  id: string
  name: string
  className: string
  studentNumber: string
  number: number
}

type CellValue = {
  status: AttendanceStatus
  reasonCategory: ReasonCategory | null
  note: string
  inherited: boolean
  sourcePeriod: number | null
}

type EditValue = Pick<CellValue, 'status' | 'reasonCategory' | 'note'>

const PERIODS = Array.from({ length: 8 }, (_, index) => index + 1)

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: 'unset', label: '미처리' },
  { value: 'present', label: '출석' },
  { value: 'late', label: '지각' },
  { value: 'absent', label: '결석' },
  { value: 'early', label: '조퇴' },
  { value: 'result', label: '결과' },
]

const REASON_OPTIONS: { value: ReasonCategory; label: string }[] = [
  { value: 'illness', label: '질병' },
  { value: 'unexcused', label: '미인정' },
  { value: 'other', label: '기타' },
]

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  unset: 'border-gray-200 bg-gray-50 text-gray-500',
  present: 'border-green-200 bg-green-50 text-green-700',
  late: 'border-amber-200 bg-amber-50 text-amber-700',
  absent: 'border-red-200 bg-red-50 text-red-700',
  early: 'border-blue-200 bg-blue-50 text-blue-700',
  result: 'border-violet-200 bg-violet-50 text-violet-700',
}

const STATUS_ICON = {
  unset: AlertCircle,
  present: CheckCircle2,
  late: Clock,
  absent: XCircle,
  early: LogOut,
  result: Clock,
}

function todayString() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function classShort(name: string) {
  const match = name.match(/(\d+)학년\s*(\d+)반/)
  return match ? `${match[1]}-${match[2]}` : name
}

function displayNumber(studentNumber: string) {
  const parsed = Number(studentNumber.slice(-2))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number(studentNumber) || 0
}

function editKey(studentId: string, period: number) {
  return `${studentId}:${period}`
}

function requiresReason(status: AttendanceStatus) {
  return ['late', 'absent', 'early', 'result'].includes(status)
}

export function ManualAttendancePage() {
  const [students, setStudents] = useState<Student[]>([])
  const [savedRows, setSavedRows] = useState<ApiAttendanceRow[]>([])
  const [edits, setEdits] = useState<Record<string, EditValue>>({})
  const [date, setDate] = useState(todayString())
  const [classFilter, setClassFilter] = useState('전체')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false
    async function load() {
      try {
        const params = new URLSearchParams({ dateFrom: date, dateTo: date })
        const [studentRows, attendanceRows] = await Promise.all([
          apiFetch<ApiStudent[]>('/students'),
          apiFetch<ApiAttendanceRow[]>(`/attendance?${params.toString()}`),
        ])
        if (ignore) return
        setStudents(studentRows.map((student) => ({
          id: String(student.id),
          name: student.name,
          className: classShort(student.className),
          studentNumber: student.studentNumber,
          number: displayNumber(student.studentNumber),
        })))
        setSavedRows(attendanceRows)
        setEdits({})
        setError('')
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : '출석 정보를 불러오지 못했습니다.')
      }
    }
    load()
    return () => { ignore = true }
  }, [date, reloadKey])

  const classOptions = useMemo(() => [
    '전체',
    ...sortClassLabels(Array.from(new Set(students.map((student) => student.className).filter(Boolean)))),
  ], [students])

  useEffect(() => {
    if (!classOptions.includes(classFilter)) setClassFilter('전체')
  }, [classFilter, classOptions])

  const filteredStudents = students.filter((student) => {
    const query = search.trim().toLowerCase()
    return (classFilter === '전체' || student.className === classFilter)
      && (!query || student.name.toLowerCase().includes(query) || student.studentNumber.toLowerCase().includes(query))
  })

  function getCell(studentId: string, targetPeriod: number): CellValue {
    let carried: CellValue = { status: 'unset', reasonCategory: null, note: '', inherited: false, sourcePeriod: null }
    for (const period of PERIODS) {
      if (period > targetPeriod) break
      const edited = edits[editKey(studentId, period)]
      const saved = savedRows.find((row) => String(row.studentId) === studentId && Number(row.period || 1) === period)
      if (edited) {
        carried = { ...edited, inherited: false, sourcePeriod: period }
      } else if (saved) {
        carried = {
          status: saved.status,
          reasonCategory: saved.reasonCategory || (requiresReason(saved.status) ? 'other' : null),
          note: saved.memo || '',
          inherited: false,
          sourcePeriod: period,
        }
      } else if (carried.sourcePeriod !== null) {
        carried = { ...carried, inherited: true }
      }
    }
    return carried
  }

  function changeStatus(studentId: string, period: number, status: AttendanceStatus) {
    setEdits((current) => ({
      ...current,
      [editKey(studentId, period)]: {
        status,
        reasonCategory: requiresReason(status) ? (getCell(studentId, period).reasonCategory || 'other') : null,
        note: requiresReason(status) ? getCell(studentId, period).note : '',
      },
    }))
    setMessage('')
  }

  function changeReason(studentId: string, period: number, reasonCategory: ReasonCategory) {
    const cell = getCell(studentId, period)
    setEdits((current) => ({
      ...current,
      [editKey(studentId, period)]: { status: cell.status, reasonCategory, note: cell.note },
    }))
    setMessage('')
  }

  function changeNote(studentId: string, period: number, note: string) {
    const cell = getCell(studentId, period)
    setEdits((current) => ({
      ...current,
      [editKey(studentId, period)]: { status: cell.status, reasonCategory: cell.reasonCategory, note },
    }))
    setMessage('')
  }

  function resetStudent(studentId: string) {
    setEdits((current) => {
      const next = { ...current }
      for (const period of PERIODS) {
        next[editKey(studentId, period)] = { status: 'unset', reasonCategory: null, note: '' }
      }
      return next
    })
    setMessage('')
  }

  async function save() {
    const dirtyEntries = Object.entries(edits)
    if (!dirtyEntries.length) {
      setMessage('변경된 출석 상태가 없습니다.')
      return
    }
    setSaving(true)
    try {
      const records = dirtyEntries.map(([key, value]) => {
        const [studentId, rawPeriod] = key.split(':')
        return {
          studentId,
          period: Number(rawPeriod),
          status: value.status,
          reasonCategory: value.reasonCategory,
          note: value.note,
          time: new Date().toTimeString().slice(0, 5),
        }
      })
      const result = await apiFetch<{ savedCount: number }>('/attendance/manual', {
        method: 'POST',
        body: JSON.stringify({ date, records }),
      })
      setMessage(`${result.savedCount}건의 교시별 출석 상태를 저장했습니다.`)
      setError('')
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : '출석 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div>
          <h1 className="text-gray-900">수동 출석 처리</h1>
          <p className="mt-0.5 text-sm text-gray-500">학생별로 교시 상태를 선택하세요. 변경하지 않은 다음 교시는 이전 상태를 이어받습니다.</p>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {message && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div>}

        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <CalendarDays size={15} className="text-gray-400" />
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="bg-transparent text-sm text-gray-700 outline-none" />
          </label>
          <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)} className="min-w-36 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm outline-none">
            {classOptions.map((option) => <option key={option} value={option}>{option === '전체' ? '전체 반' : option}</option>)}
          </select>
          <label className="relative flex-1 sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름, 학번 검색..." className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none shadow-sm" />
          </label>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <div className="min-w-[1060px]">
              <div className="grid grid-cols-[220px_repeat(8,minmax(100px,1fr))] border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
                <div className="sticky left-0 z-20 border-r border-gray-200 bg-gray-50 px-4 py-3">학생</div>
                {PERIODS.map((period) => <div key={period} className="border-r border-gray-100 px-2 py-3 text-center last:border-r-0">{period}교시</div>)}
              </div>

              {filteredStudents.length === 0 ? (
                <div className="py-16 text-center text-sm text-gray-400">해당하는 학생이 없습니다.</div>
              ) : filteredStudents.map((student) => (
                <div key={student.id} className="grid grid-cols-[220px_repeat(8,minmax(100px,1fr))] border-b border-gray-100 last:border-b-0">
                  <div className="sticky left-0 z-10 flex min-h-24 items-center gap-3 border-r border-gray-200 bg-white px-4 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500"><User size={15} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{student.name}</p>
                      <p className="text-xs text-gray-400">{student.className} · {student.number}번</p>
                    </div>
                    {PERIODS.some((period) => getCell(student.id, period).status !== 'unset') && (
                      <button type="button" onClick={() => resetStudent(student.id)} title={`${student.name}의 전체 교시 초기화`} aria-label={`${student.name}의 전체 교시 초기화`} className="shrink-0 rounded-md border border-gray-200 p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700">
                        <RotateCcw size={13} />
                      </button>
                    )}
                  </div>
                  {PERIODS.map((period) => (
                    <AttendanceCell
                      key={period}
                      value={getCell(student.id, period)}
                      onStatusChange={(status) => changeStatus(student.id, period, status)}
                      onReasonChange={(reason) => changeReason(student.id, period, reason)}
                      onNoteChange={(note) => changeNote(student.id, period, note)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-xs text-gray-400">
            <span>{filteredStudents.length}명 표시</span>
            <span>변경된 칸 {Object.keys(edits).length}개</span>
          </div>
        </div>

        <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center">
          <p className="text-xs text-gray-500">변경한 칸만 저장되며 이후 교시는 선생님이 다시 변경할 때까지 같은 상태로 이어집니다.</p>
          <div className="flex shrink-0 gap-2">
            <button onClick={() => { setEdits({}); setMessage('') }} disabled={!Object.keys(edits).length || saving} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 disabled:opacity-40">
              <RotateCcw size={14} /> 초기화
            </button>
            <button onClick={save} disabled={!Object.keys(edits).length || saving} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-40">
              <Save size={14} /> {saving ? '저장 중...' : `변경 ${Object.keys(edits).length}건 저장`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AttendanceCell({
  value,
  onStatusChange,
  onReasonChange,
  onNoteChange,
}: {
  value: CellValue
  onStatusChange: (status: AttendanceStatus) => void
  onReasonChange: (reason: ReasonCategory) => void
  onNoteChange: (note: string) => void
}) {
  const Icon = STATUS_ICON[value.status]
  return (
    <div className={`min-h-24 border-r border-gray-100 p-2 last:border-r-0 ${value.inherited ? 'bg-gray-50/50' : 'bg-white'}`}>
      <label className={`flex items-center rounded-md border ${STATUS_STYLE[value.status]} ${value.inherited ? 'border-dashed opacity-75' : ''}`}>
        <Icon size={12} className="ml-2 shrink-0" />
        <select value={value.status} onChange={(event) => onStatusChange(event.target.value as AttendanceStatus)} className="min-w-0 flex-1 appearance-none bg-transparent px-1.5 py-2 text-xs font-medium outline-none">
          {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      {requiresReason(value.status) && (
        <>
          <select value={value.reasonCategory || 'other'} onChange={(event) => onReasonChange(event.target.value as ReasonCategory)} className="mt-1.5 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-600 outline-none">
            {REASON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <input value={value.note} onChange={(event) => onNoteChange(event.target.value)} maxLength={200} placeholder="상세 사유" className="mt-1.5 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-600 outline-none placeholder:text-gray-300" />
        </>
      )}
    </div>
  )
}
