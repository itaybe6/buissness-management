import { colorFor, initialsOf } from "@/lib/db";

interface UserAvatarProps {
  userId: string;
  name?: string | null;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
  rounded?: "square" | "circle";
}

export function UserAvatar({
  userId,
  name,
  avatarUrl,
  size = 36,
  className = "",
  rounded = "square",
}: UserAvatarProps) {
  const radius = rounded === "circle" ? "50%" : size <= 32 ? "8px" : size <= 40 ? "10px" : "11px";
  const fontSize = Math.max(11, Math.round(size * 0.38));

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name ?? "משתמש"}
        className={`flex-none object-cover ${className}`}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  return (
    <span
      className={`grid flex-none place-items-center font-bold text-white ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: colorFor(userId),
        fontSize,
      }}
      aria-hidden={!name}
    >
      {initialsOf(name)}
    </span>
  );
}
