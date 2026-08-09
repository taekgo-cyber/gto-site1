import Link from "next/link";
import { Container } from "@/components/common/Container";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";

const SECTIONS = ["구인공고", "구직정보", "업체정보"] as const;

export default function Home() {
  return (
    <div className="bg-surface">
      <section className="border-b border-border bg-background">
        <Container className="flex flex-col items-start gap-4 py-12 sm:py-16">
          <h1 className="text-2xl font-bold sm:text-3xl">
            운송/화물차 정보 포털
          </h1>
          <p className="max-w-xl text-muted-foreground">
            구인·구직부터 운송 정보까지, 필요한 정보를 빠르게 찾을 수
            있습니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/jobs">
              <Button>구인공고 보기</Button>
            </Link>
            <Button variant="outline">업체 찾기</Button>
          </div>
        </Container>
      </section>
      <Container className="grid grid-cols-1 gap-4 py-8 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((title) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {title} 콘텐츠가 이곳에 표시됩니다.
              </p>
            </CardContent>
          </Card>
        ))}
      </Container>
    </div>
  );
}
