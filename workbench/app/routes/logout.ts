import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { clearSessionCookie } from '~/a2/session.server';

// A2 (design D3, task 4.3): logout. POST-only; clears the session cookie and
// returns to the anonymous state at /login.
export async function action(_args: ActionFunctionArgs) {
  return new Response(null, {
    status: 302,
    headers: {
      'Set-Cookie': clearSessionCookie(),
      Location: '/login',
    },
  });
}

export async function loader() {
  return new Response(null, { status: 302, headers: { Location: '/' } });
}
