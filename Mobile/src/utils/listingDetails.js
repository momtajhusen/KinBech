// Item details (RAM, kilometres, ...) live in the listing description as "- Label: value" lines
// under a "Details:" heading, so every buyer screen shows them without a new field.

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lineFor = (field) => new RegExp(`^\\s*[-•*]?\\s*${escape(field.label)}\\s*[:：]\\s*(.*)$`, 'i');
const HEADING = /^\s*details\s*:\s*$/i;
const ITEM = /^\s*[-•*]\s+/;

const stripUnit = (field, text) => {
  const value = String(text || '').trim();
  if (!field.numeric) return value;
  return (value.replace(/,/g, '').match(/\d+(\.\d+)?/) || [''])[0];
};

/** "150" + "cc" for numeric fields; other values as typed. */
export function detailText(field, value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return field.unit && field.numeric ? `${text} ${field.unit}` : text;
}

/** Start values: what the description already says, else what the AI read from the photo. */
export function readDetails(details, description) {
  const lines = String(description || '').split('\n');
  const values = {};
  (details?.fields || []).forEach((field) => {
    const pattern = lineFor(field);
    const line = lines.map((item) => item.match(pattern)).find((match) => match && match[1].trim());
    values[field.key] = line ? stripUnit(field, line[1]) : String(field.value || '');
  });
  return values;
}

export function missingDetails(details, values) {
  return (details?.fields || []).filter((field) => !String(values?.[field.key] || '').trim()).length;
}

/** The description with these values: known lines are updated in place, new ones go under "Details:". */
export function writeDetails(description, details, values) {
  const fields = details?.fields || [];
  const done = new Set();
  const out = [];
  String(description || '')
    .split('\n')
    .forEach((line) => {
      const field = fields.find((item) => lineFor(item).test(line));
      if (!field) {
        out.push(line);
        return;
      }
      if (done.has(field.key)) return;
      done.add(field.key);
      const text = detailText(field, values[field.key]);
      if (text) out.push(`- ${field.label}: ${text}`);
    });

  const added = fields
    .filter((field) => !done.has(field.key))
    .map((field) => {
      const text = detailText(field, values[field.key]);
      return text ? `- ${field.label}: ${text}` : null;
    })
    .filter(Boolean);

  let heading = out.findIndex((line) => HEADING.test(line));
  if (added.length && heading >= 0) {
    let end = heading + 1;
    while (end < out.length && ITEM.test(out[end])) end += 1;
    out.splice(end, 0, ...added);
  } else if (added.length) {
    const base = out.join('\n').replace(/\s+$/, '');
    return `${base ? `${base}\n\n` : ''}Details:\n${added.join('\n')}`;
  }
  // A heading left with no lines under it goes too.
  heading = out.findIndex((line) => HEADING.test(line));
  if (heading >= 0 && !ITEM.test(out[heading + 1] || '')) out.splice(heading, 1);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
}
