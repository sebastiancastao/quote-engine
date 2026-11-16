import { getQuoteStore } from "@/lib/quote-store";
import { performQuoteAction } from "@/lib/quote-actions";
import { errorResponse, json, readBody, versionFrom } from "@/lib/http";

type Context = { params: Promise<{ ref: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    return json({ quote: getQuoteStore().get((await context.params).ref) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { ref } = await context.params;
    const body = await readBody(request);
    const version = versionFrom(body);
    const store = getQuoteStore();
    return json({ quote: store.update(ref, version, body) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { ref } = await context.params;
    const body = await readBody(request);
    return json({ quote: await performQuoteAction(ref, body) });
  } catch (error) {
    return errorResponse(error);
  }
}
