# 출석체크 웹앱 API 명세서 정리본

## 1. API 개요

이 API는 학교 출석체크 웹앱에서 학생, 교사, 반, 학생 정보, GPS 기반 QR 인증, 출석 기록을 관리하기 위해 사용한다.

핵심 출석 흐름은 다음과 같다.

1. 학생이 학교 이메일 소셜 로그인으로 가입 또는 로그인한다.
2. 학생 계정에 학번과 반 정보를 연동한다.
3. 학생 휴대폰 브라우저가 GPS 위치를 확인한다.
4. 프론트엔드는 학교 기준 위치와 학생 위치를 비교해 1차로 학교 구역 여부를 판단한다.
5. 학생이 학교 구역 안에 있으면 서버에 QR 발급을 요청한다.
6. 서버는 QR 토큰을 발급하고, 토큰 만료 시간과 사용 여부를 관리한다.
7. 교사가 카메라 또는 전용 기기로 QR을 스캔한다.
8. 서버가 QR 토큰의 유효성, 만료 여부, 중복 사용 여부를 검증한다.
9. 검증에 성공하면 출석 기록을 저장한다.

프론트엔드 위치 검증은 사용자 경험을 위한 1차 검증이다. 보안상 중요한 판단은 서버에서 QR 토큰 검증, 만료 검증, 중복 출석 검증으로 처리한다.

## 2. 기본 정보

| 항목 | 값 |
| --- | --- |
| Base URL | `http://localhost:4000/api` |
| 데이터 형식 | JSON |
| 인증 방식 | Bearer Token |
| 문자 인코딩 | UTF-8 |
| 날짜 형식 | `YYYY-MM-DD` |
| 날짜/시간 형식 | ISO 8601 |

## 3. 공통 Request Header

| 이름 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `Authorization` | String | 조건부 | `Bearer {accessToken}` 형식. 로그인, 헬스체크 제외 대부분 필요 |
| `Content-Type` | String | 조건부 | 요청 바디가 있을 때 `application/json` |

## 4. 공통 응답 형식

### 성공

```json
{
  "success": true,
  "data": {}
}
```

