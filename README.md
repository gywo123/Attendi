# Attendi

GPS 기반 QR 인증을 사용하는 학교 출석체크 웹앱입니다. 학생이 학교 위치 안에 있을 때만 휴대폰에 출석용 QR 코드가 표시되고, 교사 또는 인증 기기가 QR을 스캔하면 출석이 처리됩니다.

## 프로젝트 목표

학교 수업, 동아리, 방과후 활동 등에서 사용할 수 있는 간단하고 안정적인 출석체크 시스템을 만드는 것이 목표입니다.

주요 목표는 다음과 같습니다.

- GPS 기반 QR 인증으로 대리 출석과 출석 후 이탈을 줄입니다.
- 학생, 교사, 관리자 권한을 분리해 출석 데이터를 안전하게 관리합니다.
- 출석, 지각, 결석, 조퇴, 공결, 병결 상태를 기록하고 조회합니다.
- 교사는 대시보드, 수동 출석 처리, 학생 관리, 출석 기록 조회를 사용할 수 있습니다.
- 학생은 학교 위치 안에서만 QR 코드를 발급받을 수 있습니다.
- QR 토큰은 짧은 만료 시간과 1회 사용 제한으로 재사용을 방지합니다.

## 현재 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | React, Vite, PWA |
| Backend | Node.js, Express |
| Database | MongoDB Atlas |
| Auth | Google OAuth, 교사 이메일 로그인, HttpOnly Cookie 세션 |
| QR | `qrcode`, `html5-qrcode` |
| API | REST |
| 배포 | Vercel 기준 프론트/백엔드 분리 배포 |

## 폴더 구조

```text
Attendi/
├─ front/                  # React + Vite 프론트엔드
├─ server/                 # Express REST API 서버
├─ README.md               # 프로젝트 통합 문서
├─ 실행_가이드.md          # 이전 실행 가이드
├─ API_명세서_정리본.md    # 이전 API 정리 문서
└─ 출석체크_프로그램_개발계획.md
```

## 주요 기능

### 학생

- Google OAuth 기반 가입 신청 및 로그인
- 관리자 또는 교사 승인 후 출석 기능 사용
- GPS 위치 확인
- 학교 구역 안에 있을 때만 QR 코드 발급
- QR 만료 시간 표시 및 자동 갱신
- 학교 밖, 출석 마감, 위치 권한 거부 상태 구분 표시

### 교사

- 대시보드에서 오늘 출석 현황 확인
- 반별 학생 출석 상태 확인
- 수동 출석 처리
- 출석, 지각, 결석, 조퇴, 공결, 병결 처리
- 학생 목록 관리
- 학생 CSV 업로드 및 다운로드
- 출석 기록 날짜별/반별 조회
- CSV 다운로드
- QR 스캔 또는 인증 기기 관리

### 관리자

- 교사 계정 승인, 비활성화, 삭제
- 학생 계정 승인 및 관리
- 학교 GPS 위치와 허용 반경 설정
- 기기 토큰 발급, 비활성화, 활성화, 삭제
- DB 백업 및 복구

## 출석 인증 흐름

1. 학생이 로그인합니다.
2. 브라우저가 학생 휴대폰의 GPS 권한을 요청합니다.
3. 서버는 학교 기준 위치와 학생 위치를 비교합니다.
4. 학생이 학교 반경 안에 있으면 QR 토큰을 발급합니다.
5. QR 토큰은 짧은 시간 후 만료됩니다.
6. 교사 또는 인증 기기가 QR 코드를 스캔합니다.
7. 서버가 QR 토큰의 만료, 중복 사용, 학생 정보, 반 정보를 검증합니다.
8. 검증에 성공하면 출석 기록이 저장됩니다.

## 출석 상태

| 상태 | 값 | 설명 |
| --- | --- | --- |
| 출석 | `present` | 정상 출석 |
| 지각 | `late` | 지각 기준 시간 이후 출석 |
| 결석 | `absent` | 출석하지 않음 |
| 조퇴 | `early_leave` | 일찍 감 |
| 공결 | `excused` | 인정 결석 또는 공식 사유 |
| 병결 | `sick` | 질병 사유 결석 |

## 로컬 실행

### 1. 백엔드 실행

```bash
cd server
npm install
npm run dev
```

기본 백엔드 주소:

```text
http://localhost:4000/api
```

헬스체크:

```text
http://localhost:4000/api/health
```

### 2. 프론트엔드 실행

```bash
cd front
npm install
npm run dev
```

기본 프론트 주소:

```text
http://localhost:5173
```

## 환경 변수

### server/.env

```env
PORT=4000
CLIENT_URL=http://localhost:5173
CLIENT_URLS=http://localhost:5173,http://127.0.0.1:5173
JWT_SECRET=change-this-secret
MONGODB_URI=mongodb+srv://...
DB_NAME=attendi

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
```

