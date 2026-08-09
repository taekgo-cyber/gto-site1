/**
 * 첨부파일 조회 URL을 만든다.
 * 실제 파일 바이너리는 서버가 DB의 attachment 관계와 storageKey를 기준으로 검증 후 서빙한다.
 * (GET /api/posts/[id]/attachments/[attachmentId]/file)
 */
export function buildAttachmentUrl(postId: string, attachmentId: string): string {
  return `/api/posts/${encodeURIComponent(postId)}/attachments/${encodeURIComponent(attachmentId)}/file`;
}
