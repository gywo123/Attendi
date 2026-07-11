import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  LogOut,
  Search,
  Shield,
  ShieldOff,
  User,
  XCircle,
} from 'lucide-react'
import { apiFetch } from '../lib/api'
import { classShort, studentClassOptions, type ClassOption } from '../lib/classes'

type AttendanceStatus = 'present' | 'late' | 'absent' | 'early' | 'result' | 'unset'
type ReasonCategory = 'illness' | 'unexcused' | 'other'

type ApiStudent = {
  id: number
  studentNumber: string
  name: string
  classId: number
  className: string
}

type ApiAttendanceRow = {
  id: number
  studentId: number
  period?: number
  status: AttendanceStatus
  reasonCategory?: ReasonCategory | null
  verifiedByQr: boolean
  verifiedAt: string | null
  memo: string | null
}

type AttendanceCellValue = {
  status: AttendanceStatus
  reasonCategory: ReasonCategory | null
  note: string
  verifiedByQr: boolean
  verifiedAt: string | null
  inherited: boolean
}

const PERIODS = Array.from({ length: 8 }, (_, index) => index + 1)

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; style: string; icon: ReactNode }> = {
  unset: { label: '미처리', style: 'border-gray-200 bg-gray-50 text-gray-500', icon: <AlertCircle size={11} /> },
  present: { label: '출석', style: 'border-green-200 bg-green-50 text-green-700', icon: <CheckCircle2 size={11} /> },
  late: { label: '지각', style: 'border-amber-200 bg-amber-50 text-amber-700', icon: <Clock size={11} /> },
  absent: { label: '결석', style: 'border-red-200 bg-red-50 text-red-700', icon: <XCircle size={11} /> },
  early: { label: '조퇴', style: 'border-blue-200 bg-blue-50 text-blue-700', icon: <LogOut size={11} /> },
  result: { label: '결과', style: 'border-violet-200 bg-violet-50 text-violet-700', icon: <FileText size={11} /> },
}

const REASON_LABEL: Record<ReasonCategory, string> = {
  illness: '질병',
  unexcused: '미인정',
  other: '기타',
}

function todayString() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function displayNumber(studentNumber: string) {
  const parsed = Number(studentNumber.slice(-2))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number(studentNumber) || 0
}

