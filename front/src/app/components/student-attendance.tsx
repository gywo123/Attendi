import { useState, useEffect } from 'react'
import {
  MapPin,
  CheckCircle2,
  Loader2,
  Lock,
  Shield,
  User,
  RefreshCw,
  Navigation,
  AlertCircle,
  Settings,
} from 'lucide-react'
import { QRCode, CircleTimer } from './qr-code'
import { ApiError, apiFetch } from '../lib/api'
import type { AuthUser } from './auth-page'

type AttendanceState = 'checking' | 'denied' | 'outside' | 'closed' | 'ready' | 'verified'

const STATE_LABELS: Record<AttendanceState, string> = {
  checking: '위치 확인 중',
  denied: '권한 거부',
  outside: '학교 밖',
  closed: '출석 마감',
  ready: 'QR 준비됨',
  verified: '출석 완료',
}

export function StudentAttendancePage({ user }: { user?: AuthUser }) {
  const [state, setState] = useState<AttendanceState>('checking')
  const [timer, setTimer] = useState(0)
  const [qrValue, setQrValue] = useState('')
  const [statusText, setStatusText] = useState('')
  const now = new Date()
  const student = {
    name: user?.name || '-',
    class: user?.class || '-',
    number: user?.number || '-',
    id: user?.studentId || '-',
  }

  const issueQr = async () => {
    setState('checking')
    try {
      const position = await readPosition()
      const result = await apiFetch<{
        qrPayload: string
        expiresInSeconds: number
      }>('/qr-sessions', {
        method: 'POST',
        body: JSON.stringify({
          classId: user?.classId || 1,
          latitude: position.latitude,
          longitude: position.longitude,
          accuracyMeters: position.accuracyMeters,
        }),
      })
      setQrValue(result.qrPayload)
      setTimer(result.expiresInSeconds)
      setStatusText('학교 구역 인증됨')
      setState('ready')
    } catch (error) {
      const nextState = getBlockedState(error)
      setState(nextState)
      setStatusText(error instanceof Error ? error.message : '')
    }
  }

  useEffect(() => {
    issueQr()
  }, [])

  useEffect(() => {
    if (state !== 'ready') return
    const iv = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          issueQr()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [state])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-4 pb-24 px-4">
      <div className="w-full max-w-sm space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-gray-400">
            {now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </span>
          <span className="text-xs text-gray-400">
            {now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Student card */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 shadow-sm">
          <div className="w-11 h-11 bg-gray-900 rounded-full flex items-center justify-center shrink-0">
            <User size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900">{student.name}</div>
            <div className="text-sm text-gray-500 truncate">
              {student.class} · {student.number} · {student.id}
            </div>
          </div>
          {state === 'verified' && <CheckCircle2 size={22} className="text-green-500 shrink-0" />}
        </div>

        {/* GPS status bar */}
        <GpsStatusBar state={state} statusText={statusText} />

        {/* Main panel */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {state === 'checking' && <CheckingPanel />}
          {state === 'denied' && <DeniedPanel />}
          {state === 'outside' && <OutsidePanel />}
          {state === 'closed' && <ClosedPanel statusText={statusText} />}
          {state === 'ready' && (
            <QRReadyPanel
              qrValue={qrValue}
              timer={timer}
              onRefresh={issueQr}
            />
          )}
          {state === 'verified' && <VerifiedPanel />}
        </div>

        <button
          onClick={issueQr}
          className="w-full text-xs text-gray-500 hover:text-gray-900 py-2"
        >
          위치 다시 확인
        </button>
      </div>
    </div>
  )
}

function GpsStatusBar({ state, statusText }: { state: AttendanceState; statusText?: string }) {
  const config = {
    checking: {
      bg: 'bg-gray-50 border-gray-200',
      text: 'text-gray-600',
      dot: 'bg-gray-400 animate-pulse',
      label: '현재 위치 확인 중...',
      sub: '',
    },
    denied: {
      bg: 'bg-red-50 border-red-200',
      text: 'text-red-700',
      dot: 'bg-red-400',
      label: 'GPS 권한 없음',
      sub: '위치 권한이 거부됨',
    },
    outside: {
      bg: 'bg-red-50 border-red-200',
      text: 'text-red-700',
      dot: 'bg-red-400',
      label: '학교 구역 밖',
      sub: '학교 인증 반경 밖에서는 QR을 발급할 수 없습니다.',
    },
    closed: {
      bg: 'bg-amber-50 border-amber-200',
      text: 'text-amber-700',
      dot: 'bg-amber-400',
      label: '출석 마감',
      sub: '오늘 출석이 마감되어 QR을 발급할 수 없습니다.',
    },
    ready: {
      bg: 'bg-green-50 border-green-200',
      text: 'text-green-700',
      dot: 'bg-green-500',
      label: '학교 구역 인증됨',
      sub: '출석 인증 구역 안에 있습니다.',
    },
    verified: {
      bg: 'bg-green-50 border-green-200',
      text: 'text-green-700',
      dot: 'bg-green-500',
      label: '학교 구역 인증됨',
      sub: '출석 인증 구역 안에 있습니다.',
    },
  }
  const c = config[state]
  const sub = statusText || c.sub
  const Icon = state === 'checking' ? Navigation : state === 'denied' ? Lock : state === 'outside' ? MapPin : state === 'closed' ? AlertCircle : Shield

  return (
    <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border ${c.bg} shadow-sm`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
      <Icon size={14} className={c.text} />
      <div className="flex-1 min-w-0">
        <span className={`text-sm font-medium ${c.text}`}>{c.label}</span>
        {sub && <p className="text-xs text-gray-500 truncate mt-0.5">{sub}</p>}
      </div>
      {state === 'checking' && <Loader2 size={14} className="text-gray-400 animate-spin shrink-0" />}
    </div>
  )
}

function getBlockedState(error: unknown): AttendanceState {
  if (error instanceof ApiError) {
    if (error.code === 'ATTENDANCE_CLOSED') return 'closed'
    if (error.code === 'OUT_OF_SCHOOL_AREA') return 'outside'
  }
  const message = error instanceof Error ? error.message : ''
  if (message.includes('권한')) return 'denied'
  return 'outside'
}

function readPosition(): Promise<{ latitude: number; longitude: number; accuracyMeters?: number }> {
  if (!navigator.geolocation) {
    return Promise.resolve({ latitude: 37.5012743, longitude: 127.039585, accuracyMeters: 999 })
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracyMeters: pos.coords.accuracy,
      }),
      () => reject(new Error('위치 권한이 필요합니다.')),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 },
    )
  })
}

function CheckingPanel() {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 gap-4">
      <div className="relative">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
          <Navigation size={24} className="text-gray-400" />
        </div>
        <Loader2 size={56} className="text-gray-300 animate-spin absolute -inset-4" />
      </div>
      <div className="text-center">
        <p className="font-medium text-gray-900">위치 확인 중</p>
        <p className="text-sm text-gray-500 mt-1">학교 구역 안에 있는지 확인하고 있습니다</p>
      </div>
    </div>
  )
}

function DeniedPanel() {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-6 gap-5">
      <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
        <Lock size={24} className="text-red-500" />
      </div>
      <div className="text-center space-y-1.5">
        <p className="font-medium text-gray-900">위치 권한이 꺼져 있습니다</p>
        <p className="text-sm text-gray-500 leading-relaxed">
          GPS 권한을 허용해야 QR 코드를 표시할 수 있습니다. 설정에서 위치 권한을 허용해 주세요.
        </p>
      </div>
      <div className="w-full space-y-2">
        <button className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white rounded-lg py-3 text-sm hover:bg-gray-700 transition-colors">
          <Settings size={15} />
          설정으로 이동
        </button>
        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-700">위치 권한 허용 방법</p>
          <p>① 설정 앱 열기</p>
          <p>② 개인정보 보호 → 위치 서비스</p>
          <p>③ 이 앱에서 "사용하는 중" 선택</p>
        </div>
      </div>
    </div>
  )
}

function ClosedPanel({ statusText }: { statusText?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-6 gap-5">
      <div className="relative">
        <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
          <Lock size={24} className="text-amber-500" />
        </div>
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
          <AlertCircle size={11} className="text-white" />
        </div>
      </div>
      <div className="text-center space-y-1">
        <p className="font-medium text-gray-900">출석이 마감되었습니다</p>
        <p className="text-sm text-gray-500">학교 안에 있어도 마감 후에는 QR 코드가 발급되지 않습니다</p>
      </div>
      <div className="w-full bg-gray-50 rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
            <Lock size={13} className="text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-700">차단 사유</p>
            <p className="text-sm text-gray-600 mt-0.5">출석 마감</p>
            <p className="text-xs text-amber-700 mt-0.5">{statusText || 'QR 발급 불가'}</p>
          </div>
        </div>
        <div className="border-t border-gray-200" />
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
            <Shield size={13} className="text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-700">해결 방법</p>
            <p className="text-sm text-gray-600 mt-0.5">선생님이 출석 정책에서 해당 날짜/반의 마감을 취소해야 합니다</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function OutsidePanel() {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-6 gap-5">
      <div className="relative">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
          <MapPin size={24} className="text-red-500" />
        </div>
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
          <AlertCircle size={11} className="text-white" />
        </div>
      </div>
      <div className="text-center space-y-1">
        <p className="font-medium text-gray-900">학교 구역 밖입니다</p>
        <p className="text-sm text-gray-500">학교 건물 안에 있어야 QR 코드가 표시됩니다</p>
      </div>
      <div className="w-full bg-gray-50 rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
            <MapPin size={13} className="text-red-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-700">현재 위치</p>
            <p className="text-sm text-gray-600 mt-0.5">학교 인증 구역 밖</p>
            <p className="text-xs text-red-600 mt-0.5">QR 발급 불가</p>
          </div>
        </div>
        <div className="border-t border-gray-200" />
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
            <Shield size={13} className="text-green-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-700">학교 인증 구역</p>
            <p className="text-sm text-gray-600 mt-0.5">관리자가 설정한 학교 위치</p>
            <p className="text-xs text-gray-500 mt-0.5">설정된 허용 반경 이내</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function QRReadyPanel({
  qrValue,
  timer,
  onRefresh,
}: {
  qrValue: string
  timer: number
  onRefresh: () => void
}) {
  const isExpiring = timer <= 8

  return (
    <div className="flex flex-col items-center py-7 px-6 gap-5">
      <div className="text-center space-y-0.5">
        <p className="font-medium text-gray-900">QR 코드를 선생님께 제시하세요</p>
        <p className="text-xs text-gray-400">카메라로 스캔하거나 단말기에 근접해 주세요</p>
      </div>

      {/* QR with frame */}
      <div
        className={`relative p-4 rounded-2xl transition-colors ${
          isExpiring ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'
        }`}
      >
        <QRCode value={qrValue} size={180} />
        {/* Corner decorations */}
        <div className="absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-gray-900 rounded-tl-sm pointer-events-none" />
        <div className="absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-gray-900 rounded-tr-sm pointer-events-none" />
        <div className="absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-gray-900 rounded-bl-sm pointer-events-none" />
        <div className="absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-gray-900 rounded-br-sm pointer-events-none" />
      </div>

      {/* Timer */}
      <div className="flex items-center gap-3 w-full bg-gray-50 rounded-xl px-4 py-3">
        <CircleTimer seconds={timer} total={30} size={44} />
        <div className="flex-1">
          <p className={`text-sm font-medium ${isExpiring ? 'text-red-600' : 'text-gray-900'}`}>
            {isExpiring ? 'QR 코드가 곧 만료됩니다' : '자동 갱신'}
          </p>
          <p className="text-xs text-gray-400">
            {timer}초 후 새 QR 코드로 교체됩니다
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
          title="지금 갱신"
        >
          <RefreshCw size={14} className="text-gray-500" />
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center">
        이 QR 코드는 본인만 사용할 수 있습니다
        <br />
        타인에게 보여주거나 캡처를 금지합니다
      </p>
    </div>
  )
}

function VerifiedPanel() {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-6 gap-5">
      <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center">
        <CheckCircle2 size={40} className="text-green-500" />
      </div>
      <div className="text-center space-y-1">
        <p className="font-medium text-gray-900">출석이 완료되었습니다</p>
        <p className="text-sm text-gray-500">QR 인증 완료</p>
      </div>
      <div className="w-full bg-gray-50 rounded-xl p-4 space-y-2">
        <Row label="날짜" value={new Date().toLocaleDateString('ko-KR')} />
        <Row label="인증 방식" value="GPS + QR 코드" />
        <Row label="처리 시각" value={new Date().toLocaleTimeString('ko-KR')} />
        <Row label="인증 위치" value="학교 인증 구역" />
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium">{value}</span>
    </div>
  )
}
