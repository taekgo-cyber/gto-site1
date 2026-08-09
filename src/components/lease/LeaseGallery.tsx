"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { buildAttachmentUrl } from "@/lib/attachments/url";

export type GalleryImage = {
  id: string;
  originalName: string;
};

type LeaseGalleryProps = {
  postId: string;
  images: GalleryImage[];
};

export function LeaseGallery({ postId, images }: LeaseGalleryProps) {
  const [selected, setSelected] = useState(0);

  if (images.length === 0) return null;

  const current = images[Math.min(selected, images.length - 1)];

  return (
    <div className="space-y-2">
      <div className="flex aspect-[4/3] max-h-[480px] w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-surface sm:aspect-[16/9]">
        <img
          src={buildAttachmentUrl(postId, current.id)}
          alt={current.originalName}
          className="max-h-full w-auto max-w-full object-contain"
        />
      </div>

      {images.length > 1 ? (
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          role="group"
          aria-label="게시글 이미지 목록"
        >
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setSelected(index)}
              aria-label={`${index + 1}번째 이미지 보기`}
              aria-pressed={index === selected}
              className={cn(
                "h-16 w-20 shrink-0 overflow-hidden rounded-md border bg-surface transition-colors",
                index === selected
                  ? "border-primary ring-2 ring-ring"
                  : "border-border hover:border-primary/40",
              )}
            >
              <img
                src={buildAttachmentUrl(postId, image.id)}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
