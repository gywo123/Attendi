import { useEffect, useState, type ReactNode } from 'react'
import {
  CheckCircle2,
  Clock,
  XCircle,
  LogOut,
  Search,
  ChevronDown,
  Check,
  FileText,
  Save,
  AlertCircle,
  User,
  Filter,
  RotateCcw,
  CalendarDays,
  Users,
  Pencil,
  X,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { apiFetch } from '../lib/api'
import { TimeInput } from './manual-attendance/time-input'

type AttendanceStatus = 'present' | 'late' | 'absent' | 'early' | 'unset'

type StudentRecord = {
  id: string
  name: string
  class: string
  grade: number
  number: number
  studentId: string
  status: AttendanceStatus
  time: string
  note: string
}

const STATUS_OPTIONS: {
  value: AttendanceStatus
  label: string
  icon: ReactNode
  activeBg: string
  dot: string
}[] = [
  { value: 'present', label: '출석', icon: <CheckCircle2 size={13} />, activeBg: 'bg-green-50 border-green-300 text-green-700', dot: 'bg-green-500' },
  { value: 'late',    label: '지각', icon: <Clock size={13} />,         activeBg: 'bg-amber-50 border-amber-300 text-amber-700',   dot: 'bg-amber-500' },
  { value: 'absent',  label: '결석', icon: <XCircle size={13} />,       activeBg: 'bg-red-50 border-red-300 text-red-700',         dot: 'bg-red-500'   },
  { value: 'early',   label: '조퇴', icon: <LogOut size={13} />,        activeBg: 'bg-blue-50 border-blue-300 text-blue-700',      dot: 'bg-blue-500'  },
]

const DEFAULT_TIME = '09:00'
const CLASSES = ['전체', '3-1', '3-2', '2-1', '2-2']

type ApiStudent = {
  id: number
  studentNumber: string
  name: string
  className: string
}

type ApiAttendanceRow = {
  studentId: number
  status: Exclude<AttendanceStatus, 'unset'>
  verifiedAt: string | null
  memo: string | null
}

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

function classShort(name: string) {
  const match = name.match(/(\d+)학년\s*(\d+)반/)
  return match ? `${match[1]}-${match[2]}` : name
}

function displayNumber(studentNumber: string) {
  const parsed = Number(studentNumber.slice(-2))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number(studentNumber) || 1
}

function makeRecords(source: Omit<StudentRecord, 'status' | 'time' | 'note'>[]): StudentRecord[] {
  return source.map((s) => ({ ...s, status: 'unset', time: DEFAULT_TIME, note: '' }))
}

function mapStudent(row: ApiStudent): Omit<StudentRecord, 'status' | 'time' | 'note'> {
  const shortClass = classShort(row.className)
  const [grade = '3'] = shortClass.split('-')
  return {
    id: String(row.id),
    studentId: row.studentNumber,
    name: row.name,
    class: shortClass,
    grade: Number(grade),
    number: displayNumber(row.studentNumber),
  }
}

function timeFromIso(value: string | null) {
  if (!value) return DEFAULT_TIME
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return DEFAULT_TIME
  return parsed.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function mergeSavedAttendance(records: StudentRecord[], savedRows: ApiAttendanceRow[]) {
  const savedByStudentId = new Map(savedRows.map((row) => [String(row.studentId), row]))
  return records.map((record) => {
    const saved = savedByStudentId.get(record.id)
    if (!saved) return record
    return {
      ...record,
      status: saved.status,
      time: timeFromIso(saved.verifiedAt),
      note: saved.memo || '',
    }
  })
}

export function ManualAttendancePage() {
  const [records, setRecords] = useState<StudentRecord[]>([])
  const [date, setDate] = useState(todayString())
  const [classFilter, setClassFilter] = useState('전체')
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | 'unset' | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedNote, setExpandedNote] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let ignore = false
    async function loadStudentsAndAttendance() {
      try {
        const params = new URLSearchParams({ dateFrom: date, dateTo: date })
        const [rows, savedRows] = await Promise.all([
          apiFetch<ApiStudent[]>('/students'),
          apiFetch<ApiAttendanceRow[]>(`/attendance?${params.toString()}`),
        ])
        if (!ignore) {
          setRecords(mergeSavedAttendance(makeRecords(rows.map(mapStudent)), savedRows))
          setSelected(new Set())
          setErrorMsg('')
        }
      } catch (err) {
        if (!ignore) setErrorMsg(err instanceof Error ? err.message : '출석 데이터를 불러오지 못했습니다.')
      }
    }
    loadStudentsAndAttendance()
    return () => { ignore = true }
  }, [date])

  const now = new Date()
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const filtered = records.filter((r) => {
    const matchClass = classFilter === '전체' || r.class === classFilter
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    const q = search.toLowerCase()
    const matchSearch = !q || r.name.includes(q) || r.studentId.toLowerCase().includes(q)
    return matchClass && matchStatus && matchSearch
  })

  const counts = {
    present: records.filter((r) => r.status === 'present').length,
    late:    records.filter((r) => r.status === 'late').length,
    absent:  records.filter((r) => r.status === 'absent').length,
    early:   records.filter((r) => r.status === 'early').length,
    unset:   records.filter((r) => r.status === 'unset').length,
  }

  const update = (id: string, patch: Partial<StudentRecord>) =>
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const applyBulk = (ids: string[], status: AttendanceStatus) => {
    setRecords((prev) =>
      prev.map((r) => ids.includes(r.id) ? { ...r, status, time: currentTime } : r)
    )
    setSelected(new Set())
  }

  const applyAll = (status: AttendanceStatus) =>
    applyBulk(filtered.map((r) => r.id), status)

  const applySelected = (status: AttendanceStatus) =>
    applyBulk(Array.from(selected), status)

  const resetAll = () => {
    setRecords((prev) => prev.map((r) => ({ ...r, status: 'unset', time: DEFAULT_TIME, note: '' })))
    setSelected(new Set())
    setSavedMsg('')
  }

  const toggleSelect = (id: string) => {
    const n = new Set(selected)
    n.has(id) ? n.delete(id) : n.add(id)
    setSelected(n)
  }

  const toggleAll = () =>
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.id)))

  const handleSave = async () => {
    setSaving(true)
    try {
      const processed = records.filter((r) => r.status !== 'unset')
      const result = await apiFetch<{ savedCount: number }>('/attendance/manual', {
        method: 'POST',
        body: JSON.stringify({
          date,
          records: processed.map((r) => ({
            studentId: r.id,
            status: r.status,
            time: r.time,
            note: r.note,
          })),
        }),
      })
      setSavedMsg(`${date.replace(/-/g, '. ')} 출석 ${result.savedCount}건이 저장되었습니다.`)
      setErrorMsg('')
      setTimeout(() => setSavedMsg(''), 3500)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '출석 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const processedCount = records.filter((r) => r.status !== 'unset').length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-gray-900">수동 출석 처리</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              날짜와 반을 선택하고 학생별 출석 상태를 직접 입력하세요
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={resetAll}
              className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 rounded-xl px-3 py-2 text-sm hover:bg-gray-50 transition-colors shadow-sm"
            >
              <RotateCcw size={13} />
              초기화
            </button>
            <button
              onClick={handleSave}
              disabled={saving || processedCount === 0}
              className="flex items-center gap-1.5 bg-gray-900 text-white rounded-xl px-4 py-2 text-sm hover:bg-gray-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />저장 중...</>
              ) : (
                <><Save size={13} />저장하기</>
              )}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* Date + class row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
            <CalendarDays size={15} className="text-gray-400 shrink-0" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-sm text-gray-700 bg-transparent focus:outline-none"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
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
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-5 gap-2">
          {[
            { label: '전체', value: records.length, color: 'text-gray-700', bg: 'bg-white' },
            { label: '출석', value: counts.present, color: 'text-green-700', bg: 'bg-green-50' },
            { label: '지각', value: counts.late,    color: 'text-amber-700', bg: 'bg-amber-50' },
            { label: '결석', value: counts.absent,  color: 'text-red-700',   bg: 'bg-red-50'   },
            { label: '조퇴', value: counts.early,   color: 'text-blue-700',  bg: 'bg-blue-50'  },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-xl border border-gray-200 px-3 py-2.5 text-center shadow-sm`}>
              <p className={`text-lg font-medium ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Unset warning */}
        <AnimatePresence>
          {counts.unset > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3"
            >
              <AlertCircle size={15} className="text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800 flex-1">
                <span className="font-medium">{counts.unset}명</span>의 출석 상태가 아직 미처리 상태입니다.
              </p>
              <button
                onClick={() => applyAll('absent')}
                className="shrink-0 text-xs text-amber-700 border border-amber-300 rounded-lg px-2.5 py-1.5 hover:bg-amber-100 transition-colors"
              >
                전체 결석 처리
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              placeholder="이름, 학번 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:border-gray-400 shadow-sm"
            />
          </div>

          {/* Status filter */}
          <div className="flex gap-1.5 overflow-x-auto">
            {([
              { id: 'all', label: '전체' },
              { id: 'unset', label: '미처리' },
              { id: 'present', label: '출석' },
              { id: 'late', label: '지각' },
              { id: 'absent', label: '결석' },
              { id: 'early', label: '조퇴' },
            ] as { id: typeof statusFilter; label: string }[]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setStatusFilter(id)}
                className={`shrink-0 px-3 py-2 rounded-xl text-xs border transition-colors ${
                  statusFilter === id
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                {label}
                {id !== 'all' && (
                  <span className="ml-1 opacity-60">
                    {id === 'unset' ? counts.unset : counts[id as AttendanceStatus] ?? 0}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk apply row */}
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Filter size={12} />
              {selected.size > 0 ? (
                <span><span className="font-medium text-gray-800">{selected.size}명 선택</span> 일괄 적용:</span>
              ) : (
                <span>필터된 <span className="font-medium text-gray-800">{filtered.length}명</span> 전체 일괄 적용:</span>
              )}
            </div>
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => selected.size > 0 ? applySelected(opt.value) : applyAll(opt.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${opt.activeBg}`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Student table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible">
          {/* Table header */}
          <div className="hidden sm:flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <input
              type="checkbox"
              checked={selected.size === filtered.length && filtered.length > 0}
              onChange={toggleAll}
              className="w-4 h-4 rounded border-gray-300 cursor-pointer shrink-0"
            />
            <span className="w-36 shrink-0">학생</span>
            <span className="w-28 shrink-0">출석 상태</span>
            <span className="w-32 shrink-0">시간</span>
            <span className="flex-1">사유</span>
          </div>

          <div className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Users size={28} className="text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">해당하는 학생이 없습니다</p>
              </div>
            ) : (
              filtered.map((r) => (
                <StudentAttendanceRow
                  key={r.id}
                  record={r}
                  selected={selected.has(r.id)}
                  noteOpen={expandedNote === r.id}
                  onToggleSelect={() => toggleSelect(r.id)}
                  onStatusChange={(s) => update(r.id, { status: s, time: currentTime })}
                  onTimeChange={(t) => update(r.id, { time: t })}
                  onNoteChange={(n) => update(r.id, { note: n })}
                  onToggleNote={() => setExpandedNote(expandedNote === r.id ? null : r.id)}
                />
              ))
            )}
          </div>

          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
            <span>{filtered.length}명 표시 · 처리 완료 {processedCount}/{records.length}명</span>
            <div className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${processedCount === records.length ? 'bg-green-400' : 'bg-amber-400'}`} />
              {processedCount === records.length ? '모두 처리됨' : `${counts.unset}명 미처리`}
            </div>
          </div>
        </div>

        {/* Bottom save */}
        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm">
          <div className="flex items-start gap-2">
            <AlertCircle size={13} className="text-gray-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-400">
              수동 처리 기록은 자동 GPS+QR 인증 기록과 구분되어 저장됩니다.
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || processedCount === 0}
            className="flex items-center gap-2 bg-gray-900 text-white rounded-xl px-5 py-2.5 text-sm hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ml-4"
          >
            {saving ? (
              <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />저장 중...</>
            ) : (
              <><Save size={14} />출석 저장</>
            )}
          </button>
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {savedMsg && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 z-50 whitespace-nowrap"
          >
            <Check size={14} className="text-green-400" />
            {savedMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Student attendance row ───────────────────────────── */

function StudentAttendanceRow({
  record: r,
  selected,
  noteOpen,
  onToggleSelect,
  onStatusChange,
  onTimeChange,
  onNoteChange,
  onToggleNote,
}: {
  record: StudentRecord
  selected: boolean
  noteOpen: boolean
  onToggleSelect: () => void
  onStatusChange: (s: AttendanceStatus) => void
  onTimeChange: (t: string) => void
  onNoteChange: (n: string) => void
  onToggleNote: () => void
}) {
  const opt = STATUS_OPTIONS.find((o) => o.value === r.status)

  return (
    <div className={`transition-colors ${selected ? 'bg-gray-50' : r.status === 'unset' ? 'bg-amber-50/30' : 'hover:bg-gray-50/50'}`}>
      {/* Desktop */}
      <div className="hidden sm:flex items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="w-4 h-4 rounded border-gray-300 cursor-pointer shrink-0"
        />

        {/* Student info */}
        <div className="w-36 shrink-0 flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <User size={12} className="text-gray-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
            <p className="text-xs text-gray-400">{r.class} · {r.number}번</p>
          </div>
        </div>

        {/* Status dropdown */}
        <div className="w-28 shrink-0">
          <StatusDropdown value={r.status} onChange={onStatusChange} />
        </div>

        {/* Time */}
        <div className="w-32 shrink-0">
          <TimeInput value={r.time} disabled={r.status === 'unset'} onChange={onTimeChange} />
        </div>

        {/* Note */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {!noteOpen && r.note && (
            <span className="text-xs text-gray-400 truncate flex-1">{r.note}</span>
          )}
          {!noteOpen && !r.note && (
            <span className="text-xs text-gray-300 flex-1">—</span>
          )}
          <button
            onClick={onToggleNote}
            className="shrink-0 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-50 transition-colors"
          >
            {noteOpen ? <X size={10} /> : <Pencil size={10} />}
            {noteOpen ? '닫기' : '사유'}
            {r.note && !noteOpen && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-0.5" />}
          </button>
        </div>
      </div>

      {/* Mobile */}
      <div className="sm:hidden px-4 py-3 space-y-2.5">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="w-4 h-4 rounded border-gray-300 cursor-pointer shrink-0"
          />
          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <User size={12} className="text-gray-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">{r.name}</p>
            <p className="text-xs text-gray-400">{r.class} · {r.number}번</p>
          </div>
          <StatusDropdown value={r.status} onChange={onStatusChange} />
        </div>
        <div className="flex items-center gap-2 pl-11">
          <TimeInput value={r.time} disabled={r.status === 'unset'} onChange={onTimeChange} />
          <button
            onClick={onToggleNote}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2 py-1.5 hover:bg-gray-50 transition-colors"
          >
            <Pencil size={10} />
            {r.note ? '사유 수정' : '사유 입력'}
            {r.note && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
          </button>
        </div>
      </div>

      {/* Note textarea (shared) */}
      <AnimatePresence>
        {noteOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 sm:pl-[calc(1rem+1.25rem+0.75rem+7rem+7rem+2.25rem)]">
              <textarea
                value={r.note}
                onChange={(e) => onNoteChange(e.target.value)}
                placeholder="사유를 입력하세요 (예: 병원, 가족행사, 교통 지연 등)"
                rows={2}
                className="w-full sm:max-w-xs px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 resize-none"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Status dropdown ──────────────────────────────────── */

function StatusDropdown({
  value,
  onChange,
}: {
  value: AttendanceStatus
  onChange: (s: AttendanceStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const current = STATUS_OPTIONS.find((o) => o.value === value)

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-all ${
          current
            ? current.activeBg
            : 'bg-gray-100 border-gray-200 text-gray-400'
        }`}
      >
        {current ? current.icon : <AlertCircle size={13} />}
        <span>{current ? current.label : '미처리'}</span>
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 min-w-28 overflow-hidden"
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.1 }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { onChange(opt.value); setOpen(false) }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-50 ${
                    opt.value === value ? 'font-medium' : ''
                  }`}
                >
                  <span className={opt.value === value ? opt.activeBg.split(' ')[1] : 'text-gray-400'}>
                    {opt.icon}
                  </span>
                  <span className={opt.value === value ? 'text-gray-900' : 'text-gray-600'}>
                    {opt.label}
                  </span>
                  {opt.value === value && <Check size={12} className="ml-auto text-gray-400" />}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
