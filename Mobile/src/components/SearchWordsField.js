import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formInputStyle, formLabelStyle, useTheme, useThemedStyles } from '../theme';

const MAX_WORDS = 20;

function cleanWord(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
}

export function mergeSearchWords(current, incoming) {
  const next = [...(current || [])];
  const seen = new Set(next.map((word) => word.toLowerCase()));
  (incoming || []).forEach((raw) => {
    const word = cleanWord(raw);
    if (!word || seen.has(word.toLowerCase()) || next.length >= MAX_WORDS) return;
    seen.add(word.toLowerCase());
    next.push(word);
  });
  return next;
}

export default function SearchWordsField({ words, onChange, onFocus }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [draft, setDraft] = useState('');

  const addDraft = () => {
    const parts = draft.split(/[,،]/);
    onChange(mergeSearchWords(words, parts));
    setDraft('');
  };

  const removeWord = (word) => {
    onChange((words || []).filter((item) => item !== word));
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Search words</Text>
      <View style={styles.row}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={addDraft}
          placeholder="Type a word, then add"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          returnKeyType="done"
          onFocus={onFocus}
        />
        <Pressable style={styles.addBtn} onPress={addDraft}>
          <Ionicons name="add" size={18} color={colors.onPrimary} />
        </Pressable>
      </View>
      {(words || []).length > 0 ? (
        <View style={styles.pills}>
          {words.map((word) => (
            <Pressable key={word} style={styles.pill} onPress={() => removeWord(word)}>
              <Text style={styles.pillText}>{word}</Text>
              <Ionicons name="close" size={14} color={colors.primary} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors) {
  return {
    wrap: { marginBottom: 10 },
    label: formLabelStyle(colors),
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    input: {
      ...formInputStyle(colors),
      flex: 1,
      height: 40,
      paddingVertical: 0,
    },
    addBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: colors.iconBackground,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pillText: { fontSize: 12, fontWeight: '700', color: colors.text },
  };
}
