import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, View } from 'react-native';

const LazyScrollContext = createContext(null);

export const LazyScrollProvider = LazyScrollContext.Provider;

/**
 * Wire a screen's ScrollView to the LazyLists inside it:
 * `ref={scrollRef}`, call `onScroll(event)` and `onContentSizeChange()` from the ScrollView,
 * and wrap the content in `<LazyScrollProvider value={value}>`.
 */
export function useLazyScroll() {
  const scrollRef = useRef(null);
  const store = useRef(null);
  if (!store.current) {
    store.current = { offset: 0, height: Dimensions.get('window').height, listeners: new Set() };
  }
  const onScroll = useCallback((event) => {
    const { contentOffset, layoutMeasurement } = event?.nativeEvent || {};
    if (!contentOffset) return;
    store.current.offset = contentOffset.y;
    if (layoutMeasurement?.height) store.current.height = layoutMeasurement.height;
    store.current.listeners.forEach((fn) => fn(false));
  }, []);
  const onContentSizeChange = useCallback(() => {
    store.current.listeners.forEach((fn) => fn(true));
  }, []);
  const value = useMemo(() => ({ scrollRef, store: store.current }), []);
  return { scrollRef, onScroll, onContentSizeChange, value };
}

function chunk(items, size) {
  const rows = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

const defaultKey = (item, index) => String(item?.id ?? item?._id ?? item?.key ?? index);

/**
 * A list or grid that lives inside a normal ScrollView and only mounts the rows near the screen.
 * Rows far above or below become empty spacers, so long feeds stay light on memory and photos
 * load only when they come close. Short lists (up to `minRows` rows) render fully, as before.
 *
 * `renderItem(item, index, revisit)` – `revisit` is true when the row was shown before, so
 * screens can skip their entering animation when the user scrolls back.
 */
export default function LazyList({
  data,
  renderItem,
  keyExtractor = defaultKey,
  columns = 1,
  gap = 0,
  rowGap = gap,
  style,
  rowStyle,
  estimatedRowHeight = 220,
  overscan = 1.5,
  minRows = 10,
  initialRows = 8,
}) {
  const ctx = useContext(LazyScrollContext);
  const rows = useMemo(() => chunk(data || [], Math.max(1, columns)), [data, columns]);
  const rowKeys = useMemo(
    () => rows.map((row, index) => keyExtractor(row[0], index * columns)),
    [rows, keyExtractor, columns]
  );
  const enabled = Boolean(ctx) && rows.length > minRows;

  const wrapRef = useRef(null);
  const topRef = useRef(null);
  const heights = useRef(new Map());
  const seen = useRef(new Set());
  const [range, setRange] = useState(() => [0, initialRows - 1]);
  const [measureFailed, setMeasureFailed] = useState(false);

  const rowHeight = useCallback(
    (index) => {
      const known = heights.current.get(rowKeys[index]);
      if (known != null) return known;
      if (!heights.current.size) return estimatedRowHeight;
      let sum = 0;
      heights.current.forEach((h) => {
        sum += h;
      });
      return sum / heights.current.size;
    },
    [rowKeys, estimatedRowHeight]
  );

  const compute = useCallback(() => {
    if (!enabled || topRef.current == null) return;
    const { offset, height } = ctx.store;
    const from = offset - topRef.current - height * overscan;
    const to = offset - topRef.current + height * (1 + overscan);
    let y = 0;
    let first = -1;
    let last = rows.length - 1;
    for (let i = 0; i < rows.length; i += 1) {
      const top = y + (i > 0 ? rowGap : 0);
      const bottom = top + rowHeight(i);
      if (first < 0 && bottom >= from) first = i;
      if (top > to) {
        last = i - 1;
        break;
      }
      y = bottom;
    }
    if (first < 0) first = Math.max(0, rows.length - 1);
    last = Math.max(first, Math.min(last, rows.length - 1));
    setRange((current) => (current[0] === first && current[1] === last ? current : [first, last]));
  }, [enabled, ctx, overscan, rows.length, rowGap, rowHeight]);

  const measureTop = useCallback(() => {
    if (!enabled) return;
    const node = wrapRef.current;
    const host = ctx.scrollRef.current;
    const inner = host?.getInnerViewRef?.() || host?.getNativeScrollRef?.();
    if (!node?.measureLayout || !inner) {
      setMeasureFailed(true);
      return;
    }
    node.measureLayout(
      inner,
      (_x, y) => {
        topRef.current = y;
        compute();
      },
      () => setMeasureFailed(true)
    );
  }, [enabled, ctx, compute]);

  const computeRef = useRef(compute);
  computeRef.current = compute;
  const measureRef = useRef(measureTop);
  measureRef.current = measureTop;

  useEffect(() => {
    if (!ctx) return undefined;
    const listener = (remeasure) => (remeasure ? measureRef.current() : computeRef.current());
    ctx.store.listeners.add(listener);
    return () => ctx.store.listeners.delete(listener);
  }, [ctx]);

  useEffect(() => {
    if (topRef.current == null) measureRef.current();
    else computeRef.current();
  }, [rows]);

  // If the position never comes back, show every row rather than leave a blank gap.
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setTimeout(() => {
      if (topRef.current == null) setMeasureFailed(true);
    }, 600);
    return () => clearTimeout(timer);
  }, [enabled]);

  const windowed = enabled && !measureFailed;
  let first = 0;
  let last = rows.length - 1;
  if (windowed && topRef.current == null) {
    last = Math.min(rows.length, initialRows) - 1;
  } else if (windowed) {
    first = Math.min(range[0], Math.max(0, rows.length - 1));
    last = Math.min(Math.max(range[1], first), rows.length - 1);
  }

  let topSpace = 0;
  let bottomSpace = 0;
  if (windowed) {
    for (let i = 0; i < first; i += 1) topSpace += rowHeight(i) + (i > 0 ? rowGap : 0);
    for (let i = last + 1; i < rows.length; i += 1) bottomSpace += rowHeight(i) + rowGap;
  }

  const recordHeight = (key) => (event) => {
    heights.current.set(key, event.nativeEvent.layout.height);
  };

  return (
    <View ref={wrapRef} onLayout={() => measureRef.current()} style={[style, OUTER]}>
      {topSpace > 0 ? <View style={{ height: topSpace }} /> : null}
      {rows.slice(first, last + 1).map((row, offset) => {
        const index = first + offset;
        const key = rowKeys[index];
        const revisit = seen.current.has(key);
        seen.current.add(key);
        return (
          <View
            key={key}
            onLayout={recordHeight(key)}
            style={[
              columns > 1 ? { flexDirection: 'row', columnGap: gap } : null,
              index > 0 && rowGap ? { marginTop: rowGap } : null,
              rowStyle,
            ]}
          >
            {row.map((item, column) => renderItem(item, index * columns + column, revisit))}
          </View>
        );
      })}
      {bottomSpace > 0 ? <View style={{ height: bottomSpace }} /> : null}
    </View>
  );
}

const OUTER = { flexDirection: 'column', flexWrap: 'nowrap', gap: 0, rowGap: 0, columnGap: 0 };
