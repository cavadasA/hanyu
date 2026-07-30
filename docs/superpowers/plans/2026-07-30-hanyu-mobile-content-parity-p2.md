# Hanyu Mobile Content Parity (P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native Practice and Library tabs with all five exercise types, interactive readings, word search, and grammar reference.

**Architecture:** Extend `@hanyu/data` with discriminated content contracts and keep Supabase access outside React Native screens. Practice and Library are nested Expo Router stacks; screen hooks own async state while focused components render one interaction. Reading tokenization remains server-side through a small authenticated Edge Function and returns display-ready tokens.

**Tech Stack:** TypeScript, Expo SDK 57, Expo Router, React Native, `expo-speech`, Supabase JS/Edge Functions, Vitest, Jest, React Native Testing Library.

## Global Constraints

- Begin only after P1 is complete and its automated tests pass.
- Preserve the five-tab order: Today, Cards, Practice, Library, You.
- Support HSK levels `1 | 2 | 3` and the existing English in-app copy.
- Record an exercise only when Check is accepted; record a reading only when comprehension is submitted.
- Never render backend HTML and never call Supabase directly from a screen.
- Speech failure disables audio only; it never blocks answering.
- Practice and Library remain online-only in P2.
- Use existing P1 `Screen`, `Card`, `Button`, `Badge`, `EmptyState`, `ErrorBanner`, `AudioButton`, `useSpeech`, theme, session, and `getData()` primitives.

---

### Task 1: Reconcile the P1 baseline and lock the content contracts

**Files:**
- Create: `packages/data/src/repositories/content.test.ts`
- Modify: `packages/data/src/types.ts`
- Modify: `packages/data/src/index.ts`
- Modify: `packages/data/src/factory.ts`
- Modify: `packages/data/src/repositories/exercises.ts`
- Modify: `packages/data/src/repositories/readings.ts`
- Modify: `packages/data/src/repositories/words.ts`
- Modify: `packages/data/src/repositories/grammar.ts`

**Interfaces:**
- Consumes: completed P1 `HanyuClient`, `createHanyuData`, and existing content repositories.
- Produces: `HskLevel`, `ExerciseType`, `Exercise`, `ExerciseCheckResult`, `ReadingSummary`, `ReadingDetail`, `ReadingToken`, `ReadingResult`, `Word`, `WordPage`, and `GrammarPoint`.

- [ ] **Step 1: Verify the predecessor**

Run:

```bash
npm test
npm test -w @hanyu/mobile -- --runInBand
test -f apps/mobile/src/ui/AudioButton.tsx
test -f apps/mobile/src/screens/CardsScreen.tsx
```

Expected: both test commands pass and both files exist. If P1 renamed a primitive, update only the paths in this plan before continuing.

- [ ] **Step 2: Write failing repository contract tests**

Create tests that use the existing fake Supabase client and assert:

```ts
expect(await data.exercises.generateExercise('dictation', 2)).toMatchObject({
  id: expect.any(String),
  type: 'dictation',
  hsk_level: 2,
  prompt: { audio_text: expect.any(String) },
});

expect(await data.words.getWords({ search: 'ni', level: 2, page: 2, page_size: 20 }))
  .toEqual({ items: expect.any(Array), page: 2, page_size: 20, total: expect.any(Number) });

expect(await data.grammar.getGrammar(2)).toEqual(expect.arrayContaining([
  expect.objectContaining({ id: expect.anything(), hsk_level: 2, title: expect.any(String) }),
]));
```

- [ ] **Step 3: Run the tests and confirm the untyped shapes fail**

Run:

```bash
npm test -- packages/data/src/repositories/content.test.ts
```

Expected: FAIL because pagination and the exported content contracts are not yet stable.

- [ ] **Step 4: Add the exact public contracts**

Add these exported shapes to `types.ts` and re-export them from `index.ts`:

