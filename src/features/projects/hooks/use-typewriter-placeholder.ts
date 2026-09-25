import { useEffect, useState } from "react";

// #region Design notes
// Animated "typewriter" placeholder: a fixed prefix ("Ask Anubithic/studio to ")
// followed by example phrases that are typed out, held, erased, and cycled.
// Only the phrase streams — the prefix never moves.
//
// It is a plain string fed to the textarea's `placeholder`, so no overlay/DOM
// tricks are needed and the real placeholder semantics are kept.
//
// - `paused` (e.g. the user is typing, so the placeholder is hidden anyway)
//   stops the timers instead of re-rendering for nothing.
// - Users with `prefers-reduced-motion` get the first phrase, static.
// #endregion

const TYPE_SPEED_MS = 35;
const DELETE_SPEED_MS = 15;
const HOLD_FULL_MS = 1400; // phrase fully typed -> wait before erasing
const HOLD_EMPTY_MS = 250; // phrase erased -> wait before typing the next one

interface UseTypewriterPlaceholderOptions {
  prefix: string;
  phrases: string[];
  paused?: boolean;
}

export const useTypewriterPlaceholder = ({
  prefix,
  phrases,
  paused = false,
}: UseTypewriterPlaceholderOptions) => {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const phrase = phrases[phraseIndex % phrases.length] ?? "";

  useEffect(() => {
    if (paused || reducedMotion || phrases.length === 0) return;

    const isFullyTyped = !isDeleting && charCount === phrase.length;
    const isFullyErased = isDeleting && charCount === 0;

    const delay = isFullyTyped
      ? HOLD_FULL_MS
      : isFullyErased
        ? HOLD_EMPTY_MS
        : isDeleting
          ? DELETE_SPEED_MS
          : TYPE_SPEED_MS;

    const timeout = setTimeout(() => {
      if (isFullyTyped) {
        setIsDeleting(true);
      } else if (isFullyErased) {
        setIsDeleting(false);
        setPhraseIndex((index) => (index + 1) % phrases.length);
      } else {
        setCharCount((count) => count + (isDeleting ? -1 : 1));
      }
    }, delay);

    return () => clearTimeout(timeout);
  }, [
    paused,
    reducedMotion,
    phrases.length,
    phrase.length,
    charCount,
    isDeleting,
  ]);

  if (reducedMotion) {
    return `${prefix}${phrases[0] ?? ""}...`;
  }

  //"..." is only appended once the line has finished streaming (while it is held),
  //so it lands at the end of the sentence instead of following the typing
  const isLineComplete = !isDeleting && charCount === phrase.length;
  return `${prefix}${phrase.slice(0, charCount)}${isLineComplete ? "..." : ""}`;
};
