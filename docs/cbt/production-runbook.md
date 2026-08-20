# CBT 배치 파이프라인 Production Runbook (Phase 0)

## 1. 목적과 금지사항

- 목적: ingest→generate→review→promote로 검증된 문제만 출시 상태로 승격한다.
- **실제 DB/LLM 실행은 금지**: 이 BUILD에서는 dry-run/명령 예시만 허용.
- DB 삭제/수정, migration, commit/push 금지. 반영 전 반드시 검토 후 진행.

## 2. Provider preflight

- `createConfiguredProvider`가 DB/LLM 쓰기 **전에** 유효성을 검사한다:
  - `CBT_LLM_API_KEY` 필수 (부재 시 throw)
  - `CBT_LLM_BASE_URL`은 HTTP(S) URL, `CBT_LLM_MODEL` 비어있지 않아야 함
- **mock 금지**: production CLI는 자동 mock 대체/`--mock` 없음. 실패 시 즉시 중단.
- **secret 비로그**: API key를 로그/IDS 파일에 출력하지 않는다. `.env`로 관리.

## 3. dry-run과 카테고리 분포 확인

```bash
npm run cbt:batch-generate -- --limit=10 --dry-run
```

- LLM 호출 0, DB write 0. `처리 대상 N건, 스킵 M건`, `카테고리 분포 CAT-A=n CAT-B=n` 출력.
- dry-run은 preflight를 거치지 않는다(LLM 미호출이므로).

## 4. 명시 ids / ids-file / REJECTED 제외

```bash
npm run cbt:batch-generate -- --ids=id1,id2 --limit=5
npm run cbt:batch-generate -- --ids-file=./targets.txt --limit=5
```

- 명시 선택 시 limit/all 없이 실행 가능(범위가 제한됨). 단, **REJECTED는 어느 경로든 제외**.
- `--ids-file`은 줄 단위, `#` 주석 무시. 목록이 없으면 "명시한 ID 중 대상 candidate가 없습니다" 오류.

## 5. runId JSONL (fail-closed)

- 위치: `data/cbt/runs/<runId>.jsonl` (`CBT_BATCH_RUNS_DIR`)
- 필드: `run_start`(command/args/targets/total/concurrency/createdAt),
  `item_result`(itemId/outcome succeeded|failed/detail/at),
  `run_end`(succeeded/failed/durationMs/aborted/abortReason)
- run 시작 로그를 기록 못하면 실행 전 거부(fail-closed). mid-run append 실패 시
  broken→신규 항목 스케줄링 중단, `aborted=true/abortReason=log_failure`로 종료됨.

## 6. Circuit breaker

- provider transient(`timeout`/`provider_error`/`rate_limited`/`server_error`) 연속 **5회** → providerBreaker open
- semantic QA_FAILED 연속 **10회** → semanticBreaker open
- open이면 이후 항목을 `circuit_open`으로 단락(LLM 호출 없음). terminal 계열은 계수하지 않음.

## 7. Targeted resume

```bash
npm run cbt:batch-generate -- --resume=<runId>
```

- **FAILED/QA_FAILED만** 재시도하고 정상 GQ/기존 데이터는 변경하지 않는다. `--force`로 숫자를 채우지 않으며, 기존 정상 GQ 재생성 위험이 있어 승인 없이 사용 금지. REJECTED guard는 절대 우회할 수 없다.
- resume 대상은 실패 item + item_result 없는 incomplete 대상(resume 신뢰성).

## 8. Pilot (이 BUILD에서는 명령 예시만, 실제 실행 금지)

```bash
npm run cbt:batch-generate -- --limit=5 --category=<CATEGORY_CODE> --concurrency=1
```

- **`--category=<CATEGORY_CODE>` 하나의 카테고리씩, 카테고리별로 명령을 반복** 실행한다.
- **반드시 `--concurrency=1`**, 소량·카테고리 균형으로만. 실제 실행 시 human gate 통과 후.

## 9. pause / abort / resume 절차

1. **pause/abort**: `Ctrl+C`로 중단. 중간에 쌓인 item_result를 남긴다.
2. 중단된 run의 runId를 기록한다 (로그에 `runId: ...`).
3. **resume**: `--resume=<runId>`로 실패분만 재진입.

## 10. 단계별 실행 (각 단계는 human review gate 전후)

```bash
# ingest (수집 → candidate)
npm run cbt:batch-ingest -- --source=NEWBT-HWMUL --ids=id1,id2 --limit=10 --dry-run
npm run cbt:batch-ingest -- --source=NEWBT-HWMUL --ids=id1,id2 --limit=10

# generate (candidate → generated)
npm run cbt:batch-generate -- --limit=10 --dry-run
npm run cbt:batch-generate -- --limit=10

# review (human gate: 승인 전 사람 확인)
npm run cbt:batch-review -- --action=approve --ids=uuid --reviewer=<id>

# promote (승인된 것만 master로)
npm run cbt:batch-promote -- --ids=uuid --dry-run
npm run cbt:batch-promote -- --ids=uuid
```

- **human review gate**: promote 전 반드시 사람이 approve. `--all`은 confirm flag 필수
  (`--i-am-sure-to-approve-all-unchecked` 등)로 전면 승인 보호.

## 11. QA v3.1 고정 / bypass 금지

- QA는 `AUTO_QA_PROMPT_VERSION = step8-auto-qa-v3.1` 고정. 버전 bypass나 QA 없이 승격 금지.
- promote는 QA_PASSED가 아니라 **human review 후 APPROVED 상태만** 승격할 수 있다.

## 12. exit code / 검증 체크리스트

- exit code 0: 정상 완료. 1: aborted 또는 전수 실패.
- 실행 후 확인: (a) runId JSONL에 run_start→item_result→run_end 순서 존재
  (b) 대상 건수·카테고리 분포가 dry-run과 일치 (c) 실패 id는 `--resume`으로 재진입
  (d) abortReason/log_failure면 중단 원인 파악 후 재실행

## 13. 문제 시 중단 / 되돌릴 코드 변경 범위

- 문제 발생 시 즉시 중단(`Ctrl+C`), 이후 명령·DB 쓰기 금지.
- 되돌릴 범위: 이 세션의 코드 변경(generate/ingest/review/promote + runlog/breaker +
  candidate-query 등)은 원복하되 **DB 삭제/수정 금지**. runId 로그 보존 후 원인 분석 및 재설계.