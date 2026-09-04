import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { AdvertisementImage } from "./AdvertisementImage";
import type { PublicHomepageAdvertisement } from "@/lib/monetization/homepage-ads";

export function SampleDetailNotice() {
  return <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground"><strong className="text-primary">샘플 광고</strong> · 영업용 미리보기입니다. 기업과 조건은 허구이며 실제 문의는 접수되지 않습니다. <Link href="/" className="ml-2 text-primary underline">홈으로</Link></div>;
}

export function SampleDetailImage({ advertisement }: { advertisement: PublicHomepageAdvertisement }) {
  return <div className="mb-5 aspect-[2/1] overflow-hidden rounded-lg"><AdvertisementImage advertisement={advertisement} eager className="h-full w-full object-cover" /></div>;
}

export function SampleInquiryPreview() {
  return <div className="mt-4 border-t border-border pt-4"><Button disabled variant="outline">문의하기 (샘플 미리보기)</Button><p className="mt-2 text-xs text-muted-foreground">샘플 광고에서는 연락처 공개, 상담 접수 및 계약을 진행하지 않습니다.</p></div>;
}
