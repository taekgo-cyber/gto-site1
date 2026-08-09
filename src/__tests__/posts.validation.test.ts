import { describe, expect, it } from "vitest";
import {
  MAX_PAGE_SIZE,
  parseCreateInput,
  parseListQuery,
  parseUpdateInput,
} from "@/lib/posts/validation";

describe("parseCreateInput", () => {
  it("정상 입력을 데이터로 변환한다", () => {
    const result = parseCreateInput({
      type: "HIRE",
      title: "지입 차주 모집합니다",
      content: "상세 내용",
    });

    expect(result.errors).toEqual({});
    expect(result.data).toMatchObject({
      type: "HIRE",
      title: "지입 차주 모집합니다",
      content: "상세 내용",
      status: "DRAFT",
    });
  });

  it("타입/제목/내용이 없으면 검증 오류를 반환한다", () => {
    const result = parseCreateInput({});

    expect(Object.keys(result.errors).length).toBeGreaterThan(0);
    expect(result.data).toBeUndefined();
  });

  it("허용되지 않는 필드는 차단한다", () => {
    const result = parseCreateInput({
      type: "HIRE",
      title: "제목",
      content: "내용",
      authorId: "attacker-id",
      id: "forged-id",
      viewCount: 999,
    });

    expect(result.errors.authorId).toBeDefined();
    expect(result.errors.id).toBeDefined();
    expect(result.errors.viewCount).toBeDefined();
    expect(result.data).toBeUndefined();
  });

  it("잘못된 유형/길이/금액을 차단한다", () => {
    const result = parseCreateInput({
      type: "INVALID",
      title: "x".repeat(101),
      content: "내용",
      payAmount: -1,
      payType: "WRONG",
    });

    expect(result.errors.type).toBeDefined();
    expect(result.errors.title).toBeDefined();
    expect(result.errors.payAmount).toBeDefined();
    expect(result.errors.payType).toBeDefined();
    expect(result.data).toBeUndefined();
  });

  it("conditions가 객체/배열이 아니면 차단한다", () => {
    const result = parseCreateInput({
      type: "SEEK",
      title: "제목",
      content: "내용",
      conditions: "not-an-object",
    });

    expect(result.errors.conditions).toBeDefined();
    expect(result.data).toBeUndefined();
  });
});

describe("parseUpdateInput", () => {
  it("부분 수정 입력을 데이터로 변환한다", () => {
    const result = parseUpdateInput({ title: "새 제목" });

    expect(result.errors).toEqual({});
    expect(result.data).toEqual({ title: "새 제목" });
  });

  it("수정 불가 필드(authorId 등)를 차단한다", () => {
    const result = parseUpdateInput({ title: "제목", authorId: "hacker" });

    expect(result.errors.authorId).toBeDefined();
    expect(result.data).toBeUndefined();
  });

  it("비어 있는 수정은 오류를 반환한다", () => {
    const result = parseUpdateInput({});

    expect(result.errors.form).toBeDefined();
    expect(result.data).toBeUndefined();
  });

  it("null로 옵션 필드를 초기화할 수 있다", () => {
    const result = parseUpdateInput({ regionId: null, payAmount: null });

    expect(result.errors).toEqual({});
    expect(result.data).toEqual({ regionId: null, payAmount: null });
  });
});

describe("parseListQuery", () => {
  it("기본 페이지네이션을 반환한다", () => {
    const result = parseListQuery(new URLSearchParams());

    expect(result.errors).toEqual({});
    expect(result.query.page).toBe(1);
    expect(result.query.pageSize).toBe(10);
  });

  it("pageSize는 최대값으로 제한된다", () => {
    const result = parseListQuery(
      new URLSearchParams({ pageSize: String(MAX_PAGE_SIZE + 100) }),
    );

    expect(result.query.pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("잘못된 type/payType 필터를 차단한다", () => {
    const result = parseListQuery(
      new URLSearchParams({ type: "BAD", payType: "WRONG" }),
    );

    expect(result.errors.type).toBeDefined();
    expect(result.errors.payType).toBeDefined();
  });

  it("유효한 필터는 query에 포함된다", () => {
    const result = parseListQuery(
      new URLSearchParams({ type: "HIRE", regionId: "region-1", keyword: "차주" }),
    );

    expect(result.query.type).toBe("HIRE");
    expect(result.query.regionId).toBe("region-1");
    expect(result.query.keyword).toBe("차주");
  });
});