```ts
export type HskLevel = 1 | 2 | 3;
export type ExerciseType =
  | 'fill_blank'
  | 'multiple_choice'
  | 'reorder'
  | 'dictation'
  | 'matching';

export type ExercisePrompt =
  | { kind: 'fill_blank'; sentence: string; options?: string[] }
  | { kind: 'multiple_choice'; question: string; options: string[] }
  | { kind: 'reorder'; tokens: string[] }
  | { kind: 'dictation'; audio_text: string }
  | { kind: 'matching'; pairs: Array<{ left: string; right: string }> };

export interface Exercise {
  id: string;
  type: ExerciseType;
  hsk_level: HskLevel;
  prompt: ExercisePrompt;
  explanation: string | null;
}

export interface ExerciseCheckResult {
  correct: boolean;
  expected_answer: unknown;
  submitted_answer: unknown;
  explanation: string | null;
}

export interface Word {
  id: number;
  hanzi: string;
  pinyin: string;
  meaning_en: string;
  hsk_level: HskLevel;
  pos: string | null;
  in_srs: boolean;
}

export interface WordPage {
  items: Word[];
  page: number;
  page_size: number;
  total: number;
}

export type ReadingFormat = 'short_text' | 'story' | 'dialogue';
export interface ReadingQuestion {
  id: string;
  prompt: string;
  options: Array<{ id: string; text: string }>;
}
export interface ReadingToken {
  id: string;
  text: string;
  type: 'word' | 'unknown' | 'punctuation';
  word: Word | null;
}
export interface ReadingSummary {
  id: string;
  title: string;
  hsk_level: HskLevel;
  format: ReadingFormat;
  generated_at: string;
}
export interface ReadingDetail extends ReadingSummary {
  content: string;
  questions: ReadingQuestion[];
  tokens: ReadingToken[];
}
export interface ReadingResult {
  score: number;
  total: number;
  answers: Array<{ question_id: string; selected_id: string; correct_id: string; correct: boolean }>;
}

export interface GrammarPoint {
  id: number;
  hsk_level: HskLevel;
  title: string;
  pattern: string | null;
  explanation: string | null;
  examples: Array<{ chinese: string; pinyin?: string; english?: string }>;
}
```

- [ ] **Step 5: Normalize repository results**

Implement typed parameter objects and return values:

```ts
getWords(input: {
  search?: string;
  level?: HskLevel;
  page?: number;
  page_size?: number;
}): Promise<WordPage>;

generateExercise(type: ExerciseType, level: HskLevel): Promise<Exercise>;
checkExercise(id: string, answer: unknown): Promise<ExerciseCheckResult>;
getReadings(input?: { level?: HskLevel; format?: ReadingFormat }): Promise<{ readings: ReadingSummary[] }>;
getReading(id: string): Promise<ReadingDetail>;
generateReading(level: HskLevel, format: ReadingFormat): Promise<ReadingDetail>;
completeReading(id: string, answers: Record<string, string>): Promise<ReadingResult>;
getGrammar(level: HskLevel): Promise<GrammarPoint[]>;
getGrammarPoint(level: HskLevel, id: number): Promise<GrammarPoint>;
```

For words, calculate `from = (page - 1) * page_size`, `to = from + page_size - 1`, request `{ count: 'exact' }`, and return `items`, `page`, `page_size`, and `count ?? 0`. Clamp `page >= 1` and `1 <= page_size <= 50`.

- [ ] **Step 6: Run the data tests**

Run:

```bash
npm test -- packages/data/src/repositories/content.test.ts packages/data/src/factory.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/data/src
git commit -m "feat(data): type mobile content contracts"
```

---

### Task 2: Add authenticated reading tokenization

**Files:**
- Create: `supabase/functions/_shared/reading-tokenizer.ts`
- Create: `supabase/functions/_shared/reading-tokenizer.test.ts`
- Create: `supabase/functions/tokenize-reading/index.ts`
- Create: `packages/data/src/repositories/reading-tokens.test.ts`
- Modify: `packages/data/src/repositories/readings.ts`
- Modify: `supabase/config.toml` if the project tracks function settings there

