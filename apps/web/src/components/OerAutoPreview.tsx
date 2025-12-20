import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { buildAutoplayEmbed } from '../utils/youtube';

type Props = {
  title: string;
  embedUrl?: string | null;
  thumbnailUrl?: string | null;
  badge?: string;
  onClick?: () => void;
};

const OerAutoPreview: React.FC<Props> = ({ title, embedUrl, thumbnailUrl, badge, onClick }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);
  const [hovered, setHovered] = useState(false);
  const prefersReducedMotion = useReducedMotion() ?? false;

  // Activate only when in viewport (and not reduced-motion)
  useEffect(() => {
    if (prefersReducedMotion) return;
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting && entry.intersectionRatio > 0.35),
      { threshold: [0, 0.35, 0.75] }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [prefersReducedMotion]);

  const src = buildAutoplayEmbed(embedUrl || '');
  const showIframe = !!src && !prefersReducedMotion && (active || hovered);

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video bg-black overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : -1}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick();
      }}
    >
      {/* Motion state */}
      {showIframe ? (
        <iframe
          title={title}
          src={src!}
          className="absolute inset-0 w-full h-full"
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="origin-when-cross-origin"
          loading="lazy"
        />
      ) : thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 w-full h-full bg-black" />
      )}

      {/* Overlay badge */}
      {badge && (
        <span className="absolute top-2 left-2 text-[11px] bg-white/90 dark:bg-black/70 text-[#0d141c] dark:text-white px-2 py-0.5 rounded">
          {badge}
        </span>
      )}

      {/* Hover veil for “tap to play” feel on desktop */}
      <span className="absolute inset-0 bg-black/0 hover:bg-black/12 transition" />
    </div>
  );
};

export default OerAutoPreview;
