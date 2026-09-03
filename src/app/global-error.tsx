"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("root_render_error", {
      digest: error.digest ?? null,
      name: error.name,
    });
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          boxSizing: "border-box",
          background: "#ffffff",
          color: "#171717",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <main style={{ maxWidth: 520, textAlign: "center" }}>
          <title>오류가 발생했습니다 - 운전픽</title>
          <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700 }}>
            서비스 오류
          </p>
          <h1 style={{ margin: "0 0 12px", fontSize: 28 }}>
            페이지를 표시할 수 없습니다.
          </h1>
          <p style={{ margin: "0 0 20px", lineHeight: 1.6, color: "#525252" }}>
            잠시 후 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              minHeight: 44,
              border: "1px solid #d4d4d4",
              borderRadius: 8,
              padding: "0 18px",
              background: "#171717",
              color: "#ffffff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
        </main>
      </body>
    </html>
  );
}