**Interfaces:**
- Consumes: a reading ID, authenticated Supabase user, `words`, and the user's `srs_cards`.
- Produces: `tokenizeReading(content, dictionary): ReadingToken[]` and tokens on `ReadingDetail`.

- [ ] **Step 1: Write longest-match tests**

```ts
const dictionary = [
  { id: 1, hanzi: '你', pinyin: 'nǐ', meaning_en: 'you', hsk_level: 1, pos: null, in_srs: false },
  { id: 2, hanzi: '你好', pinyin: 'nǐ hǎo', meaning_en: 'hello', hsk_level: 1, pos: null, in_srs: true },
  { id: 3, hanzi: '朋友', pinyin: 'péngyou', meaning_en: 'friend', hsk_level: 1, pos: null, in_srs: false },
];

expect(tokenizeReading('你好，朋友。', dictionary).map(t => t.text))
  .toEqual(['你好', '，', '朋友', '。']);
expect(tokenizeReading('龘。', dictionary)).toEqual([
  { id: 't0', text: '龘', type: 'unknown', word: null },
  { id: 't1', text: '。', type: 'punctuation', word: null },
]);
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npm test -- supabase/functions/_shared/reading-tokenizer.test.ts
```

Expected: FAIL because the tokenizer does not exist.

- [ ] **Step 3: Implement the pure tokenizer**

Index dictionary entries by first Unicode code point, sort candidates by
descending `hanzi.length`, prefer the first full prefix match, group contiguous
Latin/number/space characters as punctuation text, and emit unknown Chinese
characters individually. Token IDs are stable offsets: `t${startIndex}`.

```ts
export function tokenizeReading(
  content: string,
  dictionary: Array<Omit<Word, 'in_srs'> & { in_srs: boolean }>,
): ReadingToken[] {
  const byFirst = new Map<string, typeof dictionary>();
  for (const word of dictionary) {
    const first = Array.from(word.hanzi)[0];
    byFirst.set(first, [...(byFirst.get(first) ?? []), word]);
  }
  for (const candidates of byFirst.values()) {
    candidates.sort((a, b) => b.hanzi.length - a.hanzi.length);
  }

  const tokens: ReadingToken[] = [];
  for (let offset = 0; offset < content.length;) {
    const text = Array.from(content.slice(offset))[0];
    const word = (byFirst.get(text) ?? []).find(candidate =>
      content.startsWith(candidate.hanzi, offset),
    );
    if (word) {
      tokens.push({ id: `t${offset}`, text: word.hanzi, type: 'word', word });
      offset += word.hanzi.length;
      continue;
    }
    tokens.push({
      id: `t${offset}`,
      text,
      type: /\p{Script=Han}/u.test(text) ? 'unknown' : 'punctuation',
      word: null,
    });
    offset += text.length;
  }
  return tokens;
}
```

- [ ] **Step 4: Implement the Edge Function**

`POST /tokenize-reading` accepts `{ reading_id: string }`, verifies the bearer
token, loads the reading, loads HSK 1–3 words plus the user's card word IDs, and
returns `{ tokens }`. Return `400`, `401`, or `404` for invalid input,
authentication, or missing reading.

- [ ] **Step 5: Integrate it in `getReading` and `generateReading`**

After obtaining the reading row, call:

```ts
const { data: tokenData, error: tokenError } =
  await client.functions.invoke('tokenize-reading', { body: { reading_id: reading.id } });
if (tokenError) throw createRepositoryError(tokenError, 'Failed to prepare reading words');
return { ...normalizedReading, tokens: tokenData.tokens };
```

- [ ] **Step 6: Run tokenizer and repository tests**

Run:

