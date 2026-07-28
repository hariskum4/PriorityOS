/**
 * The screen that refuses to go blank.
 *
 * Without a boundary, one thrown render error unmounts the entire app and
 * leaves a dark rectangle — no message, no way back, nothing to report. For a
 * daily ritual that is fatal in a way a crash report never captures: the
 * person does not file a bug, they stop opening the app.
 *
 * So the contract here is: never lose the whole app for one broken screen,
 * always say something true, and always leave a way forward. The tone matters
 * too — a failure to draw a chart is not an emergency, and this record is not
 * lost just because a screen could not render it.
 */
import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { colors, type, space, alpha } from '@/theme';

interface Props {
  children: React.ReactNode;
  /** Named so the message can say which part failed rather than "something". */
  label?: string;
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[${this.props.label ?? 'screen'}] render failed`, error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={s.wrap}>
        <Text style={s.title}>This part didn’t load.</Text>
        <Text style={s.body}>
          {this.props.label
            ? `The ${this.props.label} screen ran into a problem. `
            : 'A screen ran into a problem. '}
          Nothing in your record has been lost — it is all still on the server,
          and the rest of the app is working.
        </Text>

        <Pressable onPress={this.reset} style={({ pressed }) => [s.button, pressed && { opacity: 0.75 }]}>
          <Text style={s.buttonText}>Try again</Text>
        </Pressable>

        {__DEV__ ? (
          <ScrollView style={s.detail} contentContainerStyle={{ padding: space(3) }}>
            <Text style={s.detailText}>{error.message}</Text>
            {error.stack ? <Text style={s.stack}>{error.stack}</Text> : null}
          </ScrollView>
        ) : null}
      </View>
    );
  }
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: space(6),
    justifyContent: 'center',
    gap: space(3),
  },
  title: { ...type.display, fontSize: 26 },
  body: { ...type.body, color: colors.textDim, lineHeight: 23 },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: alpha(colors.amber, 0.5),
  },
  buttonText: { ...type.label, color: colors.amber },
  detail: {
    maxHeight: 220,
    marginTop: space(3),
    borderRadius: 10,
    backgroundColor: alpha(colors.text, 0.05),
  },
  detailText: { ...type.body, color: colors.text, marginBottom: space(2) },
  stack: { ...type.dim, fontSize: 11, lineHeight: 16 },
});
