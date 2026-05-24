# 출석체크 웹앱 API 명세서

## 1. API 개요

이 API는 학교 출석체크 웹앱에서 학생, 교사, 반, 수업, GPS 기반 QR 인증, 출석 기록을 관리하기 위해 사용한다.

핵심 출석 흐름은 다음과 같다.

1. 학생이 모바일 웹에서 로그인한다.
2. 학생 휴대폰 브라우저가 GPS 위치를 확인한다.
3. 프론트에서 학생 위치가 학교 허용 반경 안인지 검증한다.
4. 위치가 유효하면 짧은 만료 시간을 가진 QR 토큰을 발급한다.
5. 교사가 OR 기기로 QR을 스캔한다.
6. 서버가 QR 토큰의 유효성, 만료 여부, 중복 사용 여부를 검증한다.
7. 검증에 성공하면 출석 기록을 저장한다.

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

### Class

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | Number | 반 또는 수업 ID |
| `name` | String | 반 또는 수업 이름 |
| `createdAt` | String | 생성일 |

### Student

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | Number | 학생 ID |
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
| `token` | String | QR에 담기는 일회용 토큰 |
| `expiresAt` | String | 만료 시간 |
| `usedAt` | String 또는 Null | 사용 시간 |

### SchoolLocation

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | Number | 학교 위치 ID |
| `name` | String | 위치 이름 |
| `latitude` | Number | 기준 위도 |
| `longitude` | Number | 기준 경도 |
| `radiusMeters` | Number | 허용 반경 |

- 이거 환경변수 or 상수화 하거나 아니면 Class쪽에 학교 할당하기

## 7. 인증 API

### 7.1 학생 로그인

학생이 학번과 이름으로 로그인한다. MVP에서는 단순 로그인으로 시작하고, 추후 비밀번호 또는 학교 계정 연동을 추가한다.

#### Request

```bash
curl -X POST http://localhost:4000/api/auth/student/login \
  -H "Content-Type: application/json" \
  -d '{
    "studentNumber": "2024001",
    "name": "김민준"
  }'
```
처음에 소셜 로그인으로 학교 이메일로 가입, 학번 연동

| 메서드 | URL |
| --- | --- |
| POST | `/auth/student/login` |

#### Request Body

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `studentNumber` | String | 필수 | 학번 |
| `name` | String | 필수 | 학생 이름 |

#### Response

```json
{
  "success": true,
  "data": {
    "accessToken": "student.jwt.token",
    "user": {
      "id": 1,
      "role": "student",
      "name": "김민준"
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
- 이거 잘 합쳐봐


### 7.2 교사 로그인

교사가 이메일과 비밀번호로 로그인한다.

#### Request

```bash
curl -X POST http://localhost:4000/api/auth/teacher/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@school.kr",
    "password": "password1234"
  }'
```
- 해싱을 프론트단에서 해서 서버로 보내기
- DB는 해싱된 상태의 비번을 저장

| 메서드 | URL |
| --- | --- |
| POST | `/auth/teacher/login` |

#### Request Body

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `email` | String | 필수 | 교사 이메일 |
| `password` | String | 필수 | 비밀번호 |

#### Response

```json
{
  "success": true,
  "data": {
    "accessToken": "teacher.jwt.token",
    "user": {
      "id": 10,
      "role": "teacher",
      "name": "박철수"
    }
  }
}
```

### 7.3 내 정보 조회

현재 로그인한 사용자 정보를 조회한다.

#### Request

```bash
curl -X GET http://localhost:4000/api/auth/me \
  -H "Authorization: Bearer {accessToken}"
```

| 메서드 | URL |
| --- | --- |
| GET | `/auth/me` |

#### Response

```json
{
  "success": true,
  "data": {
    "id": 1,
    "role": "student",
    "name": "김민준"
  }
}
```
- 로그인과 불필요한 요청 중복

## 8. 반 API

### 8.1 반 목록 조회

#### Request

```bash
curl -X GET http://localhost:4000/api/classes \
  -H "Authorization: Bearer {accessToken}"