```bash
npm test -- supabase/functions/_shared/reading-tokenizer.test.ts packages/data/src/repositories/reading-tokens.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions packages/data/src/repositories
git commit -m "feat(readings): return word-level reading tokens"
```

---

### Task 3: Mount Practice and Library navigation

**Files:**
- Create: `apps/mobile/app/(app)/practice/_layout.tsx`
- Create: `apps/mobile/app/(app)/practice/index.tsx`
- Create: `apps/mobile/app/(app)/library/_layout.tsx`
- Create: `apps/mobile/app/(app)/library/index.tsx`
- Create: `apps/mobile/src/screens/PracticeHomeScreen.tsx`
- Create: `apps/mobile/src/screens/LibraryHomeScreen.tsx`
- Create: `apps/mobile/src/screens/content-navigation.test.tsx`
- Modify: `apps/mobile/app/(app)/_layout.tsx`

**Interfaces:**
- Consumes: P1 Tabs and UI primitives.
- Produces: five ordered tabs and nested Practice/Library stacks.

- [ ] **Step 1: Write the failing navigation test**

Mock `expo-router` and assert:

```tsx
render(<PracticeHomeScreen />);
fireEvent.press(screen.getByText('Exercises'));
expect(mockPush).toHaveBeenCalledWith('/practice/exercises');
fireEvent.press(screen.getByText('Readings'));
expect(mockPush).toHaveBeenCalledWith('/practice/readings');
```

Repeat for `/library/words` and `/library/grammar`.

- [ ] **Step 2: Run and verify failure**

```bash
npm test -w @hanyu/mobile -- --runInBand src/screens/content-navigation.test.tsx
```

Expected: FAIL because the screens do not exist.

- [ ] **Step 3: Implement stacks and landing screens**

Use `<Stack screenOptions={{ headerShown: false }}>` in each nested `_layout`.
Landing cards use `accessibilityRole="button"` and a single-line purpose:
“Five focused exercise types”, “Read and inspect words”, “Search HSK words”,
and “Browse grammar patterns”.

- [ ] **Step 4: Add tabs in the fixed order**

```tsx
<Tabs.Screen name="today" options={{ title: 'Today' }} />
<Tabs.Screen name="cards" options={{ title: 'Cards' }} />
<Tabs.Screen name="practice" options={{ title: 'Practice' }} />
<Tabs.Screen name="library" options={{ title: 'Library' }} />
<Tabs.Screen name="you" options={{ title: 'You' }} />
```

- [ ] **Step 5: Run the navigation tests**

```bash
npm test -w @hanyu/mobile -- --runInBand src/screens/content-navigation.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app apps/mobile/src/screens
git commit -m "feat(mobile): add Practice and Library navigation"
```

---

### Task 4: Build the exercise session controller

**Files:**
- Create: `apps/mobile/src/exercises/useExerciseSession.ts`
- Create: `apps/mobile/src/exercises/useExerciseSession.test.tsx`
- Create: `apps/mobile/src/exercises/ExerciseRenderer.tsx`
- Create: `apps/mobile/src/exercises/types.ts`

**Interfaces:**
- Consumes: `getData().exercises.generateExercise/checkExercise`.
- Produces: `useExerciseSession()` and a renderer contract shared by all five types.

- [ ] **Step 1: Write state-machine tests**

Cover `idle → loading → answering → checking → checked`, generation retry,
answer preservation on failed check, and a double Check tap:

```ts
fireEvent.press(result.current.actions.checkButton);
fireEvent.press(result.current.actions.checkButton);
await waitFor(() => expect(checkExercise).toHaveBeenCalledTimes(1));
expect(result.current.status).toBe('checked');
```

- [ ] **Step 2: Verify failure**

```bash
npm test -w @hanyu/mobile -- --runInBand src/exercises/useExerciseSession.test.tsx
```

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the controller**

