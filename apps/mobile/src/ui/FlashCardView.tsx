import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { resolveGloss, type DueCard } from '@hanyu/data';
import type { Grade } from '@hanyu/domain';
import { formatInterval } from '../lib/formatInterval';
import { useSpeech } from '../audio/useSpeech';
import { useSupportLanguage } from '../lib/useSupportLanguage';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { AudioButton } from './AudioButton';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { WrittenAnswer, type WrittenGrade } from './WrittenAnswer';

export type ReviewMode = 'recognition' | 'recall' | 'listening' | 'reading';

interface FlashCardViewProps {
  card: DueCard;
  mode: ReviewMode;
  revealed?: boolean;
  onReveal?: () => void;
  onRate?: (grade: Grade, timeMs?: number) => void | Promise<void>;
  intervals?: Record<Grade, number>;
  ratingDisabled?: boolean;
  pendingGrade?: Grade | null;
  /** Called while a swipe pan is active (true on grant, false on release/terminate). */
  onPanActiveChange?: (active: boolean) => void;
  /** Renders a static, non-interactive card sitting behind the active one in the stack. */
  preview?: boolean;
}

const PEEK_SCALE = 0.94;
const PEEK_OFFSET = 14;

type Variant = 'primary' | 'secondary' | 'outline';

const RATINGS: { label: string; grade: Grade; variant: Variant }[] = [
  { label: 'Again', grade: 'again', variant: 'outline' },
  { label: 'Hard', grade: 'hard', variant: 'secondary' },
  { label: 'Good', grade: 'good', variant: 'secondary' },
  { label: 'Easy', grade: 'easy', variant: 'primary' },
];

const SWIPE_THRESHOLD = 88;
const EASE = Easing.out(Easing.cubic);
const MOTION_DISABLED = process.env.NODE_ENV === 'test';

function readingPrompt(card: DueCard): string {
  const sentence = card.context?.sentence ?? '';
  const candidates = [card.hanzi, ...(card.variants ?? [])].filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  const target = candidates.find((candidate) => sentence.includes(candidate));

  if (!target) {
    return sentence;
  }

  return sentence.replace(target, '____');
}

function contextParts(card: DueCard): { before: string; target: string; after: string } | null {
  const sentence = card.context?.sentence ?? '';
  const candidates = [card.hanzi, ...(card.variants ?? [])].filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  const target = candidates.find((candidate) => sentence.includes(candidate));
  if (!target) {
    return null;
  }

  const index = sentence.indexOf(target);
  return {
    before: sentence.slice(0, index),
    target,
    after: sentence.slice(index + target.length),
  };
}

