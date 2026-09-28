import { initRequest, type RouteContext } from "./_core/request";
import { handleMcpRequest } from "./_core/mcp";

async function serve(request: Request, context: RouteContext): Promise<Response> {
  try {
    const ctx = await initRequest(request, context);
    return await handleMcpRequest(request, ctx);
  } catch {
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

export const GET = serve;
export const POST = serve;
export const DELETE = serve;
