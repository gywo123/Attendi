import { useEffect, useState } from 'react'
import type { ElementType } from 'react'
import {
  LayoutDashboard,
  QrCode,
  Users,
  ClipboardList,
  User,
  Menu,
  X,
  ChevronRight,
  Scan,
  Shield,
  LogOut,
  ChevronDown,
  Cpu,
  FileText,
  Settings,
  CalendarClock,
} from 'lucide-react'
import { AuthPage, type AuthUser } from './components/auth-page'
import { StudentAttendancePage } from './components/student-attendance'
import { TeacherDashboardPage } from './components/teacher-dashboard'
import { StudentManagementPage } from './components/student-management'
import { AttendanceRecordsPage } from './components/attendance-records'
import { DeviceScanPage } from './components/device-scan'
import { DeviceTokensPage } from './components/device-tokens'
import { ManualAttendancePage } from './components/manual-attendance-page'
import { TeacherManagementPage } from './components/teacher-management'
import { SchoolSettingsPage } from './components/school-settings'
import { AttendancePolicyPage } from './components/attendance-policy-page'
import { apiFetch, clearAccessToken, type AuthPayload } from './lib/api'

type TeacherTab = 'dashboard' | 'manual' | 'students' | 'teachers' | 'records' | 'devices' | 'policy' | 'settings'

const TEACHER_TABS: { id: TeacherTab; label: string; Icon: ElementType; adminOnly?: boolean }[] = [
  { id: 'dashboard', label: '대시보드', Icon: LayoutDashboard },
  { id: 'manual',    label: '수동 출석', Icon: FileText },
  { id: 'students',  label: '학생 관리', Icon: Users },
  { id: 'teachers',  label: '교사 관리', Icon: Shield, adminOnly: true },
  { id: 'records',   label: '출석 기록', Icon: ClipboardList },
  { id: 'devices',   label: '기기 관리', Icon: Cpu },
  { id: 'policy',    label: '출석 정책', Icon: CalendarClock },
  { id: 'settings',  label: 'GPS 설정', Icon: Settings },
]

