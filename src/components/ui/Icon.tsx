interface IconProps {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  fill?: boolean;
}

/** Material Symbols Rounded icon. */
export function Icon({ name, size = 22, className = "", style, fill = true }: IconProps) {
  return (
    <span
      className={`material-symbols-rounded ${className}`}
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
        ...style,
      }}
    >
      {name}
    </span>
  );
}
