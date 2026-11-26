// Evaluación fina de una grabación (Plan 13, Tarea 4): el WAV que deja el reconocedor
// (16 kHz, mono, 16 bits) se manda en base64 a la Edge Function pronunciation-assess.
import { File } from 'expo-file-system';
import type { AssessOutcome } from '@hanyu/data';
import { getData } from '../lib/data';

export async function assessRecording({ audioUri, referenceText }: { audioUri: string; referenceText: string }): Promise<AssessOutcome> {
  const audio_base64 = await new File(audioUri).base64();
  return getData().expression.assessPronunciation({ audio_base64, reference_text: referenceText });
}
