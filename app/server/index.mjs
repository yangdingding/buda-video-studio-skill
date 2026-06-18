#!/usr/bin/env node
import { createServer } from "node:http";
import { handleRequest } from "./routes.mjs";

const port = Number(process.env.BUDA_VIDEO_STUDIO_UI_PORT || process.env.PORT || 3000);
const host = "127.0.0.1";

const server = createServer((request, response) => {
  handleRequest(request, response);
});

server.listen(port, host, () => {
  process.stdout.write(`Buda Video Studio running at http://${host}:${port}\n`);
});
