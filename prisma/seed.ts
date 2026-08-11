import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// ---------------------------------------------------------------------------
// 마스터 데이터 정의
// ---------------------------------------------------------------------------

const PROVINCES: Array<{ code: string; name: string }> = [
  { code: "SEOUL", name: "서울" },
  { code: "BUSAN", name: "부산" },
  { code: "DAEGU", name: "대구" },
  { code: "INCHEON", name: "인천" },
  { code: "GWANGJU", name: "광주" },
  { code: "DAEJEON", name: "대전" },
  { code: "ULSAN", name: "울산" },
  { code: "SEJONG", name: "세종" },
  { code: "GYEONGGI", name: "경기" },
  { code: "GANGWON", name: "강원" },
  { code: "CHUNGBUK", name: "충북" },
  { code: "CHUNGNAM", name: "충남" },
  { code: "JEONBUK", name: "전북" },
  { code: "JEONNAM", name: "전남" },
  { code: "GYEONGBUK", name: "경북" },
  { code: "GYEONGNAM", name: "경남" },
  { code: "JEJU", name: "제주" },
];

const DISTRICTS: Record<string, string[]> = {
  SEOUL: ["강남구", "서초구", "송파구", "중구", "마포구", "영등포구", "성동구", "노원구"],
  BUSAN: ["중구", "해운대구", "강서구", "사상구", "부산진구"],
  DAEGU: ["중구", "달서구", "북구", "수성구"],
  INCHEON: ["중구", "남동구", "서구", "연수구", "부평구"],
  GWANGJU: ["동구", "서구", "광산구"],
  DAEJEON: ["동구", "서구", "유성구", "대덕구"],
  ULSAN: ["중구", "남구", "울주군"],
  SEJONG: ["조치원읍", "나성동"],
  GYEONGGI: ["수원시", "성남시", "고양시", "용인시", "부천시", "안산시", "화성시", "평택시", "안양시", "이천시"],
  GANGWON: ["춘천시", "원주시", "강릉시", "속초시"],
  CHUNGBUK: ["청주시", "충주시", "제천시"],
  CHUNGNAM: ["천안시", "아산시", "서산시", "당진시"],
  JEONBUK: ["전주시", "익산시", "군산시", "정읍시"],
  JEONNAM: ["여수시", "순천시", "광양시", "목포시"],
  GYEONGBUK: ["포항시", "경주시", "구미시", "안동시"],
  GYEONGNAM: ["창원시", "김해시", "양산시", "거제시", "진주시"],
  JEJU: ["제주시", "서귀포시"],
};

const VEHICLE_TYPES: Array<{ code: string; name: string }> = [
  { code: "KARGO", name: "카고" },
  { code: "WINGBODY", name: "윙바디" },
  { code: "TOP", name: "탑차" },
  { code: "REFRIGERATED", name: "냉장/냉동" },
  { code: "LIVESTOCK", name: "살아있는축" },
  { code: "FLATBED", name: "평판" },
  { code: "CONTAINER", name: "컨테이너" },
  { code: "DUMP", name: "덤프" },
  { code: "TANKER", name: "유조" },
  { code: "SPECIAL", name: "특수화물" },
];

const TONNAGES: Array<{ code: string; name: string; weightKg: number }> = [
  { code: "T1", name: "1톤", weightKg: 1000 },
  { code: "T1_4", name: "1.4톤", weightKg: 1400 },
  { code: "T2_5", name: "2.5톤", weightKg: 2500 },
  { code: "T5", name: "5톤", weightKg: 5000 },
  { code: "T8", name: "8톤", weightKg: 8000 },
  { code: "T11", name: "11톤", weightKg: 11000 },
  { code: "T25", name: "25톤", weightKg: 25000 },
  { code: "T40", name: "40톤", weightKg: 40000 },
];

async function seedRegions(): Promise<Record<string, string>> {
  const provinceIds: Record<string, string> = {};

  for (const [index, province] of PROVINCES.entries()) {
    const region = await prisma.region.upsert({
      where: { code: province.code },
      update: { name: province.name, sortOrder: index },
      create: { code: province.code, name: province.name, depth: 1, sortOrder: index },
    });
    provinceIds[province.code] = region.id;
  }

  for (const [parentCode, names] of Object.entries(DISTRICTS)) {
    for (const [index, name] of names.entries()) {
      const code = `${parentCode}_${index + 1}`;
      await prisma.region.upsert({
        where: { code },
        update: { name, parentId: provinceIds[parentCode] },
        create: {
          code,
          name,
          depth: 2,
          parentId: provinceIds[parentCode],
          sortOrder: index,
        },
      });
    }
  }

  return provinceIds;
}

