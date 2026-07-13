import {
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';

import { CommonModule } from '@angular/common';

import { ApiService } from '@/app/core/services/api.service';

import { AuthService } from '@/app/core/services/auth.service';

import { Router } from '@angular/router';

type SpectrumReportItem = {
  uuid: string;
  amostra: string;
  grao: string;
  criadoEm: string;
  operacao: string;
  placa: string;
  proteina: number | null;
  oleo: number | null;
  umidade: number | null;
  score: number;
  spectrumStatus: string;
  flagsCount: number;
  criticalFlags: number;
  warningFlags: number;
  flags: any[];
};

type SpectrumHourlyReport = {
  id: string;
  periodStart: string;
  periodEnd: string;
  executedAt: string;
  totalInRange: number;
  totalPending: number;
  totalAnalyzed: number;
  totalReported: number;
  items: SpectrumReportItem[];
  reportedItems: string[];
  message?: string | null;
};

@Component({
  selector: 'app-spectrum-report',

  standalone: true,

  imports: [CommonModule],

  templateUrl: './spectrum.report.component.html',
})
export class SpectrumReportComponent
  implements OnInit, OnDestroy
{
  private api = inject(ApiService);

  report = signal<SpectrumHourlyReport | null>(
    null,
  );

  loading = signal(false);

  error = '';
  
  auth = inject(AuthService);
  
  router = inject(Router)

  private intervalId?: number;

  ngOnInit() {
    this.loadReport();

    this.intervalId = window.setInterval(
      () => {
        this.loadReport(false);
      },
      60000,
    );
  }

  ngOnDestroy() {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
    }
  }

  loadReport(showLoading = true) {
    if (showLoading) {
      this.loading.set(true);
    }

    this.api
      .getLatestSpectrumReport()
      .subscribe({
        next: (response: any) => {
          this.report.set(response);
        },

        complete: () => {
          this.loading.set(false);
        },
        error: (res) => {
            if(res.status === 403 || res.status === 401) {
              this.error = 'Sessão encerrada. Faça login novamente.';
              this.loading.set(false);
              console.error(this.error)
              this.auth.logout();
              this.router.navigate(['/login']);
            } else {
              this.error =
                'Erro ao carregar relatório. Tente novamente.';
                console.error(this.error)
              this.loading.set(false);
            }
          },
      });
  }

  getStatusLabel(status: string) {
    const labels: Record<string, string> = {
      OK: 'OK',
      WARNING: 'Atenção',
      MOTOR_STOPPED: 'Motor parado',
      BAD_SPECTRUM: 'Espectro ruim',
    };

    return labels[status] || status || '-';
  }

  getStatusClasses(status: string) {
    switch (status) {
      case 'OK':
        return 'bg-green-50 text-green-700 border-green-300';

      case 'WARNING':
        return 'bg-yellow-50 text-yellow-700 border-yellow-300';

      case 'MOTOR_STOPPED':
        return 'bg-orange-50 text-orange-700 border-orange-300';

      case 'BAD_SPECTRUM':
        return 'bg-red-50 text-red-700 border-red-300';

      default:
        return 'bg-slate-50 text-slate-500 border-slate-300';
    }
  }

  getScoreClasses(score: number) {
    if (score < 50) {
      return 'text-red-700';
    }

    if (score < 85) {
      return 'text-yellow-700';
    }

    return 'text-green-700';
  }

  formatNumber(value: number | null) {
    if (
      value === null ||
      value === undefined
    ) {
      return '-';
    }

    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  criticalItems() {
    return (
      this.report()?.items.filter(
        (item) =>
          item.score < 50 ||
          item.spectrumStatus ===
            'MOTOR_STOPPED',
      ) || []
    );
  }
}