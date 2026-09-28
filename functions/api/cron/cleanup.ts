import { json, withErrors } from "../../_core/http";
import { initRequest, type RouteContext } from "../../_core/request";
import { runCleanup } from "../../_core/cleanup";

const handler = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await initRequest(request, context);
  const result = await runCleanup(ctx);
  return json({ ok: true, ...result });
});

export const GET = handler;
export const POST = handler;
