import { externalApi } from "@/lib/external-api";
import { json, readJsonBody } from "@/lib/http";
import { performQuoteAction } from "@/lib/quote-actions";

const methods = ["POST"];

export async function POST(
  request: Request,
  context: { params: Promise<{ ref: string }> },
) {
  return externalApi(request, methods, async () => {
    const { ref } = await context.params;
    return json({
      quote: await performQuoteAction(ref, await readJsonBody(request)),
    });
  });
}

export async function OPTIONS(request: Request) {
  return externalApi(request, methods, () => new Response(null));
}
