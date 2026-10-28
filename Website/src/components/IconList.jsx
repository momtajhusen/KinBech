/** `items` are `{ icon, text, ne?, tone? }`; `icon` is a Material icon component, `ne` a Nepali line. */
export default function IconList({ items, tone = 'green', className = '' }) {
  return (
    <ul className={`icon-list${className ? ` ${className}` : ''}`}>
      {items.map(({ icon: Icon, text, ne, tone: itemTone }) => (
        <li key={text} className={`icon-list-item icon-tone--${itemTone || tone}`}>
          <span className="icon-tile">
            <Icon aria-hidden />
          </span>
          <span className="icon-list-text">
            {text}
            {ne ? <small className="ne-sub" lang="ne">{ne}</small> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function IconTitle({ icon: Icon, tone = 'green', as: Tag = 'h3', ne, children }) {
  return (
    <Tag className={`icon-title icon-tone--${tone}`}>
      <span className="icon-tile icon-tile--lg">
        <Icon aria-hidden />
      </span>
      <span className="icon-title-text">
        {children}
        {ne ? <small className="ne-sub ne-sub--title" lang="ne">{ne}</small> : null}
      </span>
    </Tag>
  );
}
