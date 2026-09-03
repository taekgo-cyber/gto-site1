import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-background px-5 py-10 text-center shadow-sm sm:py-12">
      <div aria-hidden="true" className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-surface-strong text-xl text-primary">
        ···
      </div>
      <p className="mt-4 font-bold">{title}</p>
      {description ? <p className="mx-auto mt-1.5 max-w-lg text-sm leading-6 text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
