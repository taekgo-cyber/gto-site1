// QA v3 실측 검증 대상 38건 (PLAN READY 후 확정).
// - sourceQuestionId: 원문(CandidateQuestion) ID
// - generatedQuestionId: 기존 GeneratedQuestion (QA v3 재평가 대상)
// - group: must-fail / must-pass / adjudicated-fail / edge
// - expected: FAIL | PASS | OBSERVE
// - reason: 선정 근거 (v3 기대값 판단)
//
// 주의:
// - mock provider 오염 행(92628 등)은 제외한다.
// - 이미지 기반 원문(92477)은 텍스트 QA 판정 불가로 제외한다.
// - 이 목록은 실측 실행·집계에 그대로 사용한다.

export type ReQaExpected = "FAIL" | "PASS" | "OBSERVE";
export type ReQaGroup = "must-fail" | "must-pass" | "adjudicated-fail" | "edge";

export type ReQaTargetSpec = {
  sourceQuestionId: string;
  generatedQuestionId: string;
  group: ReQaGroup;
  expected: ReQaExpected;
  reason: string;
};

export const REQA_TARGETS: ReQaTargetSpec[] = [
  // ------------------------------------------------------------------
  // Must FAIL (11건) — v3에서 반드시 FAIL
  // ------------------------------------------------------------------
  {
    sourceQuestionId: "92596",
    generatedQuestionId: "cmsyk4zaz00197wrotovscnn9",
    group: "must-fail",
    expected: "FAIL",
    reason:
      "질문 극성 변경(틀린 것→올바른 것)+원문 정답 미보존. v2 false-pass 확정건(답은 정답 보존 규칙 B).",
  },
  {
    sourceQuestionId: "92510",
    generatedQuestionId: "cmsyjjera00047wro2znasu4l",
    group: "must-fail",
    expected: "FAIL",
    reason:
      "정량 질문(몇 % 감속)을 정성 질문(이유)으로 초점 변경. 원문 정답 '20% 감속' 미보존. v2 false-pass(규칙 A).",
  },
  {
    sourceQuestionId: "93013",
    generatedQuestionId: "cmsylg49k004j7wrog9s2qd3h",
    group: "must-fail",
    expected: "FAIL",
    reason:
      "'지원활동 해당 항목' 질문을 '두 활동 구분' 질문으로 초점 변경. 원문 정답(자재관리) 미보존. v2 false-pass(규칙 A/B).",
  },
  {
    sourceQuestionId: "92450",
    generatedQuestionId: "cmsx56k7k0007qgro371ghoae",
    group: "must-fail",
    expected: "FAIL",
    reason:
      "핵심 수치 '2년' 삭제 후 '일정 기간'으로 뭉갬. 원문 정답 미보존. APPROVED+Master active 상태로도 검출 확인 대상(규칙 A/B).",
  },
  {
    sourceQuestionId: "92502",
    generatedQuestionId: "cmsx9lr0p001ungrof8o0thoq",
    group: "must-fail",
    expected: "FAIL",
    reason:
      "생성 정답(촉각: 느슨함·흔들림·발열)이 원문 정답(후각: 발열냄새)과 의미 불일치. 원문 데이터 품질 의심은 별도 기록(규칙 B).",
  },
  {
    sourceQuestionId: "92452",
    generatedQuestionId: "cmsx6d4d2000070rokajwb13h",
    group: "must-fail",
    expected: "FAIL",
    reason:
      "해설에 원문에 없는 행동요령('신속히 교차로를 빠져나가야 함') 주입. v2도 FAIL, v3 유지 확인(규칙 D).",
  },
  {
    sourceQuestionId: "92458",
    generatedQuestionId: "cmsx8b0qp0004ngrow159eaew",
    group: "must-fail",
    expected: "FAIL",
    reason:
      "원문에 없는 '좌측 도로에서 진입하는 차량이 우선'을 새 정답으로 생성(규칙 B/C).",
  },
  {
    sourceQuestionId: "92474",
    generatedQuestionId: "cmsx8m36j000vngrosc6b59xt",
    group: "must-fail",
    expected: "FAIL",
    reason: "생성 정답이 원문 정답 보기와 불일치(운송장 기능). v2도 FAIL, v3 유지 확인(규칙 B).",
  },
  {
    sourceQuestionId: "92506",
    generatedQuestionId: "cmsx9pwgu0026ngrorztjtomd",
    group: "must-fail",
    expected: "FAIL",
    reason: "원문에 없는 보기를 새 정답으로 사용 + 환각. v2도 FAIL, v3 유지 확인(규칙 B/D).",
  },
  {
    sourceQuestionId: "92482",
    generatedQuestionId: "cmsyi9m5s0000jkro1q7pliaw",
    group: "must-fail",
    expected: "FAIL",
    reason:
      "생성 정답과 원문 정답 불일치. 원문 정답[3] 자체 오류 의심은 별도 기록. 정책상 FAIL이 정답(규칙 B).",
  },
  {
    sourceQuestionId: "92499",
    generatedQuestionId: "cmsyj9nuh00000srol0vwwe6u",
    group: "must-fail",
    expected: "FAIL",
    reason:
      "예방 방법 질문을 현상 명칭 질문으로 초점 변경. 원문 정답(속도 낮추고 공기압 높이기) 선택지에서 소실(규칙 A).",
  },

  // ------------------------------------------------------------------
  // Adjudicated FAIL (1건) — human adjudication 확정, production rejection 대상
  // ------------------------------------------------------------------
  {
    sourceQuestionId: "92462",
    generatedQuestionId: "cmsx8cbrd0007ngroxcce1bfk",
    group: "adjudicated-fail",
    expected: "FAIL",
    reason:
      "HUMAN ADJUDICATION 확정(2026-08-19): 원문은 '운행차의 최고 속도'인데 생성본은 '화물차의 최고 속도'로 특정. 원천 스니펫·DB에 '운행차=화물차' 근거 없음, 원문에 없는 대상/조건 특정(Rule A/D), 생성 질문·해설 대상 표현도 불일치. source-grounded 정책상 실제 생성 결함 → production rejection/regeneration 대상.",
  },

  // ------------------------------------------------------------------
  // Must PASS (23건) — 정상 변형, v3에서 PASS
  // ------------------------------------------------------------------
  {
    sourceQuestionId: "92613",
    generatedQuestionId: "cmsyklh6o00227wrodzr8sxnc",
    group: "must-pass",
    expected: "PASS",
    reason: "신규등록 임시운행 허가기간 10일 이내, 수치·초점 보존.",
  },
  {
    sourceQuestionId: "92615",
    generatedQuestionId: "cmsykna1b00267wro3bunip35",
    group: "must-pass",
    expected: "PASS",
    reason: "자동차전용도로 지정/경찰청장 의견. 보기 shuffle(정답 3→1), 정답 텍스트 동일.",
  },
  {
    sourceQuestionId: "92608",
    generatedQuestionId: "cmsykgu3j001t7wrowq0ey9zf",
    group: "must-pass",
    expected: "PASS",
    reason: "화물자동차운송사업 정의. 보기 shuffle(정답 3→1), 정답 텍스트 동일.",
  },
  {
    sourceQuestionId: "92568",
    generatedQuestionId: "cmsyjjq6l00057wromqj1l28f",
    group: "must-pass",
    expected: "PASS",
    reason: "범퍼 규격 두께 5mm/폭 100mm 이상. 보기 shuffle(정답 3→4), 수치·의미 보존.",
  },
  {
    sourceQuestionId: "92614",
    generatedQuestionId: "cmsykmqqf00257wro5qt4r23k",
    group: "must-pass",
    expected: "PASS",
    reason: "대기환경보전법 매연 정의. 보기 shuffle(정답 4→3). (오답 오타 '입장상' watch).",
  },
  {
    sourceQuestionId: "92617",
    generatedQuestionId: "cmsykoxra002a7wrod9dsbqjm",
    group: "must-pass",
    expected: "PASS",
    reason: "EDI 구축 시 스티커형 운송장. 질문 재구성, 정답 보존.",
  },
  {
    sourceQuestionId: "92959",
    generatedQuestionId: "cmsyl805r003w7wrouco8389t",
    group: "must-pass",
    expected: "PASS",
    reason: "방호울타리/사고유형 전환. 정답 텍스트 재구성 수준.",
  },
  {
    sourceQuestionId: "92954",
    generatedQuestionId: "cmsyl2qps003m7wromt3cblm7",
    group: "must-pass",
    expected: "PASS",
    reason: "25→50km 원심력 4배. 수치·초점 보존.",
  },
  {
    sourceQuestionId: "92451",
    generatedQuestionId: "cmsx56cge0006qgroqctnno1l",
    group: "must-pass",
    expected: "PASS",
    reason: "서행 정의. 원문 오타(잇는→있는) 교정 등 표현 정리 수준.",
  },
  {
    sourceQuestionId: "92455",
    generatedQuestionId: "cmsx5sz660006xwro37xfp8p7",
    group: "must-pass",
    expected: "PASS",
    reason: "빨간 헝겊 규격 30cm×50cm. 수치 보존.",
  },
  {
    sourceQuestionId: "92463",
    generatedQuestionId: "cmsx8feyw000engro64uze5vp",
    group: "must-pass",
    expected: "PASS",
    reason: "중앙선 침범 공소권. 원문 오타(체중→정체) 교정, 극성 유지.",
  },
  {
    sourceQuestionId: "92486",
    generatedQuestionId: "cmsyim2d50000jorovm5h0ptv",
    group: "must-pass",
    expected: "PASS",
    reason: "택배 손해배상책임 소멸 1년. 장문 재구성이되 의미 보존.",
  },
  {
    sourceQuestionId: "92493",
    generatedQuestionId: "cmsyiun5a00006grodpwbiafr",
    group: "must-pass",
    expected: "PASS",
    reason: "시야/속도 관계. 정답 문장 동의어 재구성 수준 — 완화 규칙 검증.",
  },
  {
    sourceQuestionId: "92569",
    generatedQuestionId: "cmsyjklnx00097wrov0hkah06",
    group: "must-pass",
    expected: "PASS",
    reason: "서비스 동시성. 단답 정답 보존.",
  },
  {
    sourceQuestionId: "92579",
    generatedQuestionId: "cmsyjttqt000s7wroscfxn0dq",
    group: "must-pass",
    expected: "PASS",
    reason: "물류 발전 과정 순서(물류→로지스틱스→SCM). 배열형 보존.",
  },
  {
    sourceQuestionId: "92584",
    generatedQuestionId: "cmsyk2rbx00127wrofxfg3vil",
    group: "must-pass",
    expected: "PASS",
    reason: "자동차 비해당(농업용 콤파인). 부정 극성 유지.",
  },
  {
    sourceQuestionId: "92592",
    generatedQuestionId: "cmsyk2t1q00137wrou2yevvst",
    group: "must-pass",
    expected: "PASS",
    reason: "정차 정의 5분. 빈칸형→정의형 재구성이되 의미 보존.",
  },
  {
    sourceQuestionId: "92604",
    generatedQuestionId: "cmsykd3g7001o7wronc6cz270",
    group: "must-pass",
    expected: "PASS",
    reason: "업무상과실치상 5년·2천만원. 복합 수치 보존.",
  },
  {
    sourceQuestionId: "92606",
    generatedQuestionId: "cmsykf9za001r7wro7zyxezwu",
    group: "must-pass",
    expected: "PASS",
    reason: "경찰 속도추정방법. '틀린 것'→'옳지 않은 것' 동극성 유지.",
  },
  {
    sourceQuestionId: "92620",
    generatedQuestionId: "cmsykpzx5002e7wro1e41fepg",
    group: "must-pass",
    expected: "PASS",
    reason: "포장재료 분류(방청포장). 초점·정답 보존.",
  },
  {
    sourceQuestionId: "92946",
    generatedQuestionId: "cmsykzl3r003e7wromm2vos1w",
    group: "must-pass",
    expected: "PASS",
    reason: "심경각/심시력 쌍 연결형. 보기 순서 shuffle이어도 의미 보존.",
  },
  {
    sourceQuestionId: "92960",
    generatedQuestionId: "cmsyl9akr003y7wro0md7w75g",
    group: "must-pass",
    expected: "PASS",
    reason: "내리막 브레이크 사용. 정답 문장 재구성 수준.",
  },
  {
    sourceQuestionId: "93028",
    generatedQuestionId: "cmsyliv4m004x7wro9oi3udt8",
    group: "must-pass",
    expected: "PASS",
    reason: "송하인 기재사항이 아닌 것. 부정 극성 유지.",
  },

  // ------------------------------------------------------------------
  // Edge Case (3건)
  // ------------------------------------------------------------------
  {
    sourceQuestionId: "92571",
    generatedQuestionId: "cmsyjmkp9000f7wroh15qis05",
    group: "edge",
    expected: "PASS",
    reason: "v2 유일 결함이 '주어(화물운송종사자가) 보충'. v3 규칙 D 완화 검증. FAIL 시 과잉 보수 신호.",
  },
  {
    sourceQuestionId: "92570",
    generatedQuestionId: "cmsyjmec6000e7wrohxcpeadh",
    group: "edge",
    expected: "FAIL",
    reason: "해설에 원문 외부 지식('추측 운전은 사고 위험') 추가. 완화가 해설 환각까지 허용하면 안 됨.",
  },
  {
    sourceQuestionId: "92498",
    generatedQuestionId: "cmsyj6ac30000s8ro8tgikdt4",
    group: "edge",
    expected: "OBSERVE",
    reason: "해설의 소거법 추론 경계 사례. Gate에 포함하지 않고 결과만 기록.",
  },
];
