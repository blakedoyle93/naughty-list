/** Hand-drawn crayon circle drawn behind a flagged name. One loop, drawn light. */
export function Scribble(): React.JSX.Element {
  return (
    <svg className="scribble" viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true">
      <path d="M20 32 C 16 14, 62 8, 104 10 C 150 12, 192 16, 188 33 C 184 50, 138 55, 96 53 C 54 51, 10 47, 20 32" />
    </svg>
  )
}
