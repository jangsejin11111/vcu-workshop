## 개발·배포 방식 및 자동 방 연결 (다음 배포에 포함)

작은 수정은 로컬에서 검증하고, GitHub main 반영은 배포할 변경을 모았을 때만 합니다. main에 올리면 기존 Netlify 자동 배포가 실행되므로 로컬 검증 단계에서는 push하지 않습니다. Netlify 계정의 자동 배포 설정은 변경하지 않았습니다.

서버의 자동 연결 지원 변경을 한 번 배포한 다음, 진행자 컴퓨터에서 다음을 실행합니다:

```powershell
powershell -File scripts/start-local-ai.ps1
```

방 코드 없이 실행하면 약 20초마다 방 목록을 발견하고 연결 상태를 갱신합니다. 기존 방 전용 연결 프로그램은 먼저 종료하세요. 특정 방만 운영하려면 `-Room 1031b` 옵션을 유지할 수 있습니다. 새 방 연결에는 목록 조회·네트워크 시간이 추가될 수 있습니다.

질문은 방을 번갈아 가며 한 번에 하나씩 처리합니다. 각 방 내부의 질문 순서를 유지하며, 다른 방의 프롬프트나 응답을 재사용하지 않습니다. 실행 중에도 별도 스레드가 새 방을 발견합니다. 종료된 방은 연결 대상에서 빠집니다. 다른 컴퓨터가 연결한 방은 건너뜁니다. 질문이 10분 이상 대기하면 기존 서버 시간 제한에 따라 실패로 남으며 재질문할 수 있습니다.

컴퓨터·인터넷·Ollama·연결 프로그램을 켜둬야 합니다. 자동 발견과 상태 확인도 Netlify 요청/저장 사용량을 소모하므로 운영을 마치면 프로그램을 종료하세요. 인증 토큰은 7일 후 만료되므로 장기간 연속 실행 시 프로그램을 재시작합니다.

# VCU · Same words, two perspectives

한국/미국 두 방에 같은 상황카드를 보여주고, 토론 후 두 페르소나의 실제 AI 응답을 비교하는 첫째 날 워크숍 도구입니다.

## 로컬 AI로 운영 (기본 모드)

참가자는 기존 Netlify 주소를 사용합니다. 토론 데이터와 AI 답변은 Netlify Blobs에 저장하고, 답변 생성만 진행자 컴퓨터의 Ollama에서 실행합니다. OpenAI 키나 유료 API 크레딧은 필요하지 않습니다. 컴퓨터는 Netlify로 나가는 HTTPS 연결만 사용하므로 다른 Wi-Fi 참여, LTE 참여가 가능하고 포트포워딩이 필요하지 않습니다.

1. Ollama Windows 설치: https://ollama.com/download/windows (또는 공식 standalone ZIP).
2. 모델 다운로드: `ollama pull qwen3:4b-instruct` (약 2.5GB). 설치·최초 다운로드에는 인터넷이 필요합니다.
3. Python 환경 준비: `python -m venv .venv`, `.venv\Scripts\python -m pip install -r requirements-worker.txt`.
4. 웹에서 워크숍을 만든 뒤 이 컴퓨터의 프로젝트 폴더에서 실행:

```powershell
powershell -File scripts/start-local-ai.ps1 -Room 1031a
```

진행자 비밀번호를 입력하고 실행 창을 켜두세요. 웹의 AI 연결 표시가 켜지면 비교를 시작할 수 있습니다. 다른 방 코드는 `-Room` 값만 바꾸세요. 창에서 Ctrl+C로 종료합니다. 모델 서버는 localhost:11434만 사용합니다. 진행자의 컴퓨터는 켜져 있고 인터넷에 연결돼 있어야 합니다.

직접 실행:

```powershell
.venv\Scripts\python scripts/local_ai_worker.py --site https://YOUR-SITE.netlify.app --room 1031a --model qwen3:4b-instruct --num-ctx 32768
```

두 페르소나는 동일한 로컬 모델로 순서대로 생성하며, 각 조의 개별 응답과 확정 결론을 모두 참고합니다. 모델 이름·digest·생성 설정·프롬프트·응답을 기록합니다. 기존에 확정한 페르소나도 그대로 사용할 수 있고, 새 질문부터 로컬 모델이 사용됩니다. 기존 OpenAI 실패 기록은 보존합니다.

컴퓨터 연결이 끊기면 90초 안에 작업이 실패 처리되며 부분 응답은 남습니다. 유료 모델로 자동 대체하지 않습니다. 로컬 모델의 컨텍스트 크기는 기본 32,768입니다. 원문을 조용히 잘라내지 않도록 보수적인 UTF-8 바이트 길이 검사를 하며, 자료가 너무 많으면 명시적으로 실패합니다. 이때 더 큰 컨텍스트/메모리 설정이 필요합니다. GPU와 모델에 따라 생성 속도와 한국어 품질이 달라집니다.

