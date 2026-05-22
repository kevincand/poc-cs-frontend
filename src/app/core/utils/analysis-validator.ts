import {
  ANALYSIS_RULES,
  OPERATOR_EXCEPTIONS,
} from '../config/analysis-rules';

export interface ValidationResult {
  hasAlert: boolean;

  invalidFields: string[];
}

export function validateAnalysis(
  analysis: any,
): ValidationResult {
  const grao = analysis.grao;

  const operador = analysis.usuario;

  const rules =
    structuredClone(
      ANALYSIS_RULES[grao] || {},
    );

  const operatorRules =
    OPERATOR_EXCEPTIONS[
      operador as keyof typeof OPERATOR_EXCEPTIONS
    ];

  if (operatorRules?.[grao as keyof typeof operatorRules]) {
    Object.assign(
      rules,
      operatorRules[grao as keyof typeof operatorRules],
    );
  }

  const invalidFields: string[] = [];

  const fields = [
    'proteina',
    'umidade',
    'oleo',
    'cinzas',
    'fibra',
    'densidade',
  ];

  for (const field of fields) {
    const rule =
      rules[field as keyof typeof rules];

    if (!rule) continue;

    const value = analysis[field];

    if (
      rule.min !== undefined &&
      value < rule.min
    ) {
      invalidFields.push(field);

      continue;
    }

    if (
      rule.max !== undefined &&
      value > rule.max
    ) {
      invalidFields.push(field);
    }
  }

  return {
    hasAlert: invalidFields.length > 0,

    invalidFields,
  };
}