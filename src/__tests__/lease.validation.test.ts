import { describe, expect, it } from "vitest";
import {
  validateAttachmentFiles,
  validateLeaseForm,
  type LeaseFormValues,
} from "@/lib/lease/validation";
import { MAX_FILE_SIZE, MAX_ATTACHMENTS_PER_POST } from "@/lib/lease/constants";

function makeValues(overrides: Partial<LeaseFormValues> = {}): LeaseFormValues {
  return {
    type: "HIRE",
    title: "지입 차주 모집",
    content: "상세 내용입니다.",
    status: "PUBLISHED",
    regionId: "",
    vehicleTypeId: "",
    tonnageId: "",
    payType: "MONTHLY",
    payAmount: "320",
    workType: "FULL_TIME",
    conditions: "",
    ...overrides,
  };
}

describe("validateLeaseForm", () => {
  it("유효한 입력이면 오류가 없다", () => {
    expect(validateLeaseForm(makeValues())).toEqual({});
  });

  it("게시글 유형이 없으면 오류를 반환한다", () => {
    const errors = validateLeaseForm(makeValues({ type: "" }));
    expect(errors.type).toBeDefined();
  });

  it("제목이 비어 있으면 오류를 반환한다", () => {
    const errors = validateLeaseForm(makeValues({ title: "   " }));
    expect(errors.title).toBeDefined();
  });

  it("제목이 100자를 초과하면 오류를 반환한다", () => {
    const errors = validateLeaseForm(makeValues({ title: "가".repeat(101) }));
    expect(errors.title).toContain("100자");
  });

  it("내용이 비어 있으면 오류를 반환한다", () => {
    const errors = validateLeaseForm(makeValues({ content: "" }));
    expect(errors.content).toBeDefined();
  });

  it("내용이 5000자를 초과하면 오류를 반환한다", () => {
    const errors = validateLeaseForm(makeValues({ content: "가".repeat(5001) }));
    expect(errors.content).toContain("5000자");
  });

  it("급여 유형이 있고 금액이 정수가 아니면 오류를 반환한다", () => {
    const errors = validateLeaseForm(makeValues({ payAmount: "abc" }));
    expect(errors.payAmount).toBeDefined();
  });

  it("급여 유형이 있고 금액이 음수면 오류를 반환한다", () => {
    const errors = validateLeaseForm(makeValues({ payAmount: "-1" }));
    expect(errors.payAmount).toBeDefined();
  });

  it("급여 유형이 협의(NEGOTIABLE)면 금액을 검증하지 않는다", () => {
    const errors = validateLeaseForm(makeValues({ payType: "NEGOTIABLE", payAmount: "abc" }));
    expect(errors.payAmount).toBeUndefined();
  });

  it("급여 유형이 없으면 금액을 검증하지 않는다", () => {
    const errors = validateLeaseForm(makeValues({ payType: "", payAmount: "" }));
    expect(errors.payAmount).toBeUndefined();
  });
});

describe("validateAttachmentFiles", () => {
  it("빈 목록이면 문제가 없다", () => {
    expect(validateAttachmentFiles([])).toEqual([]);
  });

  it("허용된 이미지/PDF면 문제가 없다", () => {
    const files = [
      new File([new Uint8Array(1024)], "photo.png", { type: "image/png" }),
      new File([new Uint8Array(1024)], "doc.pdf", { type: "application/pdf" }),
    ];
    expect(validateAttachmentFiles(files)).toEqual([]);
  });

  it("빈 파일은 문제로 보고한다", () => {
    const file = new File([new Uint8Array(0)], "empty.png", { type: "image/png" });
    const issues = validateAttachmentFiles([file]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("빈 파일");
  });

  it("파일 크기가 10MB를 초과하면 문제로 보고한다", () => {
    const file = new File([new Uint8Array(10)], "big.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: MAX_FILE_SIZE + 1 });
    const issues = validateAttachmentFiles([file]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("10MB");
  });

  it("지원하지 않는 확장자는 문제로 보고한다", () => {
    const file = new File([new Uint8Array(1024)], "malware.exe");
    const issues = validateAttachmentFiles([file]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("지원하지 않는 파일 형식");
  });

  it("개수가 10개를 초과하면 전체를 거부한다", () => {
    const files = Array.from(
      { length: MAX_ATTACHMENTS_PER_POST + 1 },
      (_, index) => new File([new Uint8Array(1024)], `photo${index}.png`, { type: "image/png" }),
    );
    const issues = validateAttachmentFiles(files);
    expect(issues).toHaveLength(1);
    expect(issues[0].index).toBe(-1);
    expect(issues[0].message).toContain(String(MAX_ATTACHMENTS_PER_POST));
  });
});