## Netlify 배포

1. Netlify 로그인 → **Add new project → Import an existing project → GitHub** → `vcu-workshop` 선택.
2. 빌드 명령 `npm run build`, 게시 폴더 `dist`. 저장소의 `netlify.toml`이 Functions와 라우팅을 설정합니다. Node 22 사용.
3. Project configuration → Environment variables에 다음 값을 **Functions용 환경변수**로 넣고 배포합니다. `VITE_` 접두사를 붙이지 마세요.

| 이름 | 값 |
|---|---|
| `VCU_ADMIN_PASSWORD` | 진행자 비밀번호 |
| `VCU_AUTH_SECRET` | 임의의 32자 이상 비밀 문자열. 아래 명령으로 생성 |
| `VCU_AI_PROVIDER` | 기본값은 로컬. 설정하지 않아도 됩니다. 유료 API를 명시적으로 쓸 때만 `openai` |
| `VCU_LOCAL_MODEL` | 선택사항. 기본 `qwen3:4b-instruct`. 실행 중인 로컬 worker 모델이 우선 |

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

로컬 모드에서는 기존 `OPENAI_API_KEY`가 저장돼 있어도 호출하지 않습니다. 유료 OpenAI 모드를 명시적으로 켤 경우에만 `OPENAI_API_KEY`와 선택사항 `VCU_LLM_MODEL`(기본 gpt-4.1-mini)이 사용됩니다. 환경변수는 변경 후 다시 배포하세요.

Netlify Blobs는 사이트에 자동 연결되는 서버 저장소입니다. 별도 DB 계정이 필요하지 않습니다. 일반 재배포 후에도 기록을 유지합니다. 사이트 삭제는 별도 작업이므로 먼저 JSON을 백업하세요. 배포 미리보기에서 실제 워크숍 데이터를 다루지 마세요.

배포 주소 `https://내사이트.netlify.app`에서 진행자 로그인 → 코드 입력란을 비우고 새 워크숍 생성. 한국 시간 날짜와 순번으로 코드가 만들어집니다. 예: `1031a`, `1031b`. 기존 로컬 SQLite 기록은 자동으로 인터넷에 전송되지 않습니다.

## 현장 진행

- 진행자: 카드 선택 또는 무작위 뽑기, 3/5/7/10분 타이머, 조별 결론 확인, 공용 스크린, 내보내기.
- 참가자: QR → KR/US 방 선택 → 동의 → 다섯 질문. 같은 방의 작성 내용이 약 3초 간격으로 갱신됩니다. 자동 저장은 입력이 멈춘 뒤 약 1.2초입니다. 저장 완료 표시를 확인하세요.
- 서버 시간 기준으로 마감합니다. 화면을 모두 닫았더라도 다음 요청에서 종료 상태가 확정되며, 마감 뒤 입력은 거부됩니다.
- 휴대폰: LTE/5G나 다른 Wi-Fi에서도 **배포 주소**로 접속합니다. localhost 주소는 인터넷 접속 주소가 아닙니다.
- QR은 배포 주소를 자동 사용합니다. 진행자 화면에 표시된 QR을 공유하세요. 커스텀 도메인 사용 후 QR 주소를 확인하세요.
- 토론 뒤: 카드마다 양쪽 조의 영어 결론 확정 → 페르소나 생성 → 동일 질문에 두 AI 응답.
- 두 모델은 같은 모델/템플릿/생성 설정을 사용하고, 각 조의 영어 결론과 참가자별 최신 개별 응답을 참고합니다. 실제 모델 가중치 학습이 아닌 프롬프트 기반 페르소나입니다. 소수 의견과 불확실성도 구분합니다.
- 개인 응답의 이전 버전, 조별 결론 버전, 생성 시점의 프롬프트, 모델 응답은 JSON에 각각 보존합니다. 해석·대답·행동·감정 필드를 합치지 않습니다.
- 기본 모드에서는 실제 로컬 Ollama 모델이 답변합니다. 실패/시간 초과 시 오류를 남기며 가짜 답변을 만들지 않습니다. 질문당 두 페르소나를 로컬에서 순차 생성합니다.

## 무료 운영 범위

Netlify Free 플랜의 사용량 범위 내 운영을 위한 구성입니다. 무료 한도는 무제한이 아니며, 트래픽/서버 함수/저장소/배포 사용량을 Netlify에서 확인하세요. 로컬 AI에는 API 호출료가 없으며 개인 컴퓨터의 전력과 하드웨어를 사용합니다. OpenAI 모드를 따로 켜면 그때만 API 과금/크레딧이 적용됩니다.

