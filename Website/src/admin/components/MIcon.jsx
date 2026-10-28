/**
 * Material Symbols (Rounded) icon, e.g. <MIcon name="storefront" filled />.
 * `name` is the icon's ligature name from https://fonts.google.com/icons.
 */
export default function MIcon({ name, filled = false, size, className = '', ...rest }) {
  return (
    <span
      className={`micon ${filled ? 'is-filled' : ''} ${className}`.trim()}
      style={size ? { fontSize: size } : undefined}
      aria-hidden="true"
      {...rest}
    >
      {name}
    </span>
  );
}
