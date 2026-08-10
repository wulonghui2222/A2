import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { requireUser } from '~/a2/session.server';
import { default as IndexRoute } from './_index';

// A2 (task 4.4): session guard mirrors _index; username feeds the header.
export async function loader(args: LoaderFunctionArgs) {
  const env = args.context.cloudflare.env as unknown as Record<string, string | undefined>;
  const user = await requireUser(args.request, env);

  return json({ id: args.params.id, username: user.username });
}

export default IndexRoute;
