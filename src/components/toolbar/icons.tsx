/** Small line icons for the toolbar, drawn in the text colour. Decorative: buttons carry the name. */
const props = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  focusable: false,
} as const;

export function FolderIcon() {
  return (
    <svg {...props} aria-hidden="true">
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h9A1.5 1.5 0 0 1 21 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
    </svg>
  );
}

export function OutlineIcon() {
  return (
    <svg {...props} aria-hidden="true">
      <path d="M4 6h16M8 12h12M8 18h12M4 12h.01M4 18h.01" />
    </svg>
  );
}

export function MenuIcon() {
  return (
    <svg {...props} aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
