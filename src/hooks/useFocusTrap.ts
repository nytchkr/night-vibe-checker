"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  ref: RefObject<T | null>,
  onEscape?: () => void,
) {
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active) return;

    const container = ref.current;
    if (!container) return;
    const trapContainer = container;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const getFocusable = () =>
      Array.from(trapContainer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");

    window.requestAnimationFrame(() => {
      const [first] = getFocusable();
      (first ?? trapContainer).focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onEscapeRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        trapContainer.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [active, ref]);
}
