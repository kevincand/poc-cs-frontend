export interface Analysis {
  uuid: string;

  nome: string;

  sampleGroup: string;

  criadoEm?: string;

  grao: string;

  usuario: string;

  dataHora: string;

  dispositivo: string;

  proteina: number;

  oleo: number;

  umidade: number;

  cinzas: number;

  fibra: number;

  densidade: number;

  status: 'PENDENTE' | 'ANALISADO' | 'CONFERIDO';

  hasAlert: boolean;

  invalidFields?: string[];

  spectrumScore?: number | null;

  spectrumStatus?: SpectrumStatus | null;
}

export type SpectrumStatus =
  | 'OK'
  | 'WARNING'
  | 'MOTOR_STOPPED'
  | 'BAD_SPECTRUM';