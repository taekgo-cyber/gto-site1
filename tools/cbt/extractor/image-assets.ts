// 이미지 reference 추출 (Session 10-1 STEP 4 §20~§23).
// DOM에서 <img>를 찾아 metadata로 분리한다. 실제 다운로드는 하지 않는다.
// 이미지가 어느 영역(question/choice_N/explanation)에 속하는지 location으로 기록한다.
import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import type { ExtractedImageAsset, ImageLocation } from "../types";

export type ImageExtractionContext = {
  /** 상대 URL resolve용 base URL (없으면 null) */
  baseUrl: string | null;
  /** 보기 요소 목록 (순서 보존). 이미지의 choice_N 판정에 사용 */
  choiceEls: Array<Cheerio<AnyNode>>;
  /** 해설 요소 (있을 때). 이미지의 explanation 판정에 사용 */
  explanationEl: Cheerio<AnyNode> | null;
  /** question container가 확정되었는지. false면 미확정 위치는 unknown */
  containerConfirmed: boolean;
};

function isInside(
  node: Cheerio<AnyNode>,
  ancestor: Cheerio<AnyNode>,
): boolean {
  const target = node.get(0);
  const root = ancestor.get(0);
  if (!target || !root) return false;
  let current: AnyNode | null = target;
  while (current) {
    if (current === root) return true;
    current = current.parent ?? null;
  }
  return false;
}

function resolveImageLocation(
  img: Cheerio<AnyNode>,
  ctx: ImageExtractionContext,
  warnings: string[],
): ImageLocation {
  if (ctx.explanationEl && isInside(img, ctx.explanationEl)) {
    return "explanation";
  }
  for (let i = 0; i < ctx.choiceEls.length; i += 1) {
    if (i < 4 && isInside(img, ctx.choiceEls[i])) {
      return `choice_${i + 1}` as ImageLocation;
    }
  }
  if (!ctx.containerConfirmed) {
    warnings.push("image location unknown — question container 미확정");
    return "unknown";
  }
  return "question";
}

function parseDimensionAttr(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) ? n : null;
}

/**
 * container 내부의 모든 <img>에서 이미지 reference metadata를 추출한다.
 * - src 누락, 중복 이미지 등은 warnings에 기록
 * - alt는 빈 문자열이면 null로 정규화
 * - 상대 src는 baseUrl로 resolve하며 실패 시 resolvedSrc=null
 */
export function extractImageAssets(
  $: CheerioAPI,
  container: Cheerio<AnyNode>,
  ctx: ImageExtractionContext,
  warnings: string[],
): ExtractedImageAsset[] {
  const assets: ExtractedImageAsset[] = [];
  const seen = new Set<string>();
  let index = 0;

  $(container)
    .find("img")
    .each((_, el) => {
      const $el = $(el);
      const originalSrc = $el.attr("src") ?? $el.attr("data-src") ?? null;
      if (originalSrc === null) {
        warnings.push("image src 누락");
        return;
      }

      let resolvedSrc: string | null = null;
      if (ctx.baseUrl) {
        try {
          resolvedSrc = new URL(originalSrc, ctx.baseUrl).toString();
        } catch {
          resolvedSrc = null;
        }
      }

      const src = resolvedSrc ?? originalSrc;
      if (seen.has(src)) {
        warnings.push(`중복 이미지: ${src}`);
      }
      seen.add(src);

      const alt = $el.attr("alt") ?? null;

      assets.push({
        src,
        alt: alt && alt.length > 0 ? alt : null,
        index,
        location: resolveImageLocation($el, ctx, warnings),
        sourceUrl: ctx.baseUrl,
        originalSrc,
        resolvedSrc,
        width: parseDimensionAttr($el.attr("width")),
        height: parseDimensionAttr($el.attr("height")),
      });
      index += 1;
    });

  return assets;
}
