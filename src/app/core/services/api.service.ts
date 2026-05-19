import { HttpClient } from '@angular/common/http';

import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly api =
    'http://localhost:3000';

  constructor(private http: HttpClient) {}

  login(data: any) {
    return this.http.post(
      `${this.api}/auth/login`,
      data,
    );
  }

  getAnalyses(params: any) {
    return this.http.get(
      `${this.api}/analyses`,
      {
        params,
      },
    );
  }

  updateStatus(uuid: string, status: string) {
    return this.http.patch(
      `${this.api}/analyses/${uuid}/status`,
      {
        status,
      },
    );
  }
}