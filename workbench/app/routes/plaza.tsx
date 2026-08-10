import { Outlet } from '@remix-run/react';

/*
 * A2 project-plaza: layout route for the plaza namespace. Under Remix
 * flat-file conventions `plaza.$urlId.tsx` nests under this route, so the
 * detail view only renders through this <Outlet/>. The listing lives in
 * `plaza._index.tsx`.
 */
export default function PlazaLayout() {
  return <Outlet />;
}
