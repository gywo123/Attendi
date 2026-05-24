import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  User,
  CheckCircle2,
  XCircle,
  X,
  Loader2,
  AlertCircle,
  ChevronDown,
  Check,
  Shield,
  Clock,
  Mail,
  BookOpen,
  School,
  MoreHorizontal,
  Download,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { API_BASE_URL, apiFetch } from '../lib/api'

type TeacherStatus = 'active' | 'pending' | 'inactive'
type TeacherRole = 'teacher' | 'admin'

type Teacher = {
  id: string
  name: string
  email: string
  school: string
  subject: string
  role: TeacherRole
  status: TeacherStatus
  joinedAt: string
}

const STATUS_LABEL: Record<TeacherStatus, string> = {
  active: '활성', pending: '승인 대기', inactive: '비활성',
}

const STATUS_STYLE: Record<TeacherStatus, string> = {
  active:   'bg-green-50 text-green-700 border-green-200',
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  inactive: 'bg-gray-100 text-gray-500 border-gray-200',
}

const ROLE_LABEL: Record<TeacherRole, string> = { teacher: '교사', admin: '관리자' }

type FormData = {
  name: string; email: string; school: string; subject: string
  role: TeacherRole; status: TeacherStatus
}

type ApiTeacher = {
  id: number
  name: string
  email: string
  role: TeacherRole
  school: string
  subject: string
  status: TeacherStatus
  joinedAt: string
}

function mapTeacher(row: ApiTeacher): Teacher {
  return {
    id: String(row.id),
    name: row.name,
    email: row.email,
    school: row.school || '학교',
    subject: row.subject || '—',
    role: row.role,
    status: row.status,
    joinedAt: row.joinedAt?.slice(0, 10) || '',
  }
}

/* ═══════════════════════════════════════════════════ */
/*  Main page                                          */
/* ═══════════════════════════════════════════════════ */

