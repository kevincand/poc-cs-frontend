import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (
  req,
  next,
) => {
  const token = localStorage.getItem('token');

  const role = localStorage.getItem('role');

  if (token) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,

        'x-user-role': role || '',
      },
    });
  }

  return next(req);
};