```

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
      "createdAt": "2026-05-17T06:00:00.000Z"
    }
  ]
}
```

### 8.2 반 생성

교사 또는 관리자만 사용할 수 있다.

#### Request

```bash
curl -X POST http://localhost:4000/api/classes \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "3학년 1반"
  }'
```

| 메서드 | URL |
| --- | --- |
| POST | `/classes` |

#### Request Body

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `name` | String | 필수 | 반 이름 |

#### Response

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "3학년 1반"
  }
}
```

## 9. 학생 API

### 9.1 학생 목록 조회

#### Request

```bash
curl -X GET "http://localhost:4000/api/students?classId=1&keyword=김&page=1&size=20" \
  -H "Authorization: Bearer {accessToken}"
```

| 메서드 | URL |
| --- | --- |
| GET | `/students` |

#### Query Parameters

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `classId` | Number | 선택 | 반 ID |
| `keyword` | String | 선택 | 이름 또는 학번 검색어 |
| `page` | Number | 선택 | 페이지 번호. 기본값 `1` |
| `size` | Number | 선택 | 페이지 크기. 기본값 `20` |

#### Response

```json
{
  "success": true,
  "data": {
    "page": 1,
    "size": 20,
    "totalCount": 1,
    "items": [
      {
        "id": 1,
        "classId": 1,
        "studentNumber": "2024001",
        "name": "김민준",
        "isActive": true
      }
    ]
  }
}
```

### 9.2 학생 생성

교사 또는 관리자만 사용할 수 있다.

#### Request

```bash
curl -X POST http://localhost:4000/api/students \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "classId": 1,
    "studentNumber": "2024001",
    "name": "김민준"
  }'
```

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

#### Request

```bash
curl -X PATCH http://localhost:4000/api/students/1 \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "classId": 1,
    "studentNumber": "2024001",
    "name": "김민준",
    "isActive": true
  }'
```

| 메서드 | URL |
| --- | --- |
| PATCH | `/students/{studentId}` |

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

### 9.4 학생 삭제 또는 비활성화

실제 삭제 대신 `isActive=false` 처리한다.

#### Request

```bash
curl -X DELETE http://localhost:4000/api/students/1 \
  -H "Authorization: Bearer {accessToken}"
```

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
- 이건 프론트에서 실행, 이러면 서버위치 조회됨
#### Request

```bash
curl -X GET http://localhost:4000/api/school-location \
  -H "Authorization: Bearer {accessToken}"
```

| 메서드 | URL |
| --- | --- |
| GET | `/school-location` |

#### Response

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "본관",
    "latitude": 37.5012743,
    "longitude": 127.039585,
    "radiusMeters": 100
  }
}
```

### 10.2 학교 위치 설정

교사 또는 관리자만 사용할 수 있다.

#### Request
- 위치 이정도로 자세하게 못나눔
```bash
curl -X PUT http://localhost:4000/api/school-location \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "본관",
    "latitude": 37.5012743,
    "longitude": 127.039585,
    "radiusMeters": 100
  }'
```

| 메서드 | URL |
| --- | --- |
| PUT | `/school-location` |

#### Request Body

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `name` | String | 필수 | 위치 이름 |
| `latitude` | Number | 필수 | 위도 |
| `longitude` | Number | 필수 | 경도 |
| `radiusMeters` | Number | 필수 | 허용 반경 |

#### Response

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "본관",
    "latitude": 37.5012743,
    "longitude": 127.039585,
    "radiusMeters": 100
  }
}
```

## 11. GPS 및 QR 인증 API

### 11.1 위치 검증

학생의 현재 위치가 학교 허용 반경 안인지 확인한다.

#### Request

```bash
curl -X POST http://localhost:4000/api/location/verify \
  -H "Authorization: Bearer {studentAccessToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 37.5012743,
    "longitude": 127.039585,
    "accuracyMeters": 18
  }'
