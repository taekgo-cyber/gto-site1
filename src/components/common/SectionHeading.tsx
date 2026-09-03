import type { ReactNode } from "react";

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{eyebrow}</p> : null}
        <h2 className={`${eyebrow ? "mt-1.5" : ""} text-2xl font-bold tracking-[-0.02em] sm:text-[1.75rem]`}>{title}</h2>
        {description ? <p className="mt-1.5 text-sm leading-6 text-muted-foreground sm:text-[15px]">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
