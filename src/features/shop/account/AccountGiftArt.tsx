/** Brand illustration from the approved access design, not a product photograph. */
export function AccountGiftArt() {
  return (
    <svg className="account__illustration" viewBox="0 0 280 220" aria-hidden="true">
      <circle cx="140" cy="110" r="100" fill="var(--color-surface)" opacity=".55" />
      <ellipse cx="140" cy="189" rx="93" ry="8" fill="var(--shop-peach)" />
      <rect x="59" y="99" width="162" height="83" rx="5" fill="var(--shop-peach)" />
      <rect x="51" y="82" width="178" height="29" rx="4" fill="var(--shop-rose)" />
      <path d="M128 82h24v100h-24z" fill="var(--color-accent)" />
      <path
        d="M140 84c-60 1-61-52-34-40 18 8 34 40 34 40Zm0 0c60 1 61-52 34-40-18 8-34 40-34 40Z"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="9"
      />
      <g transform="rotate(12 199 142)">
        <rect x="180" y="119" width="37" height="47" rx="2" fill="var(--color-surface)" />
        <path d="M199 132c-11-10-19 5 0 14 19-9 11-24 0-14Z" fill="var(--color-accent)" />
      </g>
    </svg>
  )
}
