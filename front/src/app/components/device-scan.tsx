import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Html5Qrcode } from 'html5-qrcode'
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Ban,
  UserCheck,
  Wifi,
  Shield,
  ShieldOff,
  Zap,
  Camera,
  Lock,
  RefreshCw,
} from 'lucide-react'
import { ApiError, apiFetch } from '../lib/api'

type ScanState = 'idle' | 'success' | 'late' | 'duplicate' | 'expired' | 'error'
type ScannerStatus = 'checking' | 'starting' | 'active' | 'permission-denied' | 'unsupported' | 'insecure' | 'error'

const RESULT_CONFIG = {
  success: {
    label: '출석 완료',
    icon: CheckCircle2,
    accent: '#22c55e',
    accentLight: 'rgba(34,197,94,0.12)',
    iconColor: '#22c55e',
    badge: { bg: 'bg-green-500/20 border-green-400/30', text: 'text-green-300', label: '출석' },
  },
  late: {
    label: '지각 처리',
    icon: Clock,
    accent: '#f59e0b',
    accentLight: 'rgba(245,158,11,0.12)',
    iconColor: '#f59e0b',
    badge: { bg: 'bg-amber-500/20 border-amber-400/30', text: 'text-amber-300', label: '지각' },
  },
  duplicate: {
    label: '이미 출석됨',
    icon: UserCheck,
    accent: '#94a3b8',
    accentLight: 'rgba(148,163,184,0.10)',
    iconColor: '#94a3b8',
    badge: { bg: 'bg-slate-500/20 border-slate-400/30', text: 'text-slate-300', label: '확인됨' },
  },
  expired: {
    label: 'QR 코드 만료',
    icon: AlertTriangle,
    accent: '#ef4444',
    accentLight: 'rgba(239,68,68,0.12)',
    iconColor: '#ef4444',
    badge: { bg: 'bg-red-500/20 border-red-400/30', text: 'text-red-300', label: '만료' },
  },
  error: {
    label: '인식 오류',
    icon: Ban,
    accent: '#ef4444',
    accentLight: 'rgba(239,68,68,0.12)',
    iconColor: '#ef4444',
    badge: { bg: 'bg-red-500/20 border-red-400/30', text: 'text-red-300', label: '오류' },
  },
}

type RecentScan = {
  name: string
  class: string
  number: string
  time: string
  status: 'present' | 'late'
  qr: boolean
}

type VerifyResult = {
  result: string
  status?: 'present' | 'late'
  verifiedAt?: string
  student?: {
    name: string
    studentNumber: string
    className: string
  }
}

function classShort(name: string) {
  const match = name.match(/(\d+)학년\s*(\d+)반/)
  return match ? `${match[1]}-${match[2]}` : name
}

function displayNumber(studentNumber: string) {
  const parsed = Number(studentNumber.slice(-2))
  return Number.isFinite(parsed) && parsed > 0 ? `${parsed}번` : studentNumber
}

