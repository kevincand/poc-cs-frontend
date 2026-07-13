import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { ApiService } from '@/app/core/services/api.service';

import { AuthService } from '@/app/core/services/auth.service';
import { Router } from '@angular/router';

type DailyReport = {
  totalAnalyses: number;

  spectrumOkCount: number;
  spectrumWarningCount: number;
  spectrumBadCount: number;
  motorStoppedCount: number;

  grainSummary: any[];

  repeatedGroups: any[];

  operators: any[];

  insights: string[];

  analyses: any[];
};

@Component({
  selector: 'app-daily-report',

  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
  ],

  templateUrl: './daily-report.component.html',
})
export class DailyReportComponent
  implements OnInit {
  private api = inject(ApiService);

  loading = signal(false);

  report = signal<DailyReport | null>(null);

  filterData = signal<any>(null);

  startDate = signal(new Date().toLocaleDateString('en-CA').slice(0, 10));

  endDate = signal(new Date().toLocaleDateString('en-CA').slice(0, 10));

  selectedUsuarios = signal<string[]>([]);

  selectedGraos = signal<string[]>([]);

  error = '';

  auth = inject(AuthService);

  router = inject(Router)

  graos = [
    'FARELO_SOJA',
    'SOJA',
    'MILHO',
  ];

  ngOnInit() {
    this.loadFilterData();
    this.loadReport();
  }

  loadFilterData() {
    this.api.getFilterData().subscribe({
      next: (response: any) => {
        this.filterData.set(response);
      },
    
    });
  }

  usuariosOrdenados = computed(() =>
    [
      ...(this.filterData()?.usuarioSet ||
        []),
    ].sort((a, b) =>
      a.nome.localeCompare(b.nome),
    ),
  );

  loadReport() {
    this.loading.set(true);

    this.api.getDailyReport({
      startDate: this.startDate(),

      endDate: this.endDate(),

      uuidUsuarios:
        this.selectedUsuarios().join(','),

      grao:
        this.selectedGraos().join(','),
    })
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

  toggleUsuario(uuid: string) {
    const selected =
      this.selectedUsuarios();

    if (selected.includes(uuid)) {
      this.selectedUsuarios.set(
        selected.filter(
          (item) => item !== uuid,
        ),
      );
    } else {
      this.selectedUsuarios.set([
        ...selected,
        uuid,
      ]);
    }
  }

  toggleGrao(grao: string) {
    const selected = this.selectedGraos();

    if (selected.includes(grao)) {
      this.selectedGraos.set(
        selected.filter(
          (item) => item !== grao,
        ),
      );
    } else {
      this.selectedGraos.set([
        ...selected,
        grao,
      ]);
    }
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

  getSpectrumStatusClasses(status: string) {
    switch (status) {
      case 'OK':
        return 'bg-green-50 text-green-700 border-green-300';

      case 'WARNING':
        return 'bg-yellow-50 text-yellow-700 border-yellow-300';

      case 'BAD_SPECTRUM':
        return 'bg-red-50 text-red-700 border-red-300';

      case 'MOTOR_STOPPED':
        return 'bg-orange-50 text-orange-700 border-orange-300';

      default:
        return 'bg-slate-50 text-slate-500 border-slate-300';
    }
  }

  getStatusLabel(status: string) {
    const labels: Record<string, string> = {
      OK: 'OK',
      WARNING: 'Atenção',
      BAD_SPECTRUM: 'Crítico',
      MOTOR_STOPPED: 'Motor parado',
    };

    return labels[status] || '-';
  }
}