import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  Search,
  Plus,
  Upload,
  Pencil,
  Trash2,
  User,
  Download,
  CheckCircle2,
  XCircle,
  X,
  Loader2,
  AlertCircle,
  Check,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { API_BASE_URL, apiFetch } from '../lib/api'
import { classShort, sortClassLabels } from '../lib/classes'

export type Student = {
  id: string
  name: string
  class: string
  grade: number
  number: number
  active: boolean
  email: string
  studentId: string
}

type StudentStatusFilter = 'all' | 'active' | 'pending' | 'inactive'

type ApiStudent = {
  id: number
  classId: number
  studentNumber: string
  name: string
  email?: string
  isActive: number | boolean
  className: string
}

type ApiStudentApplication = {
  id: number
  name: string
  email: string
  status: 'pending' | 'approved' | 'rejected'
  requestedAt: string
}

function displayNumber(studentNumber: string) {
  const parsed = Number(studentNumber.slice(-2))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number(studentNumber) || 1
}

function mapStudent(row: ApiStudent): Student {
  const shortClass = classShort(row.className)
  const [grade = '3'] = shortClass.split('-')
  return {
    id: String(row.id),
    studentId: row.studentNumber,
    name: row.name,
    class: shortClass,
    grade: Number(grade),
    number: displayNumber(row.studentNumber),
    active: Boolean(row.isActive),
    email: row.email || '',
  }
}

/* ═══════════════════════════════════════════════════ */
/*  Main page                                          */
/* ═══════════════════════════════════════════════════ */

