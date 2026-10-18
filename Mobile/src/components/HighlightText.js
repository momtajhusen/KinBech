import { useMemo } from 'react';
import { Text } from 'react-native';

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function queryWords(query) {
  const words = String(query || '')
    .toLowerCase()
    .split(/[\s,.;:!?()[\]{}"'`/\\|+_*&#@~<>=-]+/)
    .filter((word) => word.length >= 2 || /\d/.test(word));
  const withStems = words.flatMap((word) => (
    word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? [word, word.slice(0, -1)] : [word]
  ));
  return [...new Set(withStems)].sort((a, b) => b.length - a.length);
}

/** Renders text with the words of `query` emphasised. */
export default function HighlightText({ text, query, style, highlightStyle, numberOfLines }) {
  const parts = useMemo(() => {
    const value = String(text || '');
    const words = queryWords(query);
    if (!value || !words.length) return [{ text: value, hit: false }];
    const pattern = new RegExp(`(${words.map(escapeRegex).join('|')})`, 'gi');
    return value
      .split(pattern)
      .filter(Boolean)
      .map((chunk) => ({ text: chunk, hit: words.includes(chunk.toLowerCase()) }));
  }, [text, query]);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, index) => (
        <Text key={index} style={part.hit ? highlightStyle : undefined}>
          {part.text}
        </Text>
      ))}
    </Text>
  );
}
