import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  LogOut,
  QrCode,
  TrendingUp,
  ChevronRight,
  Shield,
  AlertCircle,
} from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { ManualAttendanceModal } from './manual-attendance-modal'
import { apiFetch } from '../lib/api'

const REFRESH_INTERVAL_MS = 5000

const EMPTY_STATS = {
  total: 0,
  present: 0,
  late: 0,
  absent: 0,
  early: 0,
}

type DashboardStats = typeof EMPTY_STATS

type RecentItem = {
  name: string
  class: string
  number: string
  time: string
  status: 'present' | 'late' | 'absent' | 'early'
  gps: boolean
}

const STATUS_LABEL: Record<string, string> = {
  present: '출석',
  late: '지각',
  absent: '결석',
  early: '조퇴',
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; bar: string; dot: string }> = {
  present: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', bar: 'bg-green-500', dot: 'bg-green-500' },
  late: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', bar: 'bg-amber-400', dot: 'bg-amber-500' },
  absent: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', bar: 'bg-red-500', dot: 'bg-red-500' },
  early: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', bar: 'bg-blue-500', dot: 'bg-blue-500' },
}

type ApiClass = { id: number; name: string }

type ApiSummary = {
  date: string
  classId: number | null
  summary: { total: number; present: number; late: number; absent: number; earlyLeave: number }
  recentScans: {
    studentName: string
    studentNumber?: string
    className: string
    status: RecentItem['status']
    verifiedAt?: string
  }[]
}

type WeeklyDay = {
  date: string
  dayLabel: string
  total: number
  present: number
  late: number
  earlyLeave: number
  absent: number
  attended: number
  rate: number
}

type ApiWeeklySummary = {
  date: string
  classId: number | null
  days: WeeklyDay[]
}

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

function formatKoreanDate(date: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date(`${date}T00:00:00`))
}

function classShort(name: string) {
  const match = name.match(/(\d+)학년\s*(\d+)반/)
  return match ? `${match[1]}-${match[2]}` : name
}

