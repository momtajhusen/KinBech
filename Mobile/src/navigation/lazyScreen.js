import { lazy, Suspense } from 'react';
import ScreenLoader from '../components/ScreenLoader';

export function lazyScreen(importFn) {
  const LazyComponent = lazy(importFn);

  return function LazyScreen(props) {
    return (
      <Suspense fallback={<ScreenLoader label="Opening" />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}