async function seedVehicleTypes(): Promise<Record<string, string>> {
  const vehicleTypeIds: Record<string, string> = {};
  for (const [index, vehicleType] of VEHICLE_TYPES.entries()) {
    const record = await prisma.vehicleType.upsert({
      where: { code: vehicleType.code },
      update: { name: vehicleType.name, sortOrder: index },
      create: { code: vehicleType.code, name: vehicleType.name, sortOrder: index },
    });
    vehicleTypeIds[vehicleType.code] = record.id;
  }
  return vehicleTypeIds;
}

async function seedTonnages(): Promise<Record<string, string>> {
  const tonnageIds: Record<string, string> = {};
  for (const [index, tonnage] of TONNAGES.entries()) {
    const record = await prisma.tonnage.upsert({
      where: { code: tonnage.code },
      update: { name: tonnage.name, weightKg: tonnage.weightKg, sortOrder: index },
      create: {
        code: tonnage.code,
        name: tonnage.name,
        weightKg: tonnage.weightKg,
        sortOrder: index,
      },
    });
    tonnageIds[tonnage.code] = record.id;
  }
  return tonnageIds;
}

type SeedJobPostInput = {
  type: "JOB" | "TRANSPORT";
  title: string;
  description: string;
  originRegionCode: string;
  destRegionCode: string;
  originAddress?: string;
  destAddress?: string;
  vehicleTypeCode: string;
  tonnageCode: string;
  payType: "MONTHLY" | "DAILY" | "FREIGHT" | "NEGOTIABLE";
  payAmount: number;
  workType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "DAILY" | "FREELANCE";
  workDescription?: string;
  deadline: Date;
  publishedAt: Date;
};

