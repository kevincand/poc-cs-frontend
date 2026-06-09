import {
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';

import { CommonModule } from '@angular/common';

import { ApiService } from '@/app/core/services/api.service';

import { Analysis } from '@/app/core/models/analisys.model';

import { AuthService } from '@/app/core/services/auth.service';

import { FormsModule } from '@angular/forms';

import { FilterData } from '@/app/core/models/filter-data.model';

import {
  validateAnalysis,
} from '@/app/core/utils/analysis-validator';

import { Router } from '@angular/router';

import {
  LucideAngularModule,
  Clipboard,
  Check,
  ChartSpline
} from 'lucide-angular';

import {
  NgSelectModule,
} from '@ng-select/ng-select';

import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { SpectrumModalComponent } from '../spectrum/spectrum.component';
import { analyzeSpectrumData, SpectralApiResponse } from '../spectrum/spectral.analysis';

@Component({
  selector: 'app-dashboard',

  standalone: true,

  imports: [CommonModule, FormsModule, LucideAngularModule, NgSelectModule, MatButtonModule],

  templateUrl: './dashboard.component.html',
})

export class DashboardComponent {
  api = inject(ApiService);

  auth = inject(AuthService);

  analyses = signal<Analysis[]>([]);

  loading = signal(false);

  selectedGroup = signal<string | null>(null);

  error = '';

  pendingCount = computed(
    () =>
      this.analyses().filter(
        (a) => a.status === 'PENDENTE',
      ).length,
  );
  currentPage = signal(0);

  pageSize = signal(100);

  totalPages = signal(0);

  startDate = signal('');

  endDate = signal('');

  Clipboard = Clipboard;

  Check = Check;
  
  ChartSpline = ChartSpline;

  dialog = inject(MatDialog);

  analyzedCount = computed(
    () =>
      this.analyses().filter(
        (a) => a.status === 'ANALISADO',
      ).length,
  );

  checkedCount = computed(
    () =>
      this.analyses().filter(
        (a) => a.status === 'CONFERIDO',
      ).length,
  );

  filteredAnalyses = computed(() => {
    let data = this.analyses();

    if (this.selectedGroup()) {
      data = data.filter(
        (a) =>
          a.sampleGroup ===
          this.selectedGroup(),
      );
    }

    if (this.selectedStatus().join(',') !== '') {
      data = data.filter(
        (a) =>
          a.status ===
          this.selectedStatus().join(','),
      );
    }

    return data;
  });
  router = inject(Router);
  copiedAnalysis = signal<string | null>(null);

  isInvalid(
    analysis: any,
    field: string,
  ) {
    return analysis.invalidFields?.includes(
      field,
    );
  }    

  empresasOrdenadas = computed(() =>
  [...(this.filterData()?.empresaSet || [])]
    .sort((a, b) =>
      a.nomeFantasia.localeCompare(
        b.nomeFantasia,
      ),
    ),
);

usuariosOrdenados = computed(() =>
  [...(this.filterData()?.usuarioSet || [])]
    .sort((a, b) =>
      a.nome.localeCompare(b.nome),
    ),
);

graosOrdenados = computed(() =>
  [...(this.filterData()?.graoSet || [])]
    .sort(),
);

tiposOrdenados = computed(() =>
  [...(this.filterData()?.tipoNirSet || [])]
    .sort(),
);

dispositivosOrdenados = computed(() =>
  [...(
    this.filterData()
      ?.dispositivoNirSet || []
  )].sort((a, b) =>
    a.numSerie.localeCompare(
      b.numSerie,
    ),
  ),
);

  getRowClasses(analysis: Analysis) {
    return {
      'bg-red-50 border-red-300':
        analysis.hasAlert &&
        analysis.status === 'PENDENTE',

      'bg-blue-100 border-blue-300':
        analysis.status === 'ANALISADO',

      'bg-green-100 border-green-300':
        analysis.status === 'CONFERIDO',
    };
  }
  buildRetestMessage(
    analysis: Analysis,
  ) {
    const reasons: string[] = [];

    const proteina =
      analysis.proteina;

    const umidade =
      analysis.umidade;

    if (
      analysis.invalidFields?.includes(
        'proteina',
      )
    ) {
      const proteinRule =
        analysis.grao ===
          'FARELO_SOJA'
          ? analysis.usuario?.includes(
            'BTG Alto Araguaia',
          )
            ? {
              min: 47,
              max: 49,
            }
            : {
              min: 45,
              max: 47,
            }
          : {
            min: 34,
            max: 37.25,
          };

      if (
        proteina <
        proteinRule.min
      ) {
        reasons.push(
          'Proteína baixa',
        );
      }

      if (
        proteina >
        proteinRule.max
      ) {
        reasons.push(
          'Proteína alta',
        );
      }
    }

    if (
      analysis.invalidFields?.includes(
        'umidade',
      )
    ) {
      reasons.push(
        'Umidade alta',
      );
    }

    const sampleName =
      analysis.sampleGroup;

    return `Favor refazer a análise da amostra ${sampleName} ${reasons.length > 0 ? 'devido a ' + reasons.join(
      ' e ',
    ) + ' ' : ''}- ${analysis.usuario}.`;
  }

  copyRetestMessage(
    analysis: Analysis,
  ) {
    const message =
      this.buildRetestMessage(
        analysis,
      );

    navigator.clipboard.writeText(
      message,
    );

    this.copiedAnalysis.set(
      analysis.uuid,
    );

    setTimeout(() => {
      if (
        this.copiedAnalysis() ===
        analysis.uuid
      ) {
        this.copiedAnalysis.set(
          null,
        );
      }
    }, 2000);
  }
  isFieldInvalid(
    analysis: Analysis,
    field: string,
  ) {
    return (
      analysis.invalidFields?.includes(
        field,
      ) ?? false
    );
  }

  getFieldClasses(
    analysis: Analysis,
    field: string,
  ) {
    return {
      'bg-red-100 text-red-700 ring-1 ring-red-300 font-semibold':
        this.isFieldInvalid(
          analysis,
          field,
        ),
    };
  }
  filterData = signal<FilterData | null>(null);

  query = signal('');

  selectedEmpresa = signal<string[]>([]);

selectedUsuario = signal<string[]>([]);

selectedGrao = signal<string[]>([]);

selectedTipoNir = signal<string[]>([]);

selectedDispositivo = signal<string[]>([]);

selectedStatus = signal<string[]>([]);

  ngOnInit() {
    this.loadFilters();

    this.loadAnalyses();
  }

  loadFilters() {
    this.api.getFilterData().subscribe({
      next: (response: any) => {
        this.filterData.set(response);
      },
    });
  }

  updateSpectrum( uuid: string, spectrumScore: number, spectrumStatus: string,) {
    this.api
      .updateSpectrumQuality(
        uuid,
        spectrumScore,
        spectrumStatus
      ).subscribe(() => {
        this.analyses.update((items) =>
          items.map((item) =>
            item.uuid === uuid
              ? {
                ...item,
                spectrumScore: spectrumScore,
                spectrumStatus: spectrumStatus as any,
              }
              : item,
          ),
        );
      });
  }

  abrirAnalise(uuid: string): void {
    this.api.getSpectrum(uuid).subscribe({
      next: (respostaDoBack) => {
        
        const dataSpectrum = analyzeSpectrumData(respostaDoBack as SpectralApiResponse);
        console.log(dataSpectrum);

        this.dialog.open(SpectrumModalComponent, {
          width: '800px',
          maxWidth: '90vw',
          data: {
            spectrumResponse: respostaDoBack,
            spectrumAnalysis: dataSpectrum
          } // Passa o JSON recebido diretamente para o modal
        });
        this.updateSpectrum( uuid, dataSpectrum.score, dataSpectrum.status);
      },
      error: (err) => {
        console.error('Erro ao buscar dados do espectro:', err);
      }
    });
  }

  loadAnalyses() {
    this.loading.set(true);

    this.api.getAnalyses({
      query: this.query(),
      uuidUsuarios: this.selectedUsuario().join(','),
      uuidEmpresas: this.selectedEmpresa().join(','),
      grao: this.selectedGrao().join(','),
      tipoNir: this.selectedTipoNir().join(','),
      absNumSerie: this.selectedDispositivo().join(','),
      startDate: this.formatApiDate(this.startDate(),),
      endDate: this.formatApiDate(this.endDate(),),
      page: this.currentPage(),
      size: this.pageSize(),
      offset: this.currentPage() * this.pageSize(),
    })
      .subscribe({
        next: (response: any) => {
          const mapped = response.content.map(
            (item: any) => {
              const validation =
                validateAnalysis(item);
              return {
                ...item,

                hasAlert:
                  validation.hasAlert,

                invalidFields:
                  validation.invalidFields,
              };
            },
          );

          this.analyses.set(mapped);

          this.totalPages.set(
            response.totalPages,
          );
        },
        error: () => {
        this.error = 'Sessão encerrada. Faça login novamente.';

        this.loading = signal(false);
        this.logout();
      },

        complete: () => {
          this.loading.set(false);
        },
      });
  }

  nextPage() {
    if (
      this.currentPage() <
      this.totalPages() - 1
    ) {
      this.currentPage.update((p) => p + 1);

      this.loadAnalyses();
    }
  }
  formatApiDate(date: string) {
    if (!date) {
      return '';
    }

    return `${date}T12:00:00.000Z`;
  }
  previousPage() {
    if (this.currentPage() > 0) {
      this.currentPage.update((p) => p - 1);

      this.loadAnalyses();
    }
  }
  logout() {
    this.auth.logout();

    this.router.navigate(['/login']);
  }
  selectGroup(group: string) {
    this.selectedGroup.set(group);
  }

  clearFilter() {
    this.selectedGroup.set(null);
  }

  updateStatus(
    analysis: Analysis,
    status: string,
  ) {
    this.api
      .updateStatus(analysis.uuid, status)
      .subscribe(() => {
        this.analyses.update((items) =>
          items.map((item) =>
            item.uuid === analysis.uuid
              ? {
                ...item,
                status: status as any,
              }
              : item,
          ),
        );
      });
  }

  getSpectrumStatusLabel(
  status?: string | null,
) {
  switch (status) {
    case 'OK':
      return 'OK';

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

getSpectrumContainerClasses(
  analysis: Analysis,
) {
  switch (analysis.spectrumStatus) {
    case 'OK':
      return 'bg-green-50 border-green-300 text-green-600';

    case 'WARNING':
      return 'bg-yellow-50 border-yellow-300 text-yellow-600';

    case 'MOTOR_STOPPED':
      return 'bg-orange-50 border-orange-300 text-orange-700';

    case 'BAD_SPECTRUM':
      return 'bg-red-50 border-red-300 text-red-700';

    default:
      return 'bg-slate-50 border-slate-300 text-slate-400';
  }
}

getSpectrumTitle(
  analysis: Analysis,
) {
  const scoreText =
    analysis.spectrumScore !== null &&
    analysis.spectrumScore !== undefined
      ? `Score: ${analysis.spectrumScore}`
      : 'Score não calculado';

  switch (analysis.spectrumStatus) {
    case 'OK':
      return `Espectro OK - ${scoreText}`;

    case 'WARNING':
      return `Espectro com alerta - ${scoreText}`;

    case 'MOTOR_STOPPED':
      return `Motor parado - ${scoreText}`;

    case 'BAD_SPECTRUM':
      return `Espectro ruim - ${scoreText}`;

    default:
      return 'Espectro não analisado';
  }
}

getSpectrumBarClasses(
  analysis: Analysis,
) {
  switch (analysis.spectrumStatus) {
    case 'OK':
      return 'bg-green-500';

    case 'WARNING':
      return 'bg-yellow-500';

    case 'MOTOR_STOPPED':
      return 'bg-orange-500';

    case 'BAD_SPECTRUM':
      return 'bg-red-500';

    default:
      return 'bg-slate-300';
  }
}

getSpectrumScore(
  analysis: Analysis,
) {
  return analysis.spectrumScore ?? 0;
}

getSpectrumScoreWidth(
  analysis: Analysis,
) {
  const score =
    analysis.spectrumScore ?? 0;

  if (score < 0) {
    return '0%';
  }

  if (score > 100) {
    return '100%';
  }

  return `${score}%`;
}
}