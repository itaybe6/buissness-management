interface NavItemBadgeProps {
  count: number;
  className?: string;
  ariaLabel?: string;
}

export function NavItemBadge({
  count,
  className = "side-nav-badge",
  ariaLabel,
}: NavItemBadgeProps) {
  if (count <= 0) return null;

  const label = count > 99 ? "99+" : String(count);

  return (
    <span className={className} aria-label={ariaLabel ?? `${count} פריטים חדשים`}>
      {label}
    </span>
  );
}
