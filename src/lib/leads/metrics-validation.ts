export type MetricsDateRange = {
  from?: Date;
  to?: Date;
};

function parseDateOrThrow(raw: string, label: string): Date {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error(`INVALID_${label}_DATE`);
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) throw new Error(`INVALID_${label}_DATE`);
  return d;
}

export function validateMetricsDateRange(input: {
  from?: string | Date | null;
  to?: string | Date | null;
}): MetricsDateRange {
  let from: Date | undefined;
  let to: Date | undefined;

  if (input.from != null && String(input.from).trim() !== "") {
    if (input.from instanceof Date) {
      if (Number.isNaN(input.from.getTime())) throw new Error("INVALID_FROM_DATE");
      from = input.from;
    } else {
      from = parseDateOrThrow(String(input.from), "FROM");
    }
  }

  if (input.to != null && String(input.to).trim() !== "") {
    if (input.to instanceof Date) {
      if (Number.isNaN(input.to.getTime())) throw new Error("INVALID_TO_DATE");
      to = input.to;
    } else {
      to = parseDateOrThrow(String(input.to), "TO");
    }
  }

  if (from && to && from.getTime() > to.getTime()) {
    throw new Error("INVALID_DATE_RANGE");
  }

  return { from, to };
}

export function parseMetricsDateRange(searchParams: URLSearchParams): MetricsDateRange {
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  return validateMetricsDateRange({ from: fromRaw, to: toRaw });
}

export function formatMetricsDateRange(range: MetricsDateRange): {
  from: string | null;
  to: string | null;
} {
  return {
    from: range.from ? range.from.toISOString() : null,
    to: range.to ? range.to.toISOString() : null,
  };
}
