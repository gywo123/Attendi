import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Calendar,
  Download,
  Filter,
  Shield,
  ShieldOff,
  CheckCircle2,
  Clock,
  XCircle,
  LogOut,
  ChevronDown,
  Search,
} from 'lucide-react'
import { API_BASE_URL, apiFetch } from '../lib/api'

type AttendanceStatus = 'present' | 'late' | 'absent' | 'early'

type Record_ = {
  studentId: string
  name: string
  class: string
  number: number
  date: string
  status: AttendanceStatus
  checkIn: string | null
  checkOut: string | null
  qrVerified: boolean
  note: string
}

const DATES = Array.from({ length: 7 }, (_, index) => {
  const date = new Date()
  date.setDate(date.getDate() - index)
  return date.toISOString().slice(0, 10)
})
const CLASSES = ['전체', '3-1', '3-2', '2-1', '2-2']
const STATUS_FILTER = ['전체', '출석', '지각', '결석', '조퇴']

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; bg: string; text: string; border: string; icon: ReactNode }> = {
  present: { label: '출석', bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: <CheckCircle2 size={11} /> },
  late: { label: '지각', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: <Clock size={11} /> },
  absent: { label: '결석', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: <XCircle size={11} /> },
  early: { label: '조퇴', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: <LogOut size={11} /> },
}

type ApiAttendanceRow = {
  id: number
  studentId: number
  studentName: string
  studentNumber: string
  classId: number
  className: string
  date: string
  status: AttendanceStatus
  verifiedByQr: boolean
  verifiedAt: string | null
  memo: string | null
}

function classShort(name: string) {
  const match = name.match(/(\d+)학년\s*(\d+)반/)
  return match ? `${match[1]}-${match[2]}` : name
}

