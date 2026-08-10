import Link from "next/link";

type PhoneInquiryProps = {
  phone: string | null;
  isLoggedIn: boolean;
};

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^0-9+]/g, "")}`;
}

/**
 * 전화 문의 버튼.
 * - 로그인 사용자에게만 전화번호를 노출한다.
 * - 전화번호가 없으면 표시하지 않는다.
 * - 비로그인 사용자에게는 로그인 유도 UI를 보여준다.
 *
 * 주의: 전화 클릭 이벤트는 DB에 저장하지 않는다. (Session 8 이후 별도 설계)
 */
export function PhoneInquiry({ phone, isLoggedIn }: PhoneInquiryProps) {
  if (!phone) return null;

  const buttonStyles =
    "inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto";

  if (!isLoggedIn) {
    return (
      <Link href="/login" className="block sm:inline-block">
        <span className={buttonStyles}>📞 전화 문의 · 로그인 후 확인</span>
      </Link>
    );
  }

  return (
    <a href={telHref(phone)} className="block sm:inline-block">
      <span className={buttonStyles}>📞 전화 문의</span>
    </a>
  );
}
