export interface FilterData {
  empresaSet: Empresa[];

  usuarioSet: Usuario[];

  dispositivoNirSet: Dispositivo[];

  tipoNirSet: string[];

  graoSet: string[];
}

export interface Empresa {
  uuid: string;

  nomeFantasia: string;
}

export interface Usuario {
  uuid: string;

  nome: string;
}

export interface Dispositivo {
  id: number;

  numSerie: string;
}