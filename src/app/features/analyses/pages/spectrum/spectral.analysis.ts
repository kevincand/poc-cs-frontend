// spectral-analysis.ts
// Algoritmo completo para análise de qualidade de espectros NIR
// Inclui:
// - Validação de leituras
// - Faixa absoluta de absorbância
// - Divergência entre replicatas
// - Detecção de motor parado
// - Área sob curva (AUC)
// - Suavização Savitzky-Golay
// - Primeira derivada
// - Segunda derivada
// - Ruído por derivada
// - Curvatura
// - Spike no final do espectro
// - Score e classificação final

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpectralReading {
  [key: string]: number[];
}

export interface NirDevice {
  id: number;
  numSerie: string;
  contagemLeituras: number;
  tipoNir: string;
  hibernateLazyInitializer?: unknown;
}

export interface SpectralApiResponse {
  wavelengths: number[];
  nir: NirDevice;
  absorbancias: SpectralReading;
  tipoReplicata?: string;
}

export type FlagSeverity = "warning" | "critical";

export type SpectrumStatus =
  | "OK"
  | "WARNING"
  | "MOTOR_STOPPED"
  | "BAD_SPECTRUM";

export interface AnalysisFlag {
  rule: string;
  description: string;
  severity: FlagSeverity;
  value?: number;
}

export interface SpectralAnalysisResult {
  status: SpectrumStatus;
  consistent: boolean;
  score: number;
  flags: AnalysisFlag[];
  stats: {
    numberOfReadings: number;
    numberOfPoints: number;

    analyzedNumberOfPoints: number;
    ignoredStartPoints: number;
    ignoredEndPoints: number;

    motorStoppedMaxWavelength: number;
    motorStoppedNumberOfPoints: number;
    motorMeanDivergence: number;
    motorMaxDivergence: number;
    motorDerivativeDistance: number;

    minAbsorbance: number;
    maxAbsorbance: number;

    meanDivergence: number;
    maxDivergence: number;

    baselineSpread: number;
    endSpread: number;

    aucSpread: number;

    derivativeDistance: number;
    derivativeNoise: number;
    derivativeNoiseSpread: number;

    curvature: number;
    curvatureSpread: number;

    endSpikeRatio: number;
  };
}

// ─── Thresholds ───────────────────────────────────────────────────────────────
// Ajustados para NIR 900–1700 nm em farelo de soja, com base nos seus exemplos.
// Recomendo recalibrar com mais amostras reais quando tiver base maior.

