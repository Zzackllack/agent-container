import { classNames } from "../classNames";
import { brandFor } from "./brands";

export type MarkSize = "sm" | "md" | "lg" | "xl";

/**
 * A vendor logo in a square chip. Unknown names (a future agent, a custom
 * harness) render nothing instead of a broken image, so callers can keep their
 * text label as the only source of truth.
 */
export function BrandMark({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: MarkSize;
  className?: string;
}) {
  const brand = brandFor(name);
  if (!brand) return null;
  const { Mark } = brand;
  return (
    <span
      className={classNames(
        "mark",
        `mark--${size}`,
        `mark--${brand.id}`,
        brand.glyph && "mark--glyph",
        className,
      )}
    >
      <Mark className="mark-art" />
    </span>
  );
}

/** Every agent that reads a file, in declaration order. */
export function BrandMarks({
  agents,
  size = "sm",
}: {
  agents: string[];
  size?: MarkSize;
}) {
  const known = agents.filter((agent) => brandFor(agent));
  if (!known.length) return null;
  return (
    <span className="mark-stack">
      {known.map((agent) => (
        <BrandMark key={agent} name={agent} size={size} />
      ))}
    </span>
  );
}
