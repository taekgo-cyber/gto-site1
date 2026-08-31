export type ContentPatch =
  | { field: "questionText"; from: string; to: string }
  | { field: "explanation"; from: string; to: string }
  | { field: "choice"; index: 1 | 2 | 3 | 4; from: string; to: string };

export type ContentCorrection = {
  masterQuestionId: string;
  sourceQuestionId: string;
  reason: "SHUFFLE_FRAGILE" | "TYPO" | "SOURCE_VERIFIED" | "LOCALIZATION";
  patches: readonly ContentPatch[];
};

/**
 * Source-controlled post-promotion corrections for the frozen Soft Launch CBT set.
 * CandidateQuestion is provenance and remains immutable. These corrections are
 * deliberately exact-before -> exact-after so stale or unexpected content fails closed.
 */
export const CBT_LAUNCH_CONTENT_CORRECTIONS: readonly ContentCorrection[] = [
  {
    masterQuestionId: "cmsx79gsk000360ro99qdlrgb", sourceQuestionId: "92456", reason: "SHUFFLE_FRAGILE",
    patches: [{ field: "explanation", from: "제시된 보기 중 오답으로 분류된 80/40, 90/40, 110/40을 제외하면, 최고속도 90km/h와 최저속도 50km/h가 남습니다. 따라서 정답은 3번입니다.", to: "제시된 조합 중 80/40, 90/40, 110/40은 기준과 맞지 않으며, 최고속도 90km/h와 최저속도 50km/h의 조합이 올바릅니다." }],
  },
  {
    masterQuestionId: "cmsxadij60002k4ro7e6nybsb", sourceQuestionId: "92457", reason: "SHUFFLE_FRAGILE",
    patches: [{ field: "explanation", from: "제시된 보기 중에서 보도를 횡단하기 직전, 철길건널목을 통과하고자 하는 때, 보행자가 횡단 보도를 통과하고 있을 때는 일시정지가 필요한 상황으로 언급된 반면, 비탈길 고갯마루 부근은 일시정지가 필요한 상황으로 제시되지 않았으므로 정답은 2번입니다.", to: "보도를 횡단하기 직전, 철길건널목을 통과하고자 하는 때, 보행자가 횡단보도를 통과하고 있을 때는 일시정지가 필요한 상황인 반면, 비탈길 고갯마루 부근은 이에 해당하지 않습니다." }],
  },
  {
    masterQuestionId: "cmsxazox100008gro1x8o9hby", sourceQuestionId: "92472", reason: "SHUFFLE_FRAGILE",
    patches: [{ field: "explanation", from: "과적 차량 통행 제한의 이유로는 도로·교량의 파손, 차량 조종의 어려움, 제동장치 및 동력전달장치의 고장 등이 제시된다. 고속 주행으로 인한 교통소통 지장은 과적 자체보다는 주행 행태에 의한 것으로, 직접적인 통행 제한 사유로 보기 어렵다. 따라서 정답은 3번이다.", to: "과적 차량 통행 제한의 이유로는 도로·교량의 파손, 차량 조종의 어려움, 제동장치 및 동력전달장치의 고장 등이 제시됩니다. 고속 주행으로 인한 교통 흐름 저해는 과적 자체보다 주행 행태에 따른 영향이므로 가장 관계가 먼 항목입니다." }],
  },
  {
    masterQuestionId: "cmsxazox700018gron3d6tfjk", sourceQuestionId: "92481", reason: "SHUFFLE_FRAGILE",
    patches: [{ field: "explanation", from: "제시된 보기 중 축하중 10톤 초과, 총중량 40톤 초과, 길이 16.7m 초과는 고속도로 운행 제한 차량 기준으로 제시된 반면, 높이 3m 초과는 제한 기준으로 제시되지 않았으므로 정답은 3번이다.", to: "축하중 10톤 초과, 총중량 40톤 초과, 길이 16.7m 초과는 운행 제한 기준에 해당합니다. 반면 적재물을 포함한 차량의 높이가 3m를 초과한다는 것만으로는 일반적인 높이 제한 기준인 4.0m를 초과하지 않습니다." }],
  },
  {
    masterQuestionId: "cmtgeutzu000648roxxy671t2", sourceQuestionId: "92997", reason: "SHUFFLE_FRAGILE",
    patches: [{ field: "explanation", from: "고객 서비스는 단순한 사후 처리나 일시적 활동이 아니라, 고객의 품질 만족을 위해 지속적으로 제공되는 모든 활동을 의미한다. 따라서 보기 4가 가장 올바른 설명이다.", to: "고객 서비스는 단순한 사후 처리나 일시적 활동이 아니라 고객의 품질 만족을 위해 지속적으로 제공되는 모든 활동을 의미합니다. 이러한 설명이 고객 서비스의 의미를 가장 적절하게 나타냅니다." }],
  },
  {
    masterQuestionId: "cmtgeuu07000a48rok7frj7cl", sourceQuestionId: "92597", reason: "SHUFFLE_FRAGILE",
    patches: [{ field: "explanation", from: "긴급자동차의 특례는 긴급한 용도로 운행될 때만 인정되며, 본래 용도와 무관하게 적용되는 것은 아니다. 따라서 4번이 틀린 설명이다.", to: "긴급자동차의 특례는 긴급한 용도로 운행될 때만 인정됩니다. 따라서 '긴급자동차의 본래 용도와 관계없이 모든 경우에 특례가 적용된다'는 설명이 틀립니다." }],
  },
  {
    masterQuestionId: "cmtgeuu07000b48roq3j4rzpa", sourceQuestionId: "92573", reason: "SHUFFLE_FRAGILE",
    patches: [{ field: "explanation", from: "사회경제적 관점에서 물류는 인간의 경제활동 중 운송, 통신, 상업 활동을 주축으로 하며 이를 지원하는 제반 활동을 포함하는 개념으로 이해된다. 따라서 4번이 정답이다.", to: "사회경제적 관점에서 물류는 인간의 경제활동 중 운송·통신·상업 활동을 중심으로 하며, 이를 지원하는 제반 활동을 포함하는 개념으로 이해됩니다." }],
  },
  {
    masterQuestionId: "cmtgeuu0e000f48roxm67uo3p", sourceQuestionId: "92578", reason: "SHUFFLE_FRAGILE",
    patches: [{ field: "explanation", from: "주어진 정의에 따르면 가동률, 실차율, 공차거리율은 각각 올바르게 설명되었으나, 첫 번째 설명은 효율성 지표에 대한 올바른 설명이 아니다. 따라서 1번이 틀린 설명이다.", to: "가동률, 실차율, 공차거리율에 대한 설명은 각각 타당합니다. 반면 적재율이 낮은 상태에서 가동률을 높이는 것이 가장 바람직하다는 설명은 운송 효율성을 높이는 방법으로 옳지 않습니다." }],
  },
  {
    masterQuestionId: "cmtgeuu20001948roliqk59db", sourceQuestionId: "92577", reason: "SHUFFLE_FRAGILE",
    patches: [{ field: "explanation", from: "제4자 물류의 4단계 중 '2단계-전환'은 전략적 사고, 조직변화관리, 고객의 공급망 활동과 프로세스를 통합하기 위한 기술을 강화하는 단계입니다. 따라서 1번이 정답입니다.", to: "제4자 물류의 '전환(Transition)' 단계는 전략적 사고와 조직 변화 관리, 고객의 공급망 활동과 프로세스를 통합하기 위한 기술을 강화하는 단계입니다." }],
  },
  {
    masterQuestionId: "cmtgeuu29001e48rob8s031d4", sourceQuestionId: "92622", reason: "SHUFFLE_FRAGILE",
    patches: [{ field: "explanation", from: "문제에서 잘못된 것을 묻고 있으며, 보기 1, 2, 4는 올바른 화물 운송 방법으로 제시되었고, 보기 3은 올바른 방법으로 언급되지 않았으므로 정답은 3번이다.", to: "화물을 들 때 허리에 부담을 줄이려면 허리를 구부려 드는 것이 아니라 무릎을 굽힌 뒤 다리의 힘을 이용해야 합니다. 따라서 '허리에 부담이 없도록 허리를 구부린다'는 설명이 옳지 않습니다." }],
  },
  {
    masterQuestionId: "cmtgeuu1o001248roon9xq6ox", sourceQuestionId: "92943", reason: "TYPO",
    patches: [
      { field: "choice", index: 2, from: "구심성 신경 → 원심성 심경 → 의사결정과정 → 운전조작행위", to: "구심성 신경 → 원심성 신경 → 의사결정과정 → 운전조작행위" },
      { field: "explanation", from: "문제에서 요구하는 올바른 정보처리 과정은 구심성 신경을 통한 정보 입력, 의사결정과정, 원심성 신경을 통한 명령 전달, 그리고 운전조작행위의 순서이다. 따라서 4번이 정답이다.", to: "올바른 정보처리 순서는 구심성 신경을 통한 정보 입력 → 의사결정과정 → 원심성 신경을 통한 명령 전달 → 운전조작행위입니다." },
    ],
  },
  {
    masterQuestionId: "cmsyjcl8h0000kkroxtgmz85q", sourceQuestionId: "92483", reason: "TYPO",
    patches: [
      { field: "choice", index: 3, from: "푸장 부실물품 및 무포장 물품(비닐포장 또는 소핑백 등)", to: "포장 부실물품 및 무포장 물품(비닐포장 또는 쇼핑백 등)" },
      { field: "explanation", from: "고객유의사항 확인 요구 물품에는 중고 가전제품 및 A/S용 물품, 푸장 부실물품 및 무포장 물품(비닐포장 또는 소핑백 등), 파손 우려 물품 및 내용검사가 부적당하다고 판단되는 물품이 해당한다. 따라서 '기계류, 장비 등 중량 고가물로 20kg 초과 물품'은 고객유의사항 확인 요구 물품에 해당하지 않으므로 틀린 보기이다.", to: "고객유의사항 확인 요구 물품에는 중고 가전제품 및 A/S용 물품, 포장 부실물품 및 무포장 물품(비닐포장 또는 쇼핑백 등), 파손 우려 물품 및 내용검사가 부적당하다고 판단되는 물품이 해당합니다. 따라서 '기계류, 장비 등 중량 고가물로 20kg 초과 물품'은 고객유의사항 확인 요구 물품에 해당하지 않는 항목입니다." },
    ],
  },
  {
    masterQuestionId: "cmtgeuu0v000l48ro577cvyfi", sourceQuestionId: "92468", reason: "TYPO",
    patches: [
      { field: "choice", index: 2, from: "화물의 원할한 운송", to: "화물의 원활한 운송" },
      { field: "explanation", from: "화물자동차운수 사업법의 목적에는 운수사업의 효율적 관리, 화물의 원할한 운송, 공공복리 증진이 포함되며, 화물자동차의 안전 확보는 목적에 해당하지 않는다.", to: "화물자동차운수 사업법의 목적에는 운수사업의 효율적 관리, 화물의 원활한 운송, 공공복리 증진이 포함되며, 화물자동차의 안전 확보는 목적에 해당하지 않습니다." },
    ],
  },
  {
    masterQuestionId: "cmsxadik2000ek4ron4wjagnn", sourceQuestionId: "92478", reason: "SOURCE_VERIFIED",
    patches: [{ field: "choice", index: 2, from: "15 ~ 15kg", to: "15 ~ 20kg" }],
  },
  {
    masterQuestionId: "cmtgeuu1x001748rodt6g63o1", sourceQuestionId: "92571", reason: "LOCALIZATION",
    patches: [
      { field: "questionText", from: "Which of the following is NOT one of the three attitudes toward one's occupation?", to: "다음 중 직업에 대한 세 가지 태도에 해당하지 않는 것은?" },
      { field: "explanation", from: "The three attitudes toward one's occupation are 애정, 긍지, and 열정. Therefore, 항명 is not one of them.", to: "직업에 대한 세 가지 태도는 애정, 긍지, 열정입니다. 따라서 항명은 이에 해당하지 않습니다." },
    ],
  },
  {
    masterQuestionId: "cmsxadik7000gk4ronchx5ybi", sourceQuestionId: "92485", reason: "SOURCE_VERIFIED",
    patches: [{ field: "choice", index: 2, from: "합리호특장차", to: "합리화 특장차" }],
  },
  {
    masterQuestionId: "cmsyjcl8q0002kkroljobf3bc", sourceQuestionId: "92484", reason: "SOURCE_VERIFIED",
    patches: [
      { field: "questionText", from: "합리화 측장차에 해당하는 차량만 올바르게 짝지은 것은?", to: "합리화 특장차에 해당하는 차량만 올바르게 짝지은 것은?" },
      { field: "explanation", from: "정답 근거는 '다음 중 합리화 측장차만으로 올바르게 연결된 것은 ?'이며, 이에 따라 합리화 측장차만으로 올바르게 연결된 보기는 시스템 차량과 측방 개폐차이다.", to: "합리화 특장차에는 시스템 차량과 측방 개폐차 등이 포함됩니다. 따라서 시스템 차량과 측방 개폐차를 함께 제시한 조합이 올바릅니다." },
    ],
  },
  {
    masterQuestionId: "cmsxadik5000fk4rofxot6a4j", sourceQuestionId: "92480", reason: "SOURCE_VERIFIED",
    patches: [{ field: "choice", index: 4, from: "슬립멈추기 시트삽입 방식", to: "슬립 멈추기 시트삽입 방식" }],
  },
] as const;
