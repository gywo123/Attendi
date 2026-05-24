import { useEffect, useState, type ReactNode } from 'react'
import {
  Plus,
  Copy,
  Trash2,
  Check,
  RefreshCw,
  Scan,
  Clock,
  Shield,
  ShieldOff,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { apiFetch } from '../lib/api'

type TokenStatus = 'active' | 'revoked' | 'expired'

type DeviceToken = {
  id: string
  name: string
  location: string
  token: string
  createdAt: string
  lastUsed: string | null
  status: TokenStatus
  usageCount: number
}

type ApiDeviceToken = {
  id: number
  token: string
  deviceName: string | null
  location: string | null
  revokedAt: string | null
  lastUsedAt: string | null
  createdAt: string
  usageCount?: number
}

function formatDateTime(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function mapDeviceToken(row: ApiDeviceToken): DeviceToken {
  return {
    id: String(row.id),
    name: row.deviceName || '출석 인식기',
    location: row.location || '미지정',
    token: row.token,
    createdAt: formatDateTime(row.createdAt) || '',
    lastUsed: formatDateTime(row.lastUsedAt),
    status: row.revokedAt ? 'revoked' : 'active',
    usageCount: row.usageCount || 0,
  }
}

export function DeviceTokensPage() {
  const [tokens, setTokens] = useState<DeviceToken[]>([])
  const [showModal, setShowModal] = useState(false)
  const [generatedResult, setGeneratedResult] = useState<DeviceToken | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false
    async function loadTokens() {
      try {
        const rows = await apiFetch<ApiDeviceToken[]>('/device-tokens')
        if (!ignore) {
          setTokens(rows.map(mapDeviceToken))
          setError('')
        }
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : '기기 토큰을 불러오지 못했습니다.')
      }
    }
    loadTokens()
    return () => { ignore = true }
  }, [])

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleRevoke = async (id: string) => {
    try {
      const revoked = await apiFetch<ApiDeviceToken>(`/device-tokens/${id}`, { method: 'DELETE' })
      setTokens((prev) => prev.map((t) => (t.id === id ? mapDeviceToken(revoked) : t)))
      setRevokeConfirm(null)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '토큰 취소에 실패했습니다.')
    }
  }

  const handleGenerate = async (name: string, location: string) => {
    try {
      const created = await apiFetch<ApiDeviceToken>('/device-tokens', {
        method: 'POST',
        body: JSON.stringify({ deviceName: name || '새 기기', location: location || '미지정' }),
      })
      const newToken = mapDeviceToken(created)
      setTokens((prev) => [newToken, ...prev])
      setGeneratedResult(newToken)
      setShowModal(false)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '토큰 발급에 실패했습니다.')
    }
  }

  const active = tokens.filter((t) => t.status === 'active').length
  const todayLabel = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const usedToday = tokens.filter((t) => t.lastUsed?.startsWith(todayLabel)).length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-gray-900">기기 관리</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              인식 기기에 연결할 토큰을 발급하고 관리합니다
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 bg-gray-900 text-white rounded-xl px-4 py-2.5 text-sm hover:bg-gray-700 transition-colors shadow-sm"
          >
            <Plus size={14} />
            새 토큰 발급
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="활성 기기"
            value={active}
            icon={<Shield size={15} className="text-green-600" />}
            iconBg="bg-green-100"
            valueColor="text-green-700"
          />
          <StatCard
            label="전체 토큰"
            value={tokens.length}
            icon={<Scan size={15} className="text-gray-600" />}
            iconBg="bg-gray-100"
            valueColor="text-gray-900"
          />
          <StatCard
            label="오늘 인증 수"
            value={usedToday}
            icon={<CheckCircle2 size={15} className="text-blue-600" />}
            iconBg="bg-blue-100"
            valueColor="text-blue-700"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* How it works */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={14} className="text-gray-500" />
            <p className="text-sm font-medium text-gray-700">기기 연결 방법</p>
          </div>
          <div className="grid sm:grid-cols-4 gap-3">
            {[
              { n: 1, text: '새 토큰 발급 버튼을 클릭합니다' },
              { n: 2, text: '기기 이름과 위치를 입력합니다' },
              { n: 3, text: '발급된 토큰을 복사합니다' },
              { n: 4, text: '인식기기 로그인 화면에 토큰을 입력합니다' },
            ].map(({ n, text }) => (
              <div key={n} className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-xs flex items-center justify-center shrink-0 mt-0.5 font-medium">
                  {n}
                </span>
                <p className="text-xs text-gray-500 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Token list */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">토큰 목록</p>
            <span className="text-xs text-gray-400">{tokens.length}개</span>
          </div>

          <div className="divide-y divide-gray-50">
            {tokens.map((t) => (
              <TokenRow
                key={t.id}
                token={t}
                copied={copied}
                revokeConfirm={revokeConfirm}
                onCopy={handleCopy}
                onRevoke={handleRevoke}
                onRevokeConfirm={setRevokeConfirm}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Generate modal */}
      <AnimatePresence>
        {showModal && (
          <GenerateModal
            onClose={() => setShowModal(false)}
            onGenerate={handleGenerate}
          />
        )}
      </AnimatePresence>

      {/* Generated result overlay */}
      <AnimatePresence>
        {generatedResult && (
          <GeneratedResultOverlay
            token={generatedResult}
            onClose={() => setGeneratedResult(null)}
            onCopy={handleCopy}
            copied={copied}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function TokenRow({
  token,
  copied,
  revokeConfirm,
  onCopy,
  onRevoke,
  onRevokeConfirm,
}: {
  token: DeviceToken
  copied: string | null
  revokeConfirm: string | null
  onCopy: (text: string, id: string) => void
  onRevoke: (id: string) => void
  onRevokeConfirm: (id: string | null) => void
}) {
  const isActive = token.status === 'active'

  return (
    <div className="px-4 py-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
            isActive ? 'bg-green-100' : 'bg-gray-100'
          }`}
        >
          {isActive ? (
            <Scan size={16} className="text-green-600" />
          ) : (
            <ShieldOff size={16} className="text-gray-400" />
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {/* Top row */}
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-900">{token.name}</p>
            <StatusBadge status={token.status} />
          </div>

          <p className="text-xs text-gray-400">{token.location}</p>

          {/* Token display */}
          <div className="flex items-center gap-2">
            <code
              className={`px-3 py-1.5 rounded-lg text-sm font-mono tracking-widest border ${
                isActive
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-gray-100 text-gray-400 border-gray-200 line-through'
              }`}
            >
              {token.token}
            </code>
            {isActive && (
              <button
                onClick={() => onCopy(token.token, token.id)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {copied === token.id ? (
                  <>
                    <Check size={12} className="text-green-500" />
                    복사됨
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    복사
                  </>
                )}
              </button>
            )}
          </div>

          {/* Meta */}
          <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
            <span className="flex items-center gap-1">
              <Clock size={10} />
              발급: {token.createdAt}
            </span>
            <span>
              마지막 사용: {token.lastUsed ?? '없음'}
            </span>
            <span>인증 횟수: {token.usageCount}회</span>
          </div>
        </div>

        {/* Actions */}
        {isActive && (
          <div className="shrink-0">
            {revokeConfirm === token.id ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onRevoke(token.id)}
                  className="px-2.5 py-1.5 rounded-lg text-xs bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  취소 확인
                </button>
                <button
                  onClick={() => onRevokeConfirm(null)}
                  className="px-2.5 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  돌아가기
                </button>
              </div>
            ) : (
              <button
                onClick={() => onRevokeConfirm(token.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-500 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={12} />
                토큰 취소
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function GenerateModal({
  onClose,
  onGenerate,
}: {
  onClose: () => void
  onGenerate: (name: string, location: string) => void
}) {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')

  return (
    <>
      <motion.div
        className="fixed inset-0 bg-black/40 z-50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5"
          initial={{ scale: 0.94, y: 16 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.94, y: 8 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-gray-900">새 기기 토큰 발급</h3>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400"
            >
              <X size={15} />
            </button>
          </div>

          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">기기 이름</label>
              <input
                placeholder="예: 3학년 1반 교실 태블릿"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">설치 위치 (선택)</label>
              <input
                placeholder="예: 본관 3층 3학년 1반 교실"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
              />
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
            발급된 토큰은 24시간 이내에 기기에 입력해야 하며, 한 번만 표시됩니다. 안전하게 보관하세요.
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              onClick={() => onGenerate(name, location)}
              className="flex-1 py-2.5 rounded-xl text-sm bg-gray-900 text-white hover:bg-gray-700 transition-colors"
            >
              토큰 발급
            </button>
          </div>
        </motion.div>
      </motion.div>
    </>
  )
}

function GeneratedResultOverlay({
  token,
  onClose,
  onCopy,
  copied,
}: {
  token: DeviceToken
  onClose: () => void
  onCopy: (text: string, id: string) => void
  copied: string | null
}) {
  return (
    <>
      <motion.div
        className="fixed inset-0 bg-black/50 z-50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5"
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        >
          {/* Success header */}
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-green-500" />
            </div>
            <div>
              <p className="font-medium text-gray-900">토큰이 발급되었습니다</p>
              <p className="text-sm text-gray-500 mt-0.5">{token.name}</p>
            </div>
          </div>

          {/* Token display */}
          <div className="bg-gray-950 rounded-2xl p-5 text-center space-y-3">
            <p className="text-xs text-gray-500 uppercase tracking-widest">기기 토큰</p>
            <p className="text-3xl font-mono tracking-[0.3em] text-white font-medium">
              {token.token}
            </p>
            <button
              onClick={() => onCopy(token.token, `result-${token.id}`)}
              className={`flex items-center gap-2 mx-auto px-4 py-2 rounded-lg text-sm transition-all ${
                copied === `result-${token.id}`
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-white/10 text-white/80 hover:bg-white/20 border border-white/10'
              }`}
            >
              {copied === `result-${token.id}` ? (
                <><Check size={13} />복사됨</>
              ) : (
                <><Copy size={13} />클립보드에 복사</>
              )}
            </button>
          </div>

          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
            <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700 space-y-0.5">
              <p className="font-medium">이 화면을 닫으면 토큰을 다시 볼 수 없습니다.</p>
              <p>인식기기 로그인 화면에서 토큰을 입력해 기기를 연결하세요.</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl text-sm bg-gray-900 text-white hover:bg-gray-700 transition-colors"
          >
            확인 완료
          </button>
        </motion.div>
      </motion.div>
    </>
  )
}

function StatusBadge({ status }: { status: TokenStatus }) {
  const cfg = {
    active: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', label: '활성', dot: 'bg-green-500' },
    revoked: { bg: 'bg-gray-100 border-gray-200', text: 'text-gray-500', label: '취소됨', dot: 'bg-gray-400' },
    expired: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: '만료', dot: 'bg-amber-500' },
  }
  const c = cfg[status]
  return (
    <span className={`inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

function StatCard({
  label,
  value,
  icon,
  iconBg,
  valueColor,
}: {
  label: string
  value: number
  icon: ReactNode
  iconBg: string
  valueColor: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center mb-3`}>{icon}</div>
      <p className={`text-2xl font-medium ${valueColor}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
