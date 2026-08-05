import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { KNOWN_COUNTRIES, countryName, searchCountries } from '@priority/scoring-engine';
import { Input } from '@/components/ui';
import { colors, type, space } from '@/theme';

/**
 * The countries offered as taps, not the whole table.
 *
 * A hundred and twenty chips is a wall, and these cover the overwhelming
 * majority of who opens this. The difference from before is what sits under
 * them: everybody else is now a search away rather than unreachable.
 */
const COMMON = ['IN', 'US', 'GB', 'CA', 'AU', 'SG', 'AE', 'DE', 'JP'];

/**
 * Where somebody lives, in the only form the arithmetic can use.
 *
 * Country is a code, and a code is the one thing nobody should be asked to
 * type — so this is a named list, never a free-text box that would accept
 * "Bharat" and silently mean nothing. But a list of nine was not a list, it
 * was a shortlist: a reader in Vigo whose phone still said Asia/Calcutta was
 * filed under India, shown "Time numbers use India's life expectancy", and
 * given no way at all to say Spain. The nine stay as one-tap shortcuts,
 * because they are right for most people; the search behind them exists for
 * the person the guess was wrong about, who is exactly the person this field
 * is editable for.
 */
export function CountryField({ value, onPick, disabled, footer }: {
  value?: string | null;
  onPick: (code: string | null) => void;
  disabled?: boolean;
  /** Overrides the default explanation — onboarding says less than You does. */
  footer?: string;
}) {
  const [query, setQuery] = React.useState('');
  const selected = (value ?? '').trim().toUpperCase() || null;

  /* The current country always has a chip, even when it is not a common one,
     so the answer is never invisible just because it is unusual. */
  const chips = React.useMemo(() => {
    const codes = selected && !COMMON.includes(selected) ? [...COMMON, selected] : COMMON;
    return codes
      .map((code) => KNOWN_COUNTRIES.find((c) => c.code === code) ?? { code, name: code })
      .filter(Boolean);
  }, [selected]);

  const results = React.useMemo(
    () => searchCountries(query).filter((c) => !chips.some((k) => k.code === c.code)),
    [query, chips],
  );

  const choose = (code: string) => {
    setQuery('');
    onPick(selected === code ? null : code);
  };

  return (
    <View style={{ gap: space(2) }}>
      <Text style={type.dim}>Country</Text>
      <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
        {chips.map((c) => {
          const on = selected === c.code;
          return (
            <Pressable
              key={c.code}
              onPress={() => choose(c.code)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={c.name}
              aria-selected={on}
              style={[s.chip, on && s.chipOn]}
            >
              <Text style={[type.body, on && { color: colors.amber, fontWeight: '700' }]}>
                {c.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {/* Typing is the escape hatch, not the main road — placed under the
          taps and phrased as one, so nobody reads a search box as a
          requirement to search. */}
      <Input
        value={query}
        onChangeText={setQuery}
        editable={!disabled}
        placeholder="Somewhere else? Start typing…"
        autoCapitalize="words"
        autoCorrect={false}
        accessibilityLabel="Search for a country"
        style={{ paddingVertical: 9 }}
      />
      {query.trim().length > 0 && (
        <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
          {results.length === 0 ? (
            <Text style={type.faint}>
              No country by that name. Leave it unset and Priority uses a world average.
            </Text>
          ) : (
            results.map((c) => (
              <Pressable
                key={c.code}
                onPress={() => choose(c.code)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={c.name}
                style={[s.chip, s.chipResult]}
              >
                <Text style={type.body}>{c.name}</Text>
              </Pressable>
            ))
          )}
        </View>
      )}
      {/* The name, never the code. This line exists to explain what a
          two-letter code means, so printing "IN's life expectancy" in it
          explains nothing and reads like a leaked database value. */}
      <Text style={type.faint}>
        {footer ?? (selected
          ? `Time numbers use ${countryName(selected)}'s life expectancy.`
          : 'Sets the life-expectancy figure behind every number on the Time tab.')}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.line, borderRadius: 12,
    paddingVertical: 9, paddingHorizontal: 14,
  },
  chipOn: { borderColor: colors.amber, backgroundColor: colors.amberFaint },
  chipResult: { borderStyle: 'dashed' },
});