async function seedSampleJobPosts(input: {
  provinces: Record<string, string>;
  vehicleTypes: Record<string, string>;
  tonnages: Record<string, string>;
}): Promise<void> {
  const existing = await prisma.jobPost.count();
  if (existing > 0) {
    console.log("이미 공고 데이터가 존재하여 샘플 공고 시딩을 건너뜁니다.");
    return;
  }

  const today = new Date();
  const daysFromNow = (days: number) => new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
  const daysAgo = (days: number) => new Date(today.getTime() - days * 24 * 60 * 60 * 1000);

  const samples: SeedJobPostInput[] = [
    {
      type: "JOB",
      title: "1톤 카고 택배 기사 모집 (수도권)",
      description: "수도권 지역 1톤 카고 택배 기사를 모집합니다. 정직원으로 채용하며 초보자도 지원 가능합니다.",
      originRegionCode: "GYEONGGI",
      destRegionCode: "GYEONGGI",
      originAddress: "경기도 화성시",
      destAddress: "서울 및 수도권 일대",
      vehicleTypeCode: "KARGO",
      tonnageCode: "T1",
      payType: "MONTHLY",
      payAmount: 320,
      workType: "FULL_TIME",
      workDescription: "오전 8시 출근, 평일 근무, 주 5일",
      deadline: daysFromNow(30),
      publishedAt: daysAgo(2),
    },
    {
      type: "JOB",
      title: "냉장탑차 기사 구인 (물류센터 전담)",
      description: "냉장/냉동 식품 물류센터 전담 기사를 모집합니다. 5톤 냉장탑차 운행 경력자 우대.",
      originRegionCode: "INCHEON",
      destRegionCode: "SEOUL",
      originAddress: "인천광역시 남동구",
      destAddress: "서울 전 지역",
      vehicleTypeCode: "REFRIGERATED",
      tonnageCode: "T5",
      payType: "MONTHLY",
      payAmount: 400,
      workType: "FULL_TIME",
      workDescription: "야간 근무 가능자 우대, 주 6일",
      deadline: daysFromNow(21),
      publishedAt: daysAgo(5),
    },
    {
      type: "JOB",
      title: "부산~서울 고정배차 상시 구인",
      description: "부산 ~ 서울 구간 고정배차 기사를 모집합니다. 11톤 카고 고정 노선 운행.",
      originRegionCode: "BUSAN",
      destRegionCode: "SEOUL",
      originAddress: "부산광역시 강서구",
      destAddress: "서울특별시",
      vehicleTypeCode: "KARGO",
      tonnageCode: "T11",
      payType: "MONTHLY",
      payAmount: 480,
      workType: "FULL_TIME",
      workDescription: "주 5일, 주말 근무 시 수당 지급",
      deadline: daysFromNow(14),
      publishedAt: daysAgo(7),
    },
    {
      type: "JOB",
      title: "경력 기사 급구 (25톤 덤프)",
      description: "건설 현장 덤프 운전 경력 3년 이상 기사를 급구합니다. 야간 및 특근 가능자 우대.",
      originRegionCode: "GYEONGGI",
      destRegionCode: "GYEONGGI",
      originAddress: "경기도 용인시",
      destAddress: "경기 남부 건설현장",
      vehicleTypeCode: "DUMP",
      tonnageCode: "T25",
      payType: "DAILY",
      payAmount: 25,
      workType: "DAILY",
      workDescription: "일급 지급, 숙소 제공",
      deadline: daysFromNow(10),
      publishedAt: daysAgo(3),
    },
    {
      type: "TRANSPORT",
      title: "인천항 → 대구 40피트 컨테이너 운송",
      description: "인천항에서 출발해 대구까지 40피트 컨테이너 운송을 맡길 업체를 찾습니다. 정기 물량 월 8회.",
      originRegionCode: "INCHEON",
      destRegionCode: "DAEGU",
      originAddress: "인천항 신항",
      destAddress: "대구 달서구 물류센터",
      vehicleTypeCode: "CONTAINER",
      tonnageCode: "T40",
      payType: "FREIGHT",
      payAmount: 120,
      workType: "FREELANCE",
      workDescription: "월 8회 고정 물량, 선적 서류 제공",
      deadline: daysFromNow(7),
      publishedAt: daysAgo(1),
    },
    {
      type: "TRANSPORT",
      title: "강원도 화물 택배 배송 기사 모집 (2.5톤)",
      description: "춘천·원주 지역 2.5톤 택배 배송을 함께할 기사를 모집합니다. 하루 4~5개 권역 배송.",
      originRegionCode: "GANGWON",
      destRegionCode: "GANGWON",
      originAddress: "강원도 춘천시",
      destAddress: "강원도 원주시",
      vehicleTypeCode: "TOP",
      tonnageCode: "T2_5",
      payType: "NEGOTIABLE",
      payAmount: 0,
      workType: "DAILY",
      workDescription: "건당 수당 지급, 차량 지원 가능",
      deadline: daysFromNow(15),
      publishedAt: daysAgo(4),
    },
    {
      type: "TRANSPORT",
      title: "천안 ↔ 대전 정기 운송 (1.4톤 윙바디)",
      description: "천안과 대전 구간 주 3회 정기 운송이 필요합니다. 윙바디 차량 필수.",
      originRegionCode: "CHUNGNAM",
      destRegionCode: "DAEJEON",
      originAddress: "충남 천안시",
      destAddress: "대전 유성구",
      vehicleTypeCode: "WINGBODY",
      tonnageCode: "T1_4",
      payType: "FREIGHT",
      payAmount: 25,
      workType: "CONTRACT",
      workDescription: "주 3회, 6개월 계약",
      deadline: daysFromNow(5),
      publishedAt: daysAgo(6),
    },
    {
      type: "JOB",
      title: "평판 8톤 기사 구인 (장비 운송)",
      description: "건설 장비 운송 평판 8톤 기사를 모집합니다. 전국 노선 운행.",
      originRegionCode: "GYEONGBUK",
      destRegionCode: "JEONNAM",
      originAddress: "경북 포항시",
      destAddress: "전남 광양시",
      vehicleTypeCode: "FLATBED",
      tonnageCode: "T8",
      payType: "MONTHLY",
      payAmount: 350,
      workType: "FULL_TIME",
      workDescription: "전국 노선, 장거리 수당 지급",
      deadline: daysFromNow(20),
      publishedAt: daysAgo(8),
    },
  ];

  for (const [index, sample] of samples.entries()) {
    await prisma.jobPost.create({
      data: {
        type: sample.type,
        title: sample.title,
        description: sample.description,
        originRegionId: input.provinces[sample.originRegionCode],
        destRegionId: input.provinces[sample.destRegionCode],
        originAddress: sample.originAddress,
        destAddress: sample.destAddress,
        vehicleTypeId: input.vehicleTypes[sample.vehicleTypeCode],
        tonnageId: input.tonnages[sample.tonnageCode],
        payType: sample.payType,
        payAmount: sample.payAmount > 0 ? sample.payAmount : null,
        workType: sample.workType,
        workDescription: sample.workDescription,
        deadline: sample.deadline,
        publishedAt: sample.publishedAt,
        status: "OPEN",
        viewCount: (index + 1) * 37,
      },
    });
  }

  console.log(`샘플 공고 ${samples.length}건을 생성했습니다.`);
}