function getCell(rows: ApiAttendanceRow[], studentId: number, targetPeriod: number): AttendanceCellValue {
  let carried: AttendanceCellValue = {
    status: 'unset',
    reasonCategory: null,
    note: '',
    verifiedByQr: false,
    verifiedAt: null,
    inherited: false,
  }
  let hasSource = false
  for (const period of PERIODS) {
    if (period > targetPeriod) break
    const explicit = rows.find((row) => row.studentId === studentId && Number(row.period || 1) === period)
    if (explicit) {
      carried = {
        status: explicit.status,
        reasonCategory: explicit.reasonCategory || null,
        note: explicit.memo || '',
        verifiedByQr: Boolean(explicit.verifiedByQr),
        verifiedAt: explicit.verifiedAt,
        inherited: false,
      }
      hasSource = true
    } else if (hasSource) {
      carried = { ...carried, inherited: true }
    }
  }
  return carried
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function AttendanceRecordsPage() {
  const [students, setStudents] = useState<ApiStudent[]>([])
  const [rows, setRows] = useState<ApiAttendanceRow[]>([])
  const [date, setDate] = useState(todayString())
  const [classFilter, setClassFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | 'all'>('all')
  const [search, setSearch] = useState('')
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
        setStudents(studentRows)
        setRows(attendanceRows)
        setError('')
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : '출석 기록을 불러오지 못했습니다.')
      }
    }
    load()
    return () => { ignore = true }
  }, [date])

  const classOptions: ClassOption[] = useMemo(() => studentClassOptions(students), [students])

  useEffect(() => {
    if (classFilter !== 'all' && !classOptions.some((option) => String(option.id) === classFilter)) setClassFilter('all')
  }, [classFilter, classOptions])

  const classStudents = students.filter((student) => classFilter === 'all' || String(student.classId) === classFilter)
  const counts = classStudents.reduce<Record<AttendanceStatus, number>>((result, student) => {
    for (const period of PERIODS) result[getCell(rows, student.id, period).status] += 1
    return result
  }, { present: 0, late: 0, absent: 0, early: 0, result: 0, unset: 0 })

  const filteredStudents = classStudents.filter((student) => {
    const query = search.trim().toLowerCase()
    const hasStatus = PERIODS.some((period) => getCell(rows, student.id, period).status === statusFilter)
    return (statusFilter === 'all' || hasStatus)
      && (!query || student.name.toLowerCase().includes(query) || student.studentNumber.toLowerCase().includes(query))
  })

  function downloadCsv() {
    const lines = [['date', 'class', 'studentNumber', 'studentName', 'period', 'status', 'reasonCategory', 'memo', 'source']]
    for (const student of filteredStudents) {
      for (const period of PERIODS) {
        const cell = getCell(rows, student.id, period)
        lines.push([
          date,
          student.className,
          student.studentNumber,
          student.name,
          String(period),
          STATUS_CONFIG[cell.status].label,
          cell.reasonCategory ? REASON_LABEL[cell.reasonCategory] : '',
          cell.note,
          cell.verifiedByQr ? 'GPS+QR' : 'manual',
        ])
      }
    }
    const csv = `\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `attendance-${date}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-gray-900">출석 기록</h1>
            <p className="mt-0.5 text-sm text-gray-500">학생별 교시 출석 현황 조회</p>
          </div>
          <button onClick={downloadCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm hover:bg-gray-50">
            <Download size={14} /> <span className="hidden sm:inline">CSV 다운로드</span>
          </button>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <Calendar size={14} className="text-gray-400" />
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="bg-transparent text-sm text-gray-700 outline-none" />
          </label>
          <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)} className="min-w-36 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm outline-none">
            <option value="all">전체 반</option>
            {classOptions.map((option) => <option key={option.id} value={option.id}>{classShort(option.name)}</option>)}
          </select>
          <label className="relative flex-1 sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름, 학번 검색..." className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none shadow-sm" />
          </label>
        </div>

        <div className="flex gap-1.5 overflow-x-auto">
          <button onClick={() => setStatusFilter('all')} className={`shrink-0 rounded-lg border px-3 py-2 text-xs ${statusFilter === 'all' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>전체 {classStudents.length}</button>
          {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((status) => (
            <button key={status} onClick={() => setStatusFilter(status)} className={`shrink-0 rounded-lg border px-3 py-2 text-xs ${statusFilter === status ? 'border-gray-900 bg-gray-900 text-white' : STATUS_CONFIG[status].style}`}>
              {STATUS_CONFIG[status].label} {counts[status]}
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <div className="min-w-[1140px]">
              <div className="grid grid-cols-[220px_repeat(8,minmax(112px,1fr))] border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
                <div className="sticky left-0 z-20 border-r border-gray-200 bg-gray-50 px-4 py-3">학생</div>
                {PERIODS.map((period) => <div key={period} className="border-r border-gray-100 px-2 py-3 text-center last:border-r-0">{period}교시</div>)}
              </div>
              {filteredStudents.length === 0 ? (
                <div className="py-16 text-center text-sm text-gray-400">해당 조건의 학생이 없습니다.</div>
              ) : filteredStudents.map((student) => (
                <div key={student.id} className="grid grid-cols-[220px_repeat(8,minmax(112px,1fr))] border-b border-gray-100 last:border-b-0">
                  <div className="sticky left-0 z-10 flex min-h-24 items-center gap-3 border-r border-gray-200 bg-white px-4 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500"><User size={15} /></span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{student.name}</p>
                      <p className="text-xs text-gray-400">{classShort(student.className)} · {displayNumber(student.studentNumber)}번</p>
                    </div>
                  </div>
                  {PERIODS.map((period) => <RecordCell key={period} value={getCell(rows, student.id, period)} />)}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-xs text-gray-400">
            <span>{filteredStudents.length}명 표시</span>
            <span className="flex items-center gap-3"><span className="flex items-center gap-1"><Shield size={11} className="text-green-500" /> GPS+QR</span><span className="flex items-center gap-1"><ShieldOff size={11} /> 수동</span></span>
          </div>
        </div>
      </div>
    </div>
  )
}

function RecordCell({ value }: { value: AttendanceCellValue }) {
  const config = STATUS_CONFIG[value.status]
  const details = [value.reasonCategory ? REASON_LABEL[value.reasonCategory] : '', value.note].filter(Boolean).join(' · ')
  return (
    <div className="min-h-24 border-r border-gray-100 p-2 last:border-r-0">
      <div className={`flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs font-medium ${config.style} ${value.inherited ? 'border-dashed' : ''}`}>
        {config.icon} {config.label}
      </div>
      {details && <p title={details} className="mt-1.5 truncate text-center text-[11px] text-gray-500">{details}</p>}
      {value.verifiedAt && <p className="mt-1 text-center text-[10px] tabular-nums text-gray-400">{new Date(value.verifiedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</p>}
      {value.status !== 'unset' && <div className="mt-1 flex justify-center">{value.verifiedByQr ? <Shield size={10} className="text-green-500" /> : <ShieldOff size={10} className="text-gray-300" />}</div>}
    </div>
  )
}