활성 탭은 3초 간격으로 갱신하고 숨겨진 탭은 자동 조회를 멈춥니다. 온라인 워크숍당 참가자 150명, 질문 100회 상한이 있습니다. 로컬 AI는 질문을 대기열에 넣고 진행자 컴퓨터에서 처리하므로 서버 함수의 60초 제한을 넘는 생성도 가능합니다. 연결 확인용 요청도 Netlify 사용량에 포함됩니다. 운영 전 실제 인원으로 동시 접속 리허설을 권장합니다. 로컬 테스트는 소규모 경합 검증이며 150명 부하 검증을 뜻하지 않습니다.

공식 문서: https://docs.netlify.com/build/data-and-storage/netlify-blobs/ · https://docs.netlify.com/build/functions/configuration/ · https://www.netlify.com/pricing/

## 백업과 로컬 Sentence-BERT

진행자 화면 **JSON ↓** 또는 아카이브에서 다운로드합니다. JSON은 전체 이력을 보존하고 CSV는 사람·회차별 최신 응답을 담습니다. CSV는 Excel 수식으로 해석될 수 있는 텍스트를 이스케이프합니다. 워크숍이 끝날 때마다 별도 드라이브에 JSON 사본을 보관하세요.

Python 3.11 이상에서:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-local.txt
# 인터넷이 되는 곳에서 모델 사전 다운로드
.venv\Scripts\python -m backend.model
# 다운로드한 JSON 분석 (같은 상황의 해석끼리만 비교)
.venv\Scripts\python scripts/analyze_export.py 1031a-workshop.json --field meaning --output analysis-meaning.json
# 여러 워크숍을 모아서 분석
.venv\Scripts\python scripts/analyze_export.py 1031a-workshop.json 1031b-workshop.json --field action --output analysis-action.json
```

모델은 `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`. 최초 다운로드의 revision/path는 로컬 `data/model-lock.json`에 고정됩니다. 사전 다운로드 후 분석은 로컬 파일만 사용합니다. 선택 필드는 `meaning`, `reply`, `action`, `emotion`. 같은 상황·같은 필드끼리만 비교하며, 마지막에 저장된 응답을 사용합니다. 입력 길이/잘림 여부를 기록합니다. 모델 로딩 실패 시 실패 상태만 저장하고 점수는 생성하지 않습니다. 사람의 최종 판단은 `human_reviews`에 별도로 기록할 수 있습니다. 현재 클라우드 화면으로 분석 결과를 다시 올리는 기능은 없습니다.

## 개발·검증

```powershell
npm ci
npm run test:cloud
npm run build
# Netlify 함수와 Blobs까지 로컬 실행: 별도 터미널, localhost:8888
# .env 파일에 위 서버 환경변수를 넣고 (커밋 제외)
npx netlify-cli dev
```

Netlify Dev는 `netlify.toml` 설정의 클라우드 빌드를 사용합니다. 순수 `npm run dev`는 기존 Python 서버(localhost:8000) 프록시를 사용하는 로컬 개발 모드입니다.

기존 현장용 로컬 서버도 유지됩니다:

```powershell
npm run build
$env:VCU_ADMIN_PASSWORD = '원하는 비밀번호'
$env:VCU_PUBLIC_URL = 'http://이컴퓨터의IPv4:8000'
.venv\Scripts\python -m uvicorn backend.app:app --host 0.0.0.0 --port 8000
```

같은 Wi-Fi 휴대폰은 `http://이컴퓨터의IPv4:8000` 사용, Windows 방화벽에서 해당 포트를 허용합니다. 외부 접속은 Netlify 주소를 사용합니다. 로컬 백업: `.venv\Scripts\python scripts/backup.py`.

검증 내역은 `NETLIFY_VALIDATION.md`를 참고하세요. 실제 배포와 실제 유료 API 호출 검증은 별도로 표시합니다.

### 로컬 서버에서 Ollama 직접 사용
기본 로컬 공급자는 Ollama, 모델은 `qwen3:4b-instruct`입니다. `ollama serve`를 실행한 뒤 FastAPI 서버를 시작하면 새 워크숍에도 자동 적용됩니다. `VCU_LLM_PROVIDER=openai`를 명시한 경우만 OpenAI를 사용합니다. 모델을 바꾸기 전에 만든 페르소나는 결론 확인 화면에서 다시 확정하세요. 이전 프롬프트와 응답 버전은 보존됩니다.
현재 리허설: http://127.0.0.1:8013/ (데이터 `.local-ai/console-demo-data`, 진행자 비밀번호 `local-preview-only`). 이 주소는 이 컴퓨터 전용입니다. Netlify 참가자 데이터와의 연결은 별도의 `scripts/start-local-ai.ps1` 클라우드 워커를 사용하며, 직접 로컬 서버와 자동 동기화되지는 않습니다.

