import { useLocalSearchParams } from 'expo-router';
import { ExamRunner } from '../../../../src/exam/ExamRunner';

/** `/practice/exam/next`: la primera forma que el alumno no ha hecho; `/practice/exam/B`: esa forma. */
export default function ExamRoute() {
  const { form } = useLocalSearchParams<{ form?: string }>();
  return <ExamRunner formCode={!form || form === 'next' ? null : form} />;
}
