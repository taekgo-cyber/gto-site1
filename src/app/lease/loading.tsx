import { Container } from "@/components/common/Container";

export default function LeaseLoading() {
  return (
    <Container className="space-y-6 py-8">
      <div className="h-9 w-56 animate-pulse rounded bg-border/60" />
      <div className="h-40 animate-pulse rounded-lg border border-border bg-background" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-lg bg-border/40" />
        ))}
      </div>
    </Container>
  );
}
