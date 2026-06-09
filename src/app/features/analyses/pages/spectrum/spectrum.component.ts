import {
  Component,
  Inject,
  OnInit,
} from '@angular/core';

import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';

import { BaseChartDirective } from 'ng2-charts';

import {
  ChartConfiguration,
  ChartOptions,
} from 'chart.js';

import { CommonModule } from '@angular/common';

type SpectrumStatus =
  | 'OK'
  | 'WARNING'
  | 'MOTOR_STOPPED'
  | 'BAD_SPECTRUM';

interface SpectrumFlag {
  rule: string;

  description: string;

  severity: 'critical' | 'warning' | 'info' | string;

  value?: number;
}

interface SpectrumModalData {
  spectrumResponse: any;

  spectrumAnalysis: {
    score: number;

    status: SpectrumStatus;

    flags?: SpectrumFlag[];

    stats?: Record<string, any>;
  };
}

@Component({
  selector: 'app-spectrum-modal',

  standalone: true,

  imports: [
    CommonModule,
    MatDialogModule,
    BaseChartDirective,
  ],

  templateUrl: './spectrum.component.html',

  styles: [
    `
      .chart-container {
        width: 100%;
        height: 400px;
      }
    `,
  ],
})
export class SpectrumModalComponent implements OnInit {
  public chartData?: ChartConfiguration<'line'>['data'];

  public nomeAnalise = '';

  public spectrumResponse: any;

  public spectrumAnalysis: SpectrumModalData['spectrumAnalysis'];

  public chartOptions: ChartOptions<'line'> = {
    responsive: true,

    maintainAspectRatio: false,

    scales: {
      x: {
        title: {
          display: true,
          text: 'Wavelength (nm)',
        },

        ticks: {
          maxTicksLimit: 8,
        },
      },

      y: {
        title: {
          display: true,
          text: 'Absorbance',
        },
      },
    },

    plugins: {
      legend: {
        display: true,

        position: 'bottom',
      },

      tooltip: {
        mode: 'index',

        intersect: false,
      },
    },

    interaction: {
      mode: 'nearest',

      axis: 'x',

      intersect: false,
    },
  };

  constructor(
    @Inject(MAT_DIALOG_DATA)
    public data: SpectrumModalData,

    private dialogRef: MatDialogRef<SpectrumModalComponent>,
  ) {
    this.spectrumResponse = data.spectrumResponse;

    this.spectrumAnalysis = data.spectrumAnalysis;
  }

  ngOnInit(): void {
    if (!this.spectrumResponse) {
      console.error(
        'spectrumResponse não recebido no modal:',
        this.data,
      );

      return;
    }

    const absorbancias =
      this.spectrumResponse.absorbancias || {};

    const chaves = Object.keys(absorbancias);

    if (chaves.length > 0) {
      this.nomeAnalise = chaves[0].replace(
        /_\d+$/,
        '',
      );
    }

    this.montarGrafico();
  }

  close() {
    this.dialogRef.close();
  }

  montarGrafico(): void {
    const wavelengths =
      this.spectrumResponse?.wavelengths || [];

    const absorbancias =
      this.spectrumResponse?.absorbancias || {};

    const chaves = Object.keys(absorbancias);

    if (!wavelengths.length || !chaves.length) {
      console.error(
        'Dados insuficientes para montar gráfico:',
        {
          wavelengths,
          absorbancias,
        },
      );

      return;
    }

    const labels = wavelengths.map(
      (w: number) => w.toFixed(1),
    );

    const datasets = chaves.map((key) => {
      return {
        label: `Leitura ${key.split('_').pop()}`,

        data: absorbancias[key],

        borderWidth: 1,

        pointRadius: 0,

        tension: 0.1,
      };
    });

    this.chartData = {
      labels,
      datasets,
    };
  }

  get status(): SpectrumStatus {
    return this.spectrumAnalysis?.status;
  }

  get score() {
    return this.spectrumAnalysis?.score;
  }

  get flags(): SpectrumFlag[] {
    return this.spectrumAnalysis?.flags || [];
  }

  get stats() {
    return this.spectrumAnalysis?.stats || {};
  }

  formatFlag(flag: any) {
    if (!flag) {
      return '-';
    }

    if (typeof flag === 'string') {
      return flag;
    }

    if (flag.message) {
      return flag.message;
    }

    if (flag.label) {
      return flag.label;
    }

    if (flag.type) {
      return this.getFlagLabel(flag.type);
    }

    if (flag.name) {
      return flag.name;
    }

    return JSON.stringify(flag);
  }

