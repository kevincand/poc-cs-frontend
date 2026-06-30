import type {
  AnalysisFlag,
  SpectralAnalysisResult,
  SpectralApiResponse,
  SpectrumStatus,
} from './spectral.analysis';

// ─────────────────────────────────────────────────────────────────────────────
// spectral.soybean.analysis.ts
// Algoritmo separado para análise de qualidade de espectros NIR de SOJA INTEIRA.
//
// Diferença principal para o farelo de soja:
// - Soja inteira tem maior variação natural entre leituras/replicatas.
// - O ponto de partida pode ser mais separado entre leituras.
// - O final do espectro também pode abrir mais.
// - A absorbância normal pode iniciar perto de 0.40 e chegar perto de 0.80.
// - Até 1.10 pode ocorrer sem ser necessariamente erro crítico.
// - Acima de 1.10 vira alerta; acima de 1.25 vira crítico.
// ─────────────────────────────────────────────────────────────────────────────

export const SOJA_THRESHOLDS = {
  // ─── Faixa absoluta de absorbância ─────────────────────────────────────────
  // Mantendo o teto mais baixo para evitar leituras ruidosas que passem despercebidas
  absMinCritical: 0.25, // Subi um pouco o piso para filtrar ruído de fundo logo de cara
  startExpectedWarning: 0.35,
  startNormalExpected: 0.45,
  absMaxIdeal: 0.75,   // Mais restritivo: o pico ideal agora é menor
  absMaxWarning: 1.0,  // Mais restritivo: alerta dispara mais cedo
  absMaxCritical: 1.15, // Mais restritivo: corte mais cedo

  // ─── Divergência entre replicatas ──────────────────────────────────────────
  // Reduzi os limites para obrigar que as replicatas sejam muito parecidas
  meanStdDevWarning: 0.04,
  meanStdDevCritical: 0.06,

  maxPointRangeWarning: 0.15,
  maxPointRangeCritical: 0.25,

  // ─── Baseline e final ──────────────────────────────────────────────────────
  // Reduzi a margem de manobra: flutuações de base agora são punidas mais rápido
  baselineSpreadWarning: 0.12,
  baselineSpreadCritical: 0.20,

  endSpreadWarning: 0.15,
  endSpreadCritical: 0.25,

  // ─── Área sob curva ────────────────────────────────────────────────────────
  aucSpreadWarning: 0.15,
  aucSpreadCritical: 0.25,

  // ─── Derivadas / ruído ─────────────────────────────────────────────────────
  // Tornei o sistema mais sensível a "pontas" e variações abruptas
  derivativeNoiseWarning: 0.0020,
  derivativeNoiseCritical: 0.0040,

  derivativeNoiseSpreadWarning: 0.0010,
  derivativeNoiseSpreadCritical: 0.0020,

  curvatureWarning: 0.00030,
  curvatureCritical: 0.00060,

  curvatureSpreadWarning: 0.00015,
  curvatureSpreadCritical: 0.00040,

  endSpikeRatioWarning: 3.0,
  endSpikeRatioCritical: 5.0,

  // ─── Motor parado ──────────────────────────────────────────────────────────
  motorStoppedMeanDivergence: 0.002, // Mais restritivo
  motorStoppedMaxDivergence: 0.010,  // Mais restritivo
  derivativeDistanceMotorStopped: 0.0010,

  // ─── Recortes e janelas ────────────────────────────────────────────────────
  ignoredStartPoints: 19,
  ignoredEndPoints: 19,
  motorStoppedMaxWavelength: 1420,

  baselineWindowSize: 10,
  endWindowSize: 15,
  endDerivativeWindowSize: 20,
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
    arr.reduce((sum, value) => sum + (value - m) ** 2, 0) / arr.length,
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

  return Math.sqrt(sum / size);
}

function cropUsefulSpectrum(
  wavelengths: number[],
  readings: number[][],
  ignoredStartPoints: number,
  ignoredEndPoints: number,
): {
  wavelengths: number[];
  readings: number[][];
  startIndex: number;
  endIndexExclusive: number;
} {
  const startIndex = Math.max(0, ignoredStartPoints);

  const endIndexExclusive = Math.max(
    startIndex,
    wavelengths.length - Math.max(0, ignoredEndPoints),
  );

  return {
    wavelengths: wavelengths.slice(startIndex, endIndexExclusive),
    readings: readings.map((reading) =>
      reading.slice(startIndex, endIndexExclusive),
    ),
    startIndex,
    endIndexExclusive,
  };
}