```

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
    "insideSchoolArea": true,
    "distanceMeters": 23.4,
    "radiusMeters": 100,
    "schoolLocation": {
      "latitude": 37.5012743,
      "longitude": 127.039585
    }
  }
}
```
insideSchoolArea만 남기기
### 11.2 학생용 QR 발급

학생 위치가 학교 반경 안이면 일회용 QR 토큰을 발급한다.

#### Request

```bash
curl -X POST http://localhost:4000/api/qr-sessions \
  -H "Authorization: Bearer {studentAccessToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "classId": 1,
    "latitude": 37.5012743,
    "longitude": 127.039585,
    "accuracyMeters": 18
  }'
```

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

학교 반경 밖이면 QR을 발급하지 않는다.

```json
{
  "success": false,
  "error": {
    "code": "OUT_OF_SCHOOL_AREA",
    "message": "학교 인증 구역 밖에서는 QR 코드를 발급할 수 없습니다."
  }
}
```

### 11.3 QR 갱신

기존 QR이 만료되기 전 또는 만료된 후 새 QR을 발급한다.

- 이거 QR생성과 통합, 유무 검사까지 /qr-sessions에서

#### Request

```bash
curl -X POST http://localhost:4000/api/qr-sessions/refresh \
  -H "Authorization: Bearer {studentAccessToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "classId": 1,
    "latitude": 37.5012743,
    "longitude": 127.039585,
    "accuracyMeters": 18
  }'
```

| 메서드 | URL |
| --- | --- |
| POST | `/qr-sessions/refresh` |

#### Response

```json
{
  "success": true,
  "data": {
    "qrSessionId": 101,
    "qrPayload": "attendi://attendance?token=new.token.value",
    "expiresAt": "2026-05-17T00:01:00.000Z",
    "expiresInSeconds": 30
  }
}
```

### 11.4 교사용 QR 스캔 검증

교사가 스캔한 QR 토큰을 서버에 보내 출석 처리한다.

#### Request

```bash
curl -X POST http://localhost:4000/api/qr-sessions/verify \
  -H "Authorization: Bearer {teacherAccessToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "qrPayload": "attendi://attendance?token=eyJhbGciOiJIUzI1NiIs...",
    "scannedAt": "2026-05-17T00:08:42.000Z"
  }'
```

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
    "result": "accepted",
    "attendanceRecord": {
      "id": 300,
      "studentId": 1,
      "classId": 1,
      "date": "2026-05-17",
      "status": "present",
      "verifiedByQr": true,
      "verifiedAt": "2026-05-17T00:08:42.000Z"
    },
    "student": {
      "id": 1,
      "studentNumber": "2024001",
      "name": "김민준",
      "className": "3학년 1반"
    }
  }
}
```
result만 반환

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

### 12.1 오늘 출석 현황 조회

교사용 대시보드에서 사용한다.

#### Request

```bash
curl -X GET "http://localhost:4000/api/attendance/summary?date=2026-05-17&classId=1" \
  -H "Authorization: Bearer {teacherAccessToken}"
```

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
    "total": 30,
    "present": 24,
    "late": 3,
    "absent": 2,
    "earlyLeave": 1
  }
}
```

### 12.2 출석 기록 목록 조회

#### Request

```bash
curl -X GET "http://localhost:4000/api/attendance?dateFrom=2026-05-01&dateTo=2026-05-17&classId=1&studentId=1&page=1&size=20" \
  -H "Authorization: Bearer {teacherAccessToken}"
```

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
| `page` | Number | 선택 | 페이지 번호 |
| `size` | Number | 선택 | 페이지 크기 |

#### Response

```json
{
  "success": true,
  "data": {
    "page": 1,
    "size": 20,
    "totalCount": 1,
    "items": [
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
}
```
- page, size 없어도 될듯

### 12.3 수동 출석 처리

