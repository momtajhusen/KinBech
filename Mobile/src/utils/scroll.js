/** True when a scroll event is within `distance` px of the bottom of its content. */
export function isNearEnd(event, distance = 600) {
  const { contentOffset, layoutMeasurement, contentSize } = event?.nativeEvent || {};
  if (!contentOffset || !layoutMeasurement || !contentSize) return false;
  return contentOffset.y + layoutMeasurement.height >= contentSize.height - distance;
}
