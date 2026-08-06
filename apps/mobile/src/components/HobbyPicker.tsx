import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COMMON_HOBBIES, suggestHobbies, searchHobbies } from '@priority/scoring-engine';
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
 * Why this is not a shelf of chips any more
 * -----------------------------------------
 * It was, and the reasoning was sound: chips make the question cost a tap
 * rather than a sentence, and a reader four screens into onboarding has paid
 * enough. What that missed is that the argument only holds while the list is
 * scannable. `COMMON_HOBBIES` is twenty-nine, this component is rendered
 * twice on both surfaces that use it, and the You tab therefore opened onto
 * fifty-eight buttons — above a profession, a country, a theme picker and a
 * partner invite. At that size a shortcut is just a wall with rounded
 * corners, and the eye stops reading at about row three.
 *
 * So the shelf stays as the source of truth and stops being the interface:
 *
 *   - what they have picked, always visible, removable;
 *   - four they might plausibly say yes to, drawn from the domains they
 *     already ranked, shown while the box is empty;
 *   - a box that finds the rest as they type.
 *
 * Free text survives all of it, and matters more here than anywhere: no list
 * of hobbies has ever been complete, and being absent from one is a small
 * insult. Anything typed that the shelf does not know becomes a chip exactly
 * like any other.
 *
 * The cap is eight and is not about storage. A person who lists twenty
 * hobbies has told the model nothing.
 */
export function HobbyPicker({
  value, onChange, placeholder, max = 8, disabled, domains, movementLimits, exclude,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  max?: number;
  disabled?: boolean;
  /** Their ranking, so the four offered are about the life they described. */
  domains?: Array<{ domainType: string; importance?: number | null }>;
  /** Withholds the vigorous options from somebody who told us about a limit. */
  movementLimits?: string | null;
  /** The other list's picks — nothing is offered in both at once. */
  exclude?: string[];
}) {
  const [draft, setDraft] = React.useState('');
  const [focused, setFocused] = React.useState(false);

  const taken = React.useMemo(
    () => [...value, ...(exclude ?? [])],
    [value, exclude],
  );

  const add = (h: string) => {
    if (value.length >= max) return;
    if (value.some((v) => v.toLowerCase() === h.toLowerCase())) return;
    onChange([...value, h]);
    setDraft('');
  };

  const remove = (h: string) =>
    onChange(value.filter((v) => v.toLowerCase() !== h.toLowerCase()));

  /* Enter adds whatever is typed, matched against the shelf first so that
     "walking" becomes "Walking" rather than a second lowercase twin. */
  const commit = () => {
    const v = draft.trim().replace(/\s+/g, ' ');
    setDraft('');
    if (!v) return;
    const known = COMMON_HOBBIES.find((h) => h.toLowerCase() === v.toLowerCase());
    add(known ?? v);
  };

  const results = searchHobbies(draft, taken);
  const suggestions = React.useMemo(
    () => suggestHobbies({ domains, movementLimits, exclude: taken }),
    [domains, movementLimits, taken],
  );
  const full = value.length >= max;
  /**
   * Typed something the shelf does not have, offered explicitly — a search
   * box that silently returns nothing reads as a rejection, and this is the
   * question where being absent from the list is most worth not feeling.
   *
   * Only when nothing matched. Offered alongside results it is pure noise:
   * two characters into "Walking" the row said `Add “wa”`, and nobody has a
   * hobby called wa. Somebody who really does want the short string can still
   * press enter, which commits whatever is in the box.
   */
  const novel = results.length === 0 && draft.trim().length >= 2;

  return (
    <View style={{ gap: space(2) }}>
      {value.length > 0 && (
        <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
          {value.map((h) => (
            <Pressable
              key={h}
              onPress={() => remove(h)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`${h} — remove`}
              style={[s.chip, s.chipOn, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
            >
              <Text style={[type.body, { color: colors.amber, fontWeight: '700' }]}>{h}</Text>
              <Ionicons name="close" size={13} color={colors.amber} />
            </Pressable>
          ))}
        </View>
      )}

      {!full && (
        <Input
          placeholder={placeholder}
          accessibilityLabel={placeholder}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={commit}
          onFocus={() => setFocused(true)}
          /* Deliberately not committing on blur. The old picker did, which
             turned tapping a search result into a race between the result's
             press and the box emptying itself into a chip nobody asked for. */
          onBlur={() => setFocused(false)}
          editable={!disabled}
          returnKeyType="done"
          autoCapitalize="words"
          autoCorrect={false}
        />
      )}

      {!full && draft.trim().length > 0 && (
        <View style={s.results}>
          {results.map((h) => (
            <Pressable
              key={h}
              onPress={() => add(h)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`Add ${h}`}
              style={({ pressed }) => [s.result, pressed && { backgroundColor: colors.surfaceSunken }]}
            >
              <Text style={type.body}>{h}</Text>
            </Pressable>
          ))}
          {novel && (
            <Pressable
              onPress={commit}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`Add ${draft.trim()}`}
              style={({ pressed }) => [s.result, pressed && { backgroundColor: colors.surfaceSunken }]}
            >
              <Text style={[type.body, { color: colors.amber }]}>
                Add “{draft.trim()}”
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* The four, while the box is empty. Not shown once somebody is typing,
          because two lists of options under one input is the clutter this
          replaced, in miniature. */}
      {!full && draft.trim().length === 0 && suggestions.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={type.faint}>
            {value.length > 0 ? 'Or one of these' : 'Common ones, or search above'}
          </Text>
          <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
            {suggestions.map((h) => (
              <Pressable
                key={h}
                onPress={() => add(h)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={`Add ${h}`}
                style={s.chip}
              >
                <Text style={type.body}>{h}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {full && (
        <Text style={type.faint}>
          That is plenty — eight is more than anybody keeps. Remove one to add another.
        </Text>
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
  results: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 12, overflow: 'hidden',
  },
  result: {
    paddingVertical: 11, paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
});
