import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-spectrum-modal',
  standalone: true,
  imports: [CommonModule, MatDialogModule, BaseChartDirective],
  templateUrl: './spectrum.component.html',
  styles: [`.chart-container { width: 100%; height: 400px; }`]
})
export class SpectrumModalComponent implements OnInit {
  public chartData?: ChartConfiguration<'line'>['data'];
  public nomeAnalise: string = '';
  public chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { title: { display: true, text: 'Wavelength (nm)' } },
      y: { title: { display: true, text: 'Absorbance' } }
    },
   
  };

  constructor(@Inject(MAT_DIALOG_DATA) public data: any) {}

  ngOnInit(): void {
    const chaves = Object.keys(this.data.absorbancias);
    if (chaves.length > 0) {
      /* this.nomeAnalise = chaves[0].replace(/\s*-\s*[^-]*$/, ''); */
      this.nomeAnalise = chaves[0];
    }
    this.montarGrafico();
  }

  montarGrafico(): void {
    // Eixo X: Formata os comprimentos de onda para exibição com 1 casa decimal
    const labels = this.data.wavelengths.map((w: number) => w.toFixed(1));

    // Eixo Y: Mapeia cada chave do objeto absorbancias para uma linha no gráfico
    const datasets = Object.keys(this.data.absorbancias).map(key => {
      return {
        label: key.slice(-1),
        data: this.data.absorbancias[key],
        borderWidth: 1,
        pointRadius: 0,
        tension: 0.1 // Suaviza a linha do gráfico
      };
    });

    this.chartData = { labels, datasets };
  }
}
