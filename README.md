# MH 환율 현황판

BNK부산은행 공개 웹 조회 폼의 최초고시(1회차) 매매기준율을 수집해 기존 Supabase 프로젝트에 저장하고, GitHub Pages에서 로그인 없이 공개 조회합니다.

## 화면과 계산

- USD(원/달러), JPY(원/100엔), EUR(원/유로), CNY(원/위안), USD/JPY(엔/달러) 5개 차트
- 공통 기간 필터, 전 고시일 대비 증감, 기간 최저·최고, 일자별 표, CSV
- 기본 조회 기간 1년. 과거 자료를 추가해도 기존 누적 자료를 삭제하지 않음
- USD/JPY = USD ÷ JPY(100) × 100. 내부 계산 후 표시만 소수점 둘째 자리 반올림
- 미고시·휴일 데이터는 만들지 않음. 완전한 4개 통화 묶음만 표시

## 무료 운영 구성

- 공개 저장소 + 기본 ubuntu-24.04 GitHub Actions. 유료 대형 러너 없음
- GitHub Pages는 main 브랜치의 /docs 정적 파일로 배포
- 공개 화면의 소스는 `docs/`에 보관. 별도 패키지 설치·빌드 과정 없음
- Actions artifact/cache/패키지 저장소/유료 서비스 사용 없음
- Supabase 기존 Free 프로젝트 유지. Edge Function, 새 프로젝트, 유료 DB 브랜치, 플랜 변경 없음
- 평일 KST 09:17/10:17/16:17, 최근 7일 재조회로 단기 누락 보완
- 새 고시일에는 `data/latest-first-rates.json`에 공개 원본 값·고시시각을 자동 기록. 값이 같으면 커밋하지 않음. 증빙 보존 및 장기 미활동 위험 감소 목적이며, 저장소의 한 파일에만 기록
- 무료 스케줄은 지연되거나 누락될 수 있으며, 공개 저장소가 60일간 비활성 상태이면 예약 실행이 중지될 수 있음. 실행이 중지되면 Actions에서 재활성화 필요

## 수집 방식

`scripts/collect.py`는 Python 표준 라이브러리만 사용합니다. API 키 발급·환율 API 구독·브라우저 설치 없이 아래 공개 폼에 POST합니다.

- 페이지: https://www.busanbank.co.kr/ib20/mnu/CMNCMN006001000
- 폼 action: https://www.busanbank.co.kr/ib20/wgt/QSVEXR650INQV1AM
- inqCrdt=YYYYMMDD, ntfcTmrd=1
- HTML에 포함된 resultData JSON 리터럴을 추출하며 JavaScript는 실행하지 않음
- NTFC_DT=요청일, NTFC_TMRD=1, JPY(100) 단위, 4개 통화 유일성, BYS_CRRT_FMT와 BYS_CRRT/100 일치 확인
- 고시시각 NTFC_TM 저장. 조회기준일시(접속 시각)와 구분
- 원본 HTML SHA-256을 수집 로그에 기록. 해시는 이후 원본을 자동 재현한다는 보증이 아니며 조회시각이 달라지면 해시도 달라질 수 있음
- 은행 응답 BAFEB06531은 공휴일 미고시로 처리. 다른 응답 변화는 실패 처리
- 일시적 TLS/네트워크 오류·429·서버 오류는 인증서/호스트명 검증을 유지하고 최대 3회 시도. 날짜·회차·금액 검증 오류는 재시도로 숨기지 않음

## 권한

- 공개 키는 비밀키가 아님. 익명 조회는 서버의 기존 RLS 정책에 따라 verified/1회차만 허용
- 브라우저는 조회만 수행. 직접 INSERT/UPDATE/DELETE 권한 없음
- 관리자는 Supabase 프로젝트 대시보드에서 데이터 검토·수정. 사이트에 가입·관리자 계정 자동 생성 기능 없음
- 수집 전용 토큰은 GitHub Actions Secret `FX_COLLECTOR_TOKEN`에 보관. DB에는 SHA-256만 저장
- 수집 함수는 올바른 토큰을 확인한 경우 4개 통화 묶음의 새 날짜만 추가. 기존 값이 다르면 관리자 검토를 요구하고 전체 트랜잭션 중단
- 수집 토큰은 기존 행 수정·삭제·사용자 관리·다른 테이블 접근 불가
- Supabase 보안 진단은 익명 호출 가능한 SECURITY DEFINER 함수에 경고를 표시함. 이 함수는 의도한 수집 입구이며, 256비트 비밀 토큰 검증과 신규 날짜 추가 제한으로 보호. 수동 Actions 실행 시 무인증·잘못된 토큰·기존 값 변경·불완전 묶음 차단을 실제 확인
- 토큰 교체 시 새 토큰의 SHA-256을 `fx_private.collector_config`에 관리자 권한으로 반영하고 GitHub Secret 변경. 비밀값을 SQL·소스·대화에 붙이지 않을 것

## 운영

1. Actions → Collect BNK first rates → Run workflow (기본 7일, 1~366일 지정 가능)
2. 실행 성공과 공개 화면 최신 고시일 확인
3. 실패 시 작업 로그 및 Supabase fx_collection_logs 조회. 토큰/비밀값을 출력하지 않을 것
4. 은행 화면 형식이 바뀌면 검증 실패를 해소한 뒤 실행. 최종고시나 타 은행 값으로 대체 금지
5. Supabase Free 일시정지·무료 한도 도달 시 서비스가 중단될 수 있음. 유료 전환 없이 관리자 확인 후 복구

검증: `python -m unittest discover -s tests -v`

원본 쓰기 없이 수집 검증: `python scripts/collect.py --days 7 --dry-run`

실제 수집: 환경변수에 토큰 설정 후 `python scripts/collect.py --days 7`

## 변경 범위

기존 UI 파일은 인계되지 않아 요구사항을 기준으로 새 화면을 구성했습니다. 기존 fx_rates/fx_collection_logs와 공개 SELECT 정책을 유지하며 수집 함수를 추가했습니다.

공개 사이트: https://malongwan-web.github.io/mh-fx-dashboard/

2026-10-14 검증: 19개 고시일·76개 환율 저장. GitHub 실제 실행, 은행 원본 대조, 익명 쓰기 거부, 잘못된 토큰 거부, 중복 방지, 기존 값 변경 거부 확인. 상세 적용·배포 결과는 별도 검증 보고서를 확인하십시오.
