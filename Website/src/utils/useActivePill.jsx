import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Tracks where the active item sits inside a container so one highlight can slide between items.
 * Attach `ref` to the container (it must be position: relative) and render `pill` inside it.
 * `ready` turns on after the first placement, so the highlight doesn't fly in from the corner.
 */
export default function useActivePill(selector, deps) {
  const ref = useRef(null);
  const [pill, setPill] = useState(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return undefined;
    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const item = box.querySelector(selector);
      if (!item) {
        setPill(null);
        return;
      }
      let next;
      if (item.offsetParent === box) {
        next = { x: item.offsetLeft, y: item.offsetTop, w: item.offsetWidth, h: item.offsetHeight };
      } else {
        const outer = box.getBoundingClientRect();
        const inner = item.getBoundingClientRect();
        next = {
          x: Math.round(inner.left - outer.left - box.clientLeft + box.scrollLeft),
          y: Math.round(inner.top - outer.top - box.clientTop + box.scrollTop),
          w: Math.round(inner.width),
          h: Math.round(inner.height),
        };
      }
      setPill((prev) => (
        prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next
      ));
    };

    measure();
    const frame = requestAnimationFrame(() => setReady(true));
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    [...box.children].forEach((child) => {
      if (!child.classList.contains('nav-pill')) observer.observe(child);
    });
    document.fonts?.ready.then(measure);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [selector, ...deps]);

  return { ref, pill, ready };
}

export function NavPill({ pill, ready }) {
  if (!pill) return null;
  return (
    <span
      className={`nav-pill ${ready ? 'is-ready' : ''}`}
      style={{ width: pill.w, height: pill.h, transform: `translate3d(${pill.x}px, ${pill.y}px, 0)` }}
      aria-hidden="true"
    />
  );
}