export function FlashCardView({
  card,
  mode,
  revealed = false,
  onReveal,
  onRate,
  intervals,
  ratingDisabled = false,
  pendingGrade = null,
  onPanActiveChange,
  preview = false,
}: FlashCardViewProps) {
  const { colors } = useTheme();
  const supportLanguage = useSupportLanguage();
  const { speak, stop } = useSpeech();
  const entrance = useRef(new Animated.Value(MOTION_DISABLED ? 1 : 0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const dragX = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);
  const [motionReady, setMotionReady] = useState(MOTION_DISABLED);
  const [writtenGrade, setWrittenGrade] = useState<WrittenGrade | null>(null);
  const entranceAnim = useRef<Animated.CompositeAnimation | null>(null);
  const revealAnim = useRef<Animated.CompositeAnimation | null>(null);

  const revealedRef = useRef(revealed);
  const disabledRef = useRef(ratingDisabled);
  const onRateRef = useRef(onRate);
  const onPanActiveChangeRef = useRef(onPanActiveChange);
  revealedRef.current = revealed;
  disabledRef.current = ratingDisabled;
  onRateRef.current = onRate;
  onPanActiveChangeRef.current = onPanActiveChange;

  useEffect(() => {
    setWrittenGrade(null);
  }, [card.id, mode]);

  useEffect(() => {
    if (MOTION_DISABLED) {
      return;
    }

    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) {
          reduceMotion.current = value;
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) {
          setMotionReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    entranceAnim.current?.stop();
    entrance.setValue(0);
    reveal.setValue(0);
    dragX.setValue(0);

    if (MOTION_DISABLED || reduceMotion.current || !motionReady) {
      entrance.setValue(1);
      return;
    }

    entranceAnim.current = Animated.timing(entrance, {
      toValue: 1,
      duration: 200,
      easing: EASE,
      useNativeDriver: true,
    });
    entranceAnim.current.start();

    return () => {
      entranceAnim.current?.stop();
    };
  }, [card.id, entrance, reveal, dragX, motionReady]);

  useEffect(() => {
    revealAnim.current?.stop();

    if (!revealed) {
      reveal.setValue(0);
      return;
    }

    if (MOTION_DISABLED || reduceMotion.current) {
      reveal.setValue(1);
      return;
    }

    revealAnim.current = Animated.timing(reveal, {
      toValue: 1,
      duration: 180,
      easing: EASE,
      useNativeDriver: true,
    });
    revealAnim.current.start();

    return () => {
      revealAnim.current?.stop();
    };
  }, [revealed, reveal]);

  useEffect(() => {
    if (!preview && mode === 'listening' && !revealed && card.hanzi) {
      speak(card.hanzi);
      return stop;
    }

    return undefined;
  }, [card.id, card.hanzi, mode, revealed, speak, stop, preview]);

  function finishSwipe(direction: -1 | 1, grade: Grade) {
    Animated.timing(dragX, {
      toValue: direction * 420,
      duration: 160,
      easing: EASE,
      useNativeDriver: true,
    }).start(() => {
      onRateRef.current?.(grade);
    });
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        revealedRef.current &&
        !disabledRef.current &&
        Math.abs(gesture.dx) > 12 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderGrant: () => {
        onPanActiveChangeRef.current?.(true);
      },
      onPanResponderMove: (_event, gesture) => {
        dragX.setValue(gesture.dx);
      },
      // Once the card owns the swipe, refuse to hand the responder back to the
      // ScrollView: otherwise a vertical drift mid-swipe makes the screen scroll.
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_event, gesture) => {
        onPanActiveChangeRef.current?.(false);
        if (disabledRef.current) {
          Animated.spring(dragX, { toValue: 0, useNativeDriver: true }).start();
          return;
        }

        if (gesture.dx <= -SWIPE_THRESHOLD) {
          finishSwipe(-1, 'again');
        } else if (gesture.dx >= SWIPE_THRESHOLD) {
          finishSwipe(1, 'good');
        } else {
          Animated.spring(dragX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        onPanActiveChangeRef.current?.(false);
        Animated.spring(dragX, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  if (preview) {
    return (
      <View
        pointerEvents="none"
        style={[
          styles.previewWrap,
          { transform: [{ translateY: PEEK_OFFSET }, { scale: PEEK_SCALE }] },
        ]}
      >
        <Card
          style={[
            styles.card,
            styles.previewCard,
            { backgroundColor: colors.bg, shadowColor: colors.vermilion },
          ]}
        >
          <View style={styles.top}>
            <Badge label={`HSK ${card.hsk_level ?? '-'}`} />
          </View>
          <View style={styles.face}>
            <Text style={[styles.hanzi, { color: colors.text }]}> 
              {mode === 'recall'
                ? resolveGloss(card, supportLanguage)
                : mode === 'reading'
                  ? readingPrompt(card)
                  : card.hanzi}
            </Text>
          </View>
        </Card>
      </View>
    );
  }

  const rotate = dragX.interpolate({
    inputRange: [-240, 0, 240],
    outputRange: ['-7deg', '0deg', '7deg'],
  });

  return (
    <Animated.View
      testID="flashcard-active"
      {...panResponder.panHandlers}
      style={{
        opacity: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
        transform: [
          { translateX: dragX },
          { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [PEEK_SCALE, 1] }) },
          {
            translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [PEEK_OFFSET, 0] }),
          },
          { rotate },
        ],
      }}
    >
      <Card style={[styles.card, { backgroundColor: colors.bg, shadowColor: colors.vermilion }]}>
        <View style={styles.top}>
          <Badge label={`HSK ${card.hsk_level ?? '-'}`} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Play audio"
            onPress={() => speak(card.hanzi ?? '')}
            style={({ pressed }) => [
              styles.audio,
              { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name="volume-medium" size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={styles.face}>
          {mode === 'recognition' && !revealed ? (
            <Text style={[styles.hanzi, { color: colors.text }]}>{card.hanzi}</Text>
          ) : null}

          {mode !== 'recognition' && !revealed ? (
            <>
              {mode === 'recall' ? (
                <Text style={[styles.prompt, { color: colors.text }]}>
                  {resolveGloss(card, supportLanguage)}
                </Text>
              ) : null}
              {mode === 'listening' ? (
                <>
                  <Text style={[styles.prompt, { color: colors.textMuted }]}>Listen and identify the word</Text>
                  <AudioButton text={card.hanzi ?? ''} label="Play again" />
                </>
              ) : null}
              {mode === 'reading' ? (
                <Text style={[styles.prompt, { color: colors.text }]}>{readingPrompt(card)}</Text>
              ) : null}
              <WrittenAnswer
                key={`${card.id}-${mode}`}
                expected={card.hanzi ?? ''}
                kind="hanzi"
                onGraded={setWrittenGrade}
              />
              {writtenGrade ? (
                <Button
                  label="Continue"
                  onPress={() => onRate?.(writtenGrade.grade, writtenGrade.elapsed_ms)}
                  disabled={ratingDisabled}
                />
              ) : null}
            </>
          ) : null}

          {revealed ? (
            <Animated.View
              style={[
                styles.answer,
                {
                  opacity: reveal,
                  transform: [
                    { translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
                  ],
                },
              ]}
            >
              <Text style={[styles.hanzi, { color: colors.text }]}>{card.hanzi}</Text>
              <Text style={[styles.pinyin, { color: colors.gold }]}>{card.pinyin}</Text>
              <Text style={[styles.meaning, { color: colors.text }]}> 
                {resolveGloss(card, supportLanguage)}
              </Text>
              {card.traditional ? (
                <Text style={[styles.detail, { color: colors.textMuted }]}>繁 {card.traditional}</Text>
              ) : null}
              {card.variants && card.variants.length > 0 ? (
                <Text style={[styles.detail, { color: colors.textMuted }]}>Variants: {card.variants.join(' · ')}</Text>
              ) : null}
              {card.sense_index !== null && card.sense_index !== undefined ? (
                <Badge
                  label={`Sense ${card.sense_index}`}
                  accessibilityLabel={`Sense ${card.sense_index}`}
                />
              ) : null}
              {card.classifier ? <Badge label={`量 ${card.classifier}`} /> : null}
              {card.context ? (
                <Text style={[styles.context, { color: colors.textMuted }]}> 
                  {contextParts(card) ? (
                    <>
                      {contextParts(card)?.before}
                      <Text style={{ color: colors.vermilion }}>{contextParts(card)?.target}</Text>
                      {contextParts(card)?.after}
                    </>
                  ) : card.context.sentence}
                </Text>
              ) : null}
            </Animated.View>
          ) : null}
        </View>

        {revealed ? (
          <View style={styles.ratings}>
            {RATINGS.map((rating) => (
              <View key={rating.label} style={styles.rating}>
                <Button
                  label={rating.label}
                  sublabel={intervals ? formatInterval(intervals[rating.grade]) : undefined}
                  variant={rating.variant}
                  onPress={() => onRate?.(rating.grade)}
                  disabled={ratingDisabled}
                  busy={pendingGrade === rating.grade}
                />
              </View>
            ))}
          </View>
        ) : mode === 'recognition' ? (
          <Button label="Show answer" onPress={() => onReveal?.()} />
        ) : null}
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: tokens.radius.xl,
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  previewWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  previewCard: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  audio: {
    width: 38,
    height: 38,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  face: { alignItems: 'center', gap: tokens.spacing.sm, paddingVertical: tokens.spacing.xl },
  answer: { alignItems: 'center', gap: tokens.spacing.sm },
  hanzi: { fontSize: 60, lineHeight: 66, fontWeight: '700' },
  pinyin: { fontSize: tokens.fontSize.lg, fontWeight: '600' },
  meaning: { fontSize: tokens.fontSize.md },
  detail: { fontSize: tokens.fontSize.sm },
  context: { fontSize: tokens.fontSize.md, textAlign: 'center' },
  prompt: { fontSize: tokens.fontSize.lg, textAlign: 'center' },
  ratings: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  rating: { flexGrow: 1, flexBasis: '45%' },
});