export function StudentManagementPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [applications, setApplications] = useState<ApiStudentApplication[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('전체')
  const [statusFilter, setStatusFilter] = useState<StudentStatusFilter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Student | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null)
  const [approveTarget, setApproveTarget] = useState<ApiStudentApplication | null>(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let ignore = false
    async function loadStudents() {
      try {
        const [rows, pending] = await Promise.all([
          apiFetch<ApiStudent[]>('/students?includeInactive=true'),
          apiFetch<ApiStudentApplication[]>('/student-applications?status=pending'),
        ])
        if (!ignore) {
          setStudents(rows.map(mapStudent))
          setApplications(pending)
          setErrorMsg('')
        }
      } catch (err) {
        if (!ignore) setErrorMsg(err instanceof Error ? err.message : '학생 목록을 불러오지 못했습니다.')
      }
    }
    loadStudents()
    return () => { ignore = true }
  }, [])

  const reloadStudentsAndApplications = async () => {
    const [rows, pending] = await Promise.all([
      apiFetch<ApiStudent[]>('/students?includeInactive=true'),
      apiFetch<ApiStudentApplication[]>('/student-applications?status=pending'),
    ])
    setStudents(rows.map(mapStudent))
    setApplications(pending)
  }

  const filtered = students.filter((s) => {
    if (statusFilter === 'pending') return false
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.studentId.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    const matchClass = classFilter === '전체' || s.class === classFilter
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && s.active) ||
      (statusFilter === 'inactive' && !s.active)
    return matchSearch && matchClass && matchStatus
  })

  const counts = {
    all: students.length + applications.length,
    active: students.filter((s) => s.active).length,
    pending: applications.length,
    inactive: students.filter((s) => !s.active).length,
  }

  const classOptions = useMemo(() => {
    const labels = Array.from(new Set(students.map((student) => student.class).filter(Boolean)))
    return ['전체', ...sortClassLabels(labels)]
  }, [students])

  useEffect(() => {
    if (!classOptions.includes(classFilter)) setClassFilter('전체')
  }, [classFilter, classOptions])

  const toast = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 3000)
  }

  const toggleSelect = (id: string) => {
    const n = new Set(selected)
    n.has(id) ? n.delete(id) : n.add(id)
    setSelected(n)
  }

  const toggleAll = () =>
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((s) => s.id)))

  const handleAdd = async (data: StudentFormData) => {
    try {
      const saved = await apiFetch<ApiStudent>('/students', {
        method: 'POST',
        body: JSON.stringify({
          name: data.name,
          studentNumber: data.studentId,
          email: data.email,
          grade: Number(data.grade),
          classNum: Number(data.classNum),
          isActive: data.active,
        }),
      })
      setStudents((prev) => [mapStudent(saved), ...prev])
      setAddOpen(false)
      setErrorMsg('')
      toast(`${data.name} 학생이 추가되었습니다.`)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '학생 추가에 실패했습니다.')
    }
  }

  const handleEdit = async (data: StudentFormData) => {
    if (!editTarget) return
    try {
      const saved = await apiFetch<ApiStudent>(`/students/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: data.name,
          studentNumber: data.studentId,
          email: data.email,
          grade: Number(data.grade),
          classNum: Number(data.classNum),
          isActive: data.active,
        }),
      })
      setStudents((prev) => prev.map((s) => s.id === editTarget.id ? mapStudent(saved) : s))
      setEditTarget(null)
      setErrorMsg('')
      toast(`${data.name} 학생 정보가 수정되었습니다.`)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '학생 수정에 실패했습니다.')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await apiFetch(`/students/${deleteTarget.id}`, { method: 'DELETE' })
      setStudents((prev) => prev.filter((s) => s.id !== deleteTarget.id))
      setSelected((prev) => { const n = new Set(prev); n.delete(deleteTarget.id); return n })
      setDeleteTarget(null)
      setErrorMsg('')
      toast('학생이 삭제되었습니다.')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '학생 삭제에 실패했습니다.')
    }
  }

  const handleBulkDelete = async () => {
    try {
      await Promise.all(Array.from(selected).map((id) => apiFetch(`/students/${id}`, { method: 'DELETE' })))
      setStudents((prev) => prev.filter((s) => !selected.has(s.id)))
      const count = selected.size
      setSelected(new Set())
      setErrorMsg('')
      toast(`${count}명의 학생이 삭제되었습니다.`)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '일괄 삭제에 실패했습니다.')
    }
  }

  const handleCsvUpload = async (file: File | null) => {
    if (!file) return
    try {
      const csv = await file.text()
      const result = await apiFetch<{ importedCount: number; students: ApiStudent[] }>('/students/import', {
        method: 'POST',
        body: JSON.stringify({ csv }),
      })
      const rows = await apiFetch<ApiStudent[]>('/students?includeInactive=true')
      setStudents(rows.map(mapStudent).sort((a, b) => a.studentId.localeCompare(b.studentId)))
      setErrorMsg('')
      toast(`${result.importedCount}명의 학생 CSV를 반영했습니다.`)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'CSV 업로드에 실패했습니다.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const downloadCsv = () => {
    window.location.href = `${API_BASE_URL}/students/export.csv?includeInactive=true`
  }

  const handleApproveApplication = async (application: ApiStudentApplication, data: StudentApprovalFormData) => {
    try {
      await apiFetch(`/student-applications/${application.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'approved',
          name: data.name,
          studentNumber: data.studentId,
          grade: Number(data.grade),
          classNum: Number(data.classNum),
        }),
      })
      await reloadStudentsAndApplications()
      setApproveTarget(null)
      setErrorMsg('')
      toast(`${data.name} 학생 가입을 승인했습니다.`)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '학생 가입 승인에 실패했습니다.')
    }
  }

  const handleRejectApplication = async (application: ApiStudentApplication) => {
    try {
      await apiFetch(`/student-applications/${application.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected' }),
      })
      await reloadStudentsAndApplications()
      setErrorMsg('')
      toast(`${application.name} 학생 가입 신청을 거절했습니다.`)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '학생 가입 거절에 실패했습니다.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-gray-900">학생 관리</h1>
            <p className="text-sm text-gray-500 mt-0.5">전체 {counts.all}명</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => handleCsvUpload(e.target.files?.[0] || null)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl px-3 py-2 text-sm hover:bg-gray-50 transition-colors shadow-sm"
            >
              <Upload size={14} />
              <span className="hidden sm:inline">CSV 업로드</span>
            </button>
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 bg-gray-900 text-white rounded-xl px-3 py-2 text-sm hover:bg-gray-700 transition-colors shadow-sm"
            >
              <Plus size={14} />
              학생 추가
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            { id: 'all', label: '전체', value: counts.all, color: 'text-gray-700', bg: 'bg-white' },
            { id: 'active', label: '활성', value: counts.active, color: 'text-green-700', bg: 'bg-green-50' },
            { id: 'pending', label: '승인 대기', value: counts.pending, color: 'text-amber-700', bg: 'bg-amber-50' },
            { id: 'inactive', label: '비활성', value: counts.inactive, color: 'text-gray-500', bg: 'bg-gray-100' },
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

        {/* Filters */}
        <div className="flex gap-2 flex-col sm:flex-row">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="이름, 학번, 이메일 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300 shadow-sm"
            />
          </div>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="w-full sm:w-40 px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-gray-400 shadow-sm"
          >
            {classOptions.map((cls) => <option key={cls} value={cls}>{cls}</option>)}
          </select>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {applications.length > 0 && statusFilter !== 'active' && statusFilter !== 'inactive' && (
          <PendingApplicationsPanel
            applications={applications}
            onApprove={setApproveTarget}
            onReject={handleRejectApplication}
          />
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
          <div className="hidden sm:grid items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50"
            style={{ gridTemplateColumns: 'auto 1fr auto auto auto auto' }}>
            <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll}
              className="w-4 h-4 rounded border-gray-300 cursor-pointer" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">학생</span>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">학반</span>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">학번</span>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">상태</span>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">관리</span>
          </div>

          <div className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Search size={24} className="text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">검색 결과가 없습니다</p>
              </div>
            ) : (
              filtered.map((s) => (
                <StudentRow
                  key={s.id}
                  student={s}
                  selected={selected.has(s.id)}
                  onToggle={() => toggleSelect(s.id)}
                  onEdit={() => setEditTarget(s)}
                  onDelete={() => setDeleteTarget(s)}
                />
              ))
            )}
          </div>

          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
            <span>{filtered.length}명 표시 (전체 {students.length}명)</span>
            <button onClick={downloadCsv} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 transition-colors">
              <Download size={12} />CSV 다운로드
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 z-50"
          >
            <Check size={14} className="text-green-400" />
            {successMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Modal */}
      <AnimatePresence>
        {addOpen && (
          <StudentFormModal
            mode="add"
            onSave={handleAdd}
            onClose={() => setAddOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editTarget && (
          <StudentFormModal
            mode="edit"
            student={editTarget}
            onSave={handleEdit}
            onClose={() => setEditTarget(null)}
          />
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteTarget && (
          <DeleteConfirmModal
            student={deleteTarget}
            onConfirm={handleDelete}
            onClose={() => setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {approveTarget && (
          <StudentApprovalModal
            application={approveTarget}
            onSave={(data) => handleApproveApplication(approveTarget, data)}
            onClose={() => setApproveTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ═══════════════════════════════════════════════════ */
/*  Pending student applications                       */
/* ═══════════════════════════════════════════════════ */

type StudentApprovalFormData = {
  name: string
  grade: string
  classNum: string
  number: string
  studentId: string
}

function PendingApplicationsPanel({
  applications,
  onApprove,
  onReject,
}: {
  applications: ApiStudentApplication[]
  onApprove: (application: ApiStudentApplication) => void
  onReject: (application: ApiStudentApplication) => void
}) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-amber-900">학생 가입 승인 대기</h2>
          <p className="text-xs text-amber-700 mt-0.5">교사가 학번과 반을 배정해야 학생이 로그인할 수 있습니다.</p>
        </div>
        <span className="text-xs text-amber-700 bg-white/70 border border-amber-200 rounded-full px-2 py-1">
          {applications.length}명
        </span>
      </div>
      <div className="divide-y divide-amber-100 bg-white">
        {applications.map((application) => (
          <div key={application.id} className="px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
              <User size={14} className="text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{application.name}</p>
              <p className="text-xs text-gray-400 truncate">{application.email}</p>
            </div>
            <button
              onClick={() => onReject(application)}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-500 hover:bg-gray-50"
            >
              거절
            </button>
            <button
              onClick={() => onApprove(application)}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs bg-gray-900 text-white hover:bg-gray-700"
            >
              승인
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function StudentApprovalModal({
  application,
  onSave,
  onClose,
}: {
  application: ApiStudentApplication
  onSave: (data: StudentApprovalFormData) => void | Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<StudentApprovalFormData>({
    name: application.name,
    grade: '3',
    classNum: '1',
    number: '',
    studentId: '',
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<StudentApprovalFormData>>({})

  const set = (k: keyof StudentApprovalFormData) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }))

  const validate = () => {
    const e: Partial<StudentApprovalFormData> = {}
    if (!form.name.trim()) e.name = '이름을 입력해 주세요'
    if (!form.studentId.trim()) e.studentId = '학번을 입력해 주세요'
    if (!form.number.trim()) e.number = '번호를 입력해 주세요'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!validate()) return
    setLoading(true)
    await onSave(form)
    setLoading(false)
  }

  return (
    <Overlay onClose={onClose}>
      <ModalCard>
        <ModalHeader
          title="학생 가입 승인"
          subtitle={`${application.email} 계정을 학생으로 등록합니다`}
          onClose={onClose}
        />
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <FormField label="이름 *" error={errors.name}>
            <input value={form.name} onChange={(e) => set('name')(e.target.value)} className={inputCls(!!errors.name)} />
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="학년 *">
              <select value={form.grade} onChange={(e) => set('grade')(e.target.value)} className={inputCls()}>
                {['1','2','3'].map((v) => <option key={v} value={v}>{v}학년</option>)}
              </select>
            </FormField>
            <FormField label="반 *">
              <select value={form.classNum} onChange={(e) => set('classNum')(e.target.value)} className={inputCls()}>
                {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((v) => <option key={v} value={v}>{v}반</option>)}
              </select>
            </FormField>
            <FormField label="번호 *" error={errors.number}>
              <input type="number" min={1} value={form.number} onChange={(e) => set('number')(e.target.value)} className={inputCls(!!errors.number)} />
            </FormField>
          </div>
          <FormField label="학번 *" error={errors.studentId} hint="예: S2024001">
            <input value={form.studentId} onChange={(e) => set('studentId')(e.target.value)} placeholder="S2024001" className={inputCls(!!errors.studentId)} />
          </FormField>
        </form>
        <ModalFooter>
          <button onClick={onClose} className={secondaryBtn}>취소</button>
          <button onClick={handleSubmit} disabled={loading} className={primaryBtn}>
            {loading && <Loader2 size={14} className="animate-spin" />}
            승인하기
          </button>
        </ModalFooter>
      </ModalCard>
    </Overlay>
  )
}

/* ═══════════════════════════════════════════════════ */
/*  Student row                                        */
/* ═══════════════════════════════════════════════════ */

function StudentRow({
  student: s,
  selected,
  onToggle,
  onEdit,
  onDelete,
}: {
  student: Student
  selected: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={`px-4 py-3 transition-colors ${selected ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
    >
      {/* Desktop */}
      <div className="hidden sm:grid items-center gap-3" style={{ gridTemplateColumns: 'auto 1fr auto auto auto auto' }}>
        <input type="checkbox" checked={selected} onChange={onToggle} className="w-4 h-4 rounded border-gray-300 cursor-pointer" />

        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <User size={14} className="text-gray-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
            <p className="text-xs text-gray-400 truncate">{s.email}</p>
          </div>
        </div>

        <span className="text-sm text-gray-600">{s.grade}학년 {s.class.split('-')[1]}반 {s.number}번</span>
        <span className="text-sm text-gray-500 font-mono">{s.studentId}</span>

        <StatusPill active={s.active} />

        <div className="flex items-center gap-0.5">
          <ActionBtn onClick={onEdit} title="수정" icon={<Pencil size={13} />} />
          <ActionBtn onClick={onDelete} title="삭제" icon={<Trash2 size={13} />} danger />
        </div>
      </div>

      {/* Mobile */}
      <div className="sm:hidden flex items-center gap-3">
        <input type="checkbox" checked={selected} onChange={onToggle} className="w-4 h-4 rounded border-gray-300 cursor-pointer shrink-0" />
        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
          <User size={15} className="text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-900">{s.name}</p>
            <StatusPill active={s.active} />
          </div>
          <p className="text-xs text-gray-400">{s.grade}학년 {s.class.split('-')[1]}반 {s.number}번 · {s.studentId}</p>
        </div>
        <div className="flex gap-0.5 shrink-0">
          <ActionBtn onClick={onEdit} title="수정" icon={<Pencil size={13} />} />
          <ActionBtn onClick={onDelete} title="삭제" icon={<Trash2 size={13} />} danger />
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════ */
/*  Student Form Modal (Add / Edit)                    */
/* ═══════════════════════════════════════════════════ */

type StudentFormData = {
  name: string; grade: string; classNum: string; number: string
  studentId: string; email: string; active: boolean
}

function StudentFormModal({
  mode,
  student,
  onSave,
  onClose,
}: {
  mode: 'add' | 'edit'
  student?: Student
  onSave: (data: StudentFormData) => void | Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<StudentFormData>({
    name: student?.name ?? '',
    grade: student?.grade?.toString() ?? '3',
    classNum: student?.class?.split('-')[1] ?? '1',
    number: student?.number?.toString() ?? '',
    studentId: student?.studentId ?? '',
    email: student?.email ?? '',
    active: student?.active ?? true,
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<StudentFormData>>({})

  const set = (k: keyof StudentFormData) => (v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }))

  const validate = (): boolean => {
    const e: Partial<StudentFormData> = {}
    if (!form.name.trim()) e.name = '이름을 입력해 주세요'
    if (!form.studentId.trim()) e.studentId = '학번을 입력해 주세요'
    if (!form.number.trim()) e.number = '번호를 입력해 주세요'
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
          title={mode === 'add' ? '학생 추가' : '학생 정보 수정'}
          subtitle={mode === 'add' ? '새 학생을 등록합니다' : `${student?.name} 정보를 수정합니다`}
          onClose={onClose}
        />

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* 이름 */}
          <FormField label="이름 *" error={errors.name}>
            <input
              value={form.name}
              onChange={(e) => set('name')(e.target.value)}
              placeholder="홍길동"
              className={inputCls(!!errors.name)}
            />
          </FormField>

          {/* 학년 / 반 / 번호 */}
          <div className="grid grid-cols-3 gap-3">
            <FormField label="학년 *">
              <select value={form.grade} onChange={(e) => set('grade')(e.target.value)} className={inputCls()}>
                {['1','2','3'].map((v) => <option key={v} value={v}>{v}학년</option>)}
              </select>
            </FormField>
            <FormField label="반 *">
              <select value={form.classNum} onChange={(e) => set('classNum')(e.target.value)} className={inputCls()}>
                {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((v) => (
                  <option key={v} value={v}>{v}반</option>
                ))}
              </select>
            </FormField>
            <FormField label="번호 *" error={errors.number}>
              <input
                type="number" min={1} max={50}
                value={form.number}
                onChange={(e) => set('number')(e.target.value)}
                placeholder="1"
                className={inputCls(!!errors.number)}
              />
            </FormField>
          </div>

          {/* 학번 */}
          <FormField label="학번 *" error={errors.studentId} hint="예: S2024001">
            <input
              value={form.studentId}
              onChange={(e) => set('studentId')(e.target.value)}
              placeholder="S2024001"
              className={inputCls(!!errors.studentId)}
            />
          </FormField>

          {/* 이메일 */}
          <FormField label="이메일 (선택)">
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email')(e.target.value)}
              placeholder="student@school.kr"
              className={inputCls()}
            />
          </FormField>

          {/* 상태 */}
          <FormField label="계정 상태">
            <div className="flex gap-2">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => set('active')(v)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all ${
                    form.active === v
                      ? v ? 'bg-green-50 text-green-700 border-green-300' : 'bg-gray-100 text-gray-600 border-gray-300'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {v ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  {v ? '활성' : '비활성'}
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
  student,
  onConfirm,
  onClose,
}: {
  student: Student
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
            <h3 className="text-gray-900">학생 삭제</h3>
            <p className="text-sm text-gray-500 mt-1.5">
              <span className="font-medium text-gray-700">{student.name}</span> 학생을 삭제하시겠습니까?
              이 작업은 되돌릴 수 없습니다.
            </p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-600">학생 계정과 연결된 출석/QR 기록도 함께 삭제됩니다. 비활성화는 수정 화면의 계정 상태에서 처리하세요.</p>
          </div>
        </div>
        <ModalFooter>
          <button onClick={onClose} className={secondaryBtn}>취소</button>
          <button onClick={onConfirm} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors">
            <Trash2 size={14} />
            삭제하기
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
      <motion.div
        className="fixed inset-0 bg-black/40 z-50"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      >
        <div className="pointer-events-auto w-full flex justify-center">{children}</div>
      </motion.div>
    </>
  )
}

function ModalCard({ children, maxW = 'max-w-md' }: { children: ReactNode; maxW?: string }) {
  return (
    <motion.div
      className={`bg-white rounded-2xl shadow-2xl w-full ${maxW} flex flex-col overflow-hidden`}
      initial={{ scale: 0.94, y: 16 }}
      animate={{ scale: 1, y: 0 }}
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

function FormField({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
      {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} />{error}</p>}
    </div>
  )
}

function StatusPill({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-1.5 py-0.5">
      <CheckCircle2 size={10} />활성
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 border border-gray-200 rounded-full px-1.5 py-0.5">
      <XCircle size={10} />비활성
    </span>
  )
}

function ActionBtn({ onClick, title, icon, danger = false }: { onClick: () => void; title: string; icon: ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
        danger
          ? 'text-gray-400 hover:text-red-500 hover:bg-red-50'
          : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
      }`}
    >
      {icon}
    </button>
  )
}

const inputCls = (err = false) =>
  `w-full px-3 py-2.5 bg-white border rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none transition-all ${
    err
      ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100'
      : 'border-gray-200 focus:border-gray-400 focus:ring-2 focus:ring-gray-100'
  }`

const primaryBtn =
  'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed'

const secondaryBtn =
  'px-4 py-2.5 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors'

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
