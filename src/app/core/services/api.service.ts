import { HttpClient } from '@angular/common/http';

import { Injectable } from '@angular/core';

import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly api = environment.api;

  constructor(private http: HttpClient) { }

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

  getFilterData() {
    return this.http.get(
      `${this.api}/filters`,
    );
  }

  getSpectrum(uuid: string) {
    return this.http.get(
      `${this.api}/analyses/${uuid}/spectrum`,
    );
  }

  updateSpectrumQuality(
    uuid: string,
    spectrumScore: number,
    spectrumStatus: string,
  ) {
    return this.http.patch(`${this.api}/analyses/${uuid}/spectrum-quality`,
      {
        spectrumScore,
        spectrumStatus,
      },
    );
  }
}