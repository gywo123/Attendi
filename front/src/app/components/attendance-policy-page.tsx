import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarCheck, Clock, Loader2, Save, ShieldCheck } from 'lucide-react'
import { apiFetch } from '../lib/api'
import { studentClassOptions } from '../lib/classes'

type Policy = {
  startTime: string
  lateAfterTime: string
  closeTime: string
  autoAbsentEnabled: boolean
}

type ClassRow = {
  id: number
  name: string
}

type ApiStudent = {
  classId: number
  className: string
}

type ClassPolicy = {
  classId: number
  className?: string
  startTime?: string
  lateAfterTime?: string
  closeTime?: string
}

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

export function AttendancePolicyPage() {
  const [policy, setPolicy] = useState<Policy>({
    startTime: '09:00',
    lateAfterTime: '09:10',
    closeTime: '17:00',
    autoAbsentEnabled: false,
  })
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [classPolicies, setClassPolicies] = useState<Record<number, ClassPolicy>>({})
  const [closeDate, setCloseDate] = useState(todayString())
  const [closeClassId, setCloseClassId] = useState('')
  const [autoCreateAbsent, setAutoCreateAbsent] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false
    async function load() {
      try {
        const [policyPayload, students] = await Promise.all([
          apiFetch<{ policy: Policy; classPolicies: ClassPolicy[] }>('/attendance/policy'),
          apiFetch<ApiStudent[]>('/students?includeInactive=true'),
        ])
        if (!ignore) {
          setPolicy(policyPayload.policy)
          setClasses(studentClassOptions(students).map((item) => ({ id: item.id, name: item.name })))
          setClassPolicies(Object.fromEntries(policyPayload.classPolicies.map((row) => [row.classId, row])))
          setError('')
        }
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : '출석 정책을 불러오지 못했습니다.')
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    load()
    return () => { ignore = true }
  }, [])

  const savePolicy = async () => {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const saved = await apiFetch<Policy>('/attendance/policy', {
        method: 'PUT',
        body: JSON.stringify(policy),
      })
      setPolicy(saved)
      setMessage('기본 출석 정책이 저장되었습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : '출석 정책 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const saveClassPolicy = async (classId: number) => {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const saved = await apiFetch<ClassPolicy>(`/classes/${classId}/attendance-policy`, {
        method: 'PUT',
        body: JSON.stringify(classPolicies[classId] || { classId }),
      })
      setClassPolicies((prev) => ({ ...prev, [classId]: saved }))
      setMessage('반별 출석 시간이 저장되었습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : '반별 출석 시간 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const closeAttendance = async () => {
    if (!window.confirm('선택한 날짜/반 출석을 마감할까요?')) return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const result = await apiFetch<{ createdAbsentCount: number }>('/attendance/close', {
        method: 'POST',
        body: JSON.stringify({
          date: closeDate,
          classId: closeClassId ? Number(closeClassId) : null,
          autoCreateAbsent,
        }),
      })
      setMessage(`출석을 마감했습니다. 자동 결석 ${result.createdAbsentCount}건`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '출석 마감에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const patchClassPolicy = (classId: number, key: keyof ClassPolicy, value: string) => {
    setClassPolicies((prev) => ({
      ...prev,
      [classId]: { classId, ...(prev[classId] || {}), [key]: value },
    }))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">
        <Loader2 size={16} className="animate-spin mr-2" />
        출석 정책 불러오는 중...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-gray-900">출석 정책</h1>
            <p className="text-sm text-gray-500 mt-0.5">지각 기준, 반별 출석 시간, 날짜별 마감을 관리합니다</p>
          </div>
          <button onClick={savePolicy} disabled={saving} className={primaryButton}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            저장
          </button>
        </div>

        {error && <Notice tone="red" text={error} />}
        {message && <Notice tone="green" text={message} />}

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <SectionHeader icon={<Clock size={17} />} title="기본 출석 시간" desc="반별 설정이 없을 때 적용되는 기본 시간입니다" />
          <div className="p-5 grid sm:grid-cols-4 gap-4">
            <TimeField label="수업 시작" value={policy.startTime} onChange={(v) => setPolicy((p) => ({ ...p, startTime: v }))} />
            <TimeField label="지각 기준" value={policy.lateAfterTime} onChange={(v) => setPolicy((p) => ({ ...p, lateAfterTime: v }))} />
            <TimeField label="출석 마감" value={policy.closeTime} onChange={(v) => setPolicy((p) => ({ ...p, closeTime: v }))} />
            <label className="flex items-center gap-2 pt-7 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={policy.autoAbsentEnabled}
                onChange={(e) => setPolicy((p) => ({ ...p, autoAbsentEnabled: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300"
              />
              마감 시 자동 결석
            </label>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <SectionHeader icon={<CalendarCheck size={17} />} title="반별 출석 시간" desc="특정 반만 다른 수업 시간과 지각 기준을 적용합니다" />
          <div className="divide-y divide-gray-100">
            {classes.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">등록된 반이 없습니다</div>
            ) : classes.map((cls) => {
              const row = classPolicies[cls.id] || { classId: cls.id }
              return (
                <div key={cls.id} className="p-4 grid lg:grid-cols-[120px_1fr_1fr_1fr_auto] gap-3 items-end">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{cls.name}</p>
                    <p className="text-xs text-gray-400">비우면 기본값 사용</p>
                  </div>
                  <TimeField label="시작" value={row.startTime || ''} placeholder={policy.startTime} onChange={(v) => patchClassPolicy(cls.id, 'startTime', v)} />
                  <TimeField label="지각" value={row.lateAfterTime || ''} placeholder={policy.lateAfterTime} onChange={(v) => patchClassPolicy(cls.id, 'lateAfterTime', v)} />
                  <TimeField label="마감" value={row.closeTime || ''} placeholder={policy.closeTime} onChange={(v) => patchClassPolicy(cls.id, 'closeTime', v)} />
                  <button onClick={() => saveClassPolicy(cls.id)} disabled={saving} className={secondaryButton}>저장</button>
                </div>
              )
            })}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <SectionHeader icon={<ShieldCheck size={17} />} title="출석 마감" desc="마감된 날짜/반은 QR 발급과 수동 출석 수정이 제한됩니다" />
          <div className="p-5 grid md:grid-cols-[180px_1fr_auto_auto] gap-3 items-end">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700">날짜</span>
              <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} className={inputClass} />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700">반</span>
              <select value={closeClassId} onChange={(e) => setCloseClassId(e.target.value)} className={inputClass}>
                <option value="">전체 반</option>
                {classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 py-2.5 text-sm text-gray-700">
              <input type="checkbox" checked={autoCreateAbsent} onChange={(e) => setAutoCreateAbsent(e.target.checked)} className="w-4 h-4 rounded border-gray-300" />
              미처리 자동 결석
            </label>
            <button onClick={closeAttendance} disabled={saving} className={primaryButton}>마감하기</button>
          </div>
        </section>
      </div>
    </div>
  )
}

function SectionHeader({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600">{icon}</div>
      <div>
        <h3 className="text-gray-900">{title}</h3>
        <p className="text-sm text-gray-400 mt-0.5">{desc}</p>
      </div>
    </div>
  )
}

function TimeField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1.5">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input type="time" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </label>
  )
}

function Notice({ tone, text }: { tone: 'red' | 'green'; text: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${
      tone === 'red' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'
    }`}>
      {text}
    </div>
  )
}

const inputClass =
  'w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100'

const primaryButton =
  'inline-flex items-center justify-center gap-1.5 bg-gray-900 text-white rounded-xl px-4 py-2.5 text-sm hover:bg-gray-700 transition-colors disabled:opacity-60'

const secondaryButton =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60'
