import { createServer } from "node:http";

// A real loopback origin keeps browser local-network permissions accurate.
// Playwright's intercepted navigation cannot establish the origin's IP space.
createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end("<!doctype html><title>Partner app</title>");
}).listen(5173, "127.0.0.1");
