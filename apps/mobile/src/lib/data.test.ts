import { getData, resetData } from './data';

describe('getData', () => {
  afterEach(() => {
    resetData();
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  });

  it('throws a configuration error when the environment is empty', () => {
    expect(() => getData()).toThrow(/Supabase is not configured/);
  });

  it('exposes the daily loop repositories once configured', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';

    const data = getData();

    expect(typeof data.today.getToday).toBe('function');
    expect(typeof data.flashcards.buildQueue).toBe('function');
    expect(typeof data.flashcards.createStudyPlan).toBe('function');
    expect(typeof data.flashcards.submitDiagnostic).toBe('function');
    expect(typeof data.settings.updateSettings).toBe('function');
    expect(typeof data.auth.signIn).toBe('function');
  });

  it('returns the same instance on repeated calls', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';

    expect(getData()).toBe(getData());
  });
});