루트 폴더의 `client_secret*.json` 파일도 백엔드가 자동으로 읽을 수 있습니다. 단, 이 파일은 민감 정보이므로 Git에 올리면 안 됩니다.

### front 환경 변수

```env
VITE_API_BASE_URL=http://localhost:4000/api
```

배포 환경에서는 실제 백엔드 주소를 넣습니다.

```env
VITE_API_BASE_URL=https://attendiserver.vercel.app/api
```

## 초기 관리자 계정

초기 실행 시 기본 관리자 계정이 생성됩니다.

```text
admin@school.kr / 1234
```

운영 환경에서는 반드시 로그인 후 비밀번호 또는 계정 정책을 변경해야 합니다.

## Google OAuth 설정

Google Cloud Console에서 OAuth 웹 애플리케이션을 생성한 뒤 다음 값을 등록합니다.

로컬 개발용 승인된 리디렉션 URI:

```text
http://localhost:4000/api/auth/google/callback
```

배포용 승인된 리디렉션 URI:

```text
https://백엔드주소/api/auth/google/callback
```

승인된 JavaScript 원본:

```text
http://localhost:5173
https://프론트주소
```

## 배포

현재 구조는 프론트와 백엔드를 분리해서 배포하는 방식입니다.

### 프론트엔드

Vercel 또는 Cloudflare Pages에서 `front` 폴더를 루트로 설정합니다.

```text
Root Directory: front
Build Command: npm run build
Output Directory: dist
Environment Variable: VITE_API_BASE_URL=https://백엔드주소/api
```

### 백엔드

Vercel에서 `server` 폴더를 루트로 설정합니다.

```text
Root Directory: server
Install Command: npm install
Build Command: 비워둠
Output Directory: 비워둠
Start Command: npm start
```

필수 환경 변수:

```env
CLIENT_URL=https://프론트주소
CLIENT_URLS=https://프론트주소
JWT_SECRET=운영용_긴_랜덤_문자열
MONGODB_URI=mongodb+srv://...
DB_NAME=attendi
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://백엔드주소/api/auth/google/callback
```

## 주요 API 요약

공통 응답 형식:

```json
{
  "success": true,
  "data": {}
}
```