```ts
export interface ExerciseSession {
  status: 'idle' | 'loading' | 'answering' | 'checking' | 'checked' | 'error';
  type: ExerciseType;
  level: HskLevel;
  exercise: Exercise | null;
  draft: unknown;
  result: ExerciseCheckResult | null;
  error: string | null;
  setType(type: ExerciseType): void;
  setLevel(level: HskLevel): void;
  setDraft(value: unknown): void;
  load(): Promise<void>;
  check(): Promise<void>;
  next(): Promise<void>;
}
```

Guard `check()` with a synchronous ref as well as state so two taps in one
render frame cannot submit twice. Clear the draft only after a successful
`load()`/`next()`.

- [ ] **Step 4: Implement the dispatcher**

`ExerciseRenderer` switches on `exercise.prompt.kind` and passes:

```ts
{ prompt, value: draft, disabled: status !== 'answering', onChange: setDraft }
```

An exhaustive `never` branch makes a sixth backend type a compile failure.

- [ ] **Step 5: Run tests and typecheck**

```bash
npm test -w @hanyu/mobile -- --runInBand src/exercises/useExerciseSession.test.tsx
npx tsc -p apps/mobile/tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/exercises
git commit -m "feat(mobile): add exercise session controller"
```

---

### Task 5: Implement all five native exercise renderers

**Files:**
- Create: `apps/mobile/src/exercises/FillBlankExercise.tsx`
- Create: `apps/mobile/src/exercises/MultipleChoiceExercise.tsx`
- Create: `apps/mobile/src/exercises/DictationExercise.tsx`
- Create: `apps/mobile/src/exercises/ReorderExercise.tsx`
- Create: `apps/mobile/src/exercises/MatchingExercise.tsx`
- Create: `apps/mobile/src/exercises/ExerciseRenderer.test.tsx`
- Modify: `apps/mobile/src/exercises/ExerciseRenderer.tsx`

**Interfaces:**
- Consumes: Task 4 renderer props and P1 `AudioButton`.
- Produces: accessible draft answers in the repository's expected shape.

- [ ] **Step 1: Write one failing interaction test per type**

Assert exact draft output:

```ts
// fill_blank / dictation
expect(onChange).toHaveBeenLastCalledWith('你好');
// multiple_choice
expect(onChange).toHaveBeenLastCalledWith('B');
// reorder
expect(onChange).toHaveBeenLastCalledWith(['我', '学习', '中文']);
// matching
expect(onChange).toHaveBeenLastCalledWith({ 你: 'you', 好: 'good' });
```

Also assert selected state, disabled state, and accessibility labels.

- [ ] **Step 2: Verify all five tests fail**

```bash
npm test -w @hanyu/mobile -- --runInBand src/exercises/ExerciseRenderer.test.tsx
```

Expected: FAIL because renderers are unresolved.

- [ ] **Step 3: Implement text, choice, and dictation renderers**

Use controlled `TextInput` for fill/dictation, `Pressable` option rows for
multiple choice, and:

```tsx
<AudioButton
  text={prompt.audio_text}
  accessibilityLabel="Play dictation"
  disabled={disabled}
/>
```

- [ ] **Step 4: Implement reorder without mandatory drag-and-drop**

Render unused tokens as buttons and the assembled sentence as removable token
buttons. Selecting appends; selecting an assembled token returns it to its
original available position. Provide “Clear order”.

- [ ] **Step 5: Implement matching as a two-step accessible interaction**

Select one left item, then one right item. Store pairs in an object, show paired
state, allow tapping a pair to remove it, and announce “Matched 你 with you”.

- [ ] **Step 6: Run tests**

```bash
npm test -w @hanyu/mobile -- --runInBand src/exercises/ExerciseRenderer.test.tsx
```

