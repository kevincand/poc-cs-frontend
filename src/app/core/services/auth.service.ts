import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  token = signal<string | null>(null);

  role = signal<string | null>(null);

  user = signal<any>(null);

  constructor() {
    this.loadStorage();
  }

  setAuth(data: any) {
    localStorage.setItem(
      'token',
      data.access_token,
    );

    localStorage.setItem('role', data.tipo);

    localStorage.setItem(
      'user',
      JSON.stringify(data),
    );

    this.token.set(data.access_token);

    this.role.set(data.tipo);

    this.user.set(data);
  }

  loadStorage() {
    const token = localStorage.getItem('token');

    const role = localStorage.getItem('role');

    const user = localStorage.getItem('user');

    if (token) {
      this.token.set(token);
    }

    if (role) {
      this.role.set(role);
    }

    if (user) {
      this.user.set(JSON.parse(user));
    }
  }

 logout() {
  localStorage.removeItem('token');

  localStorage.removeItem('role');

  localStorage.removeItem('user');

  this.token.set(null);

  this.role.set(null);

  this.user.set(null);
}
  
  isAuthenticated() {
    return !!this.token();
  }

  isAdmin() {
    return this.role() === 'ADMIN';
  }
}