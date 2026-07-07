import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { api } from '@/services/api';
import { useAuth } from '@/store/auth';
import { Button, Input } from '@/components/ui';
import { colors, type, space, skyGradient } from '@/theme';

export default function Login() {
  const [email, setEmail] = useState('demo@priority.app');
  const [password, setPassword] = useState('priority123');
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
        <Button title="Log in" onPress={submit} />
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
