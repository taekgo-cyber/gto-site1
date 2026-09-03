import {
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_QUERY_MIN_LENGTH,
} from "@/lib/search/contract";

type UnifiedSearchFormProps = {
  formId: string;
  inputId: string;
  ariaLabel: string;
  placeholder?: string;
  defaultValue?: string;
  variant?: "hero" | "compact";
};

export function UnifiedSearchForm({
  formId,
  inputId,
  ariaLabel,
  placeholder = "예: 5톤 지입, 화물 운송",
  defaultValue = "",
  variant = "compact",
}: UnifiedSearchFormProps) {
  const isHero = variant === "hero";

  return (
    <form
      id={formId}
      action="/search"
      method="get"
      role="search"
      aria-label={ariaLabel}
      className={
        isHero
          ? "flex w-full max-w-3xl items-center gap-2 rounded-xl bg-background"
          : "flex w-full items-center gap-1.5"
      }
    >
      <label htmlFor={inputId} className="sr-only">
        {ariaLabel}
      </label>
      <input
        id={inputId}
        name="q"
        type="search"
        required
        minLength={SEARCH_QUERY_MIN_LENGTH}
        maxLength={SEARCH_QUERY_MAX_LENGTH}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        className={
          isHero
            ? "h-13 min-w-0 flex-1 rounded-lg border-0 bg-background px-4 text-[16px] font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            : "h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        }
      />
      <button
        type="submit"
        className={
          isHero
            ? "inline-flex min-h-13 shrink-0 items-center justify-center rounded-lg bg-primary px-5 text-[15px] font-bold text-primary-foreground shadow-sm transition-colors hover:bg-[#0f56c0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-7"
            : "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-[#0f56c0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        }
      >
        검색
      </button>
    </form>
  );
}
