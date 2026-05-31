import { useEffect, useState, type FormEvent, type ReactNode, type ElementType } from 'react'
import {
  QrCode,
  Eye,
  EyeOff,
  Loader2,
  User,
  Shield,
  Scan,
  AlertCircle,
  MapPin,
  Clock,
  Check,
  ArrowLeft,
  ChevronDown,
  Info,
  Mail,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import {
  ApiError,
  apiFetch,
  loginDevice,
  loginTeacher,
  startGoogleLogin,
  type AuthPayload,
} from '../lib/api'

export type AuthUser = {
  role: 'student' | 'teacher' | 'admin' | 'device'
  name: string
  id?: number
  class?: string
  number?: string
  studentId?: string
  classId?: number
  email?: string
  deviceName?: string
  token?: string
}

type AuthRole = 'student' | 'teacher' | 'device'

type GoogleAccount = { name: string; email: string; initial: string }

// emailAuth: set when coming from email signup (not Google SSO)
type View =
  | { type: 'login'; role: AuthRole }
  | { type: 'profile-setup'; role: 'student' | 'teacher'; account: GoogleAccount; emailAuth?: { email: string; password: string } }
  | { type: 'pending-approval'; name: string; email: string; role?: 'student' | 'teacher' }

const ROLE_TABS: { id: AuthRole; label: string; Icon: ElementType }[] = [
  { id: 'student', label: '학생',         Icon: User   },
  { id: 'teacher', label: '교사 / 관리자', Icon: Shield },
  { id: 'device',  label: '인식 기기',     Icon: Scan   },
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

export function AuthPage({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [view, setView] = useState<View>({ type: 'login', role: 'student' })
  const [authNotice, setAuthNotice] = useState('')

  useEffect(() => {
    let ignore = false
    async function handleAuthRedirect() {
      const params = new URLSearchParams(window.location.search)
      const auth = params.get('auth')
      const authSuccess = params.get('auth_success')
      const pending = params.get('signup_pending')
      const authError = params.get('auth_error')

      if (pending) {
        const payload = decodeClientPayload<{ name: string; email: string; role?: 'student' | 'teacher' }>(pending)
        if (payload && !ignore) {
          setView({ type: 'pending-approval', name: payload.name, email: payload.email, role: payload.role || 'teacher' })
          window.history.replaceState({}, '', window.location.pathname)
          return
        }
      }

      if (authError) {
        if (!ignore) {
          setAuthNotice(authErrorMessage(authError))
          setView({ type: 'login', role: 'teacher' })
        }
        window.history.replaceState({}, '', window.location.pathname)
        return
      }

      if (authSuccess) {
        try {
          const payload = await apiFetch<AuthPayload>('/auth/me')
          if (!ignore) onLogin(toAuthUser(payload))
        } catch (error) {
          if (!ignore) setAuthNotice(error instanceof Error ? error.message : 'Google 로그인 상태를 확인하지 못했습니다.')
        } finally {
          window.history.replaceState({}, '', window.location.pathname)
        }
        return
      }

      if (auth) {
        if (!ignore) setAuthNotice('이전 방식의 로그인 링크입니다. 다시 로그인해 주세요.')
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
    handleAuthRedirect()
    return () => { ignore = true }
  }, [onLogin])

  const handleRoleChange = (r: AuthRole) => {
    setAuthNotice('')
    setView({ type: 'login', role: r })
  }

  const handleGoogleClick = (r: 'student' | 'teacher') => {
    startGoogleLogin(r)
  }

  const handleEmailSignup = (email: string, password: string) => {
    setAuthNotice('')
    const initial = email[0].toUpperCase()
    setView({
      type: 'profile-setup',
      role: 'teacher',
      account: { name: '', email, initial },
      emailAuth: { email, password },
    })
  }

  const handlePendingApproval = (name: string, email: string, role: 'student' | 'teacher' = 'teacher') => {
    setAuthNotice('')
    setView({ type: 'pending-approval', name, email, role })
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left branding ── */}
      <div
        className="hidden lg:flex lg:w-[42%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: '#0a0a0a' }}
      >
        <div
          className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 20% 80%, rgba(255,255,255,0.04), transparent)',
          }}
        />
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center">
            <QrCode size={16} className="text-black" />
          </div>
          <span className="text-white font-medium">출석체크</span>
        </div>
        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-white" style={{ fontSize: 36, fontWeight: 500, lineHeight: 1.25 }}>
              GPS + QR 기반<br />스마트 출석 관리
            </h1>
            <p className="text-white/50 mt-4 leading-relaxed">
              학교 구역 안에서만 QR 코드가 활성화되어 대리 출석과 무단 이석을 효과적으로 방지합니다.
            </p>
          </div>
          <div className="space-y-3">
            {[
              { Icon: MapPin, text: 'GPS 위치 인증으로 대리 출석 차단' },
              { Icon: QrCode, text: '30초 단위 동적 QR 코드로 위변조 방지' },
              { Icon: Clock,  text: '실시간 출결 현황 및 통계 대시보드' },
            ].map(({ Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center shrink-0">
                  <Icon size={14} className="text-white/60" />
                </div>
                <span className="text-sm text-white/60">{text}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-xs text-white/20">© 2026 출석체크 시스템</p>
      </div>

      {/* ── Right form ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-white overflow-y-auto">
        <div className="w-full max-w-[380px] space-y-6">
          <div className="lg:hidden flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-900 rounded-xl flex items-center justify-center">
              <QrCode size={15} className="text-white" />
            </div>
            <span className="font-medium text-gray-900">출석체크</span>
          </div>

          <AnimatePresence mode="wait">
            {/* ── Login view ── */}
            {view.type === 'login' && (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-gray-100 rounded-xl">
                  {ROLE_TABS.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      onClick={() => handleRoleChange(id)}
                      className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-lg text-xs transition-all ${
                        view.role === id
                          ? 'bg-white text-gray-900 shadow-sm font-medium'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Icon size={15} />
                      {label}
                    </button>
                  ))}
                </div>

                {view.role === 'student' && (
                  <StudentLoginView onGoogleClick={() => handleGoogleClick('student')} onLogin={onLogin} />
                )}
                {view.role === 'teacher' && (
                  <TeacherLoginView
                    onLogin={onLogin}
                    onGoogleClick={() => handleGoogleClick('teacher')}
                    onEmailSignup={handleEmailSignup}
                    onPendingApproval={handlePendingApproval}
                    notice={authNotice}
                  />
                )}
                {view.role === 'device' && <DeviceLoginView onLogin={onLogin} />}
              </motion.div>
            )}

            {/* ── Profile setup ── */}
            {view.type === 'profile-setup' && (
              <motion.div
                key="profile-setup"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <button
                  onClick={() =>
                    setView(
                      view.emailAuth
                        ? { type: 'login', role: 'teacher' }
                        : { type: 'login', role: view.role }
                    )
                  }
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
                >
                  <ArrowLeft size={15} />
                  {view.emailAuth ? '회원가입으로' : '계정 선택으로'}
                </button>

                {/* Connected account badge */}
                {view.emailAuth ? (
                  <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <Mail size={15} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-blue-800">이메일 회원가입</p>
                        <Check size={13} className="text-blue-500" />
                      </div>
                      <p className="text-xs text-blue-600 truncate">{view.emailAuth.email}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                    <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center font-medium text-green-700 text-sm shrink-0">
                      {view.account.initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-green-800">{view.account.name}</p>
                        <Check size={13} className="text-green-500" />
                      </div>
                      <p className="text-xs text-green-600 truncate">{view.account.email}</p>
                    </div>
                    <GoogleLogo size={16} />
                  </div>
                )}

                <div>
                  <h2 className="text-gray-900" style={{ fontSize: 22, fontWeight: 600 }}>
                    {view.role === 'student' ? '학생 가입 신청' : '교사 프로필 설정'}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {view.role === 'student' ? '승인 후 교사가 학반과 학번을 배정합니다' : '소속 학교 정보를 입력해 주세요'}
                  </p>
                </div>

                {view.role === 'student' ? (
                  <StudentProfileSetup account={view.account} onPendingApproval={handlePendingApproval} />
                ) : (
                  <TeacherProfileSetup
                    account={view.account}
                    emailAuth={view.emailAuth}
                    onPendingApproval={handlePendingApproval}
                  />
                )}
              </motion.div>
            )}
            {/* ── Pending approval ── */}
            {view.type === 'pending-approval' && (
              <motion.div
                key="pending-approval"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.2 }}
              >
                <PendingApprovalView
                  name={view.name}
                  email={view.email}
                  role={view.role || 'teacher'}
                  onBackToLogin={() => setView({ type: 'login', role: view.role === 'student' ? 'student' : 'teacher' })}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

/* ─── Student login (SSO only) ─────────────────────────────── */

function StudentLoginView({ onGoogleClick }: { onGoogleClick: () => void; onLogin: (u: AuthUser) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-gray-900" style={{ fontSize: 22, fontWeight: 600 }}>학생 로그인</h2>
        <p className="text-sm text-gray-500 mt-1">Google 계정으로 로그인하세요</p>
      </div>
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
        <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700 leading-relaxed">
          학생은 <span className="font-medium">Google 계정</span>으로만 로그인할 수 있습니다.
          처음 로그인 시 학반 정보를 입력해 주세요.
        </p>
      </div>
      <GoogleButton onClick={onGoogleClick} label="Google 계정으로 로그인 / 가입" large />
    </div>
  )
}

/* ─── Teacher / Admin login + signup ───────────────────────── */

function TeacherLoginView({
  onLogin,
  onGoogleClick,
  onEmailSignup,
  onPendingApproval,
  notice,
}: {
  onLogin: (u: AuthUser) => void
  onGoogleClick: () => void
  onEmailSignup: (email: string, password: string) => void
  onPendingApproval: (name: string, email: string) => void
  notice: string
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-gray-900" style={{ fontSize: 22, fontWeight: 600 }}>
          {mode === 'login' ? '로그인' : '회원가입'}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {mode === 'login' ? '교사/관리자 계정으로 로그인하세요' : '새 교사 계정을 만드세요'}
        </p>
      </div>

      {/* SSO */}
      <GoogleButton onClick={onGoogleClick} label="Google로 로그인 / 회원가입" />

      <Divider />

      {notice && <InfoMsg>{notice}</InfoMsg>}

      <AnimatePresence mode="wait">
        {mode === 'login' ? (
          <motion.div
            key="login"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            <EmailLoginForm onLogin={onLogin} onPendingApproval={onPendingApproval} />
            <p className="text-sm text-center text-gray-400">
              계정이 없으신가요?{' '}
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="text-gray-900 font-medium hover:underline"
              >
                회원가입
              </button>
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="signup"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            <EmailSignupForm onSignup={onEmailSignup} />
            <p className="text-sm text-center text-gray-400">
              이미 계정이 있으신가요?{' '}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-gray-900 font-medium hover:underline"
              >
                로그인
              </button>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Email login form ──────────────────────────────────────── */

function EmailLoginForm({
  onLogin,
  onPendingApproval,
}: {
  onLogin: (u: AuthUser) => void
  onPendingApproval: (name: string, email: string) => void
}) {
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setError('이메일과 비밀번호를 입력해 주세요.'); return }
    setLoading(true); setError('')
    try {
      const payload = await loginTeacher(email, password)
      onLogin(toAuthUser(payload))
    } catch (error) {
      if (error instanceof ApiError && error.code === 'TEACHER_PENDING') {
        onPendingApproval('', email)
        return
      }
      setError(error instanceof Error ? error.message : '이메일 또는 비밀번호가 올바르지 않습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <Field label="이메일">
        <Input placeholder="teacher@school.kr" value={email} onChange={setEmail} type="email" autoComplete="email" />
      </Field>
      <Field label="비밀번호">
        <PasswordInput value={password} onChange={setPassword} show={showPw} onToggle={() => setShowPw(!showPw)} />
      </Field>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      <SubmitBtn loading={loading}>로그인</SubmitBtn>
    </form>
  )
}

/* ─── Email signup form ─────────────────────────────────────── */

function EmailSignupForm({ onSignup }: { onSignup: (email: string, password: string) => void }) {
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [showCf, setShowCf]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email || !password || !confirm) { setError('모든 항목을 입력해 주세요.'); return }
    if (password.length < 6) { setError('비밀번호는 6자 이상이어야 합니다.'); return }
    if (password !== confirm) { setError('비밀번호가 일치하지 않습니다.'); return }
    setLoading(true); setError('')
    await delay(600)
    onSignup(email, password)
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <Field label="이메일 *">
        <Input placeholder="teacher@school.kr" value={email} onChange={setEmail} type="email" autoComplete="email" />
      </Field>
      <Field label="비밀번호 *">
        <PasswordInput
          value={password}
          onChange={setPassword}
          show={showPw}
          onToggle={() => setShowPw(!showPw)}
          placeholder="6자 이상 입력"
        />
      </Field>
      <Field label="비밀번호 확인 *">
        <PasswordInput
          value={confirm}
          onChange={setConfirm}
          show={showCf}
          onToggle={() => setShowCf(!showCf)}
          placeholder="비밀번호 재입력"
        />
      </Field>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      <SubmitBtn loading={loading}>다음 — 프로필 입력</SubmitBtn>
    </form>
  )
}

/* ─── Device login ──────────────────────────────────────────── */

function DeviceLoginView({ onLogin }: { onLogin: (u: AuthUser) => void }) {
  const [token, setToken]           = useState('')
  const [deviceName, setDeviceName] = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  const formatToken = (raw: string) => {
    const c = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 7)
    return c.length <= 3 ? c : `${c.slice(0, 3)}-${c.slice(3)}`
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (token.replace('-', '').length < 7) { setError('올바른 기기 토큰을 입력해 주세요.'); return }
    setLoading(true); setError('')
    try {
      const payload = await loginDevice(token, deviceName)
      onLogin(toAuthUser(payload))
    } catch (error) {
      setError(error instanceof Error ? error.message : '유효하지 않거나 만료된 토큰입니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-gray-900" style={{ fontSize: 22, fontWeight: 600 }}>인식 기기 연결</h2>
        <p className="text-sm text-gray-500 mt-1">교사가 발급한 기기 토큰을 입력하세요</p>
      </div>
      <div className="bg-gray-50 rounded-xl p-4 space-y-2">
        <p className="text-xs font-medium text-gray-700">기기 연결 방법</p>
        {['교사/관리자로 로그인', '기기 관리 탭 이동', '새 토큰 발급 후 복사', '아래에 토큰 입력'].map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-gray-200 text-gray-600 text-xs flex items-center justify-center shrink-0 font-medium">{i + 1}</span>
            <span className="text-xs text-gray-500">{s}</span>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <Field label="기기 이름 (선택)">
          <Input placeholder="예: 3학년 1반 교실 태블릿" value={deviceName} onChange={setDeviceName} />
        </Field>
        <Field label="기기 토큰">
          <input
            value={token}
            onChange={(e) => setToken(formatToken(e.target.value))}
            placeholder="ATD-XXXX"
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-center tracking-[0.25em] font-mono text-gray-900 focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 placeholder:tracking-normal placeholder:font-sans placeholder:text-gray-400"
            spellCheck={false}
          />
        </Field>
        {error && <ErrorMsg>{error}</ErrorMsg>}
        <SubmitBtn loading={loading}>기기 연결</SubmitBtn>
      </form>
    </div>
  )
}

/* ─── Student profile setup ─────────────────────────────────── */

function StudentProfileSetup({
  account,
  onPendingApproval,
}: {
  account: GoogleAccount
  onPendingApproval: (name: string, email: string, role?: 'student' | 'teacher') => void
}) {
  const [name, setName] = useState(account.name)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('이름을 입력해 주세요.'); return }
    setLoading(true); setError('')
    try {
      await apiFetch('/auth/student/signup', {
        method: 'POST',
        body: JSON.stringify({ name, email: account.email }),
      })
      onPendingApproval(name, account.email, 'student')
    } catch (err) {
      setError(err instanceof Error ? err.message : '학생 가입 신청에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <Field label="이름 *">
        <Input placeholder="홍길동" value={name} onChange={setName} />
      </Field>
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
        <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700 leading-relaxed">
          학년, 반, 번호, 학번은 교사가 승인할 때 배정합니다.
        </p>
      </div>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      <SubmitBtn loading={loading}>가입 신청</SubmitBtn>
    </form>
  )
}

/* ─── Teacher profile setup ─────────────────────────────────── */

function TeacherProfileSetup({
  account,
  emailAuth,
  onPendingApproval,
}: {
  account: GoogleAccount
  emailAuth?: { email: string; password: string }
  onPendingApproval: (name: string, email: string) => void
}) {
  const [name, setName]       = useState(account.name)
  const [school, setSchool]   = useState('')
  const [subject, setSubject] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!school.trim()) { setError('학교명을 입력해 주세요.'); return }
    if (emailAuth && !name.trim()) { setError('이름을 입력해 주세요.'); return }
    setLoading(true); setError('')
    try {
      const finalName = name || account.name
      const finalEmail = emailAuth?.email ?? account.email
      await apiFetch('/auth/teacher/signup', {
        method: 'POST',
        body: JSON.stringify({
          name: finalName,
          email: finalEmail,
          password: emailAuth?.password ?? cryptoFallbackPassword(finalEmail),
          school,
          subject,
        }),
      })
      onPendingApproval(finalName, finalEmail)
    } catch (err) {
      setError(err instanceof Error ? err.message : '가입 신청에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      {emailAuth && (
        <Field label="이름 *">
          <Input placeholder="홍길동" value={name} onChange={setName} />
        </Field>
      )}
      <Field label="학교명 *">
        <Input placeholder="예: 학교명" value={school} onChange={setSchool} />
      </Field>
      <Field label="담당 과목 (선택)">
        <Input placeholder="예: 수학" value={subject} onChange={setSubject} />
      </Field>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      <SubmitBtn loading={loading}>가입 완료</SubmitBtn>
    </form>
  )
}

/* ─── Pending approval screen ───────────────────────────────── */

function PendingApprovalView({
  name,
  email,
  role,
  onBackToLogin,
}: {
  name: string
  email: string
  role: 'student' | 'teacher'
  onBackToLogin: () => void
}) {
  const isStudent = role === 'student'
  return (
    <div className="space-y-6">
      {/* Icon */}
      <div className="flex flex-col items-center text-center pt-4 space-y-4">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-green-100 border-2 border-white flex items-center justify-center">
            <Check size={13} className="text-green-600" />
          </div>
        </div>

        <div>
          <h2 className="text-gray-900" style={{ fontSize: 22, fontWeight: 600 }}>가입 신청 완료</h2>
          <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
            가입 신청이 접수되었습니다.<br />
            {isStudent ? '교사 승인 후 출석 인증을 사용할 수 있습니다.' : '관리자 승인 후 로그인하실 수 있습니다.'}
          </p>
        </div>
      </div>

      {/* Info card */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">신청 정보</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">이름</span>
            <span className="text-sm font-medium text-gray-900">{name || '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">이메일</span>
            <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">상태</span>
            <span className="inline-flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              승인 대기 중
            </span>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-2.5">
        {[
          { step: '1', text: isStudent ? '교사에게 학생 가입 승인 요청' : '학교 관리자에게 가입 승인 요청', done: true },
          { step: '2', text: isStudent ? '교사가 학번과 반을 배정' : '관리자 검토 및 승인 (1~2 영업일)', done: false },
          { step: '3', text: '승인 완료 후 이메일 알림 발송', done: false },
          { step: '4', text: isStudent ? '로그인 후 출석 인증 시작' : '로그인 후 출석 관리 시작', done: false },
        ].map(({ step, text, done }) => (
          <div key={step} className="flex items-center gap-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-medium ${
              done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
            }`}>
              {done ? <Check size={12} /> : step}
            </div>
            <span className={`text-sm ${done ? 'text-gray-700' : 'text-gray-400'}`}>{text}</span>
          </div>
        ))}
      </div>

      {/* Notice */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
        <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 leading-relaxed">
          승인 완료 시 입력하신 이메일로 안내 메일이 발송됩니다. 스팸함도 확인해 주세요.
        </p>
      </div>

      <button
        onClick={onBackToLogin}
        className="w-full py-3 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
      >
        로그인 페이지로 돌아가기
      </button>
    </div>
  )
}

/* ─── Shared primitives ─────────────────────────────────────── */

function GoogleButton({ onClick, label, large }: { onClick: () => void; label: string; large?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm active:scale-[0.99] ${large ? 'py-3.5 px-4' : 'py-2.5 px-4'}`}
    >
      <GoogleLogo size={18} />
      {label}
    </button>
  )
}

function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.259c-.806.54-1.837.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

function Divider({ label = '또는' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs text-gray-400">{label}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

function Input({ placeholder = '', value, onChange, type = 'text', autoComplete }: {
  placeholder?: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete={autoComplete}
      className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all"
    />
  )
}

function PasswordInput({ value, onChange, show, onToggle, placeholder = '비밀번호 입력' }: {
  value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; placeholder?: string
}) {
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 pr-10 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all"
      />
      <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}

function SelectInput({ value, onChange, options, suffix }: {
  value: string; onChange: (v: string) => void; options: string[]; suffix?: string
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 appearance-none cursor-pointer pr-7"
      >
        {options.map((o) => <option key={o} value={o}>{o}{suffix}</option>)}
      </select>
      <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  )
}

function SubmitBtn({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full bg-gray-900 text-white py-3 rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mt-1"
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  )
}

function ErrorMsg({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
      <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
      <p className="text-sm text-red-600">{children}</p>
    </div>
  )
}

function InfoMsg({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
      <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
      <p className="text-sm text-blue-700">{children}</p>
    </div>
  )
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function cryptoFallbackPassword(email: string) {
  const value = new Uint32Array(1)
  globalThis.crypto?.getRandomValues?.(value)
  return `google-${email}-${value[0] || Date.now()}`
}

function decodeClientPayload<T>(value: string): T | null {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
    const bin = atob(padded)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  } catch {
    return null
  }
}

function authErrorMessage(code: string) {
  if (code === 'teacher_inactive') return '비활성화된 교사 계정입니다. 관리자에게 문의해 주세요.'
  if (code === 'google_oauth_failed') return 'Google 로그인 처리 중 오류가 발생했습니다. 다시 시도해 주세요.'
  if (code === 'missing_code') return 'Google 로그인 인증 코드가 없습니다. 다시 시도해 주세요.'
  return '로그인할 수 없습니다. 계정 상태를 확인해 주세요.'
}