type SeedLeasePostInput = {
  type: "HIRE" | "SEEK";
  title: string;
  content: string;
  regionCode: string;
  vehicleTypeCode: string;
  tonnageCode: string;
  payType: PayType;
  payAmount: number;
  workType: WorkType;
  conditions?: string;
  publishedAt: Date;
};

type PayType = "MONTHLY" | "DAILY" | "FREIGHT" | "NEGOTIABLE";
type WorkType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "DAILY" | "FREELANCE";

async function seedDemoUserAndLeasePosts(input: {
  provinces: Record<string, string>;
  vehicleTypes: Record<string, string>;
  tonnages: Record<string, string>;
}): Promise<void> {
  const existingPosts = await prisma.leasePost.count();
  if (existingPosts > 0) {
    console.log("이미 지입 게시글 데이터가 존재하여 데모 시딩을 건너뜁니다.");
    return;
  }

  const DEMO_EMAIL = "demo@truckportal.dev";
  const DEMO_PASSWORD = "demo1234";
  const demoUser = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      email: DEMO_EMAIL,
      passwordHash: hashPassword(DEMO_PASSWORD),
      name: "데모 업체",
      nickname: "데모기사",
      phone: "010-1234-5678",
      role: "COMPANY",
    },
  });
  console.log(`데모 사용자(${demoUser.email})를 시딩했습니다.`);

  const today = new Date();
  const daysAgo = (days: number) => new Date(today.getTime() - days * 24 * 60 * 60 * 1000);

  const samples: SeedLeasePostInput[] = [
    {
      type: "HIRE",
      title: "1톤 카고 지입 기사 구인 (인천)",
      content:
        "인천 남동공단 소재 지입차 업체입니다. 1톤 카고 지입 기사를 모집합니다.\n월 정산, 보험·정비 지원. 초보 가능, 운전면허 1종 보통 소지자.",
      regionCode: "INCHEON",
      vehicleTypeCode: "KARGO",
      tonnageCode: "T1",
      payType: "MONTHLY",
      payAmount: 300,
      workType: "FULL_TIME",
      conditions: "월 300만원 이상, 정산 지연 없음",
      publishedAt: daysAgo(1),
    },
    {
      type: "HIRE",
      title: "경기권 5톤 윙바디 지입 기사 모집",
      content:
        "경기 화성·평택 물류 거점 기반 5톤 윙바디 지입 기사를 모집합니다.\n고정 노선 확보, 월 350만원 이상 실수익 가능.",
      regionCode: "GYEONGGI",
      vehicleTypeCode: "WINGBODY",
      tonnageCode: "T5",
      payType: "MONTHLY",
      payAmount: 350,
      workType: "FULL_TIME",
      conditions: "윙바디 운행 경력자 우대",
      publishedAt: daysAgo(2),
    },
    {
      type: "SEEK",
      title: "1톤 카고 차량 지입을 찾습니다",
      content:
        "1톤 카고 지입을 희망합니다. 배달 경력 5년차, 서울·수도권 지역 선호.\n조건 좋은 업체 연락 부탁드립니다.",
      regionCode: "SEOUL",
      vehicleTypeCode: "KARGO",
      tonnageCode: "T1",
      payType: "NEGOTIABLE",
      payAmount: 0,
      workType: "DAILY",
      conditions: "서울/수도권",
      publishedAt: daysAgo(3),
    },
  ];

  for (const [index, sample] of samples.entries()) {
    await prisma.leasePost.create({
      data: {
        type: sample.type,
        title: sample.title,
        content: sample.content,
        status: "PUBLISHED",
        authorId: demoUser.id,
        regionId: input.provinces[sample.regionCode],
        vehicleTypeId: input.vehicleTypes[sample.vehicleTypeCode],
        tonnageId: input.tonnages[sample.tonnageCode],
        payType: sample.payType,
        payAmount: sample.payAmount > 0 ? sample.payAmount : null,
        workType: sample.workType,
        ...(sample.conditions
          ? { conditions: { text: sample.conditions } }
          : {}),
        publishedAt: sample.publishedAt,
      },
    });
  }

  console.log(`샘플 지입 게시글 ${samples.length}건을 생성했습니다.`);
}

