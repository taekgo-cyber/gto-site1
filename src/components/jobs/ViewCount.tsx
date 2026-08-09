"use client";

import { useEffect, useState } from "react";
import { incrementJobPostView } from "@/lib/jobs/actions";

type ViewCountProps = {
  jobPostId: string;
  initialViewCount: number;
};

export function ViewCount({ jobPostId, initialViewCount }: ViewCountProps) {
  const [viewCount, setViewCount] = useState(initialViewCount);

  useEffect(() => {
    let isMounted = true;
    incrementJobPostView(jobPostId).then((updated) => {
      if (isMounted) setViewCount(updated);
    });
    return () => {
      isMounted = false;
    };
  }, [jobPostId]);

  return <span>조회 {viewCount.toLocaleString("ko-KR")}</span>;
}
