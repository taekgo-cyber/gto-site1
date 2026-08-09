import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

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

async function main() {
  console.log("마스터 데이터 시딩을 시작합니다...");

  const provinces = await seedRegions();
  console.log(`지역(시/도) ${Object.keys(provinces).length}개, 시/군/구 데이터를 시딩했습니다.`);

  const vehicleTypes = await seedVehicleTypes();
  console.log(`차종 ${Object.keys(vehicleTypes).length}개를 시딩했습니다.`);

  const tonnages = await seedTonnages();
  console.log(`톤수 ${Object.keys(tonnages).length}개를 시딩했습니다.`);

  await seedSampleJobPosts({ provinces, vehicleTypes, tonnages });

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
