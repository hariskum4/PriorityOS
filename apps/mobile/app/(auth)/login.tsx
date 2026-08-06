import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { api } from '@/services/api';
import { useAuth } from '@/store/auth';
import { Button, Input } from '@/components/ui';
import { colors, type, space, skyGradient } from '@/theme';

/**
 * The seed account, and only where it exists.
 *
 * These two lines were unconditional, so the first screen of the deployed app
 * arrived with an email and a password already typed into it. The seed has
 * never been run against the production database — `demo@priority.app` is not
 * a row there — so the form was pre-filled with credentials that cannot work.
 * Somebody opening the app for the first time sees a completed sign-in, taps
 * the only large button on the screen, and is told "Invalid credentials"
 * before they have done anything at all. The way in, "Create an account", is
 * the quietest thing on the page.
 *
 * It is also a shipped credential. The pair is compiled into the web bundle
 * and readable by anyone, so the day that seed ever does run in production,
 * the demo account belongs to whoever looked.
 *
 * Kept for local development, where the seed is real and typing it forty
 * times a day is genuinely tedious. `__DEV__` is false in every build that
 * reaches anybody else.
 */
const SEED = { email: 'demo@priority.app', password: 'priority123' };

export default function Login() {
  const [email, setEmail] = useState(__DEV__ ? SEED.email : '');
  const [password, setPassword] = useState(__DEV__ ? SEED.password : '');
  const [error, setError] = useState('');
  const setTokens = useAuth((s) => s.setTokens);

  const submit = async () => {
    try {
      const tokens = await api<{ accessToken: string; refreshToken: string }>(
        '/auth/login',
        { method: 'POST', body: { email, password } },
      );
      await setTokens(tokens);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={skyGradient()} style={s.skyWash} pointerEvents="none" />
      <KeyboardAvoidingView
        style={s.wrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <View style={s.mark}>
        <View style={s.markRing} />
        <View style={s.markDot} />
      </View>
      <Text style={s.wordmark}>Priority</Text>
      <Text style={[type.serif, { textAlign: 'center', color: colors.textDim, marginBottom: space(10) }]}>
        Your calendar tells you where your time went.{'\n'}Priority tells you where your life is going.
      </Text>
      <View style={{ gap: space(3) }}>
        <Input placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <Input placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
        {!!error && <Text style={{ color: colors.rose, textAlign: 'center' }}>{error}</Text>}
        {/* The prefill was hiding this: with both fields filled in from the
            start, the button was never pressed empty. Now that the form opens
            blank, an eager tap would post two empty strings and come back with
            whatever the DTO says about them — a validation message as the
            first sentence the app ever addresses to somebody. */}
        <Button title="Log in" onPress={submit} disabled={!email.trim() || !password} />
        <Link href="/(auth)/forgot" style={[type.dim, { textAlign: 'center', padding: 8 }]}>
          Forgot password?
        </Link>
        <Link href="/(auth)/register" style={[type.dim, { textAlign: 'center', padding: 8 }]}>
          New here? Create an account
        </Link>
      </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1, justifyContent: 'center', padding: space(6),
    maxWidth: 440, width: '100%', alignSelf: 'center',
  },
  skyWash: { position: 'absolute', top: 0, left: 0, right: 0, height: 420 },
  mark: {
    width: 52, height: 52, alignSelf: 'center', marginBottom: space(4),
    alignItems: 'center', justifyContent: 'center',
  },
  markRing: {
    position: 'absolute', width: 52, height: 52, borderRadius: 26,
    borderWidth: 3, borderColor: colors.amberSoft,
  },
  markDot: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: colors.amber,
  },
  wordmark: {
    ...type.display,
    fontSize: 38,
    textAlign: 'center',
    marginBottom: space(3),
  },
});
