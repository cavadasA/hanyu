import { schedulingParams } from './params';

describe('schedulingParams', () => {
  it('usa 0,9 de retención objetivo por defecto', () => {
    expect(schedulingParams({}).request_retention).toBe(0.9);
  });

  it('acepta la retención objetivo del usuario', () => {
    expect(schedulingParams({ request_retention: 0.85 }).request_retention).toBe(0.85);
  });

  it('recorta una retención imposible en vez de propagarla', () => {
    expect(schedulingParams({ request_retention: 1.5 }).request_retention).toBe(0.97);
    expect(schedulingParams({ request_retention: 0.1 }).request_retention).toBe(0.7);
  });

  it('programa el reaprendizaje en minutos, no en días', () => {
    const params = schedulingParams({});

    expect(params.learning_steps).toEqual(['1m', '10m']);
    expect(params.relearning_steps).toEqual(['10m']);
    expect(params.enable_short_term).toBe(true);
  });
});
