import {
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';

import { CommonModule } from '@angular/common';

import { ApiService } from '@/app/core/services/api.service';

import { Analysis } from '@/app/core/models/analysis.model';

import { AuthService } from '@/app/core/services/auth.service';

@Component({
  selector: 'app-dashboard',

  standalone: true,

  imports: [CommonModule],

  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  api = inject(ApiService);

  auth = inject(AuthService);

  analyses = signal<Analysis[]>([]);

  loading = signal(false);

  selectedGroup = signal<string | null>(null);

  pendingCount = computed(
    () =>
      this.analyses().filter(
        (a) => a.status === 'PENDENTE',
      ).length,
  );

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
    if (!this.selectedGroup()) {
      return this.analyses();
    }

    return this.analyses().filter(
      (a) =>
        a.sampleGroup === this.selectedGroup(),
    );
  });

  ngOnInit() {
    this.loadAnalyses();
  }

  loadAnalyses() {
    this.loading.set(true);

    this.api
      .getAnalyses({
        page: 0,
        size: 20,
        offset: 0,
      })
      .subscribe({
        next: (response: any) => {
          this.analyses.set(response.content);
        },

        complete: () => {
          this.loading.set(false);
        },
      });
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
}