### 실패

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "에러 메시지"
  }
}
```

## 5. 공통 에러 코드

| HTTP 상태 | 코드 | 설명 |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | 요청 값이 올바르지 않음 |
| 401 | `UNAUTHORIZED` | 인증 토큰 없음 또는 만료 |
| 403 | `FORBIDDEN` | 권한 없음 |
| 404 | `NOT_FOUND` | 리소스를 찾을 수 없음 |
| 409 | `DUPLICATE_ATTENDANCE` | 이미 출석 처리됨 |
| 410 | `QR_EXPIRED` | QR 토큰 만료 |
| 422 | `OUT_OF_SCHOOL_AREA` | 학교 GPS 반경 밖 |
| 429 | `TOO_MANY_REQUESTS` | 너무 많은 요청 |
| 500 | `INTERNAL_SERVER_ERROR` | 서버 내부 오류 |

## 6. 자원 모델

### User

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | Number | 사용자 ID |
| `role` | String | `student`, `teacher`, `admin` |
| `name` | String | 사용자 이름 |
| `email` | String | 학교 이메일 |

### Class

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | Number | 반 ID |
| `name` | String | 반 이름 |
| `schoolLocationId` | Number | 반에 연결된 학교 위치 ID |
| `createdAt` | String | 생성일 |

### Student

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | Number | 학생 ID |
| `userId` | Number | 사용자 ID |
| `classId` | Number | 소속 반 ID |
| `studentNumber` | String | 학번 |
| `name` | String | 학생 이름 |
| `isActive` | Boolean | 사용 여부 |
| `createdAt` | String | 생성일 |

### AttendanceRecord

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | Number | 출석 기록 ID |
| `studentId` | Number | 학생 ID |
| `classId` | Number | 반 ID |
| `date` | String | 출석 날짜 |
| `status` | String | `present`, `late`, `absent`, `early_leave` |
| `memo` | String | 비고 |
| `verifiedByQr` | Boolean | QR 인증 여부 |
| `verifiedLatitude` | Number | 인증 시 위도 |
| `verifiedLongitude` | Number | 인증 시 경도 |
| `verifiedAt` | String | 인증 시간 |
| `updatedAt` | String | 수정일 |

### QrSession

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | Number | QR 세션 ID |
| `studentId` | Number | 학생 ID |
| `classId` | Number | 반 ID |
| `tokenHash` | String | QR 토큰 해시값 |
| `expiresAt` | String | 만료 시간 |
| `usedAt` | String 또는 Null | 사용 시간 |
| `createdAt` | String | 생성일 |

### SchoolLocation

학교 위치는 MVP에서는 하나의 상수 또는 환경변수로 관리할 수 있다. 여러 학교나 캠퍼스를 지원할 경우 DB 테이블로 분리하고 `Class.schoolLocationId`로 연결한다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | Number | 학교 위치 ID |
| `name` | String | 학교 위치 이름 |
| `latitude` | Number | 기준 위도 |
| `longitude` | Number | 기준 경도 |
| `radiusMeters` | Number | 허용 반경 |

## 7. 인증 API

### 7.1 학생 소셜 로그인 및 학번 연동

학생은 학교 이메일 소셜 로그인으로 인증하고, 최초 로그인 시 학번과 반 정보를 연동한다.

| 메서드 | URL |
| --- | --- |
| POST | `/auth/student/login` |

#### Request Body

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `provider` | String | 필수 | `google`, `microsoft` 등 |
| `idToken` | String | 필수 | 소셜 로그인 제공자가 발급한 ID 토큰 |
| `studentNumber` | String | 조건부 | 최초 연동 시 학번 |
| `classId` | Number | 조건부 | 최초 연동 시 반 ID |

#### Request Example

```json
{
  "provider": "google",
  "idToken": "google.id.token",
  "studentNumber": "2024001",
  "classId": 1
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "accessToken": "student.jwt.token",
    "user": {
      "id": 1,
      "role": "student",
      "name": "김민준",
      "email": "2024001@school.kr"
    },
    "student": {
      "id": 1,
      "classId": 1,
      "studentNumber": "2024001",
      "name": "김민준"
    }
  }
}
```

### 7.2 교사 로그인

교사는 이메일과 비밀번호로 로그인한다. 프론트엔드는 비밀번호를 평문 그대로 장기 보관하지 않는다. 서버는 받은 비밀번호 또는 프론트 1차 해시값을 다시 안전한 방식으로 해싱해 DB의 해시값과 비교한다.

| 메서드 | URL |
| --- | --- |
| POST | `/auth/teacher/login` |

#### Request Body

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `email` | String | 필수 | 교사 이메일 |
| `passwordHash` | String | 필수 | 프론트에서 1차 해싱한 비밀번호 값 |

#### Request Example

```json
{
  "email": "teacher@school.kr",
  "passwordHash": "sha256-password-hash"
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "accessToken": "teacher.jwt.token",
    "user": {
      "id": 10,
      "role": "teacher",
      "name": "박철수",
      "email": "teacher@school.kr"
    }
  }
}
```

`GET /auth/me`는 로그인 응답과 중복되므로 MVP에서는 제외한다. 새로고침 후 사용자 복원이 필요하면 프론트에서 저장한 토큰을 기준으로 최소 사용자 정보를 복원하거나, 추후 별도 API로 추가한다.

## 8. 반 API

### 8.1 반 목록 조회

| 메서드 | URL |
| --- | --- |
| GET | `/classes` |

#### Response

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "3학년 1반",
      "schoolLocationId": 1,
      "createdAt": "2026-05-17T06:00:00.000Z"
    }
  ]
}
```

### 8.2 반 생성

교사 또는 관리자만 사용할 수 있다.

| 메서드 | URL |
| --- | --- |
| POST | `/classes` |

#### Request Body

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `name` | String | 필수 | 반 이름 |
| `schoolLocationId` | Number | 선택 | 연결할 학교 위치 ID |

#### Response

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "3학년 1반",
    "schoolLocationId": 1
  }
}
```

## 9. 학생 API

### 9.1 학생 목록 조회

| 메서드 | URL |
| --- | --- |
| GET | `/students` |

#### Query Parameters

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `classId` | Number | 선택 | 반 ID |
| `keyword` | String | 선택 | 이름 또는 학번 검색어 |

#### Response

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "classId": 1,
      "studentNumber": "2024001",
      "name": "김민준",
      "isActive": true
    }
  ]
}
```