export function TeacherManagementPage() {
  const [teachers, setTeachers]     = useState<Teacher[]>([])
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter] = useState<TeacherStatus | 'all'>('all')
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [addOpen, setAddOpen]       = useState(false)
  const [editTarget, setEditTarget] = useState<Teacher | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Teacher | null>(null)
  const [toastMsg, setToastMsg]     = useState('')
  const [errorMsg, setErrorMsg]     = useState('')

  useEffect(() => {
    let ignore = false
    async function loadTeachers() {
      try {
        const rows = await apiFetch<ApiTeacher[]>('/teachers')
        if (!ignore) {
          setTeachers(rows.map(mapTeacher))
          setErrorMsg('')
        }
      } catch (err) {
        if (!ignore) setErrorMsg(err instanceof Error ? err.message : '교사 목록을 불러오지 못했습니다.')
      }
    }
    loadTeachers()
    return () => { ignore = true }
  }, [])

  const filtered = teachers.filter((t) => {
    const q = search.toLowerCase()
    const matchSearch = !q || t.name.includes(q) || t.email.includes(q) || t.school.includes(q)
    const matchStatus = statusFilter === 'all' || t.status === statusFilter
    return matchSearch && matchStatus
  })

  const counts = {
    all:      teachers.length,
    active:   teachers.filter((t) => t.status === 'active').length,
    pending:  teachers.filter((t) => t.status === 'pending').length,
    inactive: teachers.filter((t) => t.status === 'inactive').length,
  }

  const toast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000) }

  const toggleSelect = (id: string) => {
    const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n)
  }
  const toggleAll = () =>
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((t) => t.id)))

  const handleAdd = async (data: FormData) => {
    try {
      const saved = await apiFetch<ApiTeacher>('/teachers', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      setTeachers((prev) => [mapTeacher(saved), ...prev])
      setAddOpen(false)
      setErrorMsg('')
      toast(`${data.name} 선생님이 추가되었습니다.`)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '교사 추가에 실패했습니다.')
    }
  }

  const handleEdit = async (data: FormData) => {
    if (!editTarget) return
    try {
      const saved = await apiFetch<ApiTeacher>(`/teachers/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      })
      setTeachers((prev) => prev.map((t) => t.id === editTarget.id ? mapTeacher(saved) : t))
      setEditTarget(null)
      setErrorMsg('')
      toast(`${data.name} 선생님 정보가 수정되었습니다.`)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '교사 수정에 실패했습니다.')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await apiFetch(`/teachers/${deleteTarget.id}`, { method: 'DELETE' })
      setTeachers((prev) => prev.filter((t) => t.id !== deleteTarget.id))
      setSelected((prev) => { const n = new Set(prev); n.delete(deleteTarget.id); return n })
      setDeleteTarget(null)
      setErrorMsg('')
      toast('교사가 삭제되었습니다.')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '교사 삭제에 실패했습니다.')
    }
  }

  const handleApprove = async (id: string) => {
    try {
      const saved = await apiFetch<ApiTeacher>(`/teachers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
      })
      setTeachers((prev) => prev.map((t) => t.id === id ? mapTeacher(saved) : t))
      setErrorMsg('')
      toast('승인이 완료되었습니다.')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '승인 처리에 실패했습니다.')
    }
  }

  const handleReject = async (id: string) => {
    try {
      const saved = await apiFetch<ApiTeacher>(`/teachers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      })
      setTeachers((prev) => prev.map((t) => t.id === id ? mapTeacher(saved) : t))
      setErrorMsg('')
      toast('거절되었습니다.')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '거절 처리에 실패했습니다.')
    }
  }

  const handleBulkDelete = async () => {
    try {
      await Promise.all(Array.from(selected).map((id) => apiFetch(`/teachers/${id}`, { method: 'DELETE' })))
      const count = selected.size
      setTeachers((prev) => prev.filter((t) => !selected.has(t.id)))
      setSelected(new Set())
      setErrorMsg('')
      toast(`${count}명이 삭제되었습니다.`)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '일괄 삭제에 실패했습니다.')
    }
  }

  const downloadCsv = () => {
    window.location.href = `${API_BASE_URL}/teachers/export.csv`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-gray-900">교사 관리</h1>
            <p className="text-sm text-gray-500 mt-0.5">전체 {teachers.length}명</p>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 bg-gray-900 text-white rounded-xl px-3 py-2 text-sm hover:bg-gray-700 transition-colors shadow-sm shrink-0"
          >
            <Plus size={14} />
            교사 추가
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          {([
            { id: 'all',      label: '전체',      value: counts.all,      color: 'text-gray-700',  bg: 'bg-white'      },
            { id: 'active',   label: '활성',      value: counts.active,   color: 'text-green-700', bg: 'bg-green-50'   },
            { id: 'pending',  label: '승인 대기', value: counts.pending,  color: 'text-amber-700', bg: 'bg-amber-50'   },
            { id: 'inactive', label: '비활성',    value: counts.inactive, color: 'text-gray-500',  bg: 'bg-gray-100'   },
          ] as const).map(({ id, label, value, color, bg }) => (
            <button
              key={id}
              onClick={() => setStatusFilter(id)}
              className={`${bg} rounded-xl border p-3 text-center shadow-sm transition-all ${
                statusFilter === id ? 'border-gray-400 ring-2 ring-gray-200' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className={`text-xl font-medium ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </button>
          ))}
        </div>

        {/* Pending approval banner */}
        <AnimatePresence>
          {counts.pending > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3"
            >
              <Clock size={15} className="text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800 flex-1">
                <span className="font-medium">{counts.pending}명</span>의 교사가 승인 대기 중입니다.
              </p>
              <button
                onClick={() => setStatusFilter('pending')}
                className="shrink-0 text-xs text-amber-700 border border-amber-300 rounded-lg px-2.5 py-1.5 hover:bg-amber-100 transition-colors"
              >
                확인하기
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search + filter */}
        <div className="flex gap-2 flex-col sm:flex-row">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              placeholder="이름, 이메일, 학교 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:border-gray-400 shadow-sm"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* Bulk actions */}
        <AnimatePresence>
          {selected.size > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-3 bg-gray-900 text-white rounded-xl px-4 py-3"
            >
              <span className="text-sm">{selected.size}명 선택됨</span>
              <div className="flex-1" />
              <button className="flex items-center gap-1.5 text-sm hover:text-gray-300 transition-colors">
                <Download size={14} />내보내기
              </button>
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                <Trash2 size={14} />삭제
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div
            className="hidden sm:grid items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide"
            style={{ gridTemplateColumns: 'auto 1fr auto auto auto auto' }}
          >
            <input
              type="checkbox"
              checked={selected.size === filtered.length && filtered.length > 0}
              onChange={toggleAll}
              className="w-4 h-4 rounded border-gray-300 cursor-pointer"
            />
            <span>교사</span>
            <span>학교</span>
            <span>역할</span>
            <span>상태</span>
            <span>관리</span>
          </div>

          <div className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <div className="py-16 text-center">
                <User size={28} className="text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">검색 결과가 없습니다</p>
              </div>
            ) : (
              filtered.map((t) => (
                <TeacherRow
                  key={t.id}
                  teacher={t}
                  selected={selected.has(t.id)}
                  onToggle={() => toggleSelect(t.id)}
                  onEdit={() => setEditTarget(t)}
                  onDelete={() => setDeleteTarget(t)}
                  onApprove={() => handleApprove(t.id)}
                  onReject={() => handleReject(t.id)}
                />
              ))
            )}
          </div>

          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
            <span>{filtered.length}명 표시 (전체 {teachers.length}명)</span>
            <button onClick={downloadCsv} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 transition-colors">
              <Download size={12} />CSV 다운로드
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 z-50 whitespace-nowrap"
          >
            <Check size={14} className="text-green-400" />
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add modal */}
      <AnimatePresence>
        {addOpen && (
          <TeacherFormModal mode="add" onSave={handleAdd} onClose={() => setAddOpen(false)} />
        )}
      </AnimatePresence>

      {/* Edit modal */}
      <AnimatePresence>
        {editTarget && (
          <TeacherFormModal
            mode="edit"
            teacher={editTarget}
            onSave={handleEdit}
            onClose={() => setEditTarget(null)}
          />
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteTarget && (
          <DeleteConfirmModal
            teacher={deleteTarget}
            onConfirm={handleDelete}
            onClose={() => setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ═══════════════════════════════════════════════════ */
/*  Teacher row                                        */
/* ═══════════════════════════════════════════════════ */

function TeacherRow({
  teacher: t,
  selected,
  onToggle,
  onEdit,
  onDelete,
  onApprove,
  onReject,
}: {
  teacher: Teacher
  selected: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <div className={`transition-colors ${selected ? 'bg-gray-50' : t.status === 'pending' ? 'bg-amber-50/30' : 'hover:bg-gray-50/60'}`}>
      {/* Desktop */}
      <div
        className="hidden sm:grid items-center gap-3 px-4 py-3.5"
        style={{ gridTemplateColumns: 'auto 1fr auto auto auto auto' }}
      >
        <input type="checkbox" checked={selected} onChange={onToggle} className="w-4 h-4 rounded border-gray-300 cursor-pointer" />

        {/* Info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            t.role === 'admin' ? 'bg-purple-100' : 'bg-gray-100'
          }`}>
            {t.role === 'admin'
              ? <Shield size={14} className="text-purple-600" />
              : <User size={14} className="text-gray-500" />
            }
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
            <p className="text-xs text-gray-400 truncate">{t.email}</p>
          </div>
        </div>

        {/* School + subject */}
        <div className="text-right min-w-0">
          <p className="text-xs text-gray-600 truncate max-w-32">{t.school}</p>
          <p className="text-xs text-gray-400">{t.subject}</p>
        </div>

        {/* Role */}
        <span className={`text-xs px-2 py-1 rounded-full border ${
          t.role === 'admin'
            ? 'bg-purple-50 text-purple-700 border-purple-200'
            : 'bg-gray-50 text-gray-600 border-gray-200'
        }`}>
          {ROLE_LABEL[t.role]}
        </span>

        {/* Status */}
        {t.status === 'pending' ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onApprove}
              className="flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-lg px-2 py-1 hover:bg-green-100 transition-colors"
            >
              <Check size={11} />승인
            </button>
            <button
              onClick={onReject}
              className="flex items-center gap-1 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg px-2 py-1 hover:bg-red-100 transition-colors"
            >
              <X size={11} />거절
            </button>
          </div>
        ) : (
          <span className={`text-xs px-2 py-1 rounded-full border ${STATUS_STYLE[t.status]}`}>
            {STATUS_LABEL[t.status]}
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-0.5">
          <ActionBtn onClick={onEdit} title="수정" icon={<Pencil size={13} />} />
          <ActionBtn onClick={onDelete} title="삭제" icon={<Trash2 size={13} />} danger />
        </div>
      </div>

      {/* Mobile */}
      <div className="sm:hidden px-4 py-3 flex items-center gap-3">
        <input type="checkbox" checked={selected} onChange={onToggle} className="w-4 h-4 rounded border-gray-300 cursor-pointer shrink-0" />
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
          t.role === 'admin' ? 'bg-purple-100' : 'bg-gray-100'
        }`}>
          {t.role === 'admin' ? <Shield size={15} className="text-purple-600" /> : <User size={15} className="text-gray-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-900">{t.name}</p>
            <span className={`text-xs px-1.5 py-0.5 rounded-full border ${STATUS_STYLE[t.status]}`}>
              {STATUS_LABEL[t.status]}
            </span>
          </div>
          <p className="text-xs text-gray-400 truncate">{t.email} · {t.subject}</p>
        </div>
        {t.status === 'pending' ? (
          <div className="flex gap-1 shrink-0">
            <button onClick={onApprove} className="w-7 h-7 rounded-lg bg-green-50 text-green-700 flex items-center justify-center border border-green-200">
              <Check size={13} />
            </button>
            <button onClick={onReject} className="w-7 h-7 rounded-lg bg-red-50 text-red-600 flex items-center justify-center border border-red-200">
              <X size={13} />
            </button>
          </div>
        ) : (
          <div className="flex gap-0.5 shrink-0">
            <ActionBtn onClick={onEdit} title="수정" icon={<Pencil size={13} />} />
            <ActionBtn onClick={onDelete} title="삭제" icon={<Trash2 size={13} />} danger />
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════ */
/*  Teacher Form Modal                                 */
/* ═══════════════════════════════════════════════════ */

function TeacherFormModal({
  mode,
  teacher,
  onSave,
  onClose,
}: {
  mode: 'add' | 'edit'
  teacher?: Teacher
  onSave: (data: FormData) => void | Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<FormData>({
    name:    teacher?.name    ?? '',
    email:   teacher?.email   ?? '',
    school:  teacher?.school  ?? '',
    subject: teacher?.subject ?? '',
    role:    teacher?.role    ?? 'teacher',
    status:  teacher?.status  ?? 'active',
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors]   = useState<Partial<Record<keyof FormData, string>>>({})

  const set = (k: keyof FormData) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormData, string>> = {}
    if (!form.name.trim())  e.name  = '이름을 입력해 주세요'
    if (!form.email.trim()) e.email = '이메일을 입력해 주세요'
    if (!form.school.trim()) e.school = '학교명을 입력해 주세요'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    await delay(600)
    await onSave(form)
    setLoading(false)
  }

  return (
    <Overlay onClose={onClose}>
      <ModalCard>
        <ModalHeader
          title={mode === 'add' ? '교사 추가' : '교사 정보 수정'}
          subtitle={mode === 'add' ? '새 교사를 등록합니다' : `${teacher?.name} 선생님 정보를 수정합니다`}
          onClose={onClose}
        />

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* 이름 */}
          <FormField label="이름 *" error={errors.name}>
            <input value={form.name} onChange={(e) => set('name')(e.target.value)}
              placeholder="홍길동" className={inputCls(!!errors.name)} />
          </FormField>

          {/* 이메일 */}
          <FormField label="이메일 *" error={errors.email}>
            <input type="email" value={form.email} onChange={(e) => set('email')(e.target.value)}
              placeholder="teacher@school.kr" className={inputCls(!!errors.email)} />
          </FormField>

          {/* 학교 */}
          <FormField label="학교명 *" error={errors.school}>
            <input value={form.school} onChange={(e) => set('school')(e.target.value)}
              placeholder="학교명" className={inputCls(!!errors.school)} />
          </FormField>

          {/* 담당 과목 */}
          <FormField label="담당 과목 (선택)">
            <input value={form.subject} onChange={(e) => set('subject')(e.target.value)}
              placeholder="수학" className={inputCls()} />
          </FormField>

          {/* 역할 */}
          <FormField label="역할 *">
            <div className="flex gap-2">
              {(['teacher', 'admin'] as TeacherRole[]).map((r) => (
                <button key={r} type="button" onClick={() => setForm((f) => ({ ...f, role: r }))}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all ${
                    form.role === r
                      ? r === 'admin' ? 'bg-purple-900 text-white border-purple-900' : 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {r === 'admin' ? <Shield size={14} /> : <User size={14} />}
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </FormField>

          {/* 상태 */}
          <FormField label="계정 상태">
            <div className="flex gap-2 flex-wrap">
              {(['active', 'pending', 'inactive'] as TeacherStatus[]).map((s) => (
                <button key={s} type="button" onClick={() => setForm((f) => ({ ...f, status: s }))}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm transition-all ${
                    form.status === s ? STATUS_STYLE[s] : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {s === 'active' && <CheckCircle2 size={13} />}
                  {s === 'pending' && <Clock size={13} />}
                  {s === 'inactive' && <XCircle size={13} />}
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </FormField>
        </form>

        <ModalFooter>
          <button onClick={onClose} className={secondaryBtn}>취소</button>
          <button onClick={handleSubmit} disabled={loading} className={primaryBtn}>
            {loading && <Loader2 size={14} className="animate-spin" />}
            {mode === 'add' ? '추가하기' : '저장하기'}
          </button>
        </ModalFooter>
      </ModalCard>
    </Overlay>
  )
}

/* ═══════════════════════════════════════════════════ */
/*  Delete confirm                                     */
/* ═══════════════════════════════════════════════════ */

function DeleteConfirmModal({
  teacher,
  onConfirm,
  onClose,
}: {
  teacher: Teacher
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Overlay onClose={onClose}>
      <ModalCard maxW="max-w-sm">
        <div className="p-6 space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <Trash2 size={20} className="text-red-500" />
          </div>
          <div>
            <h3 className="text-gray-900">교사 삭제</h3>
            <p className="text-sm text-gray-500 mt-1.5">
              <span className="font-medium text-gray-700">{teacher.name}</span> 선생님을 삭제하시겠습니까?
              이 작업은 되돌릴 수 없습니다.
            </p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-600">삭제된 교사 계정은 더 이상 시스템에 로그인할 수 없습니다.</p>
          </div>
        </div>
        <ModalFooter>
          <button onClick={onClose} className={secondaryBtn}>취소</button>
          <button onClick={onConfirm} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors">
            <Trash2 size={14} />삭제하기
          </button>
        </ModalFooter>
      </ModalCard>
    </Overlay>
  )
}

/* ═══════════════════════════════════════════════════ */
/*  Shared primitives                                  */
/* ═══════════════════════════════════════════════════ */

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <>
      <motion.div className="fixed inset-0 bg-black/40 z-50"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} />
      <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="pointer-events-auto w-full flex justify-center">{children}</div>
      </motion.div>
    </>
  )
}

function ModalCard({ children, maxW = 'max-w-md' }: { children: ReactNode; maxW?: string }) {
  return (
    <motion.div
      className={`bg-white rounded-2xl shadow-2xl w-full ${maxW} flex flex-col overflow-hidden`}
      initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }}
      exit={{ scale: 0.94, y: 8 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </motion.div>
  )
}

function ModalHeader({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
      <div>
        <h3 className="text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors">
        <X size={15} />
      </button>
    </div>
  )
}

function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
      {children}
    </div>
  )
}

function FormField({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} />{error}</p>}
    </div>
  )
}

function ActionBtn({ onClick, title, icon, danger = false }: { onClick: () => void; title: string; icon: ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title}
      className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
        danger ? 'text-gray-400 hover:text-red-500 hover:bg-red-50' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
      }`}>
      {icon}
    </button>
  )
}

const inputCls = (err = false) =>
  `w-full px-3 py-2.5 bg-white border rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none transition-all ${
    err ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100'
        : 'border-gray-200 focus:border-gray-400 focus:ring-2 focus:ring-gray-100'
  }`

const primaryBtn = 'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-60'
const secondaryBtn = 'px-4 py-2.5 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors'

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)) }
