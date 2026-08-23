type PublicAd = {
  id: string;
  title: string;
  linkUrl: string | null;
  companyName: string | null;
};

export function AdPlacementSlot({ campaigns }: { campaigns: PublicAd[] }) {
  if (campaigns.length === 0) return null;
  return (
    <section aria-label="광고" className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap gap-2 px-4 py-3 sm:px-6 lg:px-8">
        {campaigns.map((campaign) => {
          const content = <><span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">광고</span><span className="font-semibold">{campaign.title}</span>{campaign.companyName ? <span className="text-xs text-muted-foreground">{campaign.companyName}</span> : null}</>;
          return campaign.linkUrl ? (
            <a key={campaign.id} href={campaign.linkUrl} rel="sponsored noopener noreferrer" className="flex min-w-56 flex-1 items-center gap-2 rounded-md border border-border bg-background px-4 py-3 text-sm transition-colors hover:bg-surface">{content}</a>
          ) : (
            <div key={campaign.id} className="flex min-w-56 flex-1 items-center gap-2 rounded-md border border-border bg-background px-4 py-3 text-sm">{content}</div>
          );
        })}
      </div>
    </section>
  );
}