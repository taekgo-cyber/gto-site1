import { Container } from "@/components/common/Container";

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <Container className="flex flex-col items-center gap-1 py-6 text-center text-sm text-muted-foreground">
        <p>트럭포털 — 운송/화물차 정보 포털</p>
        <p>© {new Date().getFullYear()} 트럭포털. All rights reserved.</p>
      </Container>
    </footer>
  );
}
