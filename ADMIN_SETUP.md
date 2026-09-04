# WENK 관리자 통계 설정

## 1. Supabase 테이블 생성

Supabase SQL Editor에서 [`supabase/analytics.sql`](./supabase/analytics.sql)을 한 번 실행합니다.

생성되는 `weko_analytics_events` 테이블은 익명 `visitor_id`와 방문별 `visit_id`를 사용해 다음 이벤트를 저장합니다.

- 최초 방문 및 UTM 유입 정보
- 설문 시작
- 질문 응답(동일 방문·질문은 마지막 선택으로 갱신)
- 설문 완료 및 결과 유형
- 결과 페이지 조회
- 공유 채널 및 공유 클릭

이름, 이메일, 전화번호, 주소, 로그인 정보, IP 주소는 저장하지 않습니다. RLS를 활성화하고 공개 역할의 접근 권한을 제거했으므로 Flask 백엔드만 통계 테이블을 읽고 씁니다.

## 2. Render 환경변수

필수:

```text
ADMIN_PASSWORD=팀에서 사용할 관리자 공용 비밀번호
SECRET_KEY=충분히 긴 무작위 문자열
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
```

기존 Supabase 프로젝트가 레거시 키를 사용한다면 `SUPABASE_SECRET_KEY` 대신 아래 값도 지원합니다.

```text
SUPABASE_SERVICE_ROLE_KEY=기존 service_role 키
```

선택:

```text
SUPABASE_ANALYTICS_TABLE=weko_analytics_events
KPI_SURVEY_TARGET=1500
KPI_SHARE_TARGET=500
KPI_COMPLETION_RATE_TARGET=85
KPI_INSTAGRAM_TARGET=1000
```

KPI 목표를 설정하지 않으면 대시보드에서 해당 KPI를 “목표값 미설정”으로 표시합니다. 비밀키는 HTML이나 JavaScript에 전달되지 않습니다.

## 3. Render 배포

저장소 루트의 [`render.yaml`](./render.yaml)을 Blueprint로 연결하면 다음 설정이 적용됩니다.

```text
Build Command: pip install -r requirements.txt
Start Command: gunicorn app:app
Health Check: /health
```

배포 후에는 아래 두 주소로 상태를 구분해 확인할 수 있습니다.

```text
/health  : Flask 프로세스 실행 및 분석 환경변수 설정 여부
/ready   : Supabase 통계 테이블에 실제로 연결 가능한지 확인
```

`/health`는 Render의 짧고 안정적인 배포 상태 확인에 사용하고, `/ready`는 운영 점검 시 Supabase 연결까지 확인할 때 사용합니다. 정상 상태의 `/ready` 응답은 `{"status":"ready","analytics":"connected"}`입니다.

기존 Render 서비스를 직접 설정하는 경우에도 위 명령과 환경변수를 동일하게 사용합니다.

## 4. 관리자 주소

배포 도메인이 `https://YOUR-DOMAIN`이라면:

```text
https://YOUR-DOMAIN/admin
```

비로그인 상태에서 `/admin/dashboard` 또는 `/admin/api/*`에 접근하면 로그인 페이지로 이동하거나 401 응답을 반환합니다.

## 5. Instagram UTM 링크

Instagram 프로필, 스토리, 게시물에는 아래 형식을 복사해 사용합니다.

```text
https://YOUR-DOMAIN/?utm_source=instagram&utm_medium=social&utm_campaign=wenk
```

캠페인을 구분할 때는 `utm_campaign`만 변경합니다.

```text
https://YOUR-DOMAIN/?utm_source=instagram&utm_medium=social&utm_campaign=wenk_launch
```

결과 페이지의 공유 링크에는 앱이 자동으로 다음 값을 붙입니다.

```text
utm_source=shared_link&utm_medium=share&utm_campaign=result_share
```

## 6. 집계 기준

- 누적/오늘/이번 주 참여자: `survey_start`의 고유 `visitor_id`
- 완료율: 고유 완료 사용자 ÷ 고유 시작 사용자 × 100
- 결과 분포: 사용자별 마지막 완료 결과
- 질문별 응답: 사용자·질문별 마지막 선택
- 날짜별 추이: Asia/Seoul 날짜별 고유 참여자
- 유입 경로: 방문별 첫 UTM/referrer 기준 Instagram, Kakao, Direct, Other
- 유입별 완료율: 해당 경로의 완료 방문 ÷ 해당 경로 방문 × 100
- 공유 사용자: 공유 이벤트가 있는 고유 `visitor_id`
- 공유율: 공유 사용자 ÷ 결과 페이지 도달 사용자 × 100