Expected: five renderer groups PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/exercises
git commit -m "feat(mobile): render five exercise types"
```

---

### Task 6: Ship the Exercises screen

**Files:**
- Create: `apps/mobile/app/(app)/practice/exercises.tsx`
- Create: `apps/mobile/src/screens/ExercisesScreen.tsx`
- Create: `apps/mobile/src/screens/ExercisesScreen.test.tsx`

**Interfaces:**
- Consumes: Tasks 4–5 and P1 UI/error mapper.
- Produces: complete generate/check/explanation/next flow.

- [ ] **Step 1: Write the failing screen test**

Exercise the complete flow: select HSK 2, select Dictation, Generate, Play,
enter answer, Check, see “Correct” and explanation, then Next. Assert Check is
disabled with an empty draft and while checking.

- [ ] **Step 2: Verify failure**

```bash
npm test -w @hanyu/mobile -- --runInBand src/screens/ExercisesScreen.test.tsx
```

Expected: FAIL because the screen does not exist.

- [ ] **Step 3: Implement the screen**

Compose, in order: level segmented control, type selector, generation/error
state, `ExerciseRenderer`, Check button, result card, and Next button. Use
`toUserMessage(error)` and keep selector state across retries.

- [ ] **Step 4: Run the screen and regression tests**

```bash
npm test -w @hanyu/mobile -- --runInBand src/screens/ExercisesScreen.test.tsx src/exercises
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/'(app)'/practice/exercises.tsx apps/mobile/src/screens/ExercisesScreen*
git commit -m "feat(mobile): add Exercises practice flow"
```

---

### Task 7: Build reading list and generation

**Files:**
- Create: `apps/mobile/app/(app)/practice/readings/_layout.tsx`
- Create: `apps/mobile/app/(app)/practice/readings/index.tsx`
- Create: `apps/mobile/src/readings/useReadings.ts`
- Create: `apps/mobile/src/readings/useReadings.test.tsx`
- Create: `apps/mobile/src/screens/ReadingsScreen.tsx`
- Create: `apps/mobile/src/screens/ReadingsScreen.test.tsx`

**Interfaces:**
- Consumes: typed reading repository.
- Produces: filters, list, generate action, and navigation to `/practice/readings/[id]`.

- [ ] **Step 1: Write failing hook and screen tests**

Assert initial load, HSK/format filter reload, generation preserving filters,
generation retry, empty state, and navigation with the returned ID.

- [ ] **Step 2: Verify failure**

```bash
npm test -w @hanyu/mobile -- --runInBand src/readings/useReadings.test.tsx src/screens/ReadingsScreen.test.tsx
```

Expected: FAIL because the hook/screens are missing.

- [ ] **Step 3: Implement `useReadings`**

Expose:

```ts
{
  level, format, readings, loading, generating, error,
  setLevel, setFormat, reload, generate
}
```

Use a request generation counter so a stale filter response is ignored.
`generate()` returns the new `ReadingDetail` so the screen can navigate.

- [ ] **Step 4: Implement the list screen**

Render level/format controls, Generate reading, summaries, loading/error/empty
states. A summary opens `/practice/readings/${id}`.

- [ ] **Step 5: Run tests and commit**

```bash
npm test -w @hanyu/mobile -- --runInBand src/readings src/screens/ReadingsScreen.test.tsx
git add apps/mobile/app/'(app)'/practice/readings apps/mobile/src/readings apps/mobile/src/screens/ReadingsScreen*
git commit -m "feat(mobile): add reading discovery and generation"
```

Expected: tests PASS, then commit succeeds.

---

### Task 8: Build reading detail, word popup, audio, and comprehension

**Files:**
- Create: `apps/mobile/app/(app)/practice/readings/[id].tsx`
- Create: `apps/mobile/src/readings/ReadingText.tsx`
- Create: `apps/mobile/src/readings/WordSheet.tsx`
- Create: `apps/mobile/src/readings/ReadingQuestions.tsx`
- Create: `apps/mobile/src/screens/ReadingDetailScreen.tsx`
- Create: `apps/mobile/src/screens/ReadingDetailScreen.test.tsx`
- Create: `apps/mobile/src/readings/ReadingText.test.tsx`

**Interfaces:**
- Consumes: `ReadingDetail`, `completeReading`, `flashcards.addCard`, `AudioButton`.
- Produces: token selection and one-time comprehension submission.

- [ ] **Step 1: Write failing token and submission tests**

Assert known word details, unknown-token message, punctuation non-selection,
duplicate add state, full-text speech, pinyin toggle, answer collection,
double-submit guard, and result rendering.

- [ ] **Step 2: Verify failure**

```bash
npm test -w @hanyu/mobile -- --runInBand src/readings/ReadingText.test.tsx src/screens/ReadingDetailScreen.test.tsx
```

Expected: FAIL because components are missing.

- [ ] **Step 3: Implement token text**

Render tokens in a wrapping `<View>`. Known and unknown Chinese tokens are
`Pressable`; punctuation is plain `Text`. The selected known token opens
`WordSheet` with hanzi, pinyin, meaning, HSK badge, SRS status, and Add to Cards.

- [ ] **Step 4: Implement question state and guarded submission**

Store answers as `Record<questionId, optionId>`. Disable Submit until all
questions have answers. Guard with a ref, call `completeReading` exactly once,
retain answers on failure, and lock them after success.

- [ ] **Step 5: Compose the detail screen**

Load by route ID; render metadata, pinyin toggle, full-text `AudioButton`,
`ReadingText`, `ReadingQuestions`, result breakdown, and retry states.

- [ ] **Step 6: Run tests and commit**

```bash
npm test -w @hanyu/mobile -- --runInBand src/readings src/screens/ReadingDetailScreen.test.tsx
git add apps/mobile/app/'(app)'/practice/readings/'[id].tsx' apps/mobile/src/readings apps/mobile/src/screens/ReadingDetailScreen*
git commit -m "feat(mobile): add interactive reading detail"
```

Expected: tests PASS, then commit succeeds.

---

### Task 9: Add paginated Words library

**Files:**
- Create: `apps/mobile/app/(app)/library/words.tsx`
- Create: `apps/mobile/src/words/useWords.ts`
- Create: `apps/mobile/src/words/useWords.test.tsx`
- Create: `apps/mobile/src/screens/WordsScreen.tsx`
- Create: `apps/mobile/src/screens/WordsScreen.test.tsx`

**Interfaces:**
- Consumes: `words.getWords`, `flashcards.addCard`.
- Produces: debounced query, level filter, 20-row pages, and per-word add state.

- [ ] **Step 1: Write hook tests with fake timers**

Assert no call before 300 ms, one call after 300 ms, page reset on query/level,
stale response rejection, previous/next boundaries, retry, and page size `20`.

- [ ] **Step 2: Verify failure**

```bash
npm test -w @hanyu/mobile -- --runInBand src/words/useWords.test.tsx
```

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the hook**

Use separate `query` and `debouncedQuery`, a monotonically increasing request
ID, and:

```ts
const canPrevious = page > 1;
const canNext = page * pageSize < total;
```

- [ ] **Step 4: Implement the screen**

Render Search, All/HSK 1/2/3 filters, word cards, Add/Added buttons, result
count, Previous/Next, and all loading/error/empty variants. Track add state by
word ID; normalize duplicate-card errors to Added.

- [ ] **Step 5: Run tests and commit**

```bash
npm test -w @hanyu/mobile -- --runInBand src/words src/screens/WordsScreen.test.tsx
git add apps/mobile/app/'(app)'/library/words.tsx apps/mobile/src/words apps/mobile/src/screens/WordsScreen*
git commit -m "feat(mobile): add searchable Words library"
```

Expected: PASS, then commit succeeds.

---

### Task 10: Add Grammar list and detail

**Files:**
- Create: `apps/mobile/app/(app)/library/grammar/_layout.tsx`
- Create: `apps/mobile/app/(app)/library/grammar/index.tsx`
- Create: `apps/mobile/app/(app)/library/grammar/[id].tsx`
- Create: `apps/mobile/src/screens/GrammarScreen.tsx`
- Create: `apps/mobile/src/screens/GrammarDetailScreen.tsx`
- Create: `apps/mobile/src/screens/GrammarScreen.test.tsx`

**Interfaces:**
- Consumes: `grammar.getGrammar/getGrammarPoint`.
- Produces: HSK-filtered safe text list/detail.

- [ ] **Step 1: Write failing tests**

Assert default HSK 1, filter reload, list navigation carrying `level`, safe
omission of null fields, plain-text patterns, examples, retry, and empty state.

- [ ] **Step 2: Verify failure**

```bash
npm test -w @hanyu/mobile -- --runInBand src/screens/GrammarScreen.test.tsx
```

Expected: FAIL because the screens do not exist.

- [ ] **Step 3: Implement list and detail**

Navigate with:

```ts
router.push({ pathname: '/library/grammar/[id]', params: { id: String(point.id), level: String(level) } });
```

Detail validates `id` and `level`, calls `getGrammarPoint`, and renders only
nonempty `pattern`, `explanation`, and example fields as React Native `Text`.

- [ ] **Step 4: Run tests and commit**

```bash
npm test -w @hanyu/mobile -- --runInBand src/screens/GrammarScreen.test.tsx
git add apps/mobile/app/'(app)'/library/grammar apps/mobile/src/screens/Grammar*
git commit -m "feat(mobile): add Grammar library"
```

Expected: PASS, then commit succeeds.

---

### Task 11: Integrate Today links and complete P2 verification

**Files:**
- Modify: `apps/mobile/src/screens/TodayScreen.tsx`
- Modify: `apps/mobile/src/screens/TodayScreen.test.tsx`
- Modify: `apps/mobile/README.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed P2 routes.
- Produces: Today actions that open Practice content and the P2 release checklist.

