export class DeepSeekProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.deepseek.com/v1/chat/completions';
    this.model = 'deepseek-chat';
  }

  buildExercisePrompt(type, level, context) {
    const wordList = context.words ? context.words.join(', ') : '';

    return `You are a Mandarin Chinese language teacher. Generate a single ${type} exercise for HSK ${level} students.

Use ONLY vocabulary appropriate for HSK level ${level} or below.
${wordList ? `Focus on these words: ${wordList}` : ''}

Return ONLY a valid JSON object with this exact structure for type "${type}":
${this.getExerciseSchema(type)}

Do not include any text outside the JSON object.`;
  }

  buildReadingPrompt(level, format) {
    const lengths = { short_text: '100-200', story: '300-500', dialogue: '150-300' };

    return `You are a Mandarin Chinese language teacher. Generate a ${format} reading passage for HSK ${level} students.

Requirements:
- Use ONLY vocabulary appropriate for HSK level ${level} or below
- Length: ${lengths[format] || '100-200'} Chinese characters
- Include 3-5 comprehension questions

Return ONLY a valid JSON object:
{
  "title": "Title in Chinese",
  "content": "Full text in Chinese characters",
  "pinyin_text": "Full text with pinyin",
  "questions": [
    {
      "question": "Question in Chinese",
      "options": ["A", "B", "C", "D"],
      "correct": "A"
    }
  ]
}

Do not include any text outside the JSON object.`;
  }

  getExerciseSchema(type) {
    const schemas = {
      fill_blank:
        '{"type":"fill_blank","sentence":"Sentence with ___ blank","options":["option1","option2","option3","option4"],"correct":"correct_option","explanation":"Brief explanation"}',
      multiple_choice:
        '{"type":"multiple_choice","question":"What does X mean?","options":["a","b","c","d"],"correct":"correct_answer"}',
      reorder:
        '{"type":"reorder","words":["shuffled","word","list"],"correct_order":["correct","word","order"],"translation":"English translation"}',
      dictation:
        '{"type":"dictation","audio_text":"Chinese text to read aloud","pinyin":"pinyin of the text","accept_pinyin":true}',
      matching:
        '{"type":"matching","pairs":[{"left":"Chinese","right":"English"},{"left":"Chinese2","right":"English2"}]}'
    };

    return schemas[type] || schemas.fill_blank;
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
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DeepSeek API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from DeepSeek');
    }

    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
    return JSON.parse(jsonMatch[1].trim());
  }
}