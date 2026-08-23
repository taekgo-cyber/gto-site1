export type CompanyApplicationInput = {
  name: string;
  businessNumber: string;
  representativeName: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  addressDetail?: string | null;
  regionId?: string | null;
  introduction?: string | null;
};

export type ValidatedCompanyApplication = {
  name: string;
  businessNumber: string; // normalized 10 digits
  representativeName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  addressDetail: string | null;
  regionId: string | null;
  introduction: string | null;
};

const PHONE_RE = /^[0-9+\-()\s]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeBusinessNumber(raw: string): string {
  return raw.trim().replace(/[-\s]/g, "");
}

export function isValidBusinessNumberChecksum(normalized: string): boolean {
  if (!/^\d{10}$/.test(normalized)) return false;
  const digits = normalized.split("").map((c) => parseInt(c, 10));
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += digits[i] * weights[i];
  }
  sum += Math.floor((digits[8] * 5) / 10);
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === digits[9];
}

export function validateBusinessNumber(raw: string): string {
  const normalized = normalizeBusinessNumber(raw);
  if (!/^\d{10}$/.test(normalized)) {
    throw new Error("businessNumber must be 10 digits");
  }
  if (!isValidBusinessNumberChecksum(normalized)) {
    throw new Error("businessNumber checksum invalid");
  }
  return normalized;
}

export function validateCompanyApplicationInput(input: CompanyApplicationInput): ValidatedCompanyApplication {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const businessNumberRaw = typeof input.businessNumber === "string" ? input.businessNumber : "";
  const representativeName = typeof input.representativeName === "string" ? input.representativeName.trim() : "";
  const phone = input.phone != null ? String(input.phone).trim() : "";
  const email = input.email != null ? String(input.email).trim() : "";
  const address = input.address != null ? String(input.address).trim() : "";
  const addressDetail = input.addressDetail != null ? String(input.addressDetail).trim() : "";
  const regionId = input.regionId != null ? String(input.regionId).trim() : "";
  const introduction = input.introduction != null ? String(input.introduction).trim() : "";

  if (!name) throw new Error("name is required");
  if (name.length > 100) throw new Error("name too long");
  if (!representativeName) throw new Error("representativeName is required");
  if (representativeName.length > 50) throw new Error("representativeName too long");

  const businessNumber = validateBusinessNumber(businessNumberRaw);

  let phoneNorm: string | null = null;
  if (phone) {
    if (!PHONE_RE.test(phone)) throw new Error("phone format invalid");
    if (phone.length > 30) throw new Error("phone too long");
    phoneNorm = phone;
  }

  let emailNorm: string | null = null;
  if (email) {
    if (!EMAIL_RE.test(email)) throw new Error("email format invalid");
    if (email.length > 254) throw new Error("email too long");
    emailNorm = email;
  }

  let addressNorm: string | null = null;
  if (address) {
    if (address.length > 200) throw new Error("address too long");
    addressNorm = address;
  }

  let addressDetailNorm: string | null = null;
  if (addressDetail) {
    if (addressDetail.length > 200) throw new Error("addressDetail too long");
    addressDetailNorm = addressDetail;
  }

  const regionIdNorm = regionId || null;

  let introductionNorm: string | null = null;
  if (introduction) {
    if (introduction.length > 2000) throw new Error("introduction too long");
    introductionNorm = introduction;
  }

  return {
    name,
    businessNumber,
    representativeName,
    phone: phoneNorm,
    email: emailNorm,
    address: addressNorm,
    addressDetail: addressDetailNorm,
    regionId: regionIdNorm,
    introduction: introductionNorm,
  };
}

export function validateCompanyEditInput(input: Partial<CompanyApplicationInput>): Partial<ValidatedCompanyApplication> {
  const result: Partial<ValidatedCompanyApplication> = {};
  if (input.name !== undefined) {
    const v = String(input.name).trim();
    if (!v) throw new Error("name is required");
    if (v.length > 100) throw new Error("name too long");
    result.name = v;
  }
  if (input.businessNumber !== undefined) {
    const raw = String(input.businessNumber);
    result.businessNumber = validateBusinessNumber(raw);
  }
  if (input.representativeName !== undefined) {
    const v = String(input.representativeName).trim();
    if (!v) throw new Error("representativeName is required");
    if (v.length > 50) throw new Error("representativeName too long");
    result.representativeName = v;
  }
  if (input.phone !== undefined) {
    const v = input.phone != null ? String(input.phone).trim() : "";
    if (!v) result.phone = null;
    else {
      if (!PHONE_RE.test(v)) throw new Error("phone format invalid");
      if (v.length > 30) throw new Error("phone too long");
      result.phone = v;
    }
  }
  if (input.email !== undefined) {
    const v = input.email != null ? String(input.email).trim() : "";
    if (!v) result.email = null;
    else {
      if (!EMAIL_RE.test(v)) throw new Error("email format invalid");
      if (v.length > 254) throw new Error("email too long");
      result.email = v;
    }
  }
  if (input.address !== undefined) {
    const v = input.address != null ? String(input.address).trim() : "";
    if (!v) result.address = null;
    else {
      if (v.length > 200) throw new Error("address too long");
      result.address = v;
    }
  }
  if (input.addressDetail !== undefined) {
    const v = input.addressDetail != null ? String(input.addressDetail).trim() : "";
    if (!v) result.addressDetail = null;
    else {
      if (v.length > 200) throw new Error("addressDetail too long");
      result.addressDetail = v;
    }
  }
  if (input.regionId !== undefined) {
    const v = input.regionId != null ? String(input.regionId).trim() : "";
    result.regionId = v || null;
  }
  if (input.introduction !== undefined) {
    const v = input.introduction != null ? String(input.introduction).trim() : "";
    if (!v) result.introduction = null;
    else {
      if (v.length > 2000) throw new Error("introduction too long");
      result.introduction = v;
    }
  }
  return result;
}
