import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { api } from '@/services/api';
import { useAuth } from '@/store/auth';
import { Button, Input } from '@/components/ui';
import { colors, type, space, skyGradient } from '@/theme';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [stage, setStage] = useState<'ask' | 'reset'>('ask');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const setTokens = useAuth((s) => s.setTokens);

  const requestCode = async () => {
    setError('');
    setBusy(true);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setStage('reset');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setError('');
    setBusy(true);
    try {
      const tokens = await api<{ accessToken: string; refreshToken: string }>(
        '/auth/reset-password',
        { method: 'POST', body: { email, code: code.trim(), password } },
      );
      await setTokens(tokens);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={skyGradient()} style={s.skyWash} pointerEvents="none" />
      <KeyboardAvoidingView
        style={s.wrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={s.title}>
          {stage === 'ask' ? 'Forgot your password?' : 'Check your email'}
        </Text>
        <Text style={[type.serif, s.sub]}>
          {stage === 'ask'
            ? 'Enter your email and we’ll send a six-digit code.'
            : `A code is on its way to ${email}. It works for 15 minutes.`}
        </Text>
        <View style={{ gap: space(3) }}>
          {stage === 'ask' ? (
            <>
              <Input
                placeholder="Email"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              {!!error && <Text style={s.error}>{error}</Text>}
              <Button title={busy ? 'Sending…' : 'Send code'} onPress={requestCode} disabled={busy || !email} />
            </>
          ) : (
            <>
              <Input
                placeholder="6-digit code"
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={setCode}
              />
              <Input
                placeholder="New password (8+ characters)"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              {!!error && <Text style={s.error}>{error}</Text>}
              <Button
                title={busy ? 'Resetting…' : 'Set new password'}
                onPress={reset}
                disabled={busy || code.length !== 6 || password.length < 8}
              />
              <Text
                style={[type.dim, s.link]}
                onPress={requestCode}
                accessibilityRole="button"
                accessibilityLabel="Send a new code"
              >
                Didn{'’'}t get it? Send a new code
              </Text>
            </>
          )}
          <Link href="/(auth)/login" style={[type.dim, s.link]}>
            Back to log in
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
  title: {
    ...type.display,
    fontSize: 30,
    textAlign: 'center',
    marginBottom: space(3),
  },
  sub: { textAlign: 'center', color: colors.textDim, marginBottom: space(8) },
  error: { color: colors.rose, textAlign: 'center' },
  link: { textAlign: 'center', padding: 8 },
});
