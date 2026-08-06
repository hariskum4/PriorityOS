import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { api } from '@/services/api';
import { useAuth } from '@/store/auth';
import { Button, Input } from '@/components/ui';
import { colors, type, space, skyGradient } from '@/theme';

/**
 * The demo account, filled in and labelled as such.
 *
 * This is a shipped credential and that is the point: while the app is being
 * shown to people rather than used by them, the fastest way in is the whole
 * job of this screen. `demo@priority.app` is a fixture — Arun Krishnan, whose
 * every number comes out of published time-use data — holding no real writing
 * and rebuilt from scratch by `npm run db:seed` in about two seconds.
 *
 * It was removed earlier today for a good reason that has since been
 * overtaken. The pair was pre-filled *and the account did not exist*, so the
 * first thing the app ever said to somebody was "Invalid credentials", before
 * they had typed a character, with "Create an account" as the quietest line on
 * the page. That was an accident. This is a decision, and the difference is
 * whether the account on the other end is real — it is now.
 *
 * The line under the fields is what keeps it a decision. Credentials sitting
 * in a form with nothing to explain them read as *yours*, already remembered,
 * which is how somebody signs into a stranger's account without noticing they
 * have. Saying whose they are costs one sentence.
 *
 * **This comes out with the default in `apps/api/prisma/seed.ts`, together.**
 * One decision in two files: the day real people are signing in, a pre-filled
 * public login is the accident it used to be.
 */
const DEMO = { email: 'demo@priority.app', password: 'demo@4321' };

export default function Login() {
  const [email, setEmail] = useState(DEMO.email);
  const [password, setPassword] = useState(DEMO.password);
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
        {/* Whose account this is. Without it, a filled-in form reads as the
            reader's own, already remembered — and somebody signs into a
            stranger's life without noticing they have. */}
        {email === DEMO.email && (
          <Text style={[type.dim, { textAlign: 'center' }]}>
            Filled in with the demo account — press Log in to look around,
            or clear it to use your own.
          </Text>
        )}
        {!!error && <Text style={{ color: colors.rose, textAlign: 'center' }}>{error}</Text>}
        {/* Kept from when this form opened blank: nothing else stops an eager
            tap posting two empty strings and getting a validation message back
            as the first sentence the app ever addresses to somebody. */}
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