function timeOnly(value?: string) {
  if (!value) return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
  return new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function toRecentScan(result: VerifyResult): RecentScan | null {
  if (!result.student || !result.status) return null
  return {
    name: result.student.name,
    class: classShort(result.student.className),
    number: displayNumber(result.student.studentNumber),
    time: timeOnly(result.verifiedAt),
    status: result.status,
    qr: true,
  }
}

export function DeviceScanPage({ accessToken }: { accessToken?: string }) {
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [scannerStatus, setScannerStatus] = useState<ScannerStatus>('checking')
  const [scanMessage, setScanMessage] = useState('카메라를 준비하고 있습니다.')
  const [period, setPeriod] = useState(1)
  const [time, setTime] = useState(new Date())
  const [recentScans, setRecentScans] = useState<RecentScan[]>([])
  const [lastScan, setLastScan] = useState<RecentScan | null>(null)
  const [dismissProgress, setDismissProgress] = useState(0)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scanBusyRef = useRef(false)
  const lastDecodedRef = useRef('')
  const periodRef = useRef(1)

  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    if (scanState === 'idle') {
      setDismissProgress(0)
      return
    }
    setDismissProgress(0)
    const total = 3000
    const step = 40
    let elapsed = 0
    const prog = setInterval(() => {
      elapsed += step
      setDismissProgress(Math.min((elapsed / total) * 100, 100))
    }, step)
    const dismiss = setTimeout(() => {
      setScanState('idle')
      clearInterval(prog)
    }, total)
    return () => {
      clearTimeout(dismiss)
      clearInterval(prog)
    }
  }, [scanState])

  useEffect(() => {
    const id = 'attendi-device-qr-reader'
    let cancelled = false
    let mountedScanner: Html5Qrcode | null = null

    const startScanner = async () => {
      try {
        setScannerStatus('checking')
        setScanMessage('카메라 권한과 HTTPS 상태를 확인하고 있습니다.')

        if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
          setScannerStatus('insecure')
          setScanMessage('카메라 사용을 위해 HTTPS 배포 주소에서 접속해야 합니다.')
          return
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          setScannerStatus('unsupported')
          setScanMessage('이 브라우저에서는 카메라 스캔을 사용할 수 없습니다.')
          return
        }

        const scanner = new Html5Qrcode(id)
        mountedScanner = scanner
        scannerRef.current = scanner
        setScannerStatus('starting')
        setScanMessage('카메라 권한을 허용해 주세요.')

        const cameras = await Html5Qrcode.getCameras()
        if (!cameras.length) {
          setScannerStatus('unsupported')
          setScanMessage('사용 가능한 카메라를 찾지 못했습니다.')
          return
        }
        const camera = cameras.find((item) => /back|rear|environment|후면/i.test(item.label)) || cameras[0]
        await scanner.start(
          { deviceId: { exact: camera.id } },
          { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
          async (decodedText) => {
            if (scanBusyRef.current) return
            if (lastDecodedRef.current === decodedText) return
            scanBusyRef.current = true
            lastDecodedRef.current = decodedText
            scanner.pause(true)
            try {
              const result = await apiFetch<VerifyResult>('/qr-sessions/verify', {
                method: 'POST',
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
                body: JSON.stringify({ qrPayload: decodedText, period: periodRef.current }),
              })
              if (cancelled) return
              handleScan(result.status === 'late' ? 'late' : 'success', toRecentScan(result), 'QR 코드 인증이 완료되었습니다.')
            } catch (error) {
              if (cancelled) return
              const state = errorToScanState(error)
              const message = error instanceof Error ? error.message : 'QR 코드를 처리하지 못했습니다.'
              handleScan(state, null, message)
            } finally {
              window.setTimeout(() => {
                if (cancelled) return
                scanBusyRef.current = false
                lastDecodedRef.current = ''
                try {
                  scanner.resume()
                } catch {
                  // The scanner may already be stopped when the page is closed or the user logs out.
                }
              }, 1800)
            }
          },
          () => {},
        )
        if (!cancelled) {
          setScannerStatus('active')
          setScanMessage('QR 코드를 카메라 인식 영역에 비춰주세요.')
        }
      } catch (error) {
        if (!cancelled) {
          scannerRef.current = null
          const message = error instanceof Error ? error.message : ''
          if (/permission|notallowed|denied/i.test(message)) {
            setScannerStatus('permission-denied')
            setScanMessage('카메라 권한이 거부되었습니다. 브라우저 주소창의 권한 설정에서 카메라를 허용해 주세요.')
          } else {
            setScannerStatus('error')
            setScanMessage(message || '카메라를 시작하지 못했습니다.')
          }
        }
      }
    }

    startScanner()
    return () => {
      cancelled = true
      const scanner = scannerRef.current || mountedScanner
      scannerRef.current = null
      scanner?.stop().catch(() => {})
    }
  }, [accessToken])

  const handleScan = (state: ScanState, scan?: RecentScan | null, message = '') => {
    setScanState(state)
    setScanMessage(message)
    const data = scan ?? null
    setLastScan(data)
    if (data && (state === 'success' || state === 'late')) {
      setRecentScans((prev) => [data, ...prev].slice(0, 8))
    }
  }

  const timeStr = time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const dateStr = time.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })

  const presentCount = recentScans.filter((s) => s.status === 'present').length
  const lateCount = recentScans.filter((s) => s.status === 'late').length
  const scannerReady = scannerStatus === 'active'

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col select-none overflow-hidden">

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
            <Zap size={13} className="text-white/80" />
          </div>
          <div>
            <p className="text-sm font-medium text-white/90">출석 인식기</p>
            <p className="text-xs text-white/40">{scannerReady ? 'QR 스캔 대기 중' : '카메라 준비 필요'}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <select
            value={period}
            onChange={(event) => {
              const nextPeriod = Number(event.target.value)
              periodRef.current = nextPeriod
              setPeriod(nextPeriod)
            }}
            className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs text-white/85 outline-none"
            aria-label="현재 출석 교시"
          >
            {Array.from({ length: 8 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value} className="bg-slate-900">{value}교시</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 text-xs text-white/40">
            <Wifi size={12} className="text-green-400" />
            <span>연결됨</span>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-white/90 tabular-nums tracking-wide">{timeStr}</p>
            <p className="text-xs text-white/40">{dateStr}</p>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">

        {/* Camera section */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-6 gap-5">

          {/* Viewfinder */}
          <div className="relative w-full max-w-sm">
            <div
              className="relative rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
                aspectRatio: '1',
                boxShadow: scanState === 'idle'
                  ? '0 0 0 1px rgba(255,255,255,0.06), 0 25px 60px rgba(0,0,0,0.6)'
                  : scanState === 'success' || scanState === 'late'
                  ? `0 0 0 2px ${RESULT_CONFIG[scanState].accent}60, 0 25px 60px rgba(0,0,0,0.6)`
                  : '0 0 0 2px rgba(239,68,68,0.4), 0 25px 60px rgba(0,0,0,0.6)',
                transition: 'box-shadow 0.4s',
              }}
            >
              {/* Grid texture */}
              <div id="attendi-device-qr-reader" className="absolute inset-0 overflow-hidden" />

              {/* Grid texture */}
              <div
                className="absolute inset-0 opacity-5"
                style={{
                  backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)',
                  backgroundSize: '32px 32px',
                }}
              />

              {/* Vignette */}
              <div
                className="absolute inset-0"
                style={{ background: 'radial-gradient(ellipse 65% 65% at 50% 50%, transparent 35%, rgba(0,0,0,0.55) 100%)' }}
              />

              {scannerStatus !== 'active' && (
                <CameraStatus status={scannerStatus} message={scanMessage} />
              )}

              {/* Scan area frame */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative" style={{ width: '64%', aspectRatio: '1' }}>

                  {/* Corner brackets */}
                  {(['tl', 'tr', 'bl', 'br'] as const).map((p) => (
                    <ScanCorner key={p} pos={p} active={scanState === 'idle'} />
                  ))}

                  {/* Scan line */}
                  {scanState === 'idle' && (
                    <motion.div
                      className="absolute left-1 right-1 h-px"
                      style={{
                        background: 'linear-gradient(90deg, transparent 0%, rgba(74,222,128,0.8) 20%, #4ade80 50%, rgba(74,222,128,0.8) 80%, transparent 100%)',
                        boxShadow: '0 0 12px 3px rgba(74,222,128,0.35)',
                      }}
                      initial={{ top: 4 }}
                      animate={{ top: 'calc(100% - 4px)' }}
                      transition={{ duration: 2.2, repeat: Infinity, repeatType: 'reverse', ease: 'linear' }}
                    />
                  )}

                  {/* Center dot (idle) */}
                  {scanState === 'idle' && (
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center"
                      animate={{ opacity: [0.2, 0.5, 0.2] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400/50" />
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Top-left status chip */}
              <div className="absolute top-3 left-3">
                <motion.div
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
                  style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
                >
                  {scannerReady && scanState === 'idle' ? (
                    <>
                      <motion.span
                        className="w-1.5 h-1.5 rounded-full bg-green-400"
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1.4, repeat: Infinity }}
                      />
                      <span className="text-white/70">스캔 대기 중</span>
                    </>
                  ) : (
                    <>
                      <span className={`w-1.5 h-1.5 rounded-full ${scannerReady ? 'bg-white/40' : 'bg-amber-400'}`} />
                      <span className="text-white/50">{scannerReady ? '처리 중' : '대기'}</span>
                    </>
                  )}
                </motion.div>
              </div>

              {/* Corner device info */}
              <div className="absolute bottom-3 right-3 text-right">
                <p className="text-xs text-white/25 tabular-nums">{timeStr.slice(0, 5)}</p>
              </div>
            </div>
          </div>

          {/* Instruction text */}
          <div className="text-center space-y-1">
            <p className="text-sm text-white/60">
              {scannerReady
                ? scanState === 'idle'
                  ? 'QR 코드를 카메라 인식 영역에 비춰주세요'
                  : 'QR 코드를 처리하고 있습니다...'
                : scanMessage}
            </p>
            {scannerStatus === 'permission-denied' || scannerStatus === 'error' ? (
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1.5 mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
              >
                <RefreshCw size={12} />
                다시 시도
              </button>
            ) : null}
          </div>
        </div>

        {/* Right panel */}
        <div
          className="lg:w-72 border-t lg:border-t-0 lg:border-l flex flex-col"
          style={{ borderColor: 'rgba(255,255,255,0.07)' }}
        >
          {/* Stats */}
          <div className="px-4 py-4 grid grid-cols-3 gap-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <StatMini label="인증 기록" value={recentScans.length} color="text-white/70" />
            <StatMini label="출석" value={presentCount} color="text-green-400" />
            <StatMini label="지각" value={lateCount} color="text-amber-400" />
          </div>

          {/* Attendance progress */}
          <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/40">출석 현황</span>
              <span className="text-xs text-white/50">{recentScans.length}건</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-500"
                style={{ width: recentScans.length ? '100%' : '0%' }}
              />
            </div>
          </div>

          {/* Recent scans */}
          <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-medium text-white/40 uppercase tracking-wide">최근 인증</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            <AnimatePresence initial={false}>
              {recentScans.map((scan, i) => (
                <motion.div
                  key={`${scan.name}-${scan.time}-${i}`}
                  initial={{ opacity: 0, y: -16, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                >
                  <div
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${scan.status === 'present' ? 'bg-green-500' : 'bg-amber-500'}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/85 truncate">{scan.name}</p>
                      <p className="text-xs text-white/35">{scan.class} · {scan.number}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-white/50 tabular-nums">{scan.time}</p>
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        {scan.qr ? (
                          <Shield size={9} className="text-green-400/60" />
                        ) : (
                          <ShieldOff size={9} className="text-white/20" />
                        )}
                        <span className={`text-xs ${scan.status === 'present' ? 'text-green-400/70' : 'text-amber-400/70'}`}>
                          {scan.status === 'present' ? '출석' : '지각'}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Result overlay */}
      <AnimatePresence>
        {scanState !== 'idle' && (
          <ResultOverlay
            state={scanState}
            student={lastScan}
            message={scanMessage}
            dismissProgress={dismissProgress}
            onDismiss={() => setScanState('idle')}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function errorToScanState(error: unknown): Exclude<ScanState, 'idle' | 'success' | 'late'> {
  if (error instanceof ApiError) {
    if (error.code === 'DUPLICATE_ATTENDANCE') return 'duplicate'
    if (error.code === 'QR_EXPIRED') return 'expired'
    return 'error'
  }
  return 'error'
}

function CameraStatus({ status, message }: { status: ScannerStatus; message: string }) {
  const Icon = status === 'insecure' ? Lock : status === 'checking' || status === 'starting' ? Camera : AlertTriangle
  const isBusy = status === 'checking' || status === 'starting'
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/85 px-8 text-center">
      <div className="flex max-w-xs flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5">
          {isBusy ? (
            <RefreshCw size={24} className="animate-spin text-white/60" />
          ) : (
            <Icon size={24} className="text-amber-300" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-white/80">
            {isBusy ? '카메라 준비 중' : '스캔을 시작할 수 없습니다'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-white/45">{message}</p>
        </div>
      </div>
    </div>
  )
}

function ScanCorner({ pos, active }: { pos: 'tl' | 'tr' | 'bl' | 'br'; active: boolean }) {
  const base: Record<string, number | string> = { position: 'absolute', width: 24, height: 24 }
  const borders = {
    tl: { top: 0, left: 0, borderTop: '2px solid', borderLeft: '2px solid', borderTopLeftRadius: 3 },
    tr: { top: 0, right: 0, borderTop: '2px solid', borderRight: '2px solid', borderTopRightRadius: 3 },
    bl: { bottom: 0, left: 0, borderBottom: '2px solid', borderLeft: '2px solid', borderBottomLeftRadius: 3 },
    br: { bottom: 0, right: 0, borderBottom: '2px solid', borderRight: '2px solid', borderBottomRightRadius: 3 },
  }
  return (
    <motion.div
      style={{ ...base, ...borders[pos], borderColor: active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)' }}
      animate={active ? { opacity: [0.7, 1, 0.7] } : { opacity: 0.2 }}
      transition={{ duration: 2, repeat: active ? Infinity : 0 }}
    />
  )
}

function ResultOverlay({
  state,
  student,
  message,
  dismissProgress,
  onDismiss,
}: {
  state: Exclude<ScanState, 'idle'>
  student: RecentScan | null
  message: string
  dismissProgress: number
  onDismiss: () => void
}) {
  const cfg = RESULT_CONFIG[state]
  const Icon = cfg.icon

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: `radial-gradient(ellipse 80% 80% at 50% 50%, ${cfg.accentLight} 0%, rgba(2,6,23,0.94) 100%)`,
        backdropFilter: 'blur(12px)',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      onClick={onDismiss}
    >
      <motion.div
        className="flex flex-col items-center gap-5 text-center px-8 max-w-sm"
        initial={{ scale: 0.88, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: -10 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {/* Big icon */}
        <motion.div
          className="relative"
          initial={{ scale: 0.6 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.05, type: 'spring', stiffness: 300, damping: 20 }}
        >
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center"
            style={{
              background: `${cfg.accent}18`,
              border: `1.5px solid ${cfg.accent}40`,
              boxShadow: `0 0 40px ${cfg.accent}30`,
            }}
          >
            <Icon size={44} style={{ color: cfg.accent }} strokeWidth={1.5} />
          </div>
          {/* Pulse ring */}
          {(state === 'success' || state === 'late') && (
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ border: `1px solid ${cfg.accent}50` }}
              animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
            />
          )}
        </motion.div>

        {/* Result label */}
        <div className="space-y-1">
          <p
            className="text-3xl font-medium"
            style={{ color: cfg.accent }}
          >
            {cfg.label}
          </p>
          {state === 'success' && (
            <p className="text-white/50 text-sm">QR 코드 + GPS 인증 완료</p>
          )}
          {state === 'late' && (
            <p className="text-white/50 text-sm">지각 처리 — QR 코드 인증됨</p>
          )}
          {state === 'duplicate' && (
            <p className="text-white/50 text-sm">{message || '이미 출석 처리된 학생입니다'}</p>
          )}
          {state === 'expired' && (
            <p className="text-white/50 text-sm">{message || '학생에게 앱을 새로고침하도록 안내하세요'}</p>
          )}
          {state === 'error' && (
            <p className="text-white/50 text-sm">{message || '이 시스템의 출석 QR 코드가 아닙니다'}</p>
          )}
        </div>

        {/* Student info card */}
        {student && (
          <motion.div
            className="w-full rounded-2xl p-4 space-y-3"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <p className="text-xl font-medium text-white">{student.name}</p>
                <p className="text-sm text-white/50 mt-0.5">
                  {student.class} · {student.number}
                </p>
              </div>
              <span
                className={`text-sm font-medium border rounded-full px-3 py-1 ${cfg.badge.bg} ${cfg.badge.text}`}
              >
                {cfg.badge.label}
              </span>
            </div>

            <div
              className="border-t pt-3 grid grid-cols-2 gap-2"
              style={{ borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <DetailRow label="인증 시각" value={student.time} />
              <DetailRow label="GPS 인증" value="성공" valueColor="text-green-400" />
              <DetailRow label="인증 방식" value="QR" />
              <DetailRow label="처리 결과" value={cfg.badge.label} />
            </div>
          </motion.div>
        )}

        {/* Auto-dismiss progress bar */}
        <div className="w-full space-y-1.5">
          <div className="h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: cfg.accent, width: `${dismissProgress}%`, transition: 'width 0.04s linear' }}
            />
          </div>
          <p className="text-xs text-white/25">화면을 터치하면 닫힙니다</p>
        </div>
      </motion.div>
    </motion.div>
  )
}

function StatMini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center rounded-xl py-2.5 px-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
      <p className={`text-xl font-medium tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-white/30 mt-0.5">{label}</p>
    </div>
  )
}

function DetailRow({ label, value, valueColor = 'text-white/70' }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="text-left">
      <p className="text-xs text-white/30">{label}</p>
      <p className={`text-sm font-medium ${valueColor}`}>{value}</p>
    </div>
  )
}