  getFlagLabel(type: string) {
    const labels: Record<string, string> = {
      MOTOR_STOPPED: 'Motor parado',
      BAD_SPECTRUM: 'Espectro ruim',
      WARNING: 'Atenção',
      HIGH_DIVERGENCE: 'Alta divergência',
      BASELINE_SPREAD: 'Variação de baseline',
      DERIVATIVE_NOISE: 'Ruído na derivada',
      END_SPIKE: 'Pico nas extremidades',
      AUC_SPREAD: 'Variação de área',
    };

    return labels[type] || type;
  }

  getStatsEntries() {
    return Object.entries(this.stats);
  }

  getStatusLabel(status: SpectrumStatus) {
    switch (status) {
      case 'OK':
        return 'Espectro OK';

      case 'WARNING':
        return 'Atenção';

      case 'MOTOR_STOPPED':
        return 'Motor parado';

      case 'BAD_SPECTRUM':
        return 'Espectro ruim';

      default:
        return 'Não analisado';
    }
  }

  getStatusDescription(status: SpectrumStatus) {
    switch (status) {
      case 'OK':
        return 'A leitura apresenta comportamento dentro do esperado.';

      case 'WARNING':
        return 'A leitura possui pequenas variações e merece atenção.';

      case 'MOTOR_STOPPED':
        return 'As replicatas indicam possível motor parado.';

      case 'BAD_SPECTRUM':
        return 'A leitura apresenta inconsistências relevantes. Recomenda-se refazer.';

      default:
        return 'Sem análise disponível.';
    }
  }

  getStatusClasses(status: SpectrumStatus) {
    switch (status) {
      case 'OK':
        return 'bg-green-50 border-green-300 text-green-700';

      case 'WARNING':
        return 'bg-yellow-50 border-yellow-300 text-yellow-700';

      case 'MOTOR_STOPPED':
        return 'bg-orange-50 border-orange-300 text-orange-700';

      case 'BAD_SPECTRUM':
        return 'bg-red-50 border-red-300 text-red-700';

      default:
        return 'bg-slate-50 border-slate-300 text-slate-500';
    }
  }

  getScoreBarClasses(status: SpectrumStatus) {
    switch (status) {
      case 'OK':
        return 'bg-green-500';

      case 'WARNING':
        return 'bg-yellow-500';

      case 'MOTOR_STOPPED':
        return 'bg-orange-500';

      case 'BAD_SPECTRUM':
        return 'bg-red-500';

      default:
        return 'bg-slate-400';
    }
  }

  getSeverityLabel(severity?: string) {
    const labels: Record<string, string> = {
      critical: 'Crítico',
      warning: 'Atenção',
      info: 'Info',
    };

    return labels[severity || ''] || severity || '-';
  }

  getSeverityClasses(severity?: string) {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-700 border-red-200';

      case 'warning':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';

      case 'info':
        return 'bg-blue-100 text-blue-700 border-blue-200';

      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  }

  formatFlagValue(value: unknown) {
    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return '-';
    }

    if (typeof value !== 'number') {
      return String(value);
    }

    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  }

  getScoreWidth() {
    const score = this.score ?? 0;

    if (score < 0) {
      return '0%';
    }

    if (score > 100) {
      return '100%';
    }

    return `${score}%`;
  }

  formatNumber(value: unknown) {
    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return '-';
    }

    if (typeof value !== 'number') {
      return String(value);
    }

    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  }

  getStatLabel(key: string) {
    const labels: Record<string, string> = {
      analyzedNumberOfPoints:
        'Pontos analisados',

      ignoredStartPoints:
        'Pontos ignorados no início',

      ignoredEndPoints:
        'Pontos ignorados no fim',

      minAbsorbance:
        'Absorbância mínima',

      maxAbsorbance:
        'Absorbância máxima',

      meanDivergence:
        'Divergência média',

      maxDivergence:
        'Divergência máxima',

      baselineSpread:
        'Variação de baseline',

      curvature:
        'Curvatura',

      curvatureSpread:
        'Variação da curvatura',

      derivativeNoise:
        'Ruído da derivada',

      derivativeNoiseSpread:
        'Variação do ruído',

      derivativeDistance:
        'Distância da derivada',

      motorDerivativeDistance:
        'Distância motor/derivada',

      endSpread:
        'Variação nas extremidades',

      endSpikeRatio:
        'Pico nas extremidades',

      aucSpread:
        'Variação da área',
    };

    return labels[key] || key;
  }

  getMainStats() {
    return [
      {
        label: 'Pontos analisados',
        value:
          this.stats[
          'analyzedNumberOfPoints'
          ],
      },

      {
        label: 'Divergência média',
        value:
          this.stats[
          'meanDivergence'
          ],
      },

      {
        label: 'Divergência máxima',
        value:
          this.stats[
          'maxDivergence'
          ],
      },

      {
        label: 'Ruído da derivada',
        value:
          this.stats[
          'derivativeNoise'
          ],
      },
    ];
  }
}