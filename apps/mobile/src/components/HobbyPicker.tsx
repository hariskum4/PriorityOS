import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { COMMON_HOBBIES } from '@priority/scoring-engine';
import { Input } from '@/components/ui';
import { colors, type, space } from '@/theme';

/**
 * What somebody does for themselves, asked once.
 *
 * The app has known a reader's profession, city, children and domain ranking
 * since the first day and has never known one thing they do for pleasure. So
 * every suggestion it generated was assembled from obligations — a life
 * described entirely by what it owes. Three prompts already said "never
 * invent a hobby"; this is the other half of that rule finally arriving.
 *
 * Chips first, because the question costs a tap that way and a sentence
 * otherwise, and the reader who is four screens into onboarding has already
 * paid enough. Free text beside them, because no list of hobbies has ever
 * been complete and being absent from one is a small insult — the whole
 * reason the counting question has a text box is the same reason this does.
 *
 * The cap is eight and is not about storage. A person who lists twenty
 * hobbies has told the model nothing.
 */
export function HobbyPicker({ value, onChange, placeholder, max = 8, disabled }: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  max?: number;
  disabled?: boolean;
}) {
  const [draft, setDraft] = React.useState('');

  const toggle = (h: string) => {
    const has = value.some((v) => v.toLowerCase() === h.toLowerCase());
    if (has) return onChange(value.filter((v) => v.toLowerCase() !== h.toLowerCase()));
    if (value.length >= max) return;
    onChange([...value, h]);
  };

  const commit = () => {
    const v = draft.trim().replace(/\s+/g, ' ');
    setDraft('');
    if (!v || value.length >= max) return;
    if (value.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...value, v]);
  };

  /* The union, not the shelf: something typed below appears here as a chip
     like any other, selected and removable. Holding a custom answer
     invisibly reads as having dropped it — the same fix the counting
     question needed. */
  const shelf = [
    ...COMMON_HOBBIES,
    ...value.filter((v) => !COMMON_HOBBIES.some((c) => c.toLowerCase() === v.toLowerCase())),
  ];

  return (
    <View style={{ gap: space(2) }}>
      <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
        {shelf.map((h) => {
          const on = value.some((v) => v.toLowerCase() === h.toLowerCase());
          return (
            <Pressable
              key={h}
              onPress={() => toggle(h)}
              disabled={disabled || (!on && value.length >= max)}
              accessibilityRole="button"
              aria-selected={on}
              accessibilityLabel={h}
              style={[
                s.chip,
                on && s.chipOn,
                !on && value.length >= max && { opacity: 0.4 },
              ]}
            >
              <Text style={[type.body, on && { color: colors.amber, fontWeight: '700' }]}>{h}</Text>
            </Pressable>
          );
        })}
      </View>
      {value.length < max && (
        <Input
          placeholder={placeholder}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={commit}
          onBlur={commit}
          editable={!disabled}
          returnKeyType="done"
          autoCapitalize="words"
          autoCorrect={false}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 12,
    paddingVertical: 9, paddingHorizontal: 14,
  },
  chipOn: { borderColor: colors.amber, backgroundColor: colors.amberSoft },
});
