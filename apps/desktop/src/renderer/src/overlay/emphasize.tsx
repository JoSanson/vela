import type { ReactNode } from 'react';

/** Wraps the first occurrence of `part` in a translated sentence with `<strong>`, keeping the rest intact. */
export function emphasize(text: string, part: string): ReactNode {
  const i = part ? text.indexOf(part) : -1;
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <strong>{part}</strong>
      {text.slice(i + part.length)}
    </>
  );
}
