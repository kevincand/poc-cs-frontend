import { Routes } from '@angular/router';

import { LoginComponent } from './features/auth/pages/login/login.component';

import { DashboardComponent } from './features/analyses/pages/dashboard/dashboard.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
  },

  {
    path: '',
    component: DashboardComponent,
  },
  {
    path: 'relatorio-espectros',
    loadComponent: () =>
      import('./features/analyses/pages/spectrum-report/spectrum.report.component')
        .then((m) => m.SpectrumReportComponent),
  },
  {
    path: 'relatorio-diario',
    loadComponent: () =>
      import('./features/analyses/pages/daily-report/daily-report.component')
        .then((m) => m.DailyReportComponent),
  },
];