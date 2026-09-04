import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JobPage, { generateMetadata as jobMetadata } from "@/app/jobs/[id]/page";
import LeasePage, { generateMetadata as leaseMetadata } from "@/app/lease/[id]/page";
import CompanyPage, { generateMetadata as companyMetadata } from "@/app/companies/[id]/page";
import { createHomepageSampleInventory, homepageAdTracking } from "@/lib/monetization/homepage-samples";
import { getHomepageSampleDetail, isReadOnlyDetailPreview, sampleJobPost, sampleLeasePost } from "@/lib/monetization/sample-details";
import { getJobPostById } from "@/lib/jobs/dal";
import { getPostDetail } from "@/lib/posts/service";
import { getPostAuthorPhone } from "@/lib/posts/dal";
import { getPublicCompany } from "@/lib/company/public";
import { getApiUser } from "@/lib/api/auth";
import { getPublicRecommendations } from "@/lib/recommendations/dal";
import { JobPostDetailView } from "@/components/jobs/JobPostDetailView";
import { HomeLatestInformation } from "@/components/home/HomeContent";
import type { PostListItem } from "@/lib/posts/dal";

vi.mock("@/lib/jobs/dal", () => ({ getJobPostById: vi.fn() }));
vi.mock("@/lib/posts/service", () => ({ getPostDetail: vi.fn() }));
vi.mock("@/lib/posts/dal", () => ({ getPostAuthorPhone: vi.fn() }));
vi.mock("@/lib/company/public", () => ({ getPublicCompany: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ getApiUser: vi.fn() }));
vi.mock("@/lib/recommendations/dal", () => ({ getPublicRecommendations: vi.fn() }));
vi.mock("@/components/jobs/ViewCount", () => ({ ViewCount: () => createElement("span", { "data-real-view-counter": true }, "조회") }));

const inventory = createHomepageSampleInventory();
const samples = Object.values(inventory).flat();
const pages = { jobs: JobPage, lease: LeasePage, companies: CompanyPage };
function props(id: string) { return { params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }; }

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("ENABLE_HOMEPAGE_SAMPLE_INVENTORY", "");
  vi.stubEnv("ENABLE_READ_ONLY_DETAIL_PREVIEW", "");
  vi.mocked(getApiUser).mockResolvedValue(null);
  vi.mocked(getPublicRecommendations).mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

describe("canonical sample details", () => {
  it("resolves all 102 unique card destinations and renders their existing detail layouts without data calls", async () => {
    expect(new Set(samples.map(ad => ad.linkUrl)).size).toBe(102);
    for (const ad of samples) {
      const domain = ad.linkUrl.split("/")[1] as keyof typeof pages;
      expect(getHomepageSampleDetail(ad.id, domain)?.title).toBe(ad.title);
      const html = renderToStaticMarkup(await pages[domain](props(ad.id)));
      expect(html).toContain(domain === "companies" ? ad.companyName : ad.title);
      expect(html).toContain(ad.companyName);
      expect(html).toContain("샘플 광고");
      expect(html).toContain("disabled");
      expect(html).not.toMatch(/data-real-view-counter|tel:|<form|\/api\/ads\/|\/support\?/);
      expect(homepageAdTracking(ad)).toEqual({ enabled: false, href: ad.linkUrl });
      if (ad.listing) {
        expect(html).toContain(ad.listing.tonnageName);
        expect(html).toContain(ad.listing.originRegionName);
        expect(html).toContain(ad.listing.destRegionName);
      }
    }
    for (const read of [getJobPostById, getPostDetail, getPostAuthorPhone, getPublicCompany, getApiUser, getPublicRecommendations]) expect(read).not.toHaveBeenCalled();
  });
  it.each(["jobs", "lease", "companies"] as const)("rejects invalid, out-of-range and wrong-domain %s sample IDs without DB fallback", async domain => {
    for (const id of ["sample-unknown", "sample-main-00", "sample-main-21", "sample-main-01-extra"]) {
      await expect(pages[domain](props(id))).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    }
    const wrong = samples.find(ad => !ad.linkUrl.startsWith(`/${domain}/`))!;
    await expect(pages[domain](props(wrong.id))).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(getJobPostById).not.toHaveBeenCalled(); expect(getPostDetail).not.toHaveBeenCalled(); expect(getPublicCompany).not.toHaveBeenCalled();
  });
  it("production cannot expose samples and metadata never queries them as real records", async () => {
    for (const [domain, metadata] of [["jobs",jobMetadata],["lease",leaseMetadata],["companies",companyMetadata]] as const) {
      const ad = samples.find(ad => ad.linkUrl.startsWith(`/${domain}/`))!;
      expect((await metadata(props(ad.id))).robots).toEqual({ index: false, follow: false });
    }
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("ENABLE_HOMEPAGE_SAMPLE_INVENTORY", "true");
    for (const domain of Object.keys(pages) as (keyof typeof pages)[]) {
      const ad = samples.find(ad => ad.linkUrl.startsWith(`/${domain}/`))!;
      await expect(pages[domain](props(ad.id))).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    }
    expect(getJobPostById).not.toHaveBeenCalled(); expect(getPublicCompany).not.toHaveBeenCalled();
  });
});

