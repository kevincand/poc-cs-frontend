import { Component, inject } from '@angular/core';

import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { Router } from '@angular/router';

import { ApiService } from '@/app/core/services/api.service';

import { AuthService } from '@/app/core/services/auth.service';

@Component({
  selector: 'app-login',

  standalone: true,

  imports: [ReactiveFormsModule],

  templateUrl: './login.component.html',
})
export class LoginComponent {
  fb = inject(FormBuilder);

  api = inject(ApiService);

  auth = inject(AuthService);

  router = inject(Router);

  loading = false;

  error = '';

  form = this.fb.group({
    email: ['', Validators.required],

    senha: ['', Validators.required],
  });

  login() {
    if (this.form.invalid) return;

    this.loading = true;

    this.error = '';

    this.api.login(this.form.value).subscribe({
      next: (response: any) => {
        this.auth.setAuth(response);

        this.router.navigate(['/']);
      },

      error: () => {
        this.error = 'Usuário ou senha inválidos';

        this.loading = false;
      },

      complete: () => {
        this.loading = false;
      },
    });
  }
}