async function seedDemoCompany() {
  const existing = await prisma.company.count();
  if (existing > 0) {
    console.log("이미 업체 데이터가 존재하여 데모 업체 시딩을 건너뜁니다.");
    return;
  }

  const company = await prisma.company.create({
    data: {
      name: "데모물류",
      businessNumber: "000-00-00000",
      representativeName: "김대표",
      phone: "02-1234-5678",
      email: "company@truckportal.dev",
      status: "ACTIVE",
    },
  });

  const samplePosts = await prisma.jobPost.findMany({
    where: { companyId: null },
    orderBy: { createdAt: "asc" },
    take: 3,
    select: { id: true },
  });
  await prisma.jobPost.updateMany({
    where: { id: { in: samplePosts.map((post) => post.id) } },
    data: { companyId: company.id },
  });

  console.log(`데모 업체(${company.name})를 시딩하고 공고 ${samplePosts.length}건에 연결했습니다.`);
}

type SeedCbtQuestionInput = {
  subject: string;
  questionText: string;
  options: Array<{ id: number; text: string }>;
  correctOption: number;
  explanation?: string;
};

const CBT_CATEGORY = {
  slug: "cargo-driver",
  name: "화물운송종사자격시험",
  description:
    "화물운송종사자격시험 대비 CBT 연습 문제입니다. 교통법규, 안전운행, 화물취급, 운송서비스 과목을 풀어볼 수 있습니다.",
  sortOrder: 1,
};

const CBT_SUBJECTS = ["교통법규", "안전운행", "화물취급", "운송서비스"] as const;

