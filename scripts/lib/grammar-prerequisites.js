//
// El sílabo no declara prerrequisitos, pero sí numera las etapas de una misma
// familia gramatical en los títulos de sección: “是”字句1 en HSK 1 y “是”字句2
// en HSK 2, 比较句1 en HSK 2 y 比较句2 en HSK 3. Encadenar cada etapa con la
// anterior es leer el dato oficial, no inventar una secuencia pedagógica.
//
// Los dígitos que aparecen dentro de las viñetas (还2, 因为1, 跟2) son índices
// de sentido léxico y no se tocan aquí: el parser del sílabo los deja en
// `items`, separados del título.
const STAGE_SUFFIX = /^(.*?)([1-9])$/;

// Esta familia está numerada dentro de viñetas y no en el título del epígrafe.
// Se anota por el texto oficial de la viñeta para no convertir los índices
// léxicos (都1, 因为1, 跟2...) en prerrequisitos por accidente.
const BULLET_PREREQUISITES = [
  {
    current: { hsk_level: 2, item: /^主谓句4/ },
    previous: { hsk_level: 1, item: /^主谓句[123]/ },
  },
];

export function splitStageIndex(title) {
  const match = STAGE_SUFFIX.exec(String(title).trim());

  if (!match) {
    return { family: String(title).trim(), stage: null };
  }

  return { family: match[1], stage: Number(match[2]) };
}

export function deriveGrammarPrerequisites(points) {
  const families = new Map();

  for (const point of points) {
    const { family, stage } = splitStageIndex(point.title);
    if (stage === null) continue;

    const list = families.get(family) ?? [];
    list.push({ ...point, stage });
    families.set(family, list);
  }

  const prerequisites = [];

  for (const stages of families.values()) {
    const ordered = [...stages].sort((a, b) => a.stage - b.stage);

    for (let i = 1; i < ordered.length; i += 1) {
      const current = ordered[i];
      const previous = ordered[i - 1];

      // Una etapa posterior en el mismo nivel no es un prerrequisito de orden
      // curricular: ambas se enseñan a la vez.
      if (current.hsk_level === previous.hsk_level) continue;

      prerequisites.push({
        code: current.code,
        hsk_level: current.hsk_level,
        requires_code: previous.code,
        requires_level: previous.hsk_level,
      });
    }
  }

  for (const annotation of BULLET_PREREQUISITES) {
    const current = points.find(
      (point) =>
        point.hsk_level === annotation.current.hsk_level &&
        Array.isArray(point.items) &&
        point.items.some((item) => annotation.current.item.test(item)),
    );
    const previous = points.find(
      (point) =>
        point.hsk_level === annotation.previous.hsk_level &&
        Array.isArray(point.items) &&
        point.items.some((item) => annotation.previous.item.test(item)),
    );

    if (!current || !previous) continue;

    const duplicate = prerequisites.some(
      (prerequisite) =>
        prerequisite.code === current.code &&
        prerequisite.hsk_level === current.hsk_level &&
        prerequisite.requires_code === previous.code &&
        prerequisite.requires_level === previous.hsk_level,
    );
    if (duplicate) continue;

    prerequisites.push({
      code: current.code,
      hsk_level: current.hsk_level,
      requires_code: previous.code,
      requires_level: previous.hsk_level,
    });
  }

  return prerequisites;
}
