export interface RuleRange {
  min?: number;

  max?: number;
}

export interface AnalysisRules {
  proteina?: RuleRange;

  umidade?: RuleRange;

  oleo?: RuleRange;

  cinzas?: RuleRange;

  fibra?: RuleRange;

  densidade?: RuleRange;
}

export const ANALYSIS_RULES: Record<
  string,
  AnalysisRules
> = {
  FARELO_SOJA: {
    proteina: {
      min: 45,
      max: 47,
    },

    umidade: {
      max: 12.5,
    },

    oleo: {
      min: 1,
      max: 2.5,
    },

    cinzas: {
      min: 0,
      max: 6.5,
    },

    fibra: {
      min: 0,
      max: 7,
    },

    densidade: {
      min: 0,
      max: 1,
    },
  },

  SOJA: {
    proteina: {
      min: 34,
      max: 37.25,
    },

    oleo: {
      min: 21.9,
      max: 23,
    },
  },

  MILHO: {},
};
export const OPERATOR_EXCEPTIONS = {
  'Operação BTG Alto Araguaia': {
    FARELO_SOJA: {
      proteina: {
        min: 47,
        max: 49,
      },
    },
  },

  'Operação CTA Imbituba': {
    FARELO_SOJA: {
      umidade: {
        max: 13,
      },
    },
  },
};