const CBT_SAMPLE_QUESTIONS: SeedCbtQuestionInput[] = [
  // 교통법규 (3문항)
  {
    subject: "교통법규",
    questionText: "화물자동차의 최대적재량을 초과하여 화물을 운송한 운전자가 받는 제재로 올바른 것은?",
    options: [
      { id: 1, text: "운전면허가 즉시 취소된다" },
      { id: 2, text: "과적 단속 시 과태료·벌점 등 행정처분을 받을 수 있다" },
      { id: 3, text: "아무런 제재가 없다" },
      { id: 4, text: "사업용 화물차는 예외로 처벌하지 않는다" },
    ],
    correctOption: 2,
    explanation: "과적 운행은 도로 파손과 안전사고의 원인이 되므로 단속 시 행정처분을 받을 수 있습니다.",
  },
  {
    subject: "교통법규",
    questionText: "사업용 화물자동차 운전자의 운행 시간과 휴게에 대한 설명으로 올바른 것은?",
    options: [
      { id: 1, text: "휴게 없이 연속 6시간 운행해도 된다" },
      { id: 2, text: "연속 4시간 운행 시 최소 30분 이상 휴게하여야 한다" },
      { id: 3, text: "운전자가 휴게 시간을 스스로 정하면 된다" },
      { id: 4, text: "휴게 의무는 장거리 노선에만 적용된다" },
    ],
    correctOption: 2,
    explanation: "피로 운전 예방을 위해 연속 4시간 운행 시 30분 이상의 휴게가 필요합니다.",
  },
  {
    subject: "교통법규",
    questionText: "적재물이 흘러내리거나 떨어지지 않도록 고정 조치 없이 운행한 경우에 대한 설명으로 올바른 것은?",
    options: [
      { id: 1, text: "적재물이 안전하게 실려 있으면 고정은 선택 사항이다" },
      { id: 2, text: "단거리 운행 시에는 고정 조치가 필요 없다" },
      { id: 3, text: "적재물 낙하 사고 시 운전자의 과실이 될 수 있다" },
      { id: 4, text: "도로교통법과 무관한 사항이다" },
    ],
    correctOption: 3,
    explanation: "적재물 고정 의무는 법으로 정해져 있으며, 낙하 사고 시 운전자의 책임이 따릅니다.",
  },
  // 안전운행 (3문항)
  {
    subject: "안전운행",
    questionText: "야간 운행 시 안전을 위한 행동으로 가장 올바른 것은?",
    options: [
      { id: 1, text: "상향등을 항상 켜고 주행한다" },
      { id: 2, text: "마주 오는 차량이 있으면 하향등으로 전환한다" },
      { id: 3, text: "휴게 없이 계속 주행하는 것이 효율적이다" },
      { id: 4, text: "주행 중 속도만 줄이면 전조등은 상향으로 유지한다" },
    ],
    correctOption: 2,
    explanation: "상향등은 상대 운전자 눈부심을 유발하므로 마주 오는 차량이 있으면 하향등으로 전환해야 합니다.",
  },
  {
    subject: "안전운행",
    questionText: "화물차의 제동 거리에 영향을 주는 요소가 아닌 것은?",
    options: [
      { id: 1, text: "주행 속도" },
      { id: 2, text: "적재 중량" },
      { id: 3, text: "노면 상태" },
      { id: 4, text: "차량 색상" },
    ],
    correctOption: 4,
    explanation: "제동 거리는 속도, 중량, 노면 상태 등에 영향을 받으며 차량 색상과는 무관합니다.",
  },
  {
    subject: "안전운행",
    questionText: "비가 오는 날 화물차 운행 시 주의 사항으로 가장 올바른 것은?",
    options: [
      { id: 1, text: "노면이 젖어 제동 거리가 길어지므로 감속한다" },
      { id: 2, text: "와이퍼 작동 시에는 속도를 높인다" },
      { id: 3, text: "타이어 공기압을 높이면 빗길에 안전하다" },
      { id: 4, text: "차간 거리는 건조한 날보다 짧게 유지한다" },
    ],
    correctOption: 1,
    explanation: "젖은 노면은 마찰력이 낮아 제동 거리가 길어지므로 감속하고 차간 거리를 충분히 확보해야 합니다.",
  },
  // 화물취급 (3문항)
  {
    subject: "화물취급",
    questionText: "화물 적재 시 무게 중심을 낮추기 위한 방법으로 가장 올바른 것은?",
    options: [
      { id: 1, text: "무거운 화물을 위에 올려놓는다" },
      { id: 2, text: "무거운 화물을 아래쪽에 배치한다" },
      { id: 3, text: "모든 화물을 한쪽에 몰아 실는다" },
      { id: 4, text: "적재 높이는 신경 쓰지 않는다" },
    ],
    correctOption: 2,
    explanation: "무거운 화물을 아래쪽에 배치하면 무게 중심이 낮아져 주행 안정성이 높아집니다.",
  },
  {
    subject: "화물취급",
    questionText: "화물을 적재할 때 무게 중심이 차량 중심에서 벗어나면 발생할 수 있는 문제는?",
    options: [
      { id: 1, text: "연비가 개선된다" },
      { id: 2, text: "핸들링이 가벼워진다" },
      { id: 3, text: "차량의 균형이 무너져 전복 위험이 커진다" },
      { id: 4, text: "타이어 마모가 줄어든다" },
    ],
    correctOption: 3,
    explanation: "무게 중심이 편중되면 코너링 시 전복 위험이 커지고 타이어에 과도한 하중이 걸립니다.",
  },
  {
    subject: "화물취급",
    questionText: "냉동·냉장 화물을 운송할 때 온도 관리에 대한 설명으로 올바른 것은?",
    options: [
      { id: 1, text: "운송 중에는 온도 확인이 불필요하다" },
      { id: 2, text: "적재 전에 냉동기가 정상 작동하는지 확인한다" },
      { id: 3, text: "문을 자주 열어 온도를 확인하는 것이 좋다" },
      { id: 4, text: "화물 온도는 운임과 무관하다" },
    ],
    correctOption: 2,
    explanation: "냉동·냉장 화물은 적재 전 장비 점검과 온도 유지가 필수이며, 부패 시 손해 배상 책임이 발생할 수 있습니다.",
  },
  // 운송서비스 (3문항)
  {
    subject: "운송서비스",
    questionText: "화물 운송 계약 체결 시 운송인과 의뢰인 간에 명확히 확인해야 할 사항이 아닌 것은?",
    options: [
      { id: 1, text: "운임과 결제 방식" },
      { id: 2, text: "운송 경로와 인도 일시" },
      { id: 3, text: "적재물의 종류와 수량" },
      { id: 4, text: "운전자의 취미" },
    ],
    correctOption: 4,
    explanation: "운송 계약에서는 운임, 운송 경로, 인도 일시, 화물 정보 등을 명확히 확인해야 합니다.",
  },
  {
    subject: "운송서비스",
    questionText: "화물 인도 후 운송 과정에서 발생한 하자나 손해에 대한 책임은 원칙적으로 누구에게 있는가?",
    options: [
      { id: 1, text: "항상 화물 의뢰인에게 있다" },
      { id: 2, text: "운송인에게 있다" },
      { id: 3, text: "모든 경우에 면책된다" },
      { id: 4, text: "도로 관리 기관에게 있다" },
    ],
    correctOption: 2,
    explanation: "운송인은 운송물을 수령한 때부터 인도할 때까지 선량한 관리자의 주의 의무를 지며, 손해 발생 시 책임을 집니다.",
  },
  {
    subject: "운송서비스",
    questionText: "화물 운송 후 하주에게 제공해야 할 서류로 가장 적절한 것은?",
    options: [
      { id: 1, text: "운임 영수증" },
      { id: 2, text: "운전면허증 사본" },
      { id: 3, text: "개인 신상 정보" },
      { id: 4, text: "차량 정비 이력서" },
    ],
    correctOption: 1,
    explanation: "운송 완료 후에는 정산을 위해 운임 영수증 등 증빙 서류를 제공해야 합니다.",
  },
];

