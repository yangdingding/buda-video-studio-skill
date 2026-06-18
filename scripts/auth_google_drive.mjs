#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { loadConfig } from "../lib/config.mjs";
import { writeJson } from "../lib/common.mjs";

const defaultScope = "https://www.googleapis.com/auth/drive.readonly";

const base64Url = (buffer) =>
  buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const sha256 = (value) => createHash("sha256").update(value).digest();

const readOAuthClient = async (path) => {
  const json = JSON.parse(await readFile(path, "utf8"));
  const client = json.installed || json.web;
  if (!client?.client_id) {
    throw new Error("OAuth client JSON is missing installed.client_id or web.client_id.");
  }
  return {
    clientId: client.client_id,
    clientSecret: client.client_secret || "",
    authUri: client.auth_uri || "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUri: client.token_uri || "https://oauth2.googleapis.com/token",
  };
};

const openBrowser = (url) => {
  const child = spawn("open", [url], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
};

const waitForCode = async ({ port, state }) =>
  new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || "/", `http://localhost:${port}`);
      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const error = url.searchParams.get("error");
      if (error) {
        res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        res.end("<h1>Google Drive authorization failed</h1><p>You can close this window.</p>");
        server.close();
        reject(new Error(`Google OAuth error: ${error}`));
        return;
      }

      if (url.searchParams.get("state") !== state) {
        res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        res.end("<h1>State mismatch</h1><p>You can close this window.</p>");
        server.close();
        reject(new Error("Google OAuth state mismatch."));
        return;
      }

      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        res.end("<h1>Missing authorization code</h1><p>You can close this window.</p>");
        server.close();
        reject(new Error("Google OAuth callback did not include a code."));
        return;
      }

      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<h1>Buda Video Studio connected</h1><p>You can close this window and return to Codex.</p>");
      server.close();
      resolve(code);
    });

    server.on("error", reject);
    server.listen(port, "localhost");
  });

const exchangeCode = async ({ client, code, codeVerifier, redirectUri }) => {
  const body = new URLSearchParams({
    client_id: client.clientId,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  if (client.clientSecret) {
    body.set("client_secret", client.clientSecret);
  }

  const response = await fetch(client.tokenUri, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Google OAuth token exchange failed (${response.status}): ${JSON.stringify(json)}`);
  }

  return json;
};

const main = async () => {
  const { config } = await loadConfig();
  const drive = config.google_drive || {};
  if (!drive.client_secret_path) {
    throw new Error("Missing google_drive.client_secret_path in config.");
  }
  if (!drive.token_path) {
    throw new Error("Missing google_drive.token_path in config.");
  }

  const client = await readOAuthClient(drive.client_secret_path);
  const port = Number(process.env.BUDA_VIDEO_GOOGLE_AUTH_PORT || 53682);
  const redirectUri = `http://localhost:${port}/oauth2callback`;
  const state = base64Url(randomBytes(18));
  const codeVerifier = base64Url(randomBytes(64));
  const codeChallenge = base64Url(sha256(codeVerifier));
  const scope = process.env.BUDA_VIDEO_GOOGLE_SCOPES || defaultScope;

  const authorizeUrl = new URL(client.authUri);
  authorizeUrl.searchParams.set("client_id", client.clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("access_type", "offline");
  authorizeUrl.searchParams.set("prompt", "consent");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const codePromise = waitForCode({ port, state });
  process.stdout.write(`Opening Google authorization in your browser...\n${authorizeUrl.toString()}\n`);
  openBrowser(authorizeUrl.toString());

  const code = await codePromise;
  const token = await exchangeCode({ client, code, codeVerifier, redirectUri });
  const expiresIn = Number(token.expires_in || 3600);
  await writeJson(drive.token_path, {
    ...token,
    scope,
    token_type: token.token_type || "Bearer",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  });

  process.stdout.write(`Google Drive token saved: ${drive.token_path}\n`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
