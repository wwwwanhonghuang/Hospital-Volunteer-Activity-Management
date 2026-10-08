// SPDX-License-Identifier: AGPL-3.0-only
/** Generic branding wrapper; the separately loaded SVG artwork is CC BY-NC-SA 4.0. */
export function BrandMark({ size = 44, className = '' }: { size?: number; className?: string }) {
  return <img className={`shuori-mark ${className}`} width={size} height={size} src="/shuori-mark.svg" alt="" aria-hidden="true" />;
}

export function ShuoriBrand({ tagline = true, className = '' }: { tagline?: boolean; className?: string }) {
  return <span className={`shuori-brand ${className}`}>
    <BrandMark />
    <span className="shuori-wordmark">
      <span className="shuori-name" lang="zh-Hant">守織</span>
      <span className="shuori-roman">SHUORI</span>
      {tagline && <span className="shuori-tagline">VOLUNTEER OPERATIONS</span>}
    </span>
  </span>;
}
