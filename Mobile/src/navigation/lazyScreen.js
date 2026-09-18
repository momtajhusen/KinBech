import { lazy, Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';

export function lazyScreen(importFn) {
  const LazyComponent = lazy(importFn);

  return function LazyScreen(props) {
    return (
      <Suspense
        fallback={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" />
          </View>
        }
      >
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}
