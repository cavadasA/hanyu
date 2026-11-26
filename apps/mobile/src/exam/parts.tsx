// Una vista por tipo de parte del HSK 2 (formato 3.0). Todo texto impreso lleva el pinyin
// encima, como en el examen, y no hay traducción ni pinyin al tocar. Las opciones van con
// letra (A–F) igual que en la hoja de respuestas.
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { ExamResponse, ServedExamGroup } from '@hanyu/data';
import type { Printed as PrintedText } from '@hanyu/domain';
import { CharacterWriting } from '../expression/CharacterWriting';
import { useTheme } from '../theme/ThemeProvider';
import { questionKey } from './examModel';

export type Picks = Record<string, Record<number, ExamResponse>>;
export type OnPick = (slug: string, index: number, value: ExamResponse) => void;

const LETTERS = 'ABCDEF';

/**
 * Nueva elección en un grupo. En los grupos de banco común (L2, R1, R2, R3, W1) cada opción
 * se usa una vez: si ya la tenía otra pregunta, se le quita.
 */
export function pickInGroup(picks: Picks, slug: string, index: number, value: ExamResponse, exclusive: boolean): Picks {
  const group = { ...(picks[slug] ?? {}) };
  if (exclusive && value !== null) {
    for (const [other, chosen] of Object.entries(group)) {
      if (chosen === value && Number(other) !== index) delete group[Number(other)];
    }
  }
  group[index] = value;
  return { ...picks, [slug]: group };
}

export function Printed({ text, large = false }: { text: PrintedText; large?: boolean }) {
  const { colors } = useTheme();
  return (
    <View>
      <Text style={[styles.pinyin, { color: colors.textMuted }]}>{text.pinyin}</Text>
      <Text style={[large ? styles.hanziLarge : styles.hanzi, { color: colors.text }]}>{text.zh}</Text>
    </View>
  );
}

