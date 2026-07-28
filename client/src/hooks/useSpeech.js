import { useCallback, useRef, useState } from 'react';

export function useSpeech() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef(null);

  const ttsSupported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined';

  const SpeechRecognition =
    typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const sttSupported = Boolean(SpeechRecognition);

  const speak = useCallback(
    (text, rate = 0.8) => {
      if (!ttsSupported || !text) {
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = rate;
      window.speechSynthesis.speak(utterance);
    },
    [ttsSupported]
  );

  const stop = useCallback(() => {
    if (ttsSupported) {
      window.speechSynthesis.cancel();
    }
  }, [ttsSupported]);

  const listen = useCallback(() => {
    if (!SpeechRecognition) {
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const result = event.results[0]?.[0]?.transcript || '';
      setTranscript(result);
      setListening(false);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    setTranscript('');
    setListening(true);
    recognition.start();
  }, [SpeechRecognition]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    setListening(false);
  }, []);

  return {
    speak,
    stop,
    supported: ttsSupported,
    listen,
    stopListening,
    listening,
    transcript,
    sttSupported,
  };
}
