import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { searchRegions, regionsOf } from '@priority/scoring-engine';
import { Input } from '@/components/ui';
import { colors, type, space } from '@/theme';

/**
 * The state, province or nation between a country and a city.
 *
 * It exists because of one reader in Ranchi. They typed their own city into a
 * box whose entire knowledge of India was ten cities, got no suggestion, and
 * were left doing the filing the app should have done. Ten cities for a
 * country of a billion is not a shortlist, it is a rounding error.
 *
 * So the question is asked the way an address is written — country, then the
 * state inside it, then the city inside that. Each answer makes the next list
 * short enough to read, which is the only thing that makes a list better than
 * a text box.
 *
 * Nothing is stored. The country decides the life-expectancy figure and the
 * city is context; the state is purely a way of narrowing the third question,
 * and is re-derived from the saved city on the way back in (`regionOfCity`).
 * A column to remember a narrowing step would be storing data to serve the
 * form rather than the person filling it.
 *
 * Renders nothing at all for the countries with no regional data, rather than
 * an empty control. Most of the world gets what it had before, which is the
 * country-scoped city list, and is no worse off for this existing.
 */
export function RegionField({ value, onChange, country, disabled }: {
  value: string;
  onChange: (v: string) => void;
  /** ISO code of the country field above — decides whether this exists. */
  country?: string | null;
  disabled?: boolean;
}) {
  const [draft, setDraft] = React.useState('');
  const all = React.useMemo(() => regionsOf(country), [country]);
  const suggestions = React.useMemo(
    () => searchRegions(draft, country, 8).filter((r) => r !== value),
    [draft, country, value],
  );

  /* No regions known for this country: no question. An empty picker is the
     app asking something it cannot help with. */
  if (!all.length) return null;

  return (
    <View style={{ gap: space(2) }}>
      <Text style={type.dim}>State or region</Text>
      {value ? (
        <Pressable
          onPress={() => { onChange(''); setDraft(''); }}
          disabled={disabled}
          accessibilityRole="button"
          aria-selected
          accessibilityLabel={`${value}, selected — tap to change`}
          style={[s.chip, s.chipOn]}
        >
          <Text style={[type.body, { color: colors.amber, fontWeight: '700' }]}>{value}</Text>
        </Pressable>
      ) : (
        <>
          <Input
            placeholder={`Start typing — ${all.length} to choose from`}
            value={draft}
            onChangeText={setDraft}
            editable={!disabled}
            autoCapitalize="words"
            autoCorrect={false}
            accessibilityLabel="State or region"
            returnKeyType="done"
          />
          <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
            {suggestions.map((r) => (
              <Pressable
                key={r}
                onPress={() => { onChange(r); setDraft(''); }}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={r}
                style={s.chip}
              >
                <Text style={type.body}>{r}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.line, borderRadius: 12,
    paddingVertical: 9, paddingHorizontal: 14,
  },
  chipOn: { borderColor: colors.amber, backgroundColor: colors.amberSoft },
});