function Chip({ label, selected, onPress, accessibilityLabel }: { label: string; selected: boolean; onPress(): void; accessibilityLabel: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { borderColor: selected ? colors.vermilion : colors.border, backgroundColor: selected ? colors.vermilion : colors.surface }]}
    >
      <Text style={[styles.chipText, { color: selected ? colors.onAccent : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function Number_({ value, active = false }: { value: number; active?: boolean }) {
  const { colors } = useTheme();
  return <Text style={[styles.number, { color: active ? colors.vermilion : colors.text }]}>{value}.</Text>;
}

/**
 * El SVG de un carácter incompleto de 书写 1 (generado en la build), pintado en nativo.
 * Antes era una WebView por carácter (6 por fase) y tardaban unos 4 s en aparecer.
 */
export function SvgView({ svg, size, color }: { svg: string; size: number; color: string }) {
  return (
    <View testID="w1-character" style={{ width: size, height: size }} pointerEvents="none">
      {svg ? <SvgXml xml={svg} width={size} height={size} color={color} /> : null}
    </View>
  );
}

interface ImageProps {
  images: Record<string, { url: string }>;
  localUri(url: string): string | null;
}

function ExamImage({ imageKey, images, localUri, size }: ImageProps & { imageKey: string; size: number }) {
  const url = images[imageKey]?.url;
  const uri = url ? localUri(url) : null;
  return uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 8 }} resizeMode="contain" /> : <View style={{ width: size, height: size }} />;
}

interface GroupProps<P extends ServedExamGroup['part']> {
  group: Extract<ServedExamGroup, { part: P }> & { slug: string };
  numbers: Record<string, number>;
  picks: Picks;
  onPick: OnPick;
  activeIndex?: number | null;
}

/** L1: una frase en audio y 3 imágenes propias por pregunta. */
export function ImageTriple({ group, numbers, picks, onPick, images, localUri, activeIndex }: GroupProps<'L1'> & ImageProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.group}>
      {group.items.map((item, index) => {
        const number = numbers[questionKey(group.slug, index)];
        return (
          <View key={index} style={styles.row}>
            <Number_ value={number} active={activeIndex === index} />
            <View style={styles.triple}>
              {item.images.map((key, option) => {
                const selected = picks[group.slug]?.[index] === option;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={`Pregunta ${number}, imagen ${LETTERS[option]}`}
                    accessibilityState={{ selected }}
                    onPress={() => onPick(group.slug, index, option)}
                    style={[styles.imageOption, { borderColor: selected ? colors.vermilion : colors.border }]}
                  >
                    <ExamImage imageKey={key} images={images} localUri={localUri} size={88} />
                    <Text style={[styles.letter, { color: colors.text }]}>{LETTERS[option]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** L2 y R1: un grupo de 5–6 imágenes con letra; cada pregunta elige una. */
export function ImageChoiceGroup({ group, numbers, picks, onPick, images, localUri, activeIndex }: GroupProps<'L2' | 'R1'> & ImageProps) {
  const { colors } = useTheme();
  const shown = (group.example as { shown_answer?: number } | undefined)?.shown_answer;
  return (
    <View style={styles.group}>
      <View style={styles.imageGrid}>
        {group.images.map((key, option) => (
          <View key={key} style={styles.gridCell}>
            <ExamImage imageKey={key} images={images} localUri={localUri} size={96} />
            <Text style={[styles.letter, { color: colors.text }]}>{LETTERS[option]}</Text>
          </View>
        ))}
      </View>
      {group.example && shown !== undefined ? (
        <View style={styles.row} accessibilityLabel={`Ejemplo: ${LETTERS[shown]}`}>
          <Text style={[styles.example, { color: colors.textMuted }]}>例如：</Text>
          {'zh' in group.example.stimulus ? <Printed text={group.example.stimulus} /> : null}
          <Text style={[styles.exampleAnswer, { color: colors.text }]}>{LETTERS[shown]}</Text>
        </View>
      ) : null}
      {group.items.map((item, index) => {
        const number = numbers[questionKey(group.slug, index)];
        return (
          <View key={index} style={styles.row}>
            <Number_ value={number} active={activeIndex === index} />
            <View style={styles.flex}>
              {item.text ? <Printed text={item.text} /> : null}
              <View style={styles.chips}>
                {group.images.map((_, option) =>
                  option === shown ? null : (
                    <Chip
                      key={option}
                      label={LETTERS[option]}
                      selected={picks[group.slug]?.[index] === option}
                      onPress={() => onPick(group.slug, index, option)}
                      accessibilityLabel={`Pregunta ${number}, imagen ${LETTERS[option]}`}
                    />
                  ),
                )}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** L3 y R4: 3 respuestas impresas por pregunta; R4 con su texto y la pregunta ★. */
export function TextChoice({ group, numbers, picks, onPick, activeIndex }: GroupProps<'L3' | 'R4'>) {
  const { colors } = useTheme();
  return (
    <View style={styles.group}>
      {group.items.map((item, index) => {
        const number = numbers[questionKey(group.slug, index)];
        return (
          <View key={index} style={styles.row}>
            <Number_ value={number} active={activeIndex === index} />
            <View style={styles.flex}>
              {'passage' in item ? (
                <>
                  <Printed text={item.passage} />
                  <Printed text={item.question} />
                </>
              ) : null}
              {item.options.map((option, choice) => {
                const selected = picks[group.slug]?.[index] === choice;
                return (
                  <Pressable
                    key={choice}
                    accessibilityRole="button"
                    accessibilityLabel={`Pregunta ${number}, opción ${LETTERS[choice]}`}
                    accessibilityState={{ selected }}
                    onPress={() => onPick(group.slug, index, choice)}
                    style={[styles.textOption, { borderColor: selected ? colors.vermilion : colors.border }]}
                  >
                    <Text style={[styles.letter, { color: colors.text }]}>{LETTERS[choice]}</Text>
                    <Printed text={option} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * R2, R3 y W1: un banco común de opciones con letra para todas las preguntas del grupo.
 * En W1 el banco son componentes y cada pregunta muestra su carácter incompleto.
 */
export function BankGroup({ group, numbers, picks, onPick, characters }: GroupProps<'R2' | 'R3' | 'W1'> & { characters: Record<string, string> }) {
  const { colors } = useTheme();
  const example = group.example as ({ shown_answer?: number } & Record<string, unknown>) | undefined;
  const shown = example?.shown_answer;
  const stimulus = (entry: Record<string, any>, id: string) => {
    if (group.part === 'W1') {
      return (
        <View style={styles.wordRow}>
          <Text style={[styles.pinyin, { color: colors.textMuted }]}>{entry.word.pinyin}</Text>
          <SvgView svg={characters[`${group.slug}:${id}`] ?? ''} size={72} color={colors.text} />
        </View>
      );
    }
    return <Printed text={entry.text} />;
  };

  return (
    <View style={styles.group}>
      <View style={styles.bank}>
        {group.bank.map((entry, option) => (
          <View key={option} style={styles.bankEntry}>
            <Text style={[styles.letter, { color: colors.text }]}>{LETTERS[option]}</Text>
            {typeof entry === 'string' ? (
              <Text style={[styles.hanziLarge, { color: colors.text }]}>{entry}</Text>
            ) : (
              <Printed text={entry} />
            )}
          </View>
        ))}
      </View>
      {example && shown !== undefined ? (
        <View style={styles.row} accessibilityLabel={`Ejemplo: ${LETTERS[shown]}`}>
          <Text style={[styles.example, { color: colors.textMuted }]}>例如：</Text>
          <View style={styles.flex}>{stimulus(example, 'example')}</View>
          <Text style={[styles.exampleAnswer, { color: colors.text }]}>{LETTERS[shown]}</Text>
        </View>
      ) : null}
      {group.items.map((item, index) => {
        const number = numbers[questionKey(group.slug, index)];
        return (
          <View key={index} style={styles.row}>
            <Number_ value={number} />
            <View style={styles.flex}>
              {stimulus(item as Record<string, unknown>, String(index))}
              <View style={styles.chips}>
                {group.bank.map((_, option) =>
                  option === shown ? null : (
                    <Chip
                      key={option}
                      label={LETTERS[option]}
                      selected={picks[group.slug]?.[index] === option}
                      onPress={() => onPick(group.slug, index, option)}
                      accessibilityLabel={`Pregunta ${number}, opción ${LETTERS[option]}`}
                    />
                  ),
                )}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** W2: frase con pinyin completo y un hueco; el carácter se escribe a mano. */
export function HandwriteBlank({
  group,
  numbers,
  picks,
  onPick,
  onDrawingChange,
}: GroupProps<'W2'> & { onDrawingChange?: (drawing: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.group}>
      {group.items.map((item, index) => {
        const number = numbers[questionKey(group.slug, index)];
        const written = picks[group.slug]?.[index];
        return (
          <View key={index} style={styles.column}>
            <View style={styles.row}>
              <Number_ value={number} />
              <Printed text={item.sentence} />
            </View>
            <Text style={[styles.pinyin, { color: colors.textMuted }]}>
              {typeof written === 'string' ? `Escrito: ${written}` : 'Sin escribir'}
            </Text>
            <CharacterWriting
              mode="exam"
              size={200}
              onDrawingChange={onDrawingChange}
              onResult={result => onPick(group.slug, index, result.recognized)}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 16 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  column: { gap: 8 },
  flex: { flex: 1, gap: 8 },
  number: { fontSize: 16, fontWeight: '700', minWidth: 28 },
  pinyin: { fontSize: 12 },
  hanzi: { fontSize: 20 },
  hanziLarge: { fontSize: 26 },
  triple: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  imageOption: { borderWidth: 2, borderRadius: 10, padding: 4, alignItems: 'center' },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridCell: { alignItems: 'center' },
  letter: { fontSize: 15, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 18, minWidth: 40, height: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  chipText: { fontSize: 15, fontWeight: '600' },
  textOption: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 8 },
  bank: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  bankEntry: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  example: { fontSize: 14 },
  exampleAnswer: { fontSize: 16, fontWeight: '700' },
  wordRow: { gap: 2 },
});