- [ ] **Step 1: Add failing Today navigation assertions**

```ts
fireEvent.press(screen.getByText('Start exercises'));
expect(mockPush).toHaveBeenCalledWith('/practice/exercises');
fireEvent.press(screen.getByText('Start reading'));
expect(mockPush).toHaveBeenCalledWith('/practice/readings');
```

- [ ] **Step 2: Implement the links and run targeted tests**

```bash
npm test -w @hanyu/mobile -- --runInBand src/screens/TodayScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run all automated checks**

```bash
npm test
npm test -w @hanyu/mobile -- --runInBand
npx tsc -p packages/data/tsconfig.json --noEmit
npx tsc -p apps/mobile/tsconfig.json --noEmit
npx expo export --platform all
```

Expected: all tests/typechecks pass and Expo creates both bundles without
missing-module or route errors.

- [ ] **Step 4: Perform the manual P2 matrix**

On one iOS and one Android device verify all five exercise types, reading
generation/audio/token popup/questions, Words search/filter/page/add, Grammar
filter/detail, dark and light themes, and back/tab navigation. Confirm the web
dashboard reflects exactly one exercise/reading completion.

- [ ] **Step 5: Document and commit**

Add the commands and manual matrix to `apps/mobile/README.md`, then:

```bash
git add apps/mobile/src/screens/TodayScreen* apps/mobile/README.md README.md
git commit -m "docs: complete mobile content parity P2"
```

## Definition of Done for P2

- [ ] All five exercise renderer tests and physical-device flows pass.
- [ ] Exercise and reading submissions increment progress exactly once.
- [ ] Reading tokens prefer longest matches and unknown characters remain selectable.
- [ ] Words debounce, stale-response protection, filters, and pagination pass.
- [ ] Grammar never renders backend HTML.
- [ ] Existing P1 flows pass without regression.
- [ ] iOS and Android production bundles export successfully.