### 9.2 학생 생성

교사 또는 관리자만 사용할 수 있다.

| 메서드 | URL |
| --- | --- |
| POST | `/students` |

#### Request Body

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `classId` | Number | 필수 | 반 ID |
| `studentNumber` | String | 필수 | 학번 |
| `name` | String | 필수 | 학생 이름 |

#### Response

```json
{
  "success": true,
  "data": {
    "id": 1,
    "classId": 1,
    "studentNumber": "2024001",
    "name": "김민준",
    "isActive": true
  }
}
```

### 9.3 학생 수정

| 메서드 | URL |
| --- | --- |
| PATCH | `/students/{studentId}` |

#### Request Body

```json
{
  "classId": 1,
  "studentNumber": "2024001",
  "name": "김민준",
  "isActive": true
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "id": 1,
    "classId": 1,
    "studentNumber": "2024001",
    "name": "김민준",
    "isActive": true
  }
}
```

### 9.4 학생 비활성화

실제 삭제 대신 `isActive=false` 처리한다.

| 메서드 | URL |
| --- | --- |
| DELETE | `/students/{studentId}` |

#### Response

```json
{
  "success": true,
  "data": {
    "id": 1,
    "isActive": false
  }
}
```

## 10. 학교 위치 API

### 10.1 학교 위치 조회

프론트엔드는 이 API로 학교 기준 좌표와 허용 반경을 받아 학생 휴대폰 GPS와 비교한다.

| 메서드 | URL |
| --- | --- |
| GET | `/school-location` |

#### Response

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "학교",
    "latitude": 37.5012743,
    "longitude": 127.039585,
    "radiusMeters": 100
  }
}
```

### 10.2 학교 위치 설정

교사 또는 관리자만 사용할 수 있다. 위치 이름은 건물 단위로 세분화하지 않고 MVP에서는 `학교` 정도로 단순하게 관리한다.

| 메서드 | URL |
| --- | --- |
| PUT | `/school-location` |

#### Request Body

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `latitude` | Number | 필수 | 학교 기준 위도 |
| `longitude` | Number | 필수 | 학교 기준 경도 |
| `radiusMeters` | Number | 필수 | 허용 반경 |

#### Request Example

```json
{
  "latitude": 37.5012743,
  "longitude": 127.039585,
  "radiusMeters": 100
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "학교",
    "latitude": 37.5012743,
    "longitude": 127.039585,
    "radiusMeters": 100
  }
}
```

## 11. GPS 및 QR 인증 API

### 11.1 위치 검증

학생의 현재 위치가 학교 허용 반경 안인지 확인한다. 응답은 화면 분기에 필요한 최소 값만 내려준다.

| 메서드 | URL |
| --- | --- |
| POST | `/location/verify` |

#### Request Body

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `latitude` | Number | 필수 | 학생 현재 위도 |
| `longitude` | Number | 필수 | 학생 현재 경도 |
| `accuracyMeters` | Number | 선택 | 브라우저 GPS 정확도 |

#### Response

```json
{
  "success": true,
  "data": {
    "insideSchoolArea": true
  }
}
```

### 11.2 학생용 QR 발급 및 갱신

학생 위치가 학교 반경 안이면 일회용 QR 토큰을 발급한다. 기존 QR이 있더라도 이 API를 다시 호출하면 서버가 기존 QR의 유효성, 만료 여부, 사용 여부를 확인하고 새 QR을 발급하거나 기존 유효 QR을 반환한다.

| 메서드 | URL |
| --- | --- |
| POST | `/qr-sessions` |

#### Request Body

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `classId` | Number | 필수 | 출석할 반 또는 수업 ID |
| `latitude` | Number | 필수 | 학생 현재 위도 |
| `longitude` | Number | 필수 | 학생 현재 경도 |
| `accuracyMeters` | Number | 선택 | 브라우저 GPS 정확도 |

#### Response

```json
{
  "success": true,
  "data": {
    "qrSessionId": 100,
    "qrPayload": "attendi://attendance?token=eyJhbGciOiJIUzI1NiIs...",
    "expiresAt": "2026-05-17T00:00:30.000Z",
    "expiresInSeconds": 30
  }
}
```

#### Error Response

```json
{
  "success": false,
  "error": {
    "code": "OUT_OF_SCHOOL_AREA",
    "message": "학교 인증 구역 밖에서는 QR 코드를 발급할 수 없습니다."
  }
}
```

`POST /qr-sessions/refresh`는 별도 API로 두지 않고 `POST /qr-sessions`에 통합한다.

### 11.3 교사용 QR 스캔 검증

교사가 스캔한 QR 토큰을 서버에 보내 출석 처리한다. 프론트엔드는 성공 여부만 받고, 학생 상세 정보나 최신 출석 목록은 출석 조회 API로 다시 가져온다.

| 메서드 | URL |
| --- | --- |
| POST | `/qr-sessions/verify` |

#### Request Body

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `qrPayload` | String | 필수 | QR 코드에서 읽은 전체 문자열 |
| `scannedAt` | String | 선택 | 스캔 시간. 없으면 서버 시간 사용 |

#### Response

```json
{
  "success": true,
  "data": {
    "result": "accepted"
  }
}
```

#### Error Responses

이미 출석 처리된 경우:

```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_ATTENDANCE",
    "message": "이미 출석 처리된 학생입니다."
  }
}
```

QR이 만료된 경우:

```json
{
  "success": false,
  "error": {
    "code": "QR_EXPIRED",
    "message": "만료된 QR 코드입니다."
  }
}
```

잘못된 QR인 경우:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_QR",
    "message": "유효하지 않은 QR 코드입니다."
  }
}
```

