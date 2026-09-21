/** Hand-drawn crayon circle drawn behind a flagged name. Two overlapping loops, slightly off. */
export function Scribble(): React.JSX.Element {
  return (
    <svg className="scribble" viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true">
      <path d="M18 30 C 14 12, 60 6, 104 8 C 150 10, 194 14, 190 32 C 186 50, 140 56, 96 54 C 52 52, 8 48, 18 30" />
      <path d="M26 34 C 20 18, 66 12, 100 14 C 146 16, 184 20, 182 34 C 180 48, 138 52, 100 50 C 60 48, 22 44, 26 34" />
    </svg>
  )
}