function timeOnly(value?: string) {
  if (!value) return '--:--'
  return new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function TeacherDashboardPage({ onGoToScan }: { onGoToScan?: () => void }) {
  const [manualOpen, setManualOpen] = useState(false)
  const [date] = useState(todayString())
  const [classes, setClasses] = useState<ApiClass[]>([])
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS)
  const [recent, setRecent] = useState<RecentItem[]>([])
  const [weekly, setWeekly] = useState<WeeklyDay[]>([])
  const [lastUpdated, setLastUpdated] = useState('')
  const [error, setError] = useState('')
  const attendedToday = stats.present + stats.late + stats.early
  const attendanceRate = stats.total ? Math.round((attendedToday / stats.total) * 100) : 0

  useEffect(() => {
    let ignore = false
    async function loadDashboard() {
      try {
        const params = new URLSearchParams({ date })
        if (selectedClassId) params.set('classId', String(selectedClassId))
        const [classList, summary, weeklySummary] = await Promise.all([
          apiFetch<ApiClass[]>('/classes'),
          apiFetch<ApiSummary>(`/attendance/summary?${params.toString()}`),
          apiFetch<ApiWeeklySummary>(`/attendance/weekly-summary?${params.toString()}`),
        ])
        if (ignore) return
        setClasses(classList)
        setStats({
          total: summary.summary.total,
          present: summary.summary.present,
          late: summary.summary.late,
          absent: summary.summary.absent,
          early: summary.summary.earlyLeave,
        })
        setRecent(summary.recentScans.map((scan) => ({
          name: scan.studentName,
          class: classShort(scan.className),
            number: scan.studentNumber ? `${scan.studentNumber}번` : '',
            time: timeOnly(scan.verifiedAt),
            status: scan.status,
            gps: true,
          })))
        setWeekly(weeklySummary.days)
        setLastUpdated(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }))
        setError('')
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : '대시보드 데이터를 불러오지 못했습니다.')
      }
    }
    loadDashboard()
    const timer = window.setInterval(loadDashboard, REFRESH_INTERVAL_MS)
    return () => {
      ignore = true
      window.clearInterval(timer)
    }
  }, [date, selectedClassId])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-gray-900">대시보드</h1>
            <p className="text-sm text-gray-500 mt-0.5">{formatKoreanDate(date)}</p>
          </div>
          <button
            onClick={onGoToScan}
            className="flex items-center gap-2 bg-gray-900 text-white rounded-xl px-4 py-2.5 text-sm hover:bg-gray-700 transition-colors"
          >
            <QrCode size={15} />
            수동 출석 처리
          </button>
        </div>

        {/* Class selector */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setSelectedClassId(null)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              selectedClassId === null
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            전체
          </button>
          {classes.map((cls) => (
            <button
              key={cls.id}
              onClick={() => setSelectedClassId(cls.id)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                selectedClassId === cls.id
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {cls.name}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard
            label="전체 학생"
            value={stats.total}
            unit="명"
            icon={<Users size={16} />}
            iconBg="bg-gray-100"
            iconColor="text-gray-600"
          />
          <StatCard
            label="출석"
            value={stats.present}
            unit="명"
            icon={<CheckCircle2 size={16} />}
            iconBg="bg-green-100"
            iconColor="text-green-600"
            highlight="green"
          />
          <StatCard
            label="지각"
            value={stats.late}
            unit="명"
            icon={<Clock size={16} />}
            iconBg="bg-amber-100"
            iconColor="text-amber-600"
            highlight="amber"
          />
          <StatCard
            label="결석"
            value={stats.absent}
            unit="명"
            icon={<XCircle size={16} />}
            iconBg="bg-red-100"
            iconColor="text-red-600"
            highlight="red"
          />
          <StatCard
            label="조퇴"
            value={stats.early}
            unit="명"
            icon={<LogOut size={16} />}
            iconBg="bg-blue-100"
            iconColor="text-blue-600"
            highlight="blue"
            className="col-span-2 md:col-span-1"
          />
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {/* Attendance rate + weekly chart */}
          <div className="md:col-span-2 space-y-4">
            {/* Rate card */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-900">오늘 출석 현황</h3>
                <span className="text-xs text-gray-400">
                  {stats.present}/{stats.total}명
                </span>
              </div>

              {/* Progress bar */}
              <div className="space-y-2 mb-5">
                <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                  <div
                    className="bg-green-500 transition-all"
                    style={{ width: `${stats.total ? (stats.present / stats.total) * 100 : 0}%` }}
                  />
                  <div
                    className="bg-amber-400 transition-all"
                    style={{ width: `${stats.total ? (stats.late / stats.total) * 100 : 0}%` }}
                  />
                  <div
                    className="bg-blue-500 transition-all"
                    style={{ width: `${stats.total ? (stats.early / stats.total) * 100 : 0}%` }}
                  />
                  <div
                    className="bg-red-500 transition-all"
                    style={{ width: `${stats.total ? (stats.absent / stats.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex gap-4 flex-wrap">
                  {(['present', 'late', 'absent', 'early'] as const).map((s) => (
                    <div key={s} className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-sm ${STATUS_COLORS[s].bar}`} />
                      <span className="text-xs text-gray-500">
                        {STATUS_LABEL[s]} {stats[s]}명
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rate number */}
              <div className="flex items-end gap-2">
                <span className="text-4xl font-medium text-gray-900">{attendanceRate}%</span>
                <div className="mb-1 flex items-center gap-1 text-gray-500">
                  <TrendingUp size={14} />
                  <span className="text-sm">{lastUpdated ? `${lastUpdated} 갱신` : '실시간 갱신 대기'}</span>
                </div>
              </div>
            </div>

            {/* Weekly chart */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-900">주간 출석률</h3>
                <span className="text-xs text-gray-400">DB 기준 · 5초 갱신</span>
              </div>
              <div className="flex items-end gap-2 h-28">
                {weekly.map((d) => {
                  const isToday = d.dayLabel === '오늘'
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-gray-500">{d.rate}%</span>
                      <div className="w-full bg-gray-100 rounded-t-sm relative" style={{ height: 72 }}>
                        <div
                          className={`absolute bottom-0 left-0 right-0 rounded-t-sm transition-all ${
                            isToday ? 'bg-gray-900' : 'bg-gray-300'
                          }`}
                          style={{ height: `${d.rate}%` }}
                        />
                      </div>
                      <span className={`text-xs ${isToday ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
                        {d.dayLabel}
                      </span>
                    </div>
                  )
                })}
                {weekly.length === 0 && (
                  <div className="flex-1 h-full flex items-center justify-center text-sm text-gray-400">
                    주간 데이터가 없습니다
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recent activity */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
            <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-gray-900">최근 인증</h3>
              <button className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
                전체 보기
                <ChevronRight size={12} />
              </button>
            </div>
            <div className="flex-1 divide-y divide-gray-50">
              {(recent.length ? recent : []).map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[r.status].dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-gray-900 font-medium">{r.name}</span>
                      {r.gps && <Shield size={11} className="text-green-500" />}
                    </div>
                    <p className="text-xs text-gray-400">
                      {r.class} · {r.number}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-600">{r.time}</p>
                    <span
                      className={`text-xs border rounded-full px-1.5 py-0.5 ${STATUS_COLORS[r.status].bg} ${STATUS_COLORS[r.status].text} ${STATUS_COLORS[r.status].border}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </div>
                </div>
              ))}
              {recent.length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-gray-400">
                  아직 인증 기록이 없습니다
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Alert: unprocessed students */}
        {stats.absent > 0 && <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">미처리 학생 {stats.absent}명</p>
            <p className="text-sm text-amber-700 mt-0.5">
              아직 출석 처리가 되지 않은 학생이 있습니다.
            </p>
          </div>
          <button
            onClick={() => onGoToScan?.() ?? setManualOpen(true)}
            className="shrink-0 text-xs text-amber-700 border border-amber-300 rounded-lg px-2.5 py-1.5 hover:bg-amber-100 transition-colors"
          >
            처리하기
          </button>
        </div>}
      </div>

      {/* Manual attendance modal */}
      <AnimatePresence>
        {manualOpen && (
          <ManualAttendanceModal
            onClose={() => setManualOpen(false)}
            onSave={() => setManualOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function StatCard({
  label,
  value,
  unit,
  icon,
  iconBg,
  iconColor,
  highlight,
  className = '',
}: {
  label: string
  value: number
  unit: string
  icon: ReactNode
  iconBg: string
  iconColor: string
  highlight?: 'green' | 'amber' | 'red' | 'blue'
  className?: string
}) {
  const highlightBorder = {
    green: 'border-green-200',
    amber: 'border-amber-200',
    red: 'border-red-200',
    blue: 'border-blue-200',
  }
  return (
    <div
      className={`bg-white rounded-xl border p-4 shadow-sm ${
        highlight ? highlightBorder[highlight] : 'border-gray-200'
      } ${className}`}
    >
      <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center mb-3`}>
        <span className={iconColor}>{icon}</span>
      </div>
      <div className="flex items-end gap-0.5">
        <span className="text-2xl font-medium text-gray-900">{value}</span>
        <span className="text-sm text-gray-400 mb-0.5">{unit}</span>
      </div>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
