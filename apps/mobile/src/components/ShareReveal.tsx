/**
 * Shareable Life Reveal card — the research notes flag the reveal as the
 * viral funnel, so it must leave the app as a beautiful image.
 *
 * Web: the card is drawn on an offscreen canvas (1080x1350, IG portrait)
 * and shared via the Web Share API when available, else downloaded.
 * Native: an offscreen RN view is captured with react-native-view-shot
 * and handed to the system share sheet via expo-sharing.
 */
import React, { useRef, useState } from 'react';
import { View, Text, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Button } from './ui';
import { colors, domainColor } from '../theme';

export interface RevealShareData {
  headline: string;
  topDomains: string[];
  personLine: string | null;   // "I talk to Amma monthly. I want it to be weekly."
  insightLine: string | null;  // "Moving from monthly to weekly calls adds ~40 conversations a year."
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCard(data: RevealShareData): HTMLCanvasElement {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const sans = '-apple-system, "Segoe UI", Roboto, sans-serif';
  const serif = 'Georgia, "Times New Roman", serif';

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, H);

  // Logo mark
  ctx.strokeStyle = colors.amberSoft;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(W / 2, 130, 44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = colors.amber;
  ctx.beginPath();
  ctx.arc(W / 2, 130, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = colors.text;
  ctx.font = `800 54px ${sans}`;
  ctx.fillText('Priority', W / 2, 248);

  // Headline
  ctx.fillStyle = colors.amber;
  ctx.font = `700 62px ${serif}`;
  let y = 370;
  for (const line of wrapText(ctx, data.headline, W - 200)) {
    ctx.fillText(line, W / 2, y);
    y += 74;
  }

  // Top domains
  y += 36;
  ctx.font = `700 28px ${sans}`;
  ctx.fillStyle = colors.textDim;
  ctx.fillText('I  S A I D  T H I S  M A T T E R S  M O S T', W / 2, y);
  y += 70;
  ctx.textAlign = 'left';
  for (let i = 0; i < Math.min(3, data.topDomains.length); i++) {
    const d = data.topDomains[i];
    const c = domainColor(d);
    const rowX = W / 2 - 220;
    ctx.fillStyle = c;
    ctx.font = `800 48px ${sans}`;
    ctx.fillText(String(i + 1), rowX, y);
    ctx.beginPath();
    ctx.arc(rowX + 74, y - 15, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.text;
    ctx.font = `700 44px ${sans}`;
    ctx.fillText(cap(d), rowX + 108, y);
    y += 80;
  }

  // Person gap card
  ctx.textAlign = 'center';
  if (data.personLine) {
    y += 20;
    const boxTop = y - 46;
    const lines = (() => {
      ctx.font = `400 38px ${serif}`;
      return wrapText(ctx, data.personLine, W - 300);
    })();
    const boxH = lines.length * 52 + 76;
    ctx.fillStyle = colors.surface;
    ctx.beginPath();
    (ctx as any).roundRect(110, boxTop, W - 220, boxH, 28);
    ctx.fill();
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    y = boxTop + 74;
    ctx.fillStyle = colors.text;
    ctx.font = `400 38px ${serif}`;
    for (const line of lines) {
      ctx.fillText(line, W / 2, y);
      y += 52;
    }
    y = boxTop + boxH + 62;
  }

  // Insight — clamp so long content can never collide with the footer.
  if (data.insightLine && y < H - 240) {
    ctx.fillStyle = colors.textDim;
    ctx.font = `italic 400 36px ${serif}`;
    for (const line of wrapText(ctx, data.insightLine, W - 260).slice(0, 2)) {
      ctx.fillText(line, W / 2, y);
      y += 50;
    }
  }

  // Footer
  ctx.fillStyle = colors.textFaint;
  ctx.font = `600 32px ${sans}`;
  ctx.fillText('Where is your life going?', W / 2, H - 110);
  ctx.fillStyle = colors.amber;
  ctx.font = `700 34px ${sans}`;
  ctx.fillText('priority.app', W / 2, H - 60);

  return canvas;
}

async function shareOnWeb(data: RevealShareData): Promise<'shared' | 'downloaded'> {
  const canvas = drawCard(data);
  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/png'),
  );
  const file = new File([blob], 'my-life-reveal.png', { type: 'image/png' });
  const nav = navigator as any;
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'My Life Reveal' });
      return 'shared';
    } catch {
      // fall through to download when the user dismisses or share fails
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'my-life-reveal.png';
  a.click();
  URL.revokeObjectURL(a.href);
  return 'downloaded';
}