function timeOnly(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function displayNumber(studentNumber: string) {
  const parsed = Number(studentNumber.slice(-2))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number(studentNumber) || 0
}

function mapAttendanceRow(row: ApiAttendanceRow): Record_ {
  return {
    studentId: row.studentNumber,
    name: row.studentName,
    class: classShort(row.className),
    number: displayNumber(row.studentNumber),
    date: row.date,
    status: row.status,
    checkIn: timeOnly(row.verifiedAt),
    checkOut: row.status === 'early' ? timeOnly(row.verifiedAt) : null,
    qrVerified: row.verifiedByQr,
    note: row.memo || '',
  }
}

export function AttendanceRecordsPage() {
  const [records, setRecords] = useState<Record_[]>([])
  const [dateFilter, setDateFilter] = useState(DATES[0])
  const [classFilter, setClassFilter] = useState('전체')
  const [statusFilter, setStatusFilter] = useState('전체')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false
    async function loadRecords() {
      try {
        const rows = await apiFetch<ApiAttendanceRow[]>(`/attendance?dateFrom=${dateFilter}&dateTo=${dateFilter}`)
        if (ignore) return
        setRecords(rows.map(mapAttendanceRow))
        setError('')
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : '출석 기록을 불러오지 못했습니다.')
      }
    }
    loadRecords()
    return () => { ignore = true }
  }, [dateFilter])

  const filtered = records.filter((r) => {
    const matchDate = r.date === dateFilter
    const matchClass = classFilter === '전체' || r.class === classFilter
    const matchStatus =
      statusFilter === '전체' || STATUS_CONFIG[r.status].label === statusFilter
    const matchSearch = !search || r.name.includes(search) || r.studentId.includes(search)
    return matchDate && matchClass && matchStatus && matchSearch
  })

  const counts = {
    present: filtered.filter((r) => r.status === 'present').length,
    late: filtered.filter((r) => r.status === 'late').length,
    absent: filtered.filter((r) => r.status === 'absent').length,
    early: filtered.filter((r) => r.status === 'early').length,
  }

  const downloadCsv = () => {
    const params = new URLSearchParams({ dateFrom: dateFilter, dateTo: dateFilter })
    window.location.href = `${API_BASE_URL}/attendance/export.csv?${params.toString()}`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-gray-900">출석 기록</h1>
            <p className="text-sm text-gray-500 mt-0.5">날짜별 출석 현황 조회</p>
          </div>
          <button onClick={downloadCsv} className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors shadow-sm">
            <Download size={14} />
            <span className="hidden sm:inline">CSV 다운로드</span>
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Filters row */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Date filter */}
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="pl-8 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-gray-400 shadow-sm appearance-none cursor-pointer"
            >
              {DATES.map((d) => (
                <option key={d} value={d}>
                  {d.replace(/-/g, '. ')}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* Class filter */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {CLASSES.map((cls) => (
              <button
                key={cls}
                onClick={() => setClassFilter(cls)}
                className={`shrink-0 px-3 py-2 rounded-xl text-sm border transition-colors shadow-sm ${
                  classFilter === cls
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {cls}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 sm:max-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="이름, 학번 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300 shadow-sm"
            />
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {STATUS_FILTER.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                statusFilter === s
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Summary mini-stats */}
        <div className="grid grid-cols-4 gap-2">
          {(Object.entries(counts) as [AttendanceStatus, number][]).map(([s, n]) => {
            const c = STATUS_CONFIG[s]
            return (
              <div
                key={s}
                className={`rounded-xl border p-3 text-center ${c.bg} ${c.border}`}
              >
                <p className={`text-xl font-medium ${c.text}`}>{n}</p>
                <p className={`text-xs mt-0.5 ${c.text} opacity-75`}>{c.label}</p>
              </div>
            )
          })}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto_auto_auto_1fr] gap-3 items-center px-4 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">학생</span>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">학반</span>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">상태</span>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">등교 시각</span>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">하교 시각</span>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">GPS+QR</span>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">비고</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Filter size={24} className="text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-400">해당 조건의 기록이 없습니다</p>
              </div>
            ) : (
              filtered.map((r, i) => <AttendanceRow key={i} record={r} />)
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
            <span>{filtered.length}건 표시</span>
            <div className="flex items-center gap-1.5">
              <Shield size={11} className="text-green-500" />
              <span>GPS+QR 인증</span>
              <ShieldOff size={11} className="text-gray-400 ml-2" />
              <span>수동 처리</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AttendanceRow({ record }: { record: Record_ }) {
  const sc = STATUS_CONFIG[record.status]

  return (
    <div className="px-4 py-3 hover:bg-gray-50 transition-colors">
      {/* Mobile layout */}
      <div className="flex items-center gap-3 md:hidden">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{record.name}</span>
            <span className="text-xs text-gray-400">{record.class} · {record.number}번</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {record.checkIn && (
              <span className="text-xs text-gray-500">등교 {record.checkIn}</span>
            )}
            {record.checkOut && (
              <span className="text-xs text-gray-500">하교 {record.checkOut}</span>
            )}
            {record.note && (
              <span className="text-xs text-gray-400">— {record.note}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {record.qrVerified ? (
            <Shield size={13} className="text-green-500" />
          ) : (
            <ShieldOff size={13} className="text-gray-400" />
          )}
          <StatusChip status={record.status} />
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto_auto_auto_1fr] gap-3 items-center">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">{record.name}</p>
          <p className="text-xs text-gray-400">{record.studentId}</p>
        </div>
        <span className="text-sm text-gray-600">{record.class}반</span>
        <StatusChip status={record.status} />
        <span className="text-sm text-gray-700 font-medium tabular-nums">
          {record.checkIn ?? '—'}
        </span>
        <span className="text-sm text-gray-500 tabular-nums">
          {record.checkOut ?? '—'}
        </span>
        <div className="flex justify-center">
          {record.qrVerified ? (
            <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
              <Shield size={10} />
              인증
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">
              <ShieldOff size={10} />
              수동
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400 truncate">{record.note || '—'}</span>
      </div>
    </div>
  )
}

function StatusChip({ status }: { status: AttendanceStatus }) {
  const c = STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 font-medium ${c.bg} ${c.text} ${c.border}`}
    >
      {c.icon}
      {c.label}
    </span>
  )
}