실패 응답 형식:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "에러 메시지"
  }
}
```

### 인증

| 메서드 | URL | 설명 |
| --- | --- | --- |
| GET | `/api/auth/google` | Google OAuth 시작 |
| GET | `/api/auth/google/callback` | Google OAuth 콜백 |
| GET | `/api/auth/me` | 현재 로그인 사용자 조회 |
| POST | `/api/auth/logout` | 로그아웃 |
| POST | `/api/auth/teacher/login` | 교사/관리자 이메일 로그인 |
| POST | `/api/auth/teacher/signup` | 교사 가입 신청 |
| POST | `/api/auth/student/signup` | 학생 가입 신청 |
| POST | `/api/device/login` | 인증 기기 로그인 |

### 학생 및 교사 관리

| 메서드 | URL | 설명 |
| --- | --- | --- |
| GET | `/api/students` | 학생 목록 조회 |
| POST | `/api/students` | 학생 추가 |
| PATCH | `/api/students/:id` | 학생 수정, 활성화, 비활성화 |
| DELETE | `/api/students/:id` | 학생 삭제 |
| POST | `/api/students/import` | 학생 CSV 업로드 |
| GET | `/api/students/export.csv` | 학생 CSV 다운로드 |
| GET | `/api/student-applications` | 학생 가입 신청 목록 |
| PATCH | `/api/student-applications/:id` | 학생 가입 승인 또는 거절 |
| GET | `/api/teachers` | 교사 목록 조회 |
| POST | `/api/teachers` | 교사 추가 |
| PATCH | `/api/teachers/:id` | 교사 수정, 승인, 비활성화 |
| DELETE | `/api/teachers/:id` | 교사 삭제 |

### GPS 및 QR

| 메서드 | URL | 설명 |
| --- | --- | --- |
| GET | `/api/school-location` | 학교 GPS 위치 조회 |
| PUT | `/api/school-location` | 학교 GPS 위치 설정 |
| POST | `/api/location/verify` | 현재 위치 검증 |
| POST | `/api/qr-sessions` | 학생 QR 발급 |
| POST | `/api/qr-sessions/verify` | QR 스캔 검증 및 출석 처리 |

### 출석

| 메서드 | URL | 설명 |
| --- | --- | --- |
| GET | `/api/attendance/summary` | 일일 출석 요약 |
| GET | `/api/attendance/weekly-summary` | 주간 출석률 |
| GET | `/api/attendance` | 출석 기록 조회 |
| GET | `/api/attendance/export.csv` | 출석 기록 CSV 다운로드 |
| POST | `/api/attendance/manual` | 수동 출석 처리 |
| GET | `/api/attendance/policy` | 출석 정책 조회 |
| PUT | `/api/attendance/policy` | 기본 출석 정책 수정 |
| PUT | `/api/classes/:id/attendance-policy` | 반별 출석 정책 수정 |
| POST | `/api/attendance/close` | 출석 마감 |
| POST | `/api/attendance/reopen` | 출석 마감 취소 |

### 기기 및 운영

| 메서드 | URL | 설명 |
| --- | --- | --- |
| GET | `/api/device-tokens` | 기기 토큰 목록 |
| POST | `/api/device-tokens` | 기기 토큰 발급 |
| PATCH | `/api/device-tokens/:id` | 기기 토큰 활성화/비활성화 |
| DELETE | `/api/device-tokens/:id` | 기기 토큰 삭제 |
| GET | `/api/admin/backup` | DB 백업 다운로드 |
| POST | `/api/admin/restore` | DB 복구 |
| GET | `/api/health` | 서버 상태 확인 |

## 보안 설계

- 인증 토큰은 URL에 노출하지 않고 HttpOnly Cookie 기반으로 처리합니다.
- Google OAuth `state`는 랜덤 nonce와 서버 서명으로 검증합니다.
- OAuth nonce는 HttpOnly Cookie와 callback state를 함께 비교합니다.
- 보호 API는 인증 없는 요청을 차단합니다.
- 허용되지 않은 HTTP 메서드, 긴 쿼리, 잘못된 Authorization 헤더, JSON이 아닌 요청 바디를 차단합니다.
- QR 토큰 원문은 DB에 저장하지 않고 해시값을 저장합니다.
- 기기 토큰은 최초 발급 시에만 원문을 보여주고 이후에는 마스킹합니다.
- 로그인, 가입, OAuth 진입, 쓰기 요청에 rate limit을 적용합니다.
- 프론트에는 CSP, Referrer-Policy, X-Frame-Options, X-Content-Type-Options, Permissions-Policy 헤더를 적용합니다.

## 성능 개선

- MongoDB 인덱스 생성은 백그라운드에서 처리해 콜드 스타트 지연을 줄입니다.
- 초기 데이터 생성 여부는 `appMeta`로 확인해 반복 초기화 비용을 줄입니다.
- 프론트 GET 요청은 짧은 메모리 캐시를 사용합니다.
- 교사 화면 탭은 한 번 방문한 화면을 유지해 다시 들어갈 때 즉시 표시합니다.
- 저장, 수정, 삭제 요청이 발생하면 캐시와 숨겨진 탭 상태를 정리해 오래된 데이터 표시를 방지합니다.

## 데이터 모델 요약

| 컬렉션 | 설명 |
| --- | --- |
| `schools` | 학교 위치, GPS 반경 |
| `classes` | 반 정보 |
| `students` | 학생 정보 |
| `studentApplications` | 학생 가입 신청 |
| `teachers` | 교사, 관리자 계정 |
| `deviceTokens` | 인증 기기 토큰 |
| `qrSessions` | QR 발급 세션 |
| `attendanceRecords` | 출석 기록 |
| `attendancePolicies` | 기본 출석 정책 |
| `classAttendancePolicies` | 반별 출석 정책 |
| `attendanceClosures` | 날짜별 출석 마감 |
| `counters` | 자동 증가 ID 관리 |

## 테스트 체크리스트

- 관리자 로그인
- 교사 가입 신청 및 승인
- 학생 가입 신청 및 승인
- 학생 CSV 업로드
- 학생 활성화, 비활성화, 삭제 분리
- 학교 위치 설정
- 학교 위치 안/밖 QR 발급 여부 확인
- QR 만료 확인
- QR 중복 사용 차단 확인
- 수동 출석 처리 저장 확인
- 출석, 지각, 결석, 조퇴, 공결, 병결 상태 확인
- 출석 기록 조회 및 CSV 다운로드
- 기기 토큰 발급, 비활성화, 활성화, 삭제 확인
- DB 백업 및 복구 확인

## 주의 사항

- GPS는 환경에 따라 오차가 있으므로 학교 반경은 너무 좁게 설정하지 않는 것이 좋습니다.
- GPS 조작 앱을 웹에서 완전히 막기는 어렵습니다. QR 만료, 중복 사용 방지, 교사 스캔 기록, 재인증 정책을 함께 사용해야 합니다.
- 학생 개인정보와 출석 기록을 다루므로 운영 환경에서는 강한 `JWT_SECRET`, HTTPS, 관리자 권한 관리가 필수입니다.
- `client_secret*.json`, `.env`, MongoDB URI 같은 민감 정보는 Git에 올리면 안 됩니다.
