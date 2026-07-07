import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '@/services/api';
import { useAuth } from '@/store/auth';
import { Button, Input } from '@/components/ui';
import { colors, type, space } from '@/theme';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const setTokens = useAuth((s) => s.setTokens);
  const router = useRouter();

  const submit = async () => {
    try {
      const tokens = await api<{ accessToken: string; refreshToken: string }>(
        '/auth/register',
        {
          method: 'POST',
          body: {
            fullName, email, password,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        },
      );
      await setTokens(tokens);
      router.replace('/onboarding');
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <View style={s.wrap}>
      <Text style={type.display}>Start with what matters</Text>
      <View style={{ gap: space(3), marginTop: space(6) }}>
        <Input placeholder="Your name" value={fullName} onChangeText={setFullName} />
        <Input placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <Input placeholder="Password (8+ characters)" secureTextEntry value={password} onChangeText={setPassword} />
        {!!error && <Text style={{ color: colors.rose }}>{error}</Text>}
        <Button title="Create account" onPress={submit} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: space(6), backgroundColor: colors.bg },
});