function toAuthUser(payload: AuthPayload): AuthUser {
  return {
    ...payload.user,
    id: payload.user.id ?? payload.student?.id,
    class: payload.user.class ?? payload.student?.className,
    number: payload.user.number ?? (payload.student?.studentNumber ? `${Number(payload.student.studentNumber.slice(-2)) || payload.student.studentNumber}번` : undefined),
    studentId: payload.user.studentId ?? payload.student?.studentNumber,
    classId: payload.user.classId ?? payload.student?.classId,
    token: payload.accessToken,
  }
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [teacherTab, setTeacherTab] = useState<TeacherTab>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  useEffect(() => {
    let ignore = false
    async function restoreSession() {
      clearAccessToken()
      try {
        const payload = await apiFetch<AuthPayload>('/auth/me')
        if (!ignore) setUser(toAuthUser(payload))
      } catch {
        clearAccessToken()
      } finally {
        if (!ignore) setAuthLoading(false)
      }
    }
    restoreSession()
    return () => { ignore = true }
  }, [])

  const handleLogin = (u: AuthUser) => {
    setUser(u)
    setTeacherTab('dashboard')
    setSidebarOpen(false)
  }

  const handleLogout = () => {
    apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined)
    clearAccessToken()
    setUser(null)
    setProfileOpen(false)
    setSidebarOpen(false)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center text-sm text-gray-500">
        로그인 상태 확인 중...
      </div>
    )
  }

  // Not logged in → show auth page
  if (!user) {
    return <AuthPage onLogin={handleLogin} />
  }

  // Device mode → fullscreen kiosk
  if (user.role === 'device') {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950">
        <div
          className="flex items-center gap-3 px-4 py-2 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.07)', background: '#0a0a0a' }}
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-white/10 rounded-lg flex items-center justify-center">
              <Scan size={12} className="text-white/60" />
            </div>
            <span className="text-xs text-white/50">기기 모드</span>
            <span className="text-xs text-white/25">·</span>
            <span className="text-xs text-white/40">{user.deviceName}</span>
          </div>
          <div className="flex-1" />
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            <LogOut size={11} />
            기기 해제
          </button>
        </div>
        <div className="flex-1">
          <DeviceScanPage accessToken={user.token} />
        </div>
      </div>
    )
  }

  // Student mode
  if (user.role === 'student') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <AppHeader
          user={user}
          profileOpen={profileOpen}
          onProfileToggle={() => setProfileOpen(!profileOpen)}
          onLogout={handleLogout}
        />
        <StudentAttendancePage user={user} />
      </div>
    )
  }

  // Teacher / Admin mode
  const isAdmin = user.role === 'admin'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="flex items-center h-14 px-4 gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2 mr-1">
            <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center">
              <QrCode size={14} className="text-white" />
            </div>
            <span className="font-medium text-gray-900 text-sm hidden sm:block">출석체크</span>
          </div>

          {/* Desktop tabs */}
          <nav className="hidden md:flex items-center gap-0.5">
            {TEACHER_TABS.filter((t) => !t.adminOnly || isAdmin).map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setTeacherTab(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  teacherTab === id
                    ? 'bg-gray-100 text-gray-900 font-medium'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </nav>

          <div className="flex-1" />

          {/* Role badge */}
          <div
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${
              isAdmin
                ? 'bg-purple-50 text-purple-700 border-purple-200'
                : 'bg-gray-50 text-gray-600 border-gray-200'
            }`}
          >
            <Shield size={11} />
            {isAdmin ? '관리자' : '교사'}
          </div>

          {/* Profile dropdown */}
          <div className="relative">
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center">
                <User size={13} className="text-white" />
              </div>
              <span className="text-sm text-gray-700 hidden sm:block">{user.name}</span>
              <ChevronDown size={13} className="text-gray-400 hidden sm:block" />
            </button>

            {profileOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setProfileOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-40 py-1.5 overflow-hidden">
                  <div className="px-3 py-2.5 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">{user.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{user.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut size={14} />
                    로그아웃
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed top-14 right-0 bottom-0 w-64 bg-white border-l border-gray-200 z-30 md:hidden shadow-xl flex flex-col">
            <div className="p-3 space-y-1 flex-1">
              {TEACHER_TABS.filter((t) => !t.adminOnly || isAdmin).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => { setTeacherTab(id); setSidebarOpen(false) }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
                    teacherTab === id
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                  {teacherTab !== id && <ChevronRight size={14} className="ml-auto text-gray-300" />}
                </button>
              ))}
            </div>
            <div className="p-3 border-t border-gray-100">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={16} />
                로그아웃
              </button>
            </div>
          </div>
        </>
      )}

      {/* Main content */}
      <main className="flex-1 pb-16 md:pb-0">
        {teacherTab === 'dashboard' && (
          <TeacherDashboardPage onGoToScan={() => setTeacherTab('manual')} />
        )}
        {teacherTab === 'manual' && <ManualAttendancePage />}
        {teacherTab === 'students' && <StudentManagementPage />}
        {teacherTab === 'teachers' && <TeacherManagementPage />}
        {teacherTab === 'records' && <AttendanceRecordsPage />}
        {teacherTab === 'devices' && <DeviceTokensPage />}
        {teacherTab === 'policy' && <AttendancePolicyPage />}
        {teacherTab === 'settings' && <SchoolSettingsPage />}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-20 flex">
        {TEACHER_TABS.filter((t) => !t.adminOnly || isAdmin).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTeacherTab(id)}
            className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors ${
              teacherTab === id ? 'text-gray-900' : 'text-gray-400'
            }`}
          >
            <Icon size={19} strokeWidth={teacherTab === id ? 2.5 : 1.75} />
            <span className="text-xs">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

/* ─── Student app header ─── */
function AppHeader({
  user,
  profileOpen,
  onProfileToggle,
  onLogout,
}: {
  user: AuthUser
  profileOpen: boolean
  onProfileToggle: () => void
  onLogout: () => void
}) {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="flex items-center h-14 px-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center">
            <QrCode size={14} className="text-white" />
          </div>
          <span className="font-medium text-gray-900 text-sm">출석체크</span>
        </div>

        <div className="relative">
          <button
            onClick={onProfileToggle}
            className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
              <User size={13} className="text-gray-600" />
            </div>
            <span className="text-sm text-gray-700">{user.name}</span>
            <ChevronDown size={13} className="text-gray-400" />
          </button>

          {profileOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={onProfileToggle} />
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-40 py-1.5 overflow-hidden">
                <div className="px-3 py-2.5 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {user.class} · {user.number} · {user.studentId}
                  </p>
                </div>
                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={14} />
                  로그아웃
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
