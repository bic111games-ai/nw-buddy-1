import { Routes } from '@angular/router'

export const ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./faktoria-page.component').then((it) => it.FaktoriaPageComponent),
    children: [
      {
        path: ':id',
        loadComponent: () => import('./faktoria-detail-page.component').then((it) => it.FaktoriaDetailPageComponent),
      },
    ],
  },
]
