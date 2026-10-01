type BrandProps = { inverse?: boolean; className?: string };

export function Brand({ inverse = false, className = '' }: BrandProps) {
  return <img
    className={`brand-logo ${className}`.trim()}
    src={`/brand/playerp-logo-horizontal${inverse ? '-white' : ''}.png`}
    alt="PlayERP"
    width="800"
    height="400"
  />;
}
