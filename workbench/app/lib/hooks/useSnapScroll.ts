import { useRef, useCallback } from 'react';

export function useSnapScroll() {
  const autoScrollRef = useRef(true);
  const scrollNodeRef = useRef<HTMLDivElement>();
  const onScrollRef = useRef<() => void>();
  const observerRef = useRef<ResizeObserver>();

  const messageRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      let rafId: number | null = null;
      let lastScrollTime = 0;
      const THROTTLE_MS = 100;

      const observer = new ResizeObserver(() => {
        if (!autoScrollRef.current || !scrollNodeRef.current) return;

        const now = Date.now();
        if (now - lastScrollTime < THROTTLE_MS) return;
        lastScrollTime = now;

        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          if (scrollNodeRef.current) {
            const { scrollHeight, clientHeight } = scrollNodeRef.current;
            scrollNodeRef.current.scrollTo({ top: scrollHeight - clientHeight });
          }
          rafId = null;
        });
      });

      observer.observe(node);
      observerRef.current = observer;
    } else {
      observerRef.current?.disconnect();
      observerRef.current = undefined;
    }
  }, []);

  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      onScrollRef.current = () => {
        const { scrollTop, scrollHeight, clientHeight } = node;
        const scrollTarget = scrollHeight - clientHeight;

        autoScrollRef.current = Math.abs(scrollTop - scrollTarget) <= 10;
      };

      node.addEventListener('scroll', onScrollRef.current);

      scrollNodeRef.current = node;
    } else {
      if (onScrollRef.current) {
        scrollNodeRef.current?.removeEventListener('scroll', onScrollRef.current);
      }

      scrollNodeRef.current = undefined;
      onScrollRef.current = undefined;
    }
  }, []);

  return [messageRef, scrollRef];
}