export const THRESHOLDS = {
  // ───────────────────────────────────────────────────────────────────────────
  // FAIXA ABSOLUTA DE ABSORBÂNCIA
  // ───────────────────────────────────────────────────────────────────────────

  // Valor mínimo absoluto aceitável de absorbância.
  // Abaixo disso, a leitura pode indicar problema de sinal baixo,
  // erro de captura, pouca resposta óptica ou dado inválido.
  absMin: 0.085,

  // Valor máximo absoluto aceitável de absorbância.
  // Acima disso, pode indicar saturação, sujeira na lente,
  // amostra muito escura, erro óptico ou leitura ruim.
  absMax: 0.85,

  // Valor mínimo esperado para o produto analisado, neste caso farelo de soja.
  // É menos rígido que absMin/absMax e serve mais como alerta de perfil fora do esperado.
  soybeanMinExpected: 0.10,

  // Valor máximo esperado para farelo de soja.
  // Acima disso não significa necessariamente erro crítico,
  // mas indica que a leitura está fora do comportamento esperado para esse produto.
  soybeanMaxExpected: 0.62,


  // ───────────────────────────────────────────────────────────────────────────
  // DIVERGÊNCIA ENTRE REPLICATAS
  // ───────────────────────────────────────────────────────────────────────────

  // Desvio padrão médio entre as replicatas, ponto a ponto.
  // Mede o quanto as 5 leituras variam entre si ao longo do espectro.
  // Acima desse valor, gera alerta.
  meanStdDevWarning: 0.012,

  // Desvio padrão médio crítico entre replicatas.
  // Indica que as leituras estão muito diferentes entre si,
  // sugerindo análise instável, amostra mal posicionada ou espectro ruim.
  meanStdDevCritical: 0.025,

  // Range máximo pontual de alerta.
  // Em cada comprimento de onda, calcula-se:
  // maior absorbância - menor absorbância entre as replicatas.
  // Se em algum ponto esse range passar desse valor, gera alerta.
  maxPointRangeWarning: 0.04,

  // Range máximo pontual crítico.
  // Indica que pelo menos um ponto do espectro teve grande abertura
  // entre as replicatas, o que pode indicar ruído, spike ou leitura inconsistente.
  maxPointRangeCritical: 0.08,


  // ───────────────────────────────────────────────────────────────────────────
  // MOTOR PARADO / VARIABILIDADE BAIXA DEMAIS
  // ───────────────────────────────────────────────────────────────────────────

  // Desvio padrão médio baixo demais entre replicatas.
  // Quando as 5 leituras ficam praticamente idênticas,
  // isso pode indicar que o motor não girou ou a amostra não se movimentou.
  motorStoppedMeanDivergence: 0.0025,

  // Range máximo baixo demais para motor parado.
  // Mesmo no ponto de maior diferença, as replicatas continuam muito próximas.
  // Usado junto com motorStoppedMeanDivergence.
  motorStoppedMaxDivergence: 0.012,

  // Distância média entre as primeiras derivadas das replicatas.
  // Se as derivadas também são quase idênticas, reforça a suspeita de motor parado.
  derivativeDistanceMotorStopped: 0.0015,

  // Quantidade de pontos ignorados no início do espectro.
  // No nosso caso, os primeiros 19 pontos são descartados por causa de ruído
  // causado por variações de energia da lâmpada/sensor.
  ignoredStartPoints: 19,

  // Quantidade de pontos ignorados no final do espectro.
  // Também descartamos os últimos 19 pontos por instabilidade/ruído de borda.
  ignoredEndPoints: 19,

  // Comprimento de onda máximo usado na regra de motor parado.
  // A detecção de motor parado deve olhar apenas até 1420 nm,
  // pois acima disso a umidade afeta muito a leitura e pode mascarar o problema.
  motorStoppedMaxWavelength: 1420,


  // ───────────────────────────────────────────────────────────────────────────
  // JANELAS DE CÁLCULO
  // ───────────────────────────────────────────────────────────────────────────

  // Quantidade de pontos usados para calcular o spread no final do espectro útil.
  // Importante para detectar abertura entre replicatas no final.
  endWindowSize: 15,

  // Quantidade de pontos usados para calcular o spread no início do espectro útil.
  // Como já descartamos os 19 primeiros pontos, essa baseline começa após o corte.
  baselineWindowSize: 10,

  // Quantidade de pontos da derivada usados para verificar spike no final.
  endDerivativeWindowSize: 20,


  // ───────────────────────────────────────────────────────────────────────────
  // SPREAD NO FINAL DO ESPECTRO
  // ───────────────────────────────────────────────────────────────────────────

  // Spread de alerta no final do espectro.
  // Calcula a média dos últimos N pontos de cada replicata e compara
  // a maior média contra a menor média.
  endSpreadWarning: 0.04,

  // Spread crítico no final do espectro.
  // Indica que as replicatas abriram demais no final da leitura.
  // Pode acontecer por saturação, instabilidade óptica, umidade ou leitura ruim.
  endSpreadCritical: 0.08,


  // ───────────────────────────────────────────────────────────────────────────
  // SPREAD NO INÍCIO DO ESPECTRO ÚTIL
  // ───────────────────────────────────────────────────────────────────────────

  // Spread de alerta na baseline.
  // Mede se as replicatas começam em níveis diferentes após remover os 19 pontos iniciais.
  baselineSpreadWarning: 0.03,

  // Spread crítico na baseline.
  // Indica diferença grande logo no início útil da leitura.
  baselineSpreadCritical: 0.06,


  // ───────────────────────────────────────────────────────────────────────────
  // AUC - ÁREA SOB A CURVA
  // ───────────────────────────────────────────────────────────────────────────

  // Diferença percentual de área entre replicatas para alerta.
  // AUC mede a soma geral da absorbância ao longo do espectro.
  // Se uma replicata tem área muito diferente das outras, pode indicar leitura ruim.
  aucSpreadWarning: 0.08, // 8%

  // Diferença percentual crítica de área entre replicatas.
  // Indica que uma ou mais leituras ficaram muito deslocadas no conjunto.
  aucSpreadCritical: 0.15, // 15%


  // ───────────────────────────────────────────────────────────────────────────
  // DERIVADAS APÓS SUAVIZAÇÃO SAVITZKY-GOLAY
  // ───────────────────────────────────────────────────────────────────────────

  // Ruído médio de alerta na primeira derivada.
  // A primeira derivada mede a inclinação da curva.
  // Valores altos indicam curva serrilhada, ruído ou instabilidade.
  derivativeNoiseWarning: 0.0009,

  // Ruído médio crítico na primeira derivada.
  // Indica ruído elevado ou variações bruscas demais na forma do espectro.
  derivativeNoiseCritical: 0.0018,

  // Diferença de ruído de derivada entre replicatas para alerta.
  // Mesmo que o ruído médio esteja aceitável, uma replicata pode estar
  // mais ruidosa que as outras.
  derivativeNoiseSpreadWarning: 0.00035,

  // Diferença crítica de ruído de derivada entre replicatas.
  // Indica que pelo menos uma replicata tem comportamento muito diferente.
  derivativeNoiseSpreadCritical: 0.00075,


  // ───────────────────────────────────────────────────────────────────────────
  // CURVATURA / SEGUNDA DERIVADA
  // ───────────────────────────────────────────────────────────────────────────

  // Curvatura média de alerta.
  // A segunda derivada mede mudanças bruscas na inclinação.
  // Ajuda a detectar picos artificiais, ruído ou descontinuidade.
  curvatureWarning: 0.00018,

  // Curvatura crítica.
  // Indica comportamento abrupto demais na curva,
  // possivelmente por spike, saturação ou leitura instável.
  curvatureCritical: 0.00040,

  // Diferença de curvatura entre replicatas para alerta.
  // Detecta quando uma replicata tem formato mais irregular que as demais.
  curvatureSpreadWarning: 0.00008,

  // Diferença crítica de curvatura entre replicatas.
  // Indica replicata com comportamento de forma muito diferente.
  curvatureSpreadCritical: 0.00018,


  // ───────────────────────────────────────────────────────────────────────────
  // SPIKE ARTIFICIAL NO FINAL DO ESPECTRO
  // ───────────────────────────────────────────────────────────────────────────

  // Razão de alerta entre a derivada média do final e a derivada média global.
  // Exemplo: se for 2.5, significa que o final está 2.5x mais inclinado/instável
  // que o restante do espectro.
  endSpikeRatioWarning: 2.5,

  // Razão crítica de spike final.
  // Indica crescimento ou queda abrupta no final da curva.
  endSpikeRatioCritical: 4.0,


  // ───────────────────────────────────────────────────────────────────────────
  // SUAVIZAÇÃO SAVITZKY-GOLAY
  // ───────────────────────────────────────────────────────────────────────────

  // Janela usada na suavização Savitzky-Golay.
  // No código atual usamos janela fixa 7 com polinômio grau 2:
  // [-2, 3, 6, 7, 6, 3, -2] / 21.
  // Essa suavização reduz ruído antes de calcular derivadas.
  savitzkyGolayWindow: 7,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((sum, value) => sum + value, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length <= 1) return 0;

  const m = mean(arr);
  return Math.sqrt(
    arr.reduce((sum, value) => sum + (value - m) ** 2, 0) / arr.length
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeMin(arr: number[]): number {
  return arr.length ? Math.min(...arr) : 0;
}

function safeMax(arr: number[]): number {
  return arr.length ? Math.max(...arr) : 0;
}

function range(arr: number[]): number {
  if (!arr.length) return 0;
  return safeMax(arr) - safeMin(arr);
}

function absoluteMean(arr: number[]): number {
  return mean(arr.map(Math.abs));
}

function euclideanDistance(a: number[], b: number[]): number {
  const size = Math.min(a.length, b.length);
  if (!size) return 0;

  let sum = 0;
  for (let i = 0; i < size; i++) {
    sum += (a[i] - b[i]) ** 2;
  }

  return Math.sqrt(sum / size); // normalizado por ponto
}

function cropUsefulSpectrum(
  wavelengths: number[],
  readings: number[][],
  ignoredStartPoints: number,
  ignoredEndPoints: number
): {
  wavelengths: number[];
  readings: number[][];
  startIndex: number;
  endIndexExclusive: number;
} {
  const startIndex = Math.max(0, ignoredStartPoints);
  const endIndexExclusive = Math.max(
    startIndex,
    wavelengths.length - Math.max(0, ignoredEndPoints)
  );

  return {
    wavelengths: wavelengths.slice(startIndex, endIndexExclusive),
    readings: readings.map(reading =>
      reading.slice(startIndex, endIndexExclusive)
    ),
    startIndex,
    endIndexExclusive,
  };
}

function cropSpectrumByMaxWavelength(
  wavelengths: number[],
  readings: number[][],
  maxWavelength: number
): {
  wavelengths: number[];
  readings: number[][];
} {
  let endIndexExclusive = wavelengths.findIndex(
    wavelength => wavelength > maxWavelength
  );

  if (endIndexExclusive === -1) {
    endIndexExclusive = wavelengths.length;
  }

  return {
    wavelengths: wavelengths.slice(0, endIndexExclusive),
    readings: readings.map(reading =>
      reading.slice(0, endIndexExclusive)
    ),
  };
}

function calculatePointwiseDivergence(readings: number[][]): {
  meanDivergence: number;
  maxDivergence: number;
  pointwiseRanges: number[];
  pointwiseStdDevs: number[];
} {
  const numberOfPoints = readings[0]?.length ?? 0;
  const pointwiseRanges: number[] = [];
  const pointwiseStdDevs: number[] = [];

  for (let i = 0; i < numberOfPoints; i++) {
    const valuesAtPoint = readings.map(reading => reading[i]);

    pointwiseRanges.push(range(valuesAtPoint));
    pointwiseStdDevs.push(stdDev(valuesAtPoint));
  }

  return {
    meanDivergence: mean(pointwiseStdDevs),
    maxDivergence: safeMax(pointwiseRanges),
    pointwiseRanges,
    pointwiseStdDevs,
  };
}

function calculateDerivativeDistance(
  readings: number[][],
  wavelengths: number[]
): number {
  const smoothedReadings = readings.map(savitzkyGolaySmooth);

  const firstDerivatives = smoothedReadings.map(reading =>
    firstDerivative(reading, wavelengths)
  );

  const derivativeDistances: number[] = [];

  for (let i = 0; i < firstDerivatives.length; i++) {
    for (let j = i + 1; j < firstDerivatives.length; j++) {
      derivativeDistances.push(
        euclideanDistance(firstDerivatives[i], firstDerivatives[j])
      );
    }
  }

  return mean(derivativeDistances);
}

// ─── Savitzky-Golay Smoothing ────────────────────────────────────────────────
// Implementação fixa: janela 7, polinômio 2.
// Vantagem: simples, rápida e sem dependências externas.
// Para as bordas, mantém o valor original.

function savitzkyGolaySmooth(values: number[]): number[] {
  const coefficients = [-2, 3, 6, 7, 6, 3, -2];
  const divisor = 21;
  const halfWindow = Math.floor(coefficients.length / 2);

  if (values.length < coefficients.length) {
    return [...values];
  }

  const smoothed = [...values];

  for (let i = halfWindow; i < values.length - halfWindow; i++) {
    let acc = 0;

    for (let j = -halfWindow; j <= halfWindow; j++) {
      acc += values[i + j] * coefficients[j + halfWindow];
    }

    smoothed[i] = acc / divisor;
  }

  return smoothed;
}

// ─── Derivadas ────────────────────────────────────────────────────────────────

function firstDerivative(values: number[], wavelengths: number[]): number[] {
  const result: number[] = [];

  for (let i = 1; i < values.length; i++) {
    const deltaWavelength = wavelengths[i] - wavelengths[i - 1];

    if (deltaWavelength === 0) {
      result.push(0);
      continue;
    }

    result.push((values[i] - values[i - 1]) / deltaWavelength);
  }

  return result;
}

function secondDerivative(values: number[], wavelengths: number[]): number[] {
  const first = firstDerivative(values, wavelengths);
  const result: number[] = [];

  for (let i = 1; i < first.length; i++) {
    const deltaWavelength = wavelengths[i + 1] - wavelengths[i];

    if (deltaWavelength === 0) {
      result.push(0);
      continue;
    }

    result.push((first[i] - first[i - 1]) / deltaWavelength);
  }

  return result;
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

async function fetchSpectralData(url: string): Promise<SpectralApiResponse> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Erro ao buscar espectro: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// ─── Análise Principal ───────────────────────────────────────────────────────

export async function analyzeSpectrum(url: string): Promise<SpectralAnalysisResult> {
  const data = await fetchSpectralData(url);
  return analyzeSpectrumData(data);
}

export function analyzeSpectrumData(data: SpectralApiResponse): SpectralAnalysisResult {
  const wavelengths = data.wavelengths;
  const readings = Object.values(data.absorbancias ?? {});
  const numberOfPoints = wavelengths.length;
  const flags: AnalysisFlag[] = [];

  if (!numberOfPoints) {
    throw new Error("Nenhum comprimento de onda encontrado no espectro.");
  }

  if (!readings.length) {
    throw new Error("Nenhuma leitura de absorbância encontrada no espectro.");
  }

  // ── 1. Validação de tamanho das leituras ───────────────────────────────────

  const validReadings = readings.filter(reading => reading.length === numberOfPoints);

  if (validReadings.length !== readings.length) {
    flags.push({
      rule: "LENGTH_MISMATCH",
      description: `${readings.length - validReadings.length} leitura(s) com número de pontos diferente do esperado (${numberOfPoints}).`,
      severity: "critical",
    });
  }

  if (!validReadings.length) {
    throw new Error("Nenhuma leitura válida com o mesmo número de pontos dos wavelengths.");
  }

  // ── 1.5 Recorte do espectro útil ────────────────────────────────────────────
  // Desconsidera os 19 primeiros e os 19 últimos pontos, pois essas regiões
  // possuem ruídos maiores por variação de energia da lâmpada/sensor.

  const usefulSpectrum = cropUsefulSpectrum(
    wavelengths,
    validReadings,
    THRESHOLDS.ignoredStartPoints,
    THRESHOLDS.ignoredEndPoints
  );

  const analyzedWavelengths = usefulSpectrum.wavelengths;
  const analyzedReadings = usefulSpectrum.readings;
  const analyzedNumberOfPoints = analyzedWavelengths.length;

  if (!analyzedNumberOfPoints) {
    throw new Error("Nenhum ponto restante após recorte do espectro útil.");
  }

  // ── 2. Faixa absoluta de absorbância ───────────────────────────────────────

  const allValues = analyzedReadings.flat();
  const globalMin = safeMin(allValues);
  const globalMax = safeMax(allValues);

  if (globalMin < THRESHOLDS.absMin) {
    flags.push({
      rule: "ABS_TOO_LOW",
      description: `Absorbância mínima ${globalMin.toFixed(4)} está abaixo do limite aceitável (${THRESHOLDS.absMin}).`,
      severity: "critical",
      value: globalMin,
    });
  }

  if (globalMax > THRESHOLDS.absMax) {
    flags.push({
      rule: "ABS_TOO_HIGH",
      description: `Absorbância máxima ${globalMax.toFixed(4)} ultrapassa o limite aceitável (${THRESHOLDS.absMax}).`,
      severity: "critical",
      value: globalMax,
    });
  }

  if (globalMax > THRESHOLDS.soybeanMaxExpected) {
    flags.push({
      rule: "SOYBEAN_MAX_EXCEEDED",
      description: `Absorbância máxima ${globalMax.toFixed(4)} acima do esperado para farelo de soja (≤ ${THRESHOLDS.soybeanMaxExpected}).`,
      severity: "warning",
      value: globalMax,
    });
  }

  // ── 3. Divergência ponto a ponto entre replicatas ──────────────────────────

  const mainDivergence = calculatePointwiseDivergence(analyzedReadings);

  const meanDivergence = mainDivergence.meanDivergence;
  const maxDivergence = mainDivergence.maxDivergence;

  if (meanDivergence >= THRESHOLDS.meanStdDevCritical) {
    flags.push({
      rule: "HIGH_MEAN_DIVERGENCE",
      description: `Desvio padrão médio entre leituras ${meanDivergence.toFixed(5)} excede limite crítico (${THRESHOLDS.meanStdDevCritical}).`,
      severity: "critical",
      value: meanDivergence,
    });
  } else if (meanDivergence >= THRESHOLDS.meanStdDevWarning) {
    flags.push({
      rule: "MODERATE_MEAN_DIVERGENCE",
      description: `Desvio padrão médio entre leituras ${meanDivergence.toFixed(5)} excede limite de alerta (${THRESHOLDS.meanStdDevWarning}).`,
      severity: "warning",
      value: meanDivergence,
    });
  }

  if (maxDivergence >= THRESHOLDS.maxPointRangeCritical) {
    flags.push({
      rule: "HIGH_POINT_RANGE",
      description: `Range máximo pontual ${maxDivergence.toFixed(4)} entre leituras excede limite crítico (${THRESHOLDS.maxPointRangeCritical}).`,
      severity: "critical",
      value: maxDivergence,
    });
  } else if (maxDivergence >= THRESHOLDS.maxPointRangeWarning) {
    flags.push({
      rule: "MODERATE_POINT_RANGE",
      description: `Range máximo pontual ${maxDivergence.toFixed(4)} entre leituras excede limite de alerta (${THRESHOLDS.maxPointRangeWarning}).`,
      severity: "warning",
      value: maxDivergence,
    });
  }

  // ── 4. Spread no início e final do espectro ────────────────────────────────

  const baselineWindowSize = Math.min(
    THRESHOLDS.baselineWindowSize,
    analyzedNumberOfPoints
  );

  const endWindowSize = Math.min(
    THRESHOLDS.endWindowSize,
    analyzedNumberOfPoints
  );

  const baselineMeans = analyzedReadings.map(reading =>
    mean(reading.slice(0, baselineWindowSize))
  );

  const endMeans = analyzedReadings.map(reading =>
    mean(reading.slice(-endWindowSize))
  );

  const baselineSpread = range(baselineMeans);
  const endSpread = range(endMeans);

  if (baselineSpread >= THRESHOLDS.baselineSpreadCritical) {
    flags.push({
      rule: "BASELINE_INCONSISTENT_CRITICAL",
      description: `Spread na baseline = ${baselineSpread.toFixed(4)}. Leituras partem de níveis muito diferentes.`,
      severity: "critical",
      value: baselineSpread,
    });
  } else if (baselineSpread >= THRESHOLDS.baselineSpreadWarning) {
    flags.push({
      rule: "BASELINE_INCONSISTENT",
      description: `Spread na baseline = ${baselineSpread.toFixed(4)}. Leituras partem de níveis diferentes.`,
      severity: "warning",
      value: baselineSpread,
    });
  }

  if (endSpread >= THRESHOLDS.endSpreadCritical) {
    flags.push({
      rule: "END_SPREAD_CRITICAL",
      description: `Spread no final do espectro = ${endSpread.toFixed(4)}. Divergência crítica entre leituras.`,
      severity: "critical",
      value: endSpread,
    });
  } else if (endSpread >= THRESHOLDS.endSpreadWarning) {
    flags.push({
      rule: "END_SPREAD_WARNING",
      description: `Spread no final do espectro = ${endSpread.toFixed(4)}. Divergência elevada entre leituras.`,
      severity: "warning",
      value: endSpread,
    });
  }

  // ── 5. Área sob curva / AUC aproximada ─────────────────────────────────────
  // Aqui usamos soma simples porque o espaçamento é quase regular.
  // Se quiser mais rigor, substitua por integração trapezoidal.

  const areas = analyzedReadings.map(reading =>
    reading.reduce((sum, value) => sum + value, 0)
  );

  const aucSpread = mean(areas) !== 0 ? range(areas) / mean(areas) : 0;

  if (aucSpread >= THRESHOLDS.aucSpreadCritical) {
    flags.push({
      rule: "AUC_SPREAD_CRITICAL",
      description: `Diferença crítica de área entre replicatas: ${(aucSpread * 100).toFixed(2)}%.`,
      severity: "critical",
      value: aucSpread,
    });
  } else if (aucSpread >= THRESHOLDS.aucSpreadWarning) {
    flags.push({
      rule: "AUC_SPREAD_WARNING",
      description: `Diferença elevada de área entre replicatas: ${(aucSpread * 100).toFixed(2)}%.`,
      severity: "warning",
      value: aucSpread,
    });
  }

  // ── 6. Suavização Savitzky-Golay ───────────────────────────────────────────

  const smoothedReadings = analyzedReadings.map(savitzkyGolaySmooth);

  // ── 7. Derivadas ───────────────────────────────────────────────────────────

  const firstDerivatives = smoothedReadings.map(reading =>
    firstDerivative(reading, analyzedWavelengths)
  );

  const secondDerivatives = smoothedReadings.map(reading =>
    secondDerivative(reading, analyzedWavelengths)
  );

  // ── 8. Distância média entre primeiras derivadas ───────────────────────────

  const derivativeDistances: number[] = [];

  for (let i = 0; i < firstDerivatives.length; i++) {
    for (let j = i + 1; j < firstDerivatives.length; j++) {
      derivativeDistances.push(
        euclideanDistance(firstDerivatives[i], firstDerivatives[j])
      );
    }
  }

  const derivativeDistance = mean(derivativeDistances);

  // ── 8.1. Motor parado em região específica ─────────────────────────────────
  // Para motor parado, analisamos apenas até 1420 nm.
  // Acima disso, a umidade pode afetar muito as replicatas e mascarar
  // o comportamento de motor parado.

  const motorSpectrum = cropSpectrumByMaxWavelength(
    analyzedWavelengths,
    analyzedReadings,
    THRESHOLDS.motorStoppedMaxWavelength
  );

  const motorWavelengths = motorSpectrum.wavelengths;
  const motorReadings = motorSpectrum.readings;
  const motorStoppedNumberOfPoints = motorWavelengths.length;

  const motorDivergence = calculatePointwiseDivergence(motorReadings);

  const motorMeanDivergence = motorDivergence.meanDivergence;
  const motorMaxDivergence = motorDivergence.maxDivergence;

  const motorDerivativeDistance = calculateDerivativeDistance(
    motorReadings,
    motorWavelengths
  );

  if (
    motorStoppedNumberOfPoints > 0 &&
    motorMeanDivergence < THRESHOLDS.motorStoppedMeanDivergence &&
    motorMaxDivergence < THRESHOLDS.motorStoppedMaxDivergence &&
    motorDerivativeDistance < THRESHOLDS.derivativeDistanceMotorStopped
  ) {
    flags.push({
      rule: "MOTOR_STOPPED",
      description:
        `Replicatas excessivamente semelhantes até ${THRESHOLDS.motorStoppedMaxWavelength} nm. ` +
        `Possível motor parado ou ausência de rotação da amostra. ` +
        `motorMeanDivergence=${motorMeanDivergence.toFixed(5)}, ` +
        `motorMaxDivergence=${motorMaxDivergence.toFixed(5)}, ` +
        `motorDerivativeDistance=${motorDerivativeDistance.toFixed(6)}.`,
      severity: "critical",
      value: motorDerivativeDistance,
    });
  } else if (
    motorStoppedNumberOfPoints > 0 &&
    motorMeanDivergence < THRESHOLDS.motorStoppedMeanDivergence
  ) {
    flags.push({
      rule: "LOW_VARIABILITY_BETWEEN_REPLICATES",
      description:
        `Variabilidade muito baixa entre replicatas até ${THRESHOLDS.motorStoppedMaxWavelength} nm ` +
        `(${motorMeanDivergence.toFixed(5)}). Verificar rotação/movimentação da amostra.`,
      severity: "warning",
      value: motorMeanDivergence,
    });
  }

  // ── 9. Ruído da primeira derivada ──────────────────────────────────────────

  const derivativeNoises = firstDerivatives.map(absoluteMean);
  const derivativeNoise = mean(derivativeNoises);
  const derivativeNoiseSpread = range(derivativeNoises);

  if (derivativeNoise >= THRESHOLDS.derivativeNoiseCritical) {
    flags.push({
      rule: "DERIVATIVE_NOISE_CRITICAL",
      description: `Ruído crítico na primeira derivada: ${derivativeNoise.toFixed(6)}.`,
      severity: "critical",
      value: derivativeNoise,
    });
  } else if (derivativeNoise >= THRESHOLDS.derivativeNoiseWarning) {
    flags.push({
      rule: "DERIVATIVE_NOISE_WARNING",
      description: `Ruído elevado na primeira derivada: ${derivativeNoise.toFixed(6)}.`,
      severity: "warning",
      value: derivativeNoise,
    });
  }

  if (derivativeNoiseSpread >= THRESHOLDS.derivativeNoiseSpreadCritical) {
    flags.push({
      rule: "DERIVATIVE_NOISE_SPREAD_CRITICAL",
      description: `Diferença crítica de ruído da derivada entre replicatas: ${derivativeNoiseSpread.toFixed(6)}.`,
      severity: "critical",
      value: derivativeNoiseSpread,
    });
  } else if (derivativeNoiseSpread >= THRESHOLDS.derivativeNoiseSpreadWarning) {
    flags.push({
      rule: "DERIVATIVE_NOISE_SPREAD_WARNING",
      description: `Diferença elevada de ruído da derivada entre replicatas: ${derivativeNoiseSpread.toFixed(6)}.`,
      severity: "warning",
      value: derivativeNoiseSpread,
    });
  }

  // ── 10. Curvatura / segunda derivada ───────────────────────────────────────

  const curvatures = secondDerivatives.map(absoluteMean);
  const curvature = mean(curvatures);
  const curvatureSpread = range(curvatures);

  if (curvature >= THRESHOLDS.curvatureCritical) {
    flags.push({
      rule: "CURVATURE_ANOMALY_CRITICAL",
      description: `Curvatura crítica na segunda derivada: ${curvature.toFixed(6)}. Possível ruído, descontinuidade ou saturação.`,
      severity: "critical",
      value: curvature,
    });
  } else if (curvature >= THRESHOLDS.curvatureWarning) {
    flags.push({
      rule: "CURVATURE_ANOMALY_WARNING",
      description: `Curvatura elevada na segunda derivada: ${curvature.toFixed(6)}.`,
      severity: "warning",
      value: curvature,
    });
  }

  if (curvatureSpread >= THRESHOLDS.curvatureSpreadCritical) {
    flags.push({
      rule: "CURVATURE_SPREAD_CRITICAL",
      description: `Diferença crítica de curvatura entre replicatas: ${curvatureSpread.toFixed(6)}.`,
      severity: "critical",
      value: curvatureSpread,
    });
  } else if (curvatureSpread >= THRESHOLDS.curvatureSpreadWarning) {
    flags.push({
      rule: "CURVATURE_SPREAD_WARNING",
      description: `Diferença elevada de curvatura entre replicatas: ${curvatureSpread.toFixed(6)}.`,
      severity: "warning",
      value: curvatureSpread,
    });
  }

  // ── 11. Spike no final do espectro ─────────────────────────────────────────

  const endDerivativeWindowSize = Math.min(
    THRESHOLDS.endDerivativeWindowSize,
    firstDerivatives[0]?.length ?? 0
  );

  const endSpikeRatios = firstDerivatives.map(derivative => {
    const globalDerivativeMean = absoluteMean(derivative);
    const endDerivativeMean = absoluteMean(derivative.slice(-endDerivativeWindowSize));

    if (globalDerivativeMean === 0) return 0;
    return endDerivativeMean / globalDerivativeMean;
  });

  const endSpikeRatio = safeMax(endSpikeRatios);

  if (endSpikeRatio >= THRESHOLDS.endSpikeRatioCritical) {
    flags.push({
      rule: "END_SPIKE_CRITICAL",
      description: `Spike crítico no final do espectro. Razão final/global = ${endSpikeRatio.toFixed(2)}.`,
      severity: "critical",
      value: endSpikeRatio,
    });
  } else if (endSpikeRatio >= THRESHOLDS.endSpikeRatioWarning) {
    flags.push({
      rule: "END_SPIKE_WARNING",
      description: `Possível spike no final do espectro. Razão final/global = ${endSpikeRatio.toFixed(2)}.`,
      severity: "warning",
      value: endSpikeRatio,
    });
  }

  // ── 12. Score ──────────────────────────────────────────────────────────────

  let score = 100;

  for (const flag of flags) {
    if (flag.rule === "MOTOR_STOPPED") {
      score -= 80;
    } else if (flag.severity === "critical") {
      score -= 25;
    } else {
      score -= 10;
    }
  }

  score = clamp(score, 0, 100);

  // ── 13. Classificação final ────────────────────────────────────────────────

  let status: SpectrumStatus;

  const hasMotorStopped = flags.some(flag => flag.rule === "MOTOR_STOPPED");
  const hasCritical = flags.some(flag => flag.severity === "critical");

  if (hasMotorStopped) {
    status = "MOTOR_STOPPED";
  } else if (score < 60 || hasCritical) {
    status = "BAD_SPECTRUM";
  } else if (score < 85 || flags.length > 0) {
    status = "WARNING";
  } else {
    status = "OK";
  }

  return {
    status,
    consistent: status === "OK",
    score,
    flags,
    stats: {
      numberOfReadings: validReadings.length,
      numberOfPoints,

      analyzedNumberOfPoints,
      ignoredStartPoints: THRESHOLDS.ignoredStartPoints,
      ignoredEndPoints: THRESHOLDS.ignoredEndPoints,

      motorStoppedMaxWavelength: THRESHOLDS.motorStoppedMaxWavelength,
      motorStoppedNumberOfPoints,
      motorMeanDivergence,
      motorMaxDivergence,
      motorDerivativeDistance,

      minAbsorbance: globalMin,
      maxAbsorbance: globalMax,

      meanDivergence,
      maxDivergence,

      baselineSpread,
      endSpread,

      aucSpread,

      derivativeDistance,
      derivativeNoise,
      derivativeNoiseSpread,

      curvature,
      curvatureSpread,

      endSpikeRatio,
    },
  };
}

// ─── Exemplo de uso ──────────────────────────────────────────────────────────
// Backend / Node 18+:
//
// const result = await analyzeSpectrum(
//   "https://nira.zeit.com.br/api/v1/analises/espectrosByAnaliseUuid/UUID_DA_ANALISE"
// );
// console.log(result);
//
// Se você já tiver o JSON carregado:
//
// const result = analyzeSpectrumData(apiResponse);
// console.log(result);