describe("real public detail regression", () => {
  it("preserves existing missing/hidden real ID contracts", async () => {
    vi.mocked(getJobPostById).mockResolvedValue(null);
    vi.mocked(getPostDetail).mockRejectedValue(new Error("NOT_FOUND"));
    vi.mocked(getPublicCompany).mockResolvedValue(null);
    for (const Page of Object.values(pages)) await expect(Page(props("unknown-real-id"))).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    vi.mocked(getJobPostById).mockResolvedValue({ ...sampleJobPost(inventory.main[1]), status: "HIDDEN" });
    await expect(JobPage(props("hidden-real"))).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
  it("read-only QA is opt-in and cannot disable production counters", async () => {
    const post = { ...sampleJobPost(inventory.main[1]), id: "actual-job", companyName: "등록 기업" };
    const normal = renderToStaticMarkup(createElement(JobPostDetailView, { post }));
    expect(normal).toContain("data-real-view-counter");
    expect(normal).not.toContain("샘플 광고");
    vi.stubEnv("ENABLE_READ_ONLY_DETAIL_PREVIEW", "true");
    expect(isReadOnlyDetailPreview()).toBe(true);
    vi.mocked(getJobPostById).mockResolvedValue(post);
    expect(renderToStaticMarkup(await JobPage(props(post.id)))).not.toContain("data-real-view-counter");
    vi.mocked(getPostDetail).mockResolvedValue({ ...sampleLeasePost(inventory.main[0]), id: "actual-lease" });
    vi.mocked(getPostAuthorPhone).mockResolvedValue(null);
    await LeasePage(props("actual-lease"));
    expect(getPostDetail).toHaveBeenCalledWith(null, "actual-lease", { recordView: false });
    vi.stubEnv("NODE_ENV", "production");
    expect(isReadOnlyDetailPreview()).toBe(false);
    await LeasePage(props("actual-lease"));
    expect(getPostDetail).toHaveBeenLastCalledWith(null, "actual-lease", { recordView: true });
  });
  it("homepage free lists keep their actual job and lease IDs", () => {
    const job = { ...sampleJobPost(inventory.main[1]), id: "actual-free-job", advertisementTier: null };
    const lease: PostListItem = {
      ...sampleLeasePost(inventory.main[0]), id: "actual-free-lease", companyName: null, representativeImage: null, advertisementTier: null,
    };
    const html = renderToStaticMarkup(createElement(HomeLatestInformation, { jobs: [job], leases: [lease], now: new Date() }));
    expect(html).toContain('href="/jobs/actual-free-job"');
    expect(html).toContain('href="/lease/actual-free-lease"');
  });
});
