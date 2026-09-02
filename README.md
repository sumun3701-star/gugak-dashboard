# 국악 대시보드

국악 공연 소식(캘린더)·국악방송 유튜브·개인 작업물/할일/아이디어를 한 화면에서 관리하는 개인용 대시보드.
[PRD](./gugak_dashboard_prd_master_1.md) v1+v2 전체 범위 구현.

## 빠른 시작

### 방법 A — 그냥 열기 (설치 불필요)

`index.html` 을 브라우저(크롬/엣지 권장)로 더블클릭해서 엽니다.

- 캘린더·주간일정·게시판·스크랩·아이디어 보드: **모두 정상 동작**
- 공연 정보: KOPIS 인증키가 없으므로 **샘플 공연 + 수동 등록 공연**만 표시
- 유튜브: **YouTube API 키를 설정에 입력하면** 파일 열기 상태에서도 최신 영상이 나옵니다

### 방법 B — 로컬 서버 (KOPIS 자동수집까지)

KOPIS 오픈API는 브라우저에서 직접 부르면 CORS 로 막히므로, 아주 작은 프록시 서버가 필요합니다.
Node 또는 Python 중 설치된 것으로 실행하세요. (둘 다 표준 기능만 사용, 추가 설치 없음)

```bash
node server.js
```

또는

```bash
python server.py
```

실행 후 브라우저에서 `http://localhost:5173` 접속 → 설정에서 KOPIS 서비스키 입력 → "공연정보 새로고침".

로컬 서버는 KOPIS 프록시 외에 **유튜브 RSS 대체 수집**과 **스크랩 "정보 가져오기"(페이지 제목·요약 추출)** 도 함께 처리합니다.

### 편의 실행

- **`start.bat` 더블클릭** — 서버 실행 + 브라우저 자동으로 열기 (창을 닫으면 서버 종료)
- **로그인 시 자동 실행** — 작업 스케줄러에 `GugakDashboardServer` 작업으로 등록해두면 창 없이 백그라운드로 항상 실행됨. 등록:
  ```powershell
  $pyw = (Split-Path (python -c "import sys;print(sys.executable)")) + '\pythonw.exe'
  $action  = New-ScheduledTaskAction -Execute $pyw -Argument ('"{0}\server.py"' -f $PWD)
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName GugakDashboardServer -Action $action -Trigger $trigger -Settings $settings -Force
  ```
  해제: `Unregister-ScheduledTask -TaskName GugakDashboardServer -Confirm:$false`

