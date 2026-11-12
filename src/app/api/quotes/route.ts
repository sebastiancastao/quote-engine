import { connection } from "next/server";
import { getQuoteStore } from "@/lib/quote-store";
import { errorResponse, json, readBody } from "@/lib/http";

export async function GET() {
  await connection();
  try {
    return json({ quotes: getQuoteStore().list() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    return json(
      { quote: getQuoteStore().create(await readBody(request)) },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
