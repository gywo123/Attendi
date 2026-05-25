import { useEffect, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  Check,
  Crosshair,
  Database,
  Download,
  Loader2,
  MapPin,
  Navigation,
  Save,
  Shield,
  Upload,
} from 'lucide-react'
import { API_BASE_URL, apiFetch, getAccessToken } from '../lib/api'

type SchoolLocation = {
  id: number
  name: string
  latitude: number
  longitude: number
  radiusMeters: number
  devBypassLocation?: boolean
}

type LocationCheck = {
  latitude: number
  longitude: number
  accuracyMeters?: number
  insideSchoolArea: boolean
}

export function SchoolSettingsPage() {
  const [form, setForm] = useState<SchoolLocation>({
    id: 1,
    name: '학교',
    latitude: 37.5012743,
    longitude: 127.039585,
    radiusMeters: 100,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [check, setCheck] = useState<LocationCheck | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)

  useEffect(() => {
    let ignore = false
    async function loadLocation() {
      try {
        const location = await apiFetch<SchoolLocation>('/school-location')
        if (!ignore) {
          setForm(location)
          setError('')
        }
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : '학교 위치 정보를 불러오지 못했습니다.')
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    loadLocation()
    return () => { ignore = true }
  }, [])

  const set = (key: keyof SchoolLocation) => (value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: key === 'name' ? value : Number(value),
    }))
  }

  const save = async () => {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const saved = await apiFetch<SchoolLocation>('/school-location', {
        method: 'PUT',
        body: JSON.stringify(form),
      })
      setForm(saved)
      setMessage('학교 GPS 기준 위치가 저장되었습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : '학교 위치 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const useCurrentAsSchool = async () => {
    setChecking(true)
    setError('')
    try {
      const position = await readPosition()
      setForm((prev) => ({
        ...prev,
        latitude: roundCoord(position.latitude),
        longitude: roundCoord(position.longitude),
      }))
      setMessage('현재 위치를 학교 기준 좌표로 입력했습니다. 저장을 눌러 적용하세요.')
    } catch (err) {
      setError(err instanceof Error ? err.message : '현재 위치를 읽지 못했습니다.')
    } finally {
      setChecking(false)
    }
  }

  const testCurrentLocation = async () => {
    setChecking(true)
    setError('')
    setMessage('')
    try {
      const position = await readPosition()
      const result = await apiFetch<{ insideSchoolArea: boolean }>('/location/verify', {
        method: 'POST',
        body: JSON.stringify(position),
      })
      setCheck({ ...position, insideSchoolArea: result.insideSchoolArea })
    } catch (err) {
      setError(err instanceof Error ? err.message : '현재 위치 인증 테스트에 실패했습니다.')
    } finally {
      setChecking(false)
    }
  }

  const downloadBackup = async () => {
    setBackupBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`${API_BASE_URL}/admin/backup`, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error?.message || 'DB 백업을 생성하지 못했습니다.')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `attendi-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setMessage('DB 백업 파일을 다운로드했습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DB 백업에 실패했습니다.')
    } finally {
      setBackupBusy(false)
    }
  }

  const restoreBackupFile = async (file?: File) => {
    if (!file) return
    if (!window.confirm('현재 DB를 백업 파일 기준으로 복구합니다. 계속할까요?')) return
    setBackupBusy(true)
    setError('')
    setMessage('')
    try {
      const backup = JSON.parse(await file.text())
      const result = await apiFetch<{ restoredAt: string }>('/admin/restore', {
        method: 'POST',
        body: JSON.stringify({ confirm: 'RESTORE_ATTENDI', mode: 'replace', backup }),
      })
      setMessage(`DB 복구가 완료되었습니다. (${new Date(result.restoredAt).toLocaleString('ko-KR')})`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DB 복구에 실패했습니다.')
    } finally {
      setBackupBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">
        <Loader2 size={16} className="animate-spin mr-2" />
        GPS 설정 불러오는 중...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-gray-900">GPS 설정</h1>
            <p className="text-sm text-gray-500 mt-0.5">QR 발급을 허용할 학교 위치와 반경을 관리합니다</p>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 bg-gray-900 text-white rounded-xl px-4 py-2.5 text-sm hover:bg-gray-700 transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            저장
          </button>
        </div>

        {form.devBypassLocation && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
            <Shield size={15} className="text-blue-500 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">
              개발 모드에서는 위치 인증이 우회됩니다. 실제 운영에서는 서버 `.env`의 `DEV_BYPASS_LOCATION=false`로 바꾸면 저장한 반경이 적용됩니다.
            </p>
          </div>
        )}

        {error && <Notice tone="red" text={error} />}
        {message && <Notice tone="green" text={message} />}

        <div className="grid md:grid-cols-[1fr_280px] gap-5">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-gray-900">학교 인증 구역</h3>
              <p className="text-sm text-gray-400 mt-0.5">학생 휴대폰이 이 구역 안에 있을 때만 QR이 발급됩니다</p>
            </div>
            <div className="p-5 space-y-4">
              <FormField label="학교 이름">
                <input value={form.name} onChange={(e) => set('name')(e.target.value)} className={inputClass} />
              </FormField>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="위도">
                  <input type="number" step="0.000001" value={form.latitude} onChange={(e) => set('latitude')(e.target.value)} className={inputClass} />
                </FormField>
                <FormField label="경도">
                  <input type="number" step="0.000001" value={form.longitude} onChange={(e) => set('longitude')(e.target.value)} className={inputClass} />
                </FormField>
              </div>
              <FormField label="허용 반경(m)">
                <input type="number" min={10} max={1000} value={form.radiusMeters} onChange={(e) => set('radiusMeters')(e.target.value)} className={inputClass} />
              </FormField>
              <div className="flex flex-col sm:flex-row gap-2">
                <button onClick={useCurrentAsSchool} disabled={checking} className={secondaryButton}>
                  <Crosshair size={14} />
                  현재 위치를 기준으로 입력
                </button>
                <button onClick={testCurrentLocation} disabled={checking} className={secondaryButton}>
                  {checking ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
                  현재 위치 인증 테스트
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
              <MapPin size={18} className="text-gray-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">현재 설정</p>
              <p className="text-xs text-gray-400 mt-1">좌표와 반경은 서버 MongoDB에 저장됩니다.</p>
            </div>
            <div className="space-y-2 text-sm">
              <Row label="학교" value={form.name} />
              <Row label="위도" value={String(form.latitude)} />
              <Row label="경도" value={String(form.longitude)} />
              <Row label="반경" value={`${form.radiusMeters}m`} />
            </div>
            {check && (
              <div className={`rounded-xl border p-3 ${check.insideSchoolArea ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-2">
                  {check.insideSchoolArea
                    ? <Check size={14} className="text-green-600" />
                    : <AlertCircle size={14} className="text-red-600" />}
                  <span className={`text-sm font-medium ${check.insideSchoolArea ? 'text-green-700' : 'text-red-700'}`}>
                    {check.insideSchoolArea ? '인증 구역 안' : '인증 구역 밖'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {roundCoord(check.latitude)}, {roundCoord(check.longitude)}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
              <Database size={17} className="text-gray-600" />
            </div>
            <div>
              <h3 className="text-gray-900">운영 관리</h3>
              <p className="text-sm text-gray-400 mt-0.5">DB 백업 파일을 내려받거나 백업 JSON으로 복구합니다</p>
            </div>
          </div>
          <div className="p-5 grid sm:grid-cols-2 gap-3">
            <button onClick={downloadBackup} disabled={backupBusy} className={secondaryButton}>
              {backupBusy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              DB 백업 다운로드
            </button>
            <label className={`${secondaryButton} cursor-pointer ${backupBusy ? 'opacity-60 pointer-events-none' : ''}`}>
              <Upload size={14} />
              DB 백업 복구
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  restoreBackupFile(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900 text-right break-all">{value}</span>
    </div>
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

function readPosition(): Promise<{ latitude: number; longitude: number; accuracyMeters?: number }> {
  if (!navigator.geolocation) return Promise.reject(new Error('이 브라우저는 위치 정보를 지원하지 않습니다.'))
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracyMeters: pos.coords.accuracy,
      }),
      () => reject(new Error('브라우저 위치 권한이 필요합니다.')),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 },
    )
  })
}

function roundCoord(value: number) {
  return Number(value.toFixed(6))
}

const inputClass =
  'w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100'

const secondaryButton =
  'flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60'