> 현재 이 PC에는 Node·Python 이 설치돼 있지 않아 방법 A 로 동작합니다.
> KOPIS 자동수집이 필요하면 [Node](https://nodejs.org) 또는 Python 을 설치한 뒤 방법 B 를 쓰세요.

## API 키 발급

### KOPIS(공연예술통합전산망) 서비스키 — 공연 캘린더 자동수집

1. <https://www.kopis.or.kr> 회원가입·로그인
2. "오픈API" 메뉴 → 인증키 신청 (이용목적 예: "개인용 국악 공연 정보 대시보드")
3. 승인 후 마이페이지에서 서비스키 확인
4. 대시보드 **설정 → KOPIS 오픈API 서비스키** 에 붙여넣고 저장

### YouTube Data API v3 키 — 국악방송 유튜브 (선택)

1. <https://console.cloud.google.com> 에서 프로젝트 생성
2. "API 및 서비스 → 라이브러리" 에서 **YouTube Data API v3** 사용 설정
3. "사용자 인증 정보 → API 키" 발급 (YouTube Data API v3 로 사용 제한 권장)
4. 대시보드 **설정 → YouTube Data API v3 키** 에 입력
   - 키를 넣지 않아도, 로컬 서버(방법 B) 실행 중이면 채널 RSS 로 대체 수집합니다.
   - 대상 채널: **국악방송라디오** `@GugakFM991` / 채널ID `UChGH9Y7DVCJXFlBtNXTf98A` (TV 채널과 다름)

## 기능 ↔ PRD 매핑

| 화면 | PRD 요구사항 | 구현 |
|---|---|---|
| 캘린더 월간뷰 (자체 구현) | CAL-1 | 월요일 시작 6주 그리드, 이전/다음/오늘 |
| 4개 지정 공연장 + 상세 URL | CAL-2, CAL-4 | 공연시설명 키워드로 분류, 클릭 시 새 탭 이동(자동수집 건은 예매 URL 지연 조회) |
| 공연장 필터 | CAL-3 | 지정 4곳 + "그 외 국악 공연" + "개인 일정" 체크박스 |
| 관심 공연 체크 + 모아보기 | CAL-5 | 별표는 **체크한 그 날짜에만** 표시(여러 날 공연도 선택한 날만). "관심 공연만" 필터는 별표한 날짜 칸만 노출 |
| 상단 고정 목록 | 확장 | 관심 표시한 공연 + 추가한 개인 일정을 캘린더 맨 위에 날짜순 칩으로 표시(D-day 포함), 클릭 시 해당 날짜 열림. 지난 항목은 자동 제외 |
| 개인 일정 추가/수정/삭제 | CAL-6 | 날짜 클릭 → 모달에서 추가/삭제 |
| 공연 삭제(숨기기) | 확장 | 날짜 모달에서 공연 ✕ → 확인창 없이 즉시 처리 + 토스트에 "되돌리기". 자동수집/샘플은 "숨김"(재수집해도 안 나타남), 수동 공연은 완전 삭제. 설정 › 숨긴 공연에서 개별/일괄 복원 |
| 공연 vs 개인 일정 구분 | CAL-7, CAL-13 | 색상(파랑=지정 / 초록=그 외 / 주황=개인) + 라벨 + 범례 |
| KOPIS 자동수집 | CAL-8, CAL-10, CAL-11 | 장르코드 `CCCC`(국악) 전국 검색, 12시간 캐시 후 자동 갱신 |
| 자동수집 실패 시 수동 보조 입력 | CAL-9 | 설정 → "수동 공연 등록" |
| 지역 필터 (기본 수도권) | CAL-12 | 수도권(서울·경기·인천) ↔ 전국 |
| 중복 제거 | CAL-14 | `mt20id` 기준 병합, 지정 공연장 분류 우선 |
| 주간 뷰 / 추가·삭제 / 완료 체크 / 주 전환 | WEEK-1~3, WEEK-5 | 월요일 기준 주, 주별 저장 |
| 캘린더 → 주간 단방향 연동 | WEEK-4 | 해당 주의 개인 일정 + 관심 공연이 "캘린더 연동" 목록에 자동 표시 |
| 국악방송 유튜브 피드 | YT-1~4 | 썸네일·제목·업로드 시각, 클릭 이동, NEW 배지, "모두 확인함" |
| 투두 게시판 | 확장 | **할 일 / 진행 중** 2단 칸반 — 카드 드래그 이동 + ‹ › 버튼, "✓ 완료"(되돌리기 토스트), 제목·메모·태그, 수정·삭제 |
| 작업물 게시판 (완료된 작업물 보관) | BOARD-1~5,7 | 완료된 파일·링크를 카드 목록으로 보관(상태 없음). 파일 기본 선택, 등록일순, 제목수정·삭제, 태그. 파일은 IndexedDB 저장. **네이버 블로그식 2단계 카테고리 트리**(상위→하위, 접기/건수, 트리 사이드바, 그룹 보기) |
| 스크랩 (확장) | — | 기사·블로그 URL + 제목·메모·태그 저장, 읽음 체크, 태그/읽음/텍스트 필터. **네이버 블로그식 카테고리** — 카테고리 생성·이름변경·삭제(칩 더블클릭), 카드에서 카테고리 이동, "전체" 보기 시 카테고리별 그룹 표시. 로컬 서버 실행 시 "정보 가져오기"로 og:title·설명 자동 채움 |
| 아이디어 보드 (확장) | NOTE-1~3 | Padlet 스타일 스티키 메모 — 드래그 자유 배치, 5색, 인라인 편집·삭제. 좁은 화면은 목록으로 자동 전환 |

## 데이터 저장

- 모든 사용자 데이터(설정·관심체크·개인일정·주간할일·게시판·노트·캐시)는 **이 브라우저의 localStorage** 에만 저장됩니다.
- 새로고침·재접속 후에도 유지됩니다. 단, **다른 기기/브라우저와는 공유되지 않습니다.**
- 기기 이전: 설정 → **데이터 내보내기(JSON)** → 다른 기기에서 **가져오기**.
- 게시판 첨부파일은 **IndexedDB** 에 저장됩니다(대용량 가능). 파일 1개 기본 한도 **50MB**(설정 › 작업물 게시판 파일에서 1~500MB 조정), 전체 용량은 브라우저·디스크 여유에 따름(보통 수 GB). 설정 화면에서 현재 사용량을 확인할 수 있습니다.
- 내보내기(JSON)에는 첨부파일도 base64로 함께 포함되어 다른 기기에서 가져오기로 복원됩니다(파일이 크면 JSON 파일도 커집니다).
- 예전에 localStorage 에 저장돼 있던 파일은 앱을 열 때 자동으로 IndexedDB 로 옮겨집니다.

## 알려진 한계 (PRD 오픈 이슈 관련)

- **남산국악당 커버리지**: KOPIS "국악(CCCC)" 장르 검색 결과에 포함되면 자동 표시됩니다. 누락 시 설정의 수동 등록으로 보완하세요. (서울 열린데이터광장 연동은 미구현)
- **장르 코드**: 설정에서 변경 가능(기본 `CCCC`). 결과가 이상하면 KOPIS 오픈API 문서로 재확인.
- **지역 판별**: KOPIS 응답의 `area` 값으로 수도권 여부를 판단합니다. `area` 가 비어 오면 숨기지 않고 모두 표시합니다.
- **크로스오버 공연**: KOPIS 가 "국악"으로 분류하지 않은 공연은 자동수집에서 빠질 수 있습니다 → 수동 등록.
- **갱신 방식**: 접속 시 캐시가 12시간 이상 지났으면 자동 재조회(배치 대신 접속시 갱신).

## 파일 구조

```
index.html          화면 구조
css/style.css        스타일 (라이트/다크 자동)
js/util.js           날짜·DOM 헬퍼
js/store.js          localStorage 래퍼
js/settings.js       설정 + 수동 공연 등록 + 데이터 내보내기/가져오기
js/kopis.js          KOPIS 자동수집·파싱·캐시·샘플
js/youtube.js        유튜브 API/RSS 수집
js/calendar.js       공연 캘린더 (CAL-*)
js/weekly.js         주간 일정 (WEEK-*)
js/board.js          작업물 게시판 (완료된 작업물 보관)
js/todos.js          투두 게시판 (할 일 / 진행 중 칸반)
js/filedb.js         첨부파일 저장소 (IndexedDB)
js/scraps.js         기사·블로그 스크랩
js/notes.js          아이디어 보드 (Padlet 스타일 스티키 메모)
js/app.js            탭 라우팅·초기화
server.js / server.py  선택적 로컬 프록시 (KOPIS/YouTube RSS/스크랩 메타)
favicon.png / icon.ico  앱·바로가기 아이콘
start.bat            더블클릭 실행 (서버 + 브라우저)
```
