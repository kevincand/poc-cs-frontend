export interface Analysis {
  uuid: string;

  nome: string;

  sampleGroup: string;

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
}