QR이 안 되는 상황에서 교사가 직접 출석 상태를 입력한다.

#### Request

```bash
curl -X POST http://localhost:4000/api/attendance/manual \
  -H "Authorization: Bearer {teacherAccessToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": 1,
    "classId": 1,
    "date": "2026-05-17",
    "status": "present",
    "memo": "휴대폰 배터리 방전으로 교사 확인 후 수동 처리"
  }'
```

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

#### Request

```bash
curl -X PATCH http://localhost:4000/api/attendance/300 \
  -H "Authorization: Bearer {teacherAccessToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "late",
    "memo": "09:05 입실"
  }'
```

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

#### Request

```bash
curl -X GET "http://localhost:4000/api/attendance/export.csv?dateFrom=2026-05-01&dateTo=2026-05-17&classId=1" \
  -H "Authorization: Bearer {teacherAccessToken}"
```

| 메서드 | URL |
| --- | --- |
| GET | `/attendance/export.csv` |

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

## 13. 교사용 대시보드 API

### 13.1 대시보드 데이터 조회

#### Request

```bash
curl -X GET "http://localhost:4000/api/dashboard?date=2026-05-17&classId=1" \
  -H "Authorization: Bearer {teacherAccessToken}"
```

| 메서드 | URL |
| --- | --- |
| GET | `/dashboard` |

#### Response

```json
{
  "success": true,
  "data": {
    "date": "2026-05-17",
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
- 위에 일일 출석조회랑 합칠거 합치고 분리할거 분리해보기

## 14. 헬스체크 API

### 14.1 서버 상태 확인

#### Request

```bash
curl -X GET http://localhost:4000/api/health
```

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

## 15. 권한 정책

| API 영역 | 학생 | 교사 | 관리자 |
| --- | --- | --- | --- |
| 학생 로그인 | 가능 | 가능 | 가능 |
| 교사 로그인 | 불가 | 가능 | 가능 |
| 내 정보 조회 | 가능 | 가능 | 가능 |
| 학생 목록 조회 | 불가 | 가능 | 가능 |
| 학생 생성/수정/삭제 | 불가 | 가능 | 가능 |
| QR 발급 | 가능 | 불가 | 불가 |
| QR 스캔 검증 | 불가 | 가능 | 가능 |
| 출석 기록 조회 | 본인 기록만 가능 | 가능 | 가능 |
| 수동 출석 처리 | 불가 | 가능 | 가능 |
| 학교 위치 설정 | 불가 | 가능 | 가능 |

## 16. 보안 및 부정 출석 방지 규칙

- QR 토큰은 학생 ID, 반 ID, 만료 시간을 기반으로 서버에서 생성한다.
- QR 토큰 원문은 DB에 저장하지 않고 해시값만 저장한다.
- QR 만료 시간은 기본 30초로 한다.
- QR은 한 번 사용되면 다시 사용할 수 없다.
- QR 발급 시 학생의 GPS 위치를 서버에서 검증한다.
- QR 스캔 시 토큰 만료 여부와 사용 여부를 다시 검증한다.
- 학생 위치가 학교 반경 밖이면 QR을 발급하지 않는다.
- GPS 정확도가 너무 낮으면 QR 발급을 거부하거나 경고를 표시한다.
- 수동 출석 처리 시 반드시 메모를 남기도록 권장한다.
- 앱에서 모의 위치를 켜뒀는지 확인해서 켜져있으면 거부한다.

## 17. MVP 구현 우선순위

1. `GET /api/health`
2. `POST /api/auth/student/login`
3. `POST /api/auth/teacher/login`
4. `GET /api/classes`
5. `GET /api/students`
6. `POST /api/location/verify`
7. `POST /api/qr-sessions`
8. `POST /api/qr-sessions/verify`
9. `GET /api/attendance/summary`
10. `GET /api/attendance`
11. `POST /api/attendance/manual`
12. `GET /api/dashboard`