function cropSpectrumByMaxWavelength(
  wavelengths: number[],
  readings: number[][],
  maxWavelength: number,
): {
  wavelengths: number[];
  readings: number[][];
} {
  let endIndexExclusive = wavelengths.findIndex(
    (wavelength) => wavelength > maxWavelength,
  );

  if (endIndexExclusive === -1) {
    endIndexExclusive = wavelengths.length;
  }

  return {
    wavelengths: wavelengths.slice(0, endIndexExclusive),
    readings: readings.map((reading) => reading.slice(0, endIndexExclusive)),
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
    const valuesAtPoint = readings.map((reading) => reading[i]);

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

function calculateDerivativeDistance(
  readings: number[][],
  wavelengths: number[],
): number {
  const smoothedReadings = readings.map(savitzkyGolaySmooth);

  const firstDerivatives = smoothedReadings.map((reading) =>
    firstDerivative(reading, wavelengths),
  );

  const derivativeDistances: number[] = [];

  for (let i = 0; i < firstDerivatives.length; i++) {
    for (let j = i + 1; j < firstDerivatives.length; j++) {
      derivativeDistances.push(
        euclideanDistance(firstDerivatives[i], firstDerivatives[j]),
      );
    }
  }

  return mean(derivativeDistances);
}

// ─── Análise principal para soja inteira ─────────────────────────────────────

export function analyzeSoybeanSpectrumData(
  data: SpectralApiResponse,
): SpectralAnalysisResult {
  const thresholds = SOJA_THRESHOLDS;

  const wavelengths = data.wavelengths;
  const readings = Object.values(data.absorbancias ?? {});
  const numberOfPoints = wavelengths.length;
  const flags: AnalysisFlag[] = [];

  if (!numberOfPoints) {
    throw new Error('Nenhum comprimento de onda encontrado no espectro.');
  }

  if (!readings.length) {
    throw new Error('Nenhuma leitura de absorbância encontrada no espectro.');
  }

  // ── 1. Validação de tamanho das leituras ───────────────────────────────────

  const validReadings = readings.filter(
    (reading) => reading.length === numberOfPoints,
  );

  if (validReadings.length !== readings.length) {
    flags.push({
      rule: 'LENGTH_MISMATCH',
      description: `${
        readings.length - validReadings.length
      } leitura(s) com número de pontos diferente do esperado (${numberOfPoints}).`,
      severity: 'critical',
    });
  }

  if (!validReadings.length) {
    throw new Error(
      'Nenhuma leitura válida com o mesmo número de pontos dos wavelengths.',
    );
  }

  // ── 2. Recorte útil do espectro ────────────────────────────────────────────

  const usefulSpectrum = cropUsefulSpectrum(
    wavelengths,
    validReadings,
    thresholds.ignoredStartPoints,
    thresholds.ignoredEndPoints,
  );

  const analyzedWavelengths = usefulSpectrum.wavelengths;
  const analyzedReadings = usefulSpectrum.readings;
  const analyzedNumberOfPoints = analyzedWavelengths.length;

  if (!analyzedNumberOfPoints) {
    throw new Error('Nenhum ponto restante após recorte do espectro útil.');
  }

  // ── 3. Faixa absoluta de absorbância ───────────────────────────────────────

  const allValues = analyzedReadings.flat();
  const globalMin = safeMin(allValues);
  const globalMax = safeMax(allValues);

  if (globalMin < thresholds.absMinCritical) {
    flags.push({
      rule: 'SOY_ABS_TOO_LOW',
      description: `Absorbância mínima ${globalMin.toFixed(
        4,
      )} está abaixo do limite crítico para soja inteira (${thresholds.absMinCritical}).`,
      severity: 'critical',
      value: globalMin,
    });
  }

  if (globalMax > thresholds.absMaxCritical) {
    flags.push({
      rule: 'SOY_ABS_TOO_HIGH_CRITICAL',
      description: `Absorbância máxima ${globalMax.toFixed(
        4,
      )} ultrapassa o limite crítico para soja inteira (${thresholds.absMaxCritical}).`,
      severity: 'critical',
      value: globalMax,
    });
  } else if (globalMax > thresholds.absMaxWarning) {
    flags.push({
      rule: 'SOY_ABS_TOO_HIGH_WARNING',
      description: `Absorbância máxima ${globalMax.toFixed(
        4,
      )} ultrapassa o limite de alerta para soja inteira (${thresholds.absMaxWarning}).`,
      severity: 'warning',
      value: globalMax,
    });
  }

  // ── 4. Ponto de partida das leituras ───────────────────────────────────────

  const baselineWindowSize = Math.min(
    thresholds.baselineWindowSize,
    analyzedNumberOfPoints,
  );

  const startMeans = analyzedReadings.map((reading) =>
    mean(reading.slice(0, baselineWindowSize)),
  );

  const minStartMean = safeMin(startMeans);
  const maxStartMean = safeMax(startMeans);
  const baselineSpread = range(startMeans);

  if (minStartMean < thresholds.absMinCritical) {
    flags.push({
      rule: 'SOY_START_TOO_LOW_CRITICAL',
      description: `Média inicial mínima ${minStartMean.toFixed(
        4,
      )} ficou abaixo de ${thresholds.absMinCritical}. Pode indicar sinal baixo ou falha na leitura.`,
      severity: 'critical',
      value: minStartMean,
    });
  } else if (minStartMean < thresholds.startExpectedWarning) {
    flags.push({
      rule: 'SOY_START_LOW_WARNING',
      description: `Média inicial mínima ${minStartMean.toFixed(
        4,
      )} ficou abaixo do esperado para soja inteira. O normal é iniciar próximo de ${thresholds.startNormalExpected}.`,
      severity: 'warning',
      value: minStartMean,
    });
  }

  // ── 5. Divergência ponto a ponto entre replicatas ──────────────────────────

  const mainDivergence = calculatePointwiseDivergence(analyzedReadings);
  const meanDivergence = mainDivergence.meanDivergence;
  const maxDivergence = mainDivergence.maxDivergence;

  if (meanDivergence >= thresholds.meanStdDevCritical) {
    flags.push({
      rule: 'SOY_HIGH_MEAN_DIVERGENCE',
      description: `Desvio padrão médio entre leituras ${meanDivergence.toFixed(
        5,
      )} excede limite crítico para soja inteira (${thresholds.meanStdDevCritical}).`,
      severity: 'critical',
      value: meanDivergence,
    });
  } else if (meanDivergence >= thresholds.meanStdDevWarning) {
    flags.push({
      rule: 'SOY_MODERATE_MEAN_DIVERGENCE',
      description: `Desvio padrão médio entre leituras ${meanDivergence.toFixed(
        5,
      )} excede limite de alerta para soja inteira (${thresholds.meanStdDevWarning}).`,
      severity: 'warning',
      value: meanDivergence,
    });
  }

  if (maxDivergence >= thresholds.maxPointRangeCritical) {
    flags.push({
      rule: 'SOY_HIGH_POINT_RANGE',
      description: `Range máximo pontual ${maxDivergence.toFixed(
        4,
      )} entre leituras excede limite crítico para soja inteira (${thresholds.maxPointRangeCritical}).`,
      severity: 'critical',
      value: maxDivergence,
    });
  } else if (maxDivergence >= thresholds.maxPointRangeWarning) {
    flags.push({
      rule: 'SOY_MODERATE_POINT_RANGE',
      description: `Range máximo pontual ${maxDivergence.toFixed(
        4,
      )} entre leituras excede limite de alerta para soja inteira (${thresholds.maxPointRangeWarning}).`,
      severity: 'warning',
      value: maxDivergence,
    });
  }

  // ── 6. Spread no início e no final ─────────────────────────────────────────

  if (baselineSpread >= thresholds.baselineSpreadCritical) {
    flags.push({
      rule: 'SOY_BASELINE_SPREAD_CRITICAL',
      description: `Spread inicial ${baselineSpread.toFixed(
        4,
      )} excede limite crítico. As leituras começaram muito separadas.`,
      severity: 'critical',
      value: baselineSpread,
    });
  } else if (baselineSpread >= thresholds.baselineSpreadWarning) {
    flags.push({
      rule: 'SOY_BASELINE_SPREAD_WARNING',
      description: `Spread inicial ${baselineSpread.toFixed(
        4,
      )} excede limite de alerta. Em soja inteira alguma abertura é normal, mas esta merece atenção.`,
      severity: 'warning',
      value: baselineSpread,
    });
  }

  const endWindowSize = Math.min(
    thresholds.endWindowSize,
    analyzedNumberOfPoints,
  );

  const endMeans = analyzedReadings.map((reading) =>
    mean(reading.slice(-endWindowSize)),
  );

  const minEndMean = safeMin(endMeans);
  const maxEndMean = safeMax(endMeans);
  const endSpread = range(endMeans);

  if (maxEndMean > thresholds.absMaxCritical) {
    flags.push({
      rule: 'SOY_END_TOO_HIGH_CRITICAL',
      description: `Média final máxima ${maxEndMean.toFixed(
        4,
      )} ultrapassou o limite crítico (${thresholds.absMaxCritical}).`,
      severity: 'critical',
      value: maxEndMean,
    });
  } else if (maxEndMean > thresholds.absMaxWarning) {
    flags.push({
      rule: 'SOY_END_TOO_HIGH_WARNING',
      description: `Média final máxima ${maxEndMean.toFixed(
        4,
      )} passou de ${thresholds.absMaxWarning}. Pode indicar variação elevada no final do espectro.`,
      severity: 'warning',
      value: maxEndMean,
    });
  }

  if (endSpread >= thresholds.endSpreadCritical) {
    flags.push({
      rule: 'SOY_END_SPREAD_CRITICAL',
      description: `Spread final ${endSpread.toFixed(
        4,
      )} excede limite crítico. As leituras terminaram muito separadas.`,
      severity: 'critical',
      value: endSpread,
    });
  } else if (endSpread >= thresholds.endSpreadWarning) {
    flags.push({
      rule: 'SOY_END_SPREAD_WARNING',
      description: `Spread final ${endSpread.toFixed(
        4,
      )} excede limite de alerta para soja inteira.`,
      severity: 'warning',
      value: endSpread,
    });
  }

  // ── 7. Área sob curva ──────────────────────────────────────────────────────

  const areas = analyzedReadings.map((reading) =>
    reading.reduce((sum, value) => sum + value, 0),
  );

  const aucSpread = mean(areas) !== 0 ? range(areas) / mean(areas) : 0;

  if (aucSpread >= thresholds.aucSpreadCritical) {
    flags.push({
      rule: 'SOY_AUC_SPREAD_CRITICAL',
      description: `Diferença crítica de área entre replicatas: ${(
        aucSpread * 100
      ).toFixed(2)}%.`,
      severity: 'critical',
      value: aucSpread,
    });
  } else if (aucSpread >= thresholds.aucSpreadWarning) {
    flags.push({
      rule: 'SOY_AUC_SPREAD_WARNING',
      description: `Diferença elevada de área entre replicatas: ${(
        aucSpread * 100
      ).toFixed(2)}%.`,
      severity: 'warning',
      value: aucSpread,
    });
  }

  // ── 8. Suavização e derivadas ──────────────────────────────────────────────

  const smoothedReadings = analyzedReadings.map(savitzkyGolaySmooth);

  const firstDerivatives = smoothedReadings.map((reading) =>
    firstDerivative(reading, analyzedWavelengths),
  );

  const secondDerivatives = smoothedReadings.map((reading) =>
    secondDerivative(reading, analyzedWavelengths),
  );

  const derivativeDistances: number[] = [];

  for (let i = 0; i < firstDerivatives.length; i++) {
    for (let j = i + 1; j < firstDerivatives.length; j++) {
      derivativeDistances.push(
        euclideanDistance(firstDerivatives[i], firstDerivatives[j]),
      );
    }
  }

  const derivativeDistance = mean(derivativeDistances);

  // ── 9. Motor parado ────────────────────────────────────────────────────────

  const motorSpectrum = cropSpectrumByMaxWavelength(
    analyzedWavelengths,
    analyzedReadings,
    thresholds.motorStoppedMaxWavelength,
  );

  const motorWavelengths = motorSpectrum.wavelengths;
  const motorReadings = motorSpectrum.readings;
  const motorStoppedNumberOfPoints = motorWavelengths.length;

  const motorDivergence = calculatePointwiseDivergence(motorReadings);
  const motorMeanDivergence = motorDivergence.meanDivergence;
  const motorMaxDivergence = motorDivergence.maxDivergence;

  const motorDerivativeDistance = calculateDerivativeDistance(
    motorReadings,
    motorWavelengths,
  );

  if (
    motorStoppedNumberOfPoints > 0 &&
    motorMeanDivergence < thresholds.motorStoppedMeanDivergence &&
    motorMaxDivergence < thresholds.motorStoppedMaxDivergence &&
    motorDerivativeDistance < thresholds.derivativeDistanceMotorStopped
  ) {
    flags.push({
      rule: 'MOTOR_STOPPED',
      description:
        `Replicatas excessivamente semelhantes até ${thresholds.motorStoppedMaxWavelength} nm. Possível motor parado ou ausência de rotação da amostra. ` +
        `motorMeanDivergence=${motorMeanDivergence.toFixed(5)}, ` +
        `motorMaxDivergence=${motorMaxDivergence.toFixed(5)}, ` +
        `motorDerivativeDistance=${motorDerivativeDistance.toFixed(6)}.`,
      severity: 'critical',
      value: motorDerivativeDistance,
    });
  }

  // ── 10. Ruído da derivada ──────────────────────────────────────────────────

  const derivativeNoises = firstDerivatives.map(absoluteMean);
  const derivativeNoise = mean(derivativeNoises);
  const derivativeNoiseSpread = range(derivativeNoises);

  if (derivativeNoise >= thresholds.derivativeNoiseCritical) {
    flags.push({
      rule: 'SOY_DERIVATIVE_NOISE_CRITICAL',
      description: `Ruído crítico na primeira derivada: ${derivativeNoise.toFixed(
        6,
      )}.`,
      severity: 'critical',
      value: derivativeNoise,
    });
  } else if (derivativeNoise >= thresholds.derivativeNoiseWarning) {
    flags.push({
      rule: 'SOY_DERIVATIVE_NOISE_WARNING',
      description: `Ruído elevado na primeira derivada: ${derivativeNoise.toFixed(
        6,
      )}.`,
      severity: 'warning',
      value: derivativeNoise,
    });
  }

  if (derivativeNoiseSpread >= thresholds.derivativeNoiseSpreadCritical) {
    flags.push({
      rule: 'SOY_DERIVATIVE_NOISE_SPREAD_CRITICAL',
      description: `Diferença crítica de ruído da derivada entre replicatas: ${derivativeNoiseSpread.toFixed(
        6,
      )}.`,
      severity: 'critical',
      value: derivativeNoiseSpread,
    });
  } else if (derivativeNoiseSpread >= thresholds.derivativeNoiseSpreadWarning) {
    flags.push({
      rule: 'SOY_DERIVATIVE_NOISE_SPREAD_WARNING',
      description: `Diferença elevada de ruído da derivada entre replicatas: ${derivativeNoiseSpread.toFixed(
        6,
      )}.`,
      severity: 'warning',
      value: derivativeNoiseSpread,
    });
  }

  // ── 11. Curvatura ──────────────────────────────────────────────────────────

  const curvatures = secondDerivatives.map(absoluteMean);
  const curvature = mean(curvatures);
  const curvatureSpread = range(curvatures);

  if (curvature >= thresholds.curvatureCritical) {
    flags.push({
      rule: 'SOY_CURVATURE_CRITICAL',
      description: `Curvatura crítica na segunda derivada: ${curvature.toFixed(
        6,
      )}.`,
      severity: 'critical',
      value: curvature,
    });
  } else if (curvature >= thresholds.curvatureWarning) {
    flags.push({
      rule: 'SOY_CURVATURE_WARNING',
      description: `Curvatura elevada na segunda derivada: ${curvature.toFixed(
        6,
      )}.`,
      severity: 'warning',
      value: curvature,
    });
  }

  if (curvatureSpread >= thresholds.curvatureSpreadCritical) {
    flags.push({
      rule: 'SOY_CURVATURE_SPREAD_CRITICAL',
      description: `Diferença crítica de curvatura entre replicatas: ${curvatureSpread.toFixed(
        6,
      )}.`,
      severity: 'critical',
      value: curvatureSpread,
    });
  } else if (curvatureSpread >= thresholds.curvatureSpreadWarning) {
    flags.push({
      rule: 'SOY_CURVATURE_SPREAD_WARNING',
      description: `Diferença elevada de curvatura entre replicatas: ${curvatureSpread.toFixed(
        6,
      )}.`,
      severity: 'warning',
      value: curvatureSpread,
    });
  }

  // ── 12. Spike no final ─────────────────────────────────────────────────────

  const endDerivativeWindowSize = Math.min(
    thresholds.endDerivativeWindowSize,
    firstDerivatives[0]?.length ?? 0,
  );

  const endSpikeRatios = firstDerivatives.map((derivative) => {
    const globalDerivativeMean = absoluteMean(derivative);
    const endDerivativeMean = absoluteMean(
      derivative.slice(-endDerivativeWindowSize),
    );

    if (globalDerivativeMean === 0) return 0;

    return endDerivativeMean / globalDerivativeMean;
  });

  const endSpikeRatio = safeMax(endSpikeRatios);

  if (endSpikeRatio >= thresholds.endSpikeRatioCritical) {
    flags.push({
      rule: 'SOY_END_SPIKE_CRITICAL',
      description: `Spike crítico no final do espectro. Razão final/global = ${endSpikeRatio.toFixed(
        2,
      )}.`,
      severity: 'critical',
      value: endSpikeRatio,
    });
  } else if (endSpikeRatio >= thresholds.endSpikeRatioWarning) {
    flags.push({
      rule: 'SOY_END_SPIKE_WARNING',
      description: `Possível spike no final do espectro. Razão final/global = ${endSpikeRatio.toFixed(
        2,
      )}.`,
      severity: 'warning',
      value: endSpikeRatio,
    });
  }

  // ── 13. Score próprio da soja inteira ──────────────────────────────────────

  let score = 100;

  for (const flag of flags) {
    if (flag.rule === 'MOTOR_STOPPED') {
      score -= 80;
      continue;
    }

    if (flag.rule === 'LENGTH_MISMATCH') {
      score -= 40;
      continue;
    }

    if (flag.rule === 'SOY_ABS_TOO_HIGH_CRITICAL') {
      score -= 35;
      continue;
    }

    if (
      flag.rule === 'SOY_HIGH_MEAN_DIVERGENCE' ||
      flag.rule === 'SOY_HIGH_POINT_RANGE'
    ) {
      score -= 30;
      continue;
    }

    if (flag.severity === 'critical') {
      score -= 20;
      continue;
    }

    if (
      flag.rule === 'SOY_ABS_TOO_HIGH_WARNING' ||
      flag.rule === 'SOY_END_TOO_HIGH_WARNING'
    ) {
      score -= 10;
      continue;
    }

    if (flag.severity === 'warning') {
      score -= 6;
      continue;
    }
  }

  score = clamp(score, 0, 100);

  // ── 14. Status final ───────────────────────────────────────────────────────

  const hasMotorStopped = flags.some((flag) => flag.rule === 'MOTOR_STOPPED');
  const hasCritical = flags.some((flag) => flag.severity === 'critical');

  let status: SpectrumStatus;

  if (hasMotorStopped) {
    status = 'MOTOR_STOPPED';
  } else if (score < 60 || hasCritical) {
    status = 'BAD_SPECTRUM';
  } else if (score < 85 || flags.length > 0) {
    status = 'WARNING';
  } else {
    status = 'OK';
  }

  return {
    status,
    consistent: status === 'OK',
    score,
    flags,
    stats: {
      numberOfReadings: validReadings.length,
      numberOfPoints,

      analyzedNumberOfPoints,
      ignoredStartPoints: thresholds.ignoredStartPoints,
      ignoredEndPoints: thresholds.ignoredEndPoints,

      motorStoppedMaxWavelength: thresholds.motorStoppedMaxWavelength,
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
