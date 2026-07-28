export class GeminiProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
  }

  buildExercisePrompt(type, level, context) {
    const wordList = context.words ? context.words.join(', ') : '';

    return `You are a Mandarin Chinese language teacher. Generate a single ${type} exercise for HSK ${level} students.

Use ONLY vocabulary appropriate for HSK level ${level} or below.
${wordList ? `Focus on these words: ${wordList}` : ''}

Return ONLY a valid JSON object matching the type "${type}". No extra text.
For fill_blank: {"type":"fill_blank","sentence":"...___...","options":["a","b","c","d"],"correct":"answer","explanation":"..."}
For multiple_choice: {"type":"multiple_choice","question":"...","options":["a","b","c","d"],"correct":"answer"}
For reorder: {"type":"reorder","words":["shuffled"],"correct_order":["ordered"],"translation":"English"}
For dictation: {"type":"dictation","audio_text":"Chinese","pinyin":"pinyin","accept_pinyin":true}
For matching: {"type":"matching","pairs":[{"left":"Chinese","right":"English"}]}`;
  }

  buildReadingPrompt(level, format) {
    const lengths = { short_text: '100-200', story: '300-500', dialogue: '150-300' };

    return `Generate a ${format} reading in Mandarin Chinese for HSK ${level} students.
Length: ${lengths[format] || '100-200'} characters. Use only HSK ${level} or below vocabulary.
Return ONLY JSON: {"title":"Chinese title","content":"Chinese text","pinyin_text":"text with pinyin","questions":[{"question":"Q","options":["A","B","C","D"],"correct":"A"}]}`;
  }

  async generateExercise(type, level, context) {
    const prompt = this.buildExercisePrompt(type, level, context);
    return this.callApi(prompt);
  }

  async generateReading(level, format) {
    const prompt = this.buildReadingPrompt(level, format);
    return this.callApi(prompt);
  }

  async callApi(prompt) {
    const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1000 },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      throw new Error('Empty response from Gemini');
    }

    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
    return JSON.parse(jsonMatch[1].trim());
  }
}