async function seedCbt(): Promise<void> {
  const existingCategory = await prisma.cbtCategory.findUnique({
    where: { slug: CBT_CATEGORY.slug },
    include: { _count: { select: { questions: true } } },
  });

  if (existingCategory && existingCategory._count.questions > 0) {
    console.log("이미 CBT 문제 데이터가 존재하여 CBT 시딩을 건너뜁니다.");
    return;
  }

  const category = await prisma.cbtCategory.upsert({
    where: { slug: CBT_CATEGORY.slug },
    update: { name: CBT_CATEGORY.name, description: CBT_CATEGORY.description },
    create: {
      slug: CBT_CATEGORY.slug,
      name: CBT_CATEGORY.name,
      description: CBT_CATEGORY.description,
      sortOrder: CBT_CATEGORY.sortOrder,
    },
  });

  if (existingCategory && existingCategory._count.questions === 0) {
    await prisma.cbtQuestion.deleteMany({ where: { categoryId: category.id } });
  }

  for (const question of CBT_SAMPLE_QUESTIONS) {
    await prisma.cbtQuestion.create({
      data: {
        categoryId: category.id,
        subject: question.subject,
        questionText: question.questionText,
        options: question.options,
        correctOption: question.correctOption,
        explanation: question.explanation,
        status: "PUBLISHED",
        source: "test",
        metadata: { sample: true },
      },
    });
  }

  const subjectSummary = CBT_SUBJECTS.map(
    (subject) =>
      `${subject} ${CBT_SAMPLE_QUESTIONS.filter((q) => q.subject === subject).length}문항`,
  ).join(", ");

  console.log(`CBT 카테고리(${category.name})와 테스트 문제 ${CBT_SAMPLE_QUESTIONS.length}개를 시딩했습니다. (${subjectSummary})`);
}

async function main() {
  console.log("마스터 데이터 시딩을 시작합니다...");

  const provinces = await seedRegions();
  console.log(`지역(시/도) ${Object.keys(provinces).length}개, 시/군/구 데이터를 시딩했습니다.`);

  const vehicleTypes = await seedVehicleTypes();
  console.log(`차종 ${Object.keys(vehicleTypes).length}개를 시딩했습니다.`);

  const tonnages = await seedTonnages();
  console.log(`톤수 ${Object.keys(tonnages).length}개를 시딩했습니다.`);

  await seedSampleJobPosts({ provinces, vehicleTypes, tonnages });
  await seedDemoCompany();
  await seedDemoUserAndLeasePosts({ provinces, vehicleTypes, tonnages });
  await seedCbt();

  console.log("시딩이 완료되었습니다.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
