import type { ReactNode } from "react";
import { Container } from "@/components/common/Container";

export function PageIntro({
  eyebrow,
  title,
  description,
  meta,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="border-b border-border bg-background">
      <Container className="flex flex-col justify-between gap-5 py-8 sm:flex-row sm:items-end sm:py-10">
        <div className="max-w-3xl">
          <p className="text-sm font-bold text-primary">{eyebrow}</p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-[-0.025em] sm:text-4xl">{title}</h1>
          <p className="mt-3 text-[15px] leading-7 text-muted-foreground sm:text-base">{description}</p>
          {meta ? <div className="mt-3 text-sm font-medium text-foreground">{meta}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </Container>
    </section>
  );
}
