"use client";

import Image from "next/image";

interface BrandLogoProps {
  size?: number;
  labelClassName?: string;
  subtitleClassName?: string;
  className?: string;
  onClick?: () => void;
  showSubtitle?: boolean;
}

export function BrandLogo({
  size = 48,
  labelClassName = "text-2xl",
  subtitleClassName = "text-xs uppercase tracking-[0.32em] text-slate-500",
  className = "",
  onClick,
  showSubtitle = true,
}: BrandLogoProps) {
  const content = (
    <>
      <div
        className="relative overflow-hidden rounded-2xl border border-white/40 bg-white/80 shadow-lg"
        style={{ width: size, height: size }}
      >
        <Image
          src="/brand/lawbridge-logo.png"
          alt="LawBridge logo"
          fill
          className="object-cover"
          sizes={`${size}px`}
          priority
        />
      </div>
      <div className="text-left">
        <div
          className={`brand-title font-semibold tracking-[0.18em] text-slate-900 ${labelClassName}`}
        >
          LAWBRIDGE
        </div>
        {showSubtitle ? (
          <div className={subtitleClassName}>Labor Rights Intelligence</div>
        ) : null}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-3 text-left transition hover:opacity-90 ${className}`}
      >
        {content}
      </button>
    );
  }

  return <div className={`flex items-center gap-3 ${className}`}>{content}</div>;
}