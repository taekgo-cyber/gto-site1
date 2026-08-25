export function buildCompanyInquiryHref(input: {
  companyId: string;
  companyName: string;
}): string {
  const companyId = input.companyId.trim().slice(0, 40);
  const companyName = input.companyName.normalize("NFKC").trim().slice(0, 80);
  const params = new URLSearchParams({
    category: "COMPANY_REGISTRATION",
    subject: `[업체 문의] ${companyName}`.slice(0, 120),
    message: `문의 대상 업체: ${companyName}\n공개 업체 ID: ${companyId}\n\n문의 내용을 입력해 주세요.`,
  });
  return `/support?${params.toString()}`;
}
