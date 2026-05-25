import { useState, type ReactNode } from 'react'
import {
  X,
  CheckCircle2,
  Clock,
  XCircle,
  LogOut,
  Loader2,
  User,
  AlertCircle,
  ChevronDown,
  Check,
  FileText,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'

type AttendanceStatus = 'present' | 'late' | 'absent' | 'early' | 'excused' | 'sick'

type UnprocessedStudent = {
  id: string
  name: string
  class: string
  number: string
  studentId: string
}

type AttendanceEntry = {
  studentId: string
  status: AttendanceStatus
  time: string
  note: string
}

const STATUS_OPTIONS: {
  value: AttendanceStatus
  label: string
  icon: ReactNode
  bg: string
  text: string
  border: string
  activeBg: string
}[] = [
  {
    value: 'present',
    label: '출석',
    icon: <CheckCircle2 size={13} />,
    bg: 'bg-white',
    text: 'text-gray-600',
    border: 'border-gray-200',
    activeBg: 'bg-green-50 border-green-300 text-green-700',
  },
  {
    value: 'late',
    label: '지각',
    icon: <Clock size={13} />,
    bg: 'bg-white',
    text: 'text-gray-600',
    border: 'border-gray-200',
    activeBg: 'bg-amber-50 border-amber-300 text-amber-700',
  },
  {
    value: 'absent',
    label: '결석',
    icon: <XCircle size={13} />,
    bg: 'bg-white',
    text: 'text-gray-600',
    border: 'border-gray-200',
    activeBg: 'bg-red-50 border-red-300 text-red-700',
  },
  {
    value: 'early',
    label: '조퇴',
    icon: <LogOut size={13} />,
    bg: 'bg-white',
    text: 'text-gray-600',
    border: 'border-gray-200',
    activeBg: 'bg-blue-50 border-blue-300 text-blue-700',
  },
  {
    value: 'excused',
    label: '공결',
    icon: <FileText size={13} />,
    bg: 'bg-white',
    text: 'text-gray-600',
    border: 'border-gray-200',
    activeBg: 'bg-indigo-50 border-indigo-300 text-indigo-700',
  },
  {
    value: 'sick',
    label: '병결',
    icon: <AlertCircle size={13} />,
    bg: 'bg-white',
    text: 'text-gray-600',
    border: 'border-gray-200',
    activeBg: 'bg-rose-50 border-rose-300 text-rose-700',
  },
]

interface Props {
  students?: UnprocessedStudent[]
  date?: string
  onClose: () => void
  onSave?: (entries: Record<string, AttendanceEntry>) => void
}

export function ManualAttendanceModal({
  students = [],
  date = new Date().toISOString().slice(0, 10),
  onClose,
  onSave,
}: Props) {
  const now = new Date()
  const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const [entries, setEntries] = useState<Record<string, AttendanceEntry>>(() =>
    Object.fromEntries(
      students.map((s) => [
        s.id,
        { studentId: s.studentId, status: 'absent', time: defaultTime, note: '' },
      ])
    )
  )
  const [loading, setLoading] = useState(false)
  const [expandedNote, setExpandedNote] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const setStatus = (id: string, status: AttendanceStatus) =>
    setEntries((prev) => ({ ...prev, [id]: { ...prev[id], status } }))

  const setTime = (id: string, time: string) =>
    setEntries((prev) => ({ ...prev, [id]: { ...prev[id], time } }))

  const setNote = (id: string, note: string) =>
    setEntries((prev) => ({ ...prev, [id]: { ...prev[id], note } }))

  const applyAll = (status: AttendanceStatus) =>
    setEntries((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([id, e]) => [id, { ...e, status }])
      )
    )

  const handleSave = async () => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 800))
    setDone(true)
    onSave?.(entries)
    setTimeout(onClose, 1400)
    setLoading(false)
  }

  const statusLabel: Record<AttendanceStatus, string> = {
    present: '출석', late: '지각', absent: '결석', early: '조퇴', excused: '공결', sick: '병결',
  }

  const counts = Object.values(entries).reduce(
    (acc, e) => ({ ...acc, [e.status]: (acc[e.status] ?? 0) + 1 }),
    {} as Record<string, number>
  )

  return (
    <>
      <motion.div
        className="fixed inset-0 bg-black/45 z-50"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      >
        <motion.div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]"
          initial={{ scale: 0.93, y: 18 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.93, y: 8 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <FileText size={16} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-gray-900">수동 출석 처리</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {date.replace(/-/g, '. ')} · 미처리 {students.length}명
                </p>
              </div>
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors">
              <X size={15} />
            </button>
          </div>

          {/* ── Bulk actions ── */}
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 mr-1">일괄 적용:</span>
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => applyAll(opt.value)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-all ${opt.activeBg}`}
                >
                  {opt.icon}
                  전체 {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Student list ── */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {students.map((student) => {
              const entry = entries[student.id]
              const currentOpt = STATUS_OPTIONS.find((o) => o.value === entry.status)!
              const noteOpen = expandedNote === student.id

              return (
                <div key={student.id} className="px-5 py-4 space-y-3">
                  {/* Student info + status selector */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <User size={15} className="text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{student.name}</p>
                      <p className="text-xs text-gray-400">
                        {student.class} · {student.number} · {student.studentId}
                      </p>
                    </div>
                    {/* Status dropdown */}
                    <StatusDropdown
                      value={entry.status}
                      onChange={(s) => setStatus(student.id, s)}
                    />
                  </div>

                  {/* Time + note row */}
                  <div className="flex items-center gap-2 pl-12">
                    <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                      <Clock size={12} className="text-gray-400" />
                      <input
                        type="time"
                        value={entry.time}
                        onChange={(e) => setTime(student.id, e.target.value)}
                        className="text-xs text-gray-700 bg-transparent focus:outline-none w-16"
                      />
                    </div>
                    <button
                      onClick={() => setExpandedNote(noteOpen ? null : student.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                      <FileText size={11} />
                      {entry.note ? '사유 수정' : '사유 입력'}
                      {entry.note && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                    </button>
                    {entry.note && !noteOpen && (
                      <span className="text-xs text-gray-400 truncate max-w-28">{entry.note}</span>
                    )}
                  </div>

                  {/* Note textarea */}
                  <AnimatePresence>
                    {noteOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="pl-12 overflow-hidden"
                      >
                        <textarea
                          value={entry.note}
                          onChange={(e) => setNote(student.id, e.target.value)}
                          placeholder="사유를 입력하세요 (예: 병원, 가족행사, 교통 지연 등)"
                          rows={2}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 resize-none"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>

          {/* ── Summary ── */}
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-xs text-gray-500">처리 요약:</span>
              {Object.entries(counts).map(([s, n]) => {
                const opt = STATUS_OPTIONS.find((o) => o.value === s)
                if (!opt || !n) return null
                return (
                  <span key={s} className={`text-xs ${opt.activeBg} border rounded-full px-2 py-0.5`}>
                    {opt.label} {n}명
                  </span>
                )
              })}
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-gray-100">
            <div className="flex items-start gap-1.5">
              <AlertCircle size={13} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-gray-400">
                수동 처리 기록은 자동 GPS+QR 인증과 구분되어 저장됩니다.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={loading || done}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-60"
              >
                {done ? (
                  <><Check size={14} className="text-green-400" />저장 완료</>
                ) : loading ? (
                  <><Loader2 size={14} className="animate-spin" />저장 중...</>
                ) : (
                  '출석 처리 저장'
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </>
  )
}

/* ── Status dropdown ──────────────────────────────── */

function StatusDropdown({
  value,
  onChange,
}: {
  value: AttendanceStatus
  onChange: (s: AttendanceStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const current = STATUS_OPTIONS.find((o) => o.value === value)!

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-all ${current.activeBg}`}
      >
        {current.icon}
        {current.label}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 min-w-28 overflow-hidden"
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.12 }}
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