## 12. 출석 API

### 12.1 일일 출석 요약 및 최근 인증 기록 조회

교사용 대시보드와 일일 출석 현황에서 같이 사용한다. 기존 `/attendance/summary`와 `/dashboard`는 이 API로 통합한다.

| 메서드 | URL |
| --- | --- |
| GET | `/attendance/summary` |

#### Query Parameters

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `date` | String | 필수 | 조회 날짜 |
| `classId` | Number | 선택 | 반 ID |

#### Response

```json
{
  "success": true,
  "data": {
    "date": "2026-05-17",
    "classId": 1,
    "summary": {
      "total": 30,
      "present": 24,
      "late": 3,
      "absent": 2,
      "earlyLeave": 1
    },
    "recentScans": [
      {
        "studentId": 1,
        "studentName": "김민준",
        "className": "3학년 1반",
        "status": "present",
        "verifiedAt": "2026-05-17T00:08:42.000Z"
      }
    ]
  }
}
```

`GET /dashboard`는 별도 API로 두지 않는다.

### 12.2 출석 기록 목록 조회

페이지네이션 없이 조건에 맞는 출석 기록 목록을 반환한다. 데이터가 많아지면 추후 `page`, `size`를 추가한다.

| 메서드 | URL |
| --- | --- |
| GET | `/attendance` |

#### Query Parameters

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `dateFrom` | String | 선택 | 시작 날짜 |
| `dateTo` | String | 선택 | 종료 날짜 |
| `classId` | Number | 선택 | 반 ID |
| `studentId` | Number | 선택 | 학생 ID |
| `status` | String | 선택 | 출석 상태 |

#### Response

```json
{
  "success": true,
  "data": [
    {
      "id": 300,
      "studentId": 1,
      "studentName": "김민준",
      "studentNumber": "2024001",
      "classId": 1,
      "className": "3학년 1반",
      "date": "2026-05-17",
      "status": "present",
      "verifiedByQr": true,
      "verifiedAt": "2026-05-17T00:08:42.000Z"
    }
  ]
}
```

### 12.3 수동 출석 처리

QR이 안 되는 상황에서 교사가 직접 출석 상태를 입력한다.

| 메서드 | URL |
| --- | --- |
| POST | `/attendance/manual` |

#### Request Body

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `studentId` | Number | 필수 | 학생 ID |
| `classId` | Number | 필수 | 반 ID |
| `date` | String | 필수 | 출석 날짜 |
| `status` | String | 필수 | 출석 상태 |
| `memo` | String | 선택 | 비고 |

#### Response

```json
{
  "success": true,
  "data": {
    "id": 301,
    "studentId": 1,
    "classId": 1,
    "date": "2026-05-17",
    "status": "present",
    "memo": "휴대폰 배터리 방전으로 교사 확인 후 수동 처리",
    "verifiedByQr": false
  }
}
```

### 12.4 출석 상태 수정