export function ShareRevealButton({ data }: { data: RevealShareData }) {
  const shotRef = useRef<View>(null);
  const [status, setStatus] = useState<'idle' | 'busy' | 'done'>('idle');
  const [doneLabel, setDoneLabel] = useState('Shared');

  const share = async () => {
    setStatus('busy');
    try {
      if (Platform.OS === 'web') {
        const how = await shareOnWeb(data);
        setDoneLabel(how === 'shared' ? 'Shared' : 'Saved to downloads');
      } else {
        const uri = await captureRef(shotRef, { format: 'png', quality: 1 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'image/png' });
          setDoneLabel('Shared');
        }
      }
      setStatus('done');
      setTimeout(() => setStatus('idle'), 2500);
    } catch {
      setStatus('idle');
    }
  };

  return (
    <>
      {status === 'done' ? (
        <View style={s.doneRow}>
          <Ionicons name="checkmark-circle" size={18} color={colors.green} />
          <Text style={{ color: colors.green, fontSize: 14, fontWeight: '600' }}>{doneLabel}</Text>
        </View>
      ) : (
        <Button
          title={status === 'busy' ? 'Preparing…' : 'Share your reveal'}
          kind="ghost"
          onPress={share}
          disabled={status === 'busy'}
        />
      )}

      {/* Offscreen native capture target; web draws on canvas instead. */}
      {Platform.OS !== 'web' && (
        <View style={s.offscreen} pointerEvents="none">
          <ViewShot ref={shotRef as any} options={{ format: 'png', quality: 1 }}>
            <NativeShareCard data={data} />
          </ViewShot>
        </View>
      )}
    </>
  );
}

/** RN mirror of the canvas layout, captured by view-shot on native. */
function NativeShareCard({ data }: { data: RevealShareData }) {
  return (
    <View style={s.card}>
      <View style={s.mark}>
        <View style={s.markRing} />
        <View style={s.markDot} />
      </View>
      <Text style={s.wordmark}>Priority</Text>
      <Text style={s.headline}>{data.headline}</Text>
      <Text style={s.label}>I SAID THIS MATTERS MOST</Text>
      <View style={{ gap: 14, alignSelf: 'center' }}>
        {data.topDomains.slice(0, 3).map((d, i) => (
          <View key={d} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ color: domainColor(d), fontSize: 24, fontWeight: '800', width: 22 }}>{i + 1}</Text>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: domainColor(d) }} />
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>{cap(d)}</Text>
          </View>
        ))}
      </View>
      {data.personLine && (
        <View style={s.personBox}>
          <Text style={s.personText}>{data.personLine}</Text>
        </View>
      )}
      {data.insightLine && <Text style={s.insight}>{data.insightLine}</Text>}
      <View style={{ flex: 1 }} />
      <Text style={s.footerQ}>Where is your life going?</Text>
      <Text style={s.footerBrand}>priority.app</Text>
    </View>
  );
}

const s = StyleSheet.create({
  doneRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
  },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
  card: {
    width: 360, height: 450, backgroundColor: colors.bg,
    padding: 28, alignItems: 'center',
  },
  mark: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  markRing: {
    position: 'absolute', width: 34, height: 34, borderRadius: 17,
    borderWidth: 3, borderColor: colors.amberSoft,
  },
  markDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.amber },
  wordmark: { color: colors.text, fontSize: 19, fontWeight: '800', marginTop: 8 },
  headline: {
    color: colors.amber, fontSize: 22, fontWeight: '700', textAlign: 'center',
    marginTop: 14, marginBottom: 12, fontFamily: 'Georgia' as any,
  },
  label: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: '700', marginBottom: 10 },
  personBox: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    borderRadius: 12, padding: 12, marginTop: 16,
  },
  personText: { color: colors.text, fontSize: 14, textAlign: 'center', fontFamily: 'Georgia' as any },
  insight: {
    color: colors.textDim, fontSize: 12, fontStyle: 'italic', textAlign: 'center',
    marginTop: 10, fontFamily: 'Georgia' as any,
  },
  footerQ: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
  footerBrand: { color: colors.amber, fontSize: 12, fontWeight: '700', marginTop: 2 },
});
