interface NavItemBadgeProps {
  count: number;
  className?: string;
}

export function NavItemBadge({ count, className = "side-nav-badge" }: NavItemBadgeProps) {
  if (count <= 0) return null;

  const label = count > 99 ? "99+" : String(count);

  return (
    <span className={className} aria-label={`${count} תקלות חדשות`}>
      {label}
    </span>
  );
}
