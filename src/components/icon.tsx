import type { CSSProperties } from "react";

const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  quote: "M6 3h9l4 4v14H5V3h1 M14 3v5h5 M8 12h8 M8 16h5",
  orders: "M3 7l9-4 9 4v11l-9 4-9-4V7z M3 7l9 4 9-4 M12 11v11 M8 5l9 4",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  link: "M10 13a5 5 0 0 0 7 .2l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7-.2l-3 3a5 5 0 0 0 7 7l2-2",
  arrow: "M4 12h16 M14 6l6 6-6 6",
  plus: "M12 5v14 M5 12h14",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  chevron: "M9 5l7 7-7 7",
  check: "M5 12l4 4L19 6",
  close: "M6 6l12 12 M6 18L18 6",
  clock: "M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  route:
    "M5 7a3 3 0 1 0 0-.01 M19 17a3 3 0 1 0 0-.01 M8 7h7a4 4 0 0 1 0 8h-6a4 4 0 0 0-4 4",
  dollar: "M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  download: "M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5",
  refresh: "M20 8a9 9 0 1 0 1 7 M20 3v6h-6",
  external: "M14 3h7v7 M21 3L10 14 M10 3H4v17h17v-6",
  edit: "M16 3l5 5 M4 16L17 3a2 2 0 0 1 4 4L8 20l-5 1 1-5z",
  send: "M22 2L9 15 M22 2l-7 20-6-7-7-6 20-7z",
  help: "M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  shield: "M12 3l8 3v6c0 5-8 10-8 10S4 17 4 12V6l8-3 M8 12l3 3 5-6",
  filter: "M4 6h16 M7 12h10 M10 18h4",
  print: "M6 9V3h12v6 M6 17H3V9h18v8h-3 M6 14h12v8H6z M17 11h1",
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 20,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
