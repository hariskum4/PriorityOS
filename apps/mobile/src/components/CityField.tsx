import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { searchCities } from '@priority/scoring-engine';
import { Input } from '@/components/ui';
import { colors, type, space } from '@/theme';

/**
 * Where somebody lives, offered the way the country beneath it is offered.
 *
 * This was a bare text box with one chip beside it, read off the device
 * timezone. A reader in Kolkata saw "Kolkata" — correct, unexplained, and
 * apparently arrived at by magic — while everybody the guess was wrong about
 * got an empty box and no help at all. The country field directly below had a
 * searchable list. Two fields about the same question, answered two ways.
 *
 * So: the timezone's guess stays as the first chip, because for most readers
 * it is right and one tap is the correct price. Behind it are the cities of
 * whichever country is selected, which turns an unbounded question into a
 * short one. And the box still takes anything typed, because three hundred
 * cities is a shortlist however long it looks, and somebody in Vigo or
 * Thrissur must never be told their home is not a place.
 */
export function CityField({ value, onChange, country, region, deviceGuess, disabled }: {
  value: string;
  onChange: (v: string) => void;
  /** ISO code of the country field above — scopes the suggestions. */
  country?: string | null;
  /** The state above, when the country has states — scopes them further. */
  region?: string | null;
  /** The city the device timezone names, offered as one tap. */
  deviceGuess?: string | null;
  disabled?: boolean;
}) {
  const suggestions = React.useMemo(
    () => searchCities(value, country, region)
      .filter((c) => c.toLowerCase() !== value.trim().toLowerCase()),
    [value, country, region],
  );
  /* Only while it is still unanswered, and only when it is not already the
     first thing in the list below — two chips reading "Kolkata" would be the
     app offering the same answer twice. */
  const showGuess = !!deviceGuess
    && !value.trim()
    && !suggestions.some((c) => c.toLowerCase() === deviceGuess.toLowerCase());

  return (
    <View style={{ gap: space(2) }}>
      <Input
        placeholder={region ? `Your city in ${region}` : 'Your city (optional)'}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        autoCapitalize="words"
        autoCorrect={false}
        accessibilityLabel="Your city"
        returnKeyType="done"
      />
      <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
        {showGuess && (
          <Pressable
            onPress={() => onChange(deviceGuess!)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Use ${deviceGuess}`}
            style={[s.chip, s.chipGuess]}
          >
            <Text style={type.body}>{deviceGuess}</Text>
          </Pressable>
        )}
        {suggestions.map((c) => (
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={c}
            style={s.chip}
          >
            <Text style={type.body}>{c}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.line, borderRadius: 12,
    paddingVertical: 9, paddingHorizontal: 14,
  },
  /* The device's guess, marked as a guess rather than as a fact. */
  chipGuess: { borderStyle: 'dashed', borderColor: colors.amberSoft },
});
