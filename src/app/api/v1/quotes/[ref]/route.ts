import { externalApi } from "@/lib/external-api";
import { json, readJsonBody, versionFrom } from "@/lib/http";
import { getQuoteStore } from "@/lib/quote-store";

type Context = { params: Promise<{ ref: string }> };
const methods = ["GET", "PATCH"];

export async function GET(request: Request, context: Context) {
  return externalApi(request, methods, async () =>
    json({ quote: getQuoteStore().get((await context.params).ref) }),
  );
}

export async function PATCH(request: Request, context: Context) {
  return externalApi(request, methods, async () => {
    const { ref } = await context.params;
    const body = await readJsonBody(request);
    const version = versionFrom(body);
    const store = getQuoteStore();
    return json({
      quote: store.update(ref, version, { ...store.get(ref), ...body }),
    });
  });
}

export async function OPTIONS(request: Request) {
  return externalApi(request, methods, () => new Response(null));
}
