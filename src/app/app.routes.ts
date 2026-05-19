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
];