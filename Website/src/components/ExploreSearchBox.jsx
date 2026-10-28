import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { resolveMediaUrl } from '../utils/listing';
import { IconSearch, IconShop } from './Icons';

/** Search input with live suggestions (items, categories, stores) and keyboard navigation. */
export default function ExploreSearchBox({
  value,
  onChange,
  onSubmit,
  onPickCategory,
  placeholder = 'Search phones, furniture, shops…',
  className = '',
}) {
  const navigate = useNavigate();
  const listId = useId();
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [data, setData] = useState({ suggestions: [], categories: [], stores: [] });

  const q = value.trim();

  useEffect(() => {
    if (q.length < 2) {
      setData({ suggestions: [], categories: [], stores: [] });
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.getSearchSuggestions(q, { signal: controller.signal })
        .then((res) => setData({
          suggestions: (res.suggestions || []).slice(0, 6),
          categories: res.categories || [],
          stores: res.stores || [],
        }))
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const items = [
    ...data.suggestions.map((s) => ({ kind: 'text', key: `t-${s.text}`, label: s.text, photo: s.photo, count: s.count })),
    ...data.categories.map((c) => ({ kind: 'category', key: `c-${c.name}`, label: c.name, count: c.count })),
    ...data.stores.map((s) => ({ kind: 'store', key: `s-${s.id}`, label: s.name, id: s.id, photo: s.logo, verified: s.isVerified })),
  ];
  const showList = open && q.length >= 2 && items.length > 0;

  const pick = (item) => {
    setOpen(false);
    setActive(-1);
    if (item.kind === 'store') {
      navigate(`/seller/${item.id}`);
      return;
    }
    if (item.kind === 'category') {
      onPickCategory?.(item.label);
      return;
    }
    onChange(item.label);
    onSubmit?.(item.label);
    inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (!showList) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    setOpen(false);
    onSubmit?.(value);
    inputRef.current?.blur();
  };

  return (
    <form className={`explore-search-form ${className}`.trim()} onSubmit={submit} role="search" ref={wrapRef}>
      <div className={`explore-search${showList ? ' is-open' : ''}`}>
        <IconSearch width={18} height={18} />
        <input
          ref={inputRef}
          type="search"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          enterKeyHint="search"
        />
        {value ? (
          <button
            type="button"
            className="explore-search-clear"
            onClick={() => {
              onChange('');
              onSubmit?.('');
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            ×
          </button>
        ) : null}
      </div>

      {showList ? (
        <ul className="explore-suggest" id={listId} role="listbox">
          {items.map((item, i) => (
            <li
              key={item.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`explore-suggest-item${i === active ? ' active' : ''}`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pick(item)}
              onMouseEnter={() => setActive(i)}
            >
              <span className={`explore-suggest-thumb explore-suggest-thumb--${item.kind}`}>
                {item.photo ? (
                  <img src={resolveMediaUrl(item.photo)} alt="" loading="lazy" />
                ) : item.kind === 'store' ? (
                  <IconShop width={16} height={16} />
                ) : (
                  <IconSearch width={15} height={15} />
                )}
              </span>
              <span className="explore-suggest-label">
                {item.label}
                {item.kind === 'category' ? <em>in categories</em> : null}
                {item.kind === 'store' ? <em>{item.verified ? 'Verified store' : 'Store'}</em> : null}
              </span>
              {item.count > 1 ? <span className="explore-suggest-count">{item.count}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
