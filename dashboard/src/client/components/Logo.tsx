// The adjacent product name labels the brand; avoid repeating it to screen readers.
export function Logo({ className }: { className: string }) {
  return (
    <img
      className={className}
      src="/logo.png"
      width={256}
      height={256}
      alt=""
    />
  );
}