교사가 잘못 처리된 출석 상태를 수정한다.

| 메서드 | URL |
| --- | --- |
| PATCH | `/attendance/{attendanceRecordId}` |

#### Request Body

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `status` | String | 필수 | 변경할 출석 상태 |
| `memo` | String | 선택 | 수정 사유 또는 비고 |

#### Response

```json
{
  "success": true,
  "data": {
    "id": 300,
    "status": "late",
    "memo": "09:05 입실",
    "updatedAt": "2026-05-17T00:12:00.000Z"
  }
}
```

### 12.5 CSV 내보내기

| 메서드 | URL |
| --- | --- |
| GET | `/attendance/export.csv` |

#### Query Parameters

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `dateFrom` | String | 선택 | 시작 날짜 |
| `dateTo` | String | 선택 | 종료 날짜 |
| `classId` | Number | 선택 | 반 ID |

#### Response

| 항목 | 값 |
| --- | --- |
| Content-Type | `text/csv; charset=utf-8` |
| 파일명 | `attendance_2026-05-01_2026-05-17.csv` |

CSV 컬럼:

```csv
date,className,studentNumber,studentName,status,verifiedByQr,verifiedAt,memo
2026-05-17,3학년 1반,2024001,김민준,present,true,2026-05-17T00:08:42.000Z,
```

## 13. 헬스체크 API

### 13.1 서버 상태 확인

| 메서드 | URL |
| --- | --- |
| GET | `/health` |

#### Response

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "time": "2026-05-17T00:00:00.000Z"
  }
}
```

## 14. 권한 정책

| API 영역 | 학생 | 교사 | 관리자 |
| --- | --- | --- | --- |
| 학생 소셜 로그인 | 가능 | 불가 | 불가 |
| 교사 로그인 | 불가 | 가능 | 가능 |
| 반 목록 조회 | 가능 | 가능 | 가능 |
| 반 생성 | 불가 | 가능 | 가능 |
| 학생 목록 조회 | 본인 정보만 가능 | 가능 | 가능 |
| 학생 생성/수정/삭제 | 불가 | 가능 | 가능 |
| 학교 위치 조회 | 가능 | 가능 | 가능 |
| 학교 위치 설정 | 불가 | 가능 | 가능 |
| 위치 검증 | 가능 | 불가 | 불가 |
| QR 발급 | 가능 | 불가 | 불가 |
| QR 스캔 검증 | 불가 | 가능 | 가능 |
| 출석 기록 조회 | 본인 기록만 가능 | 가능 | 가능 |
| 수동 출석 처리 | 불가 | 가능 | 가능 |

## 15. 보안 및 부정 출석 방지 규칙

- QR 토큰은 학생 ID, 반 ID, 만료 시간을 기반으로 서버에서 생성한다.
- QR 토큰 원문은 DB에 저장하지 않고 해시값만 저장한다.
- QR 만료 시간은 기본 30초로 한다.
- QR은 한 번 사용되면 다시 사용할 수 없다.
- QR 발급 요청 시 학생 GPS 정보를 함께 기록한다.
- QR 스캔 시 토큰 만료 여부와 사용 여부를 검증한다.
- 학생 위치가 학교 반경 밖이면 QR을 발급하지 않는다.
- GPS 정확도가 너무 낮으면 QR 발급을 거부하거나 경고를 표시한다.
- 수동 출석 처리 시 반드시 메모를 남기도록 권장한다.
- 웹앱에서는 모의 위치 사용 여부를 완전히 탐지하기 어렵다. 네이티브 앱으로 확장할 경우 Android의 mock location 탐지 같은 추가 검사를 적용한다.
- 웹 MVP에서는 짧은 QR 만료 시간, 중복 사용 방지, 재인증, 교사 스캔 기록으로 부정 출석을 줄인다.

## 16. MVP 구현 우선순위

1. `GET /api/health`
2. `POST /api/auth/student/login`
3. `POST /api/auth/teacher/login`
4. `GET /api/classes`
5. `GET /api/students`
6. `GET /api/school-location`
7. `POST /api/location/verify`
8. `POST /api/qr-sessions`
9. `POST /api/qr-sessions/verify`
10. `GET /api/attendance/summary`
11. `GET /api/attendance`
12. `POST /api/attendance/manual`
