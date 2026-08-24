"use client";

import { useState } from "react";
import Image from "next/image";
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
      <div className="relative flex aspect-[4/3] max-h-[480px] w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-surface sm:aspect-[16/9]">
        <Image
          src={buildAttachmentUrl(postId, current.id)}
          alt={current.originalName}
          fill
          sizes="(min-width: 768px) 48rem, 100vw"
          className="object-contain"
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
                "relative h-16 w-20 shrink-0 touch-manipulation overflow-hidden rounded-md border bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                index === selected
                  ? "border-primary ring-2 ring-ring"
                  : "border-border hover:border-primary/40",
              )}
            >
              <Image
                src={buildAttachmentUrl(postId, image.id)}
                alt=""
                fill
                sizes="5rem"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
