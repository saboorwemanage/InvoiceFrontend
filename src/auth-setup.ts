/**
 * One-time script to connect Gmail via Composio OAuth.
 * Run: npm run auth:setup
 * Then open the printed URL in your browser.
 */
import "dotenv/config";
import { ComposioToolSet } from "composio-core";

async function main() {
  if (!process.env.COMPOSIO_API_KEY) {
    console.error("❌  COMPOSIO_API_KEY is not set. Copy .env.example → .env and fill it in.");
    process.exit(1);
  }

  const toolset  = new ComposioToolSet({ apiKey: process.env.COMPOSIO_API_KEY });
  const entityId = process.env.COMPOSIO_ENTITY_ID ?? "default";
  const entity   = toolset.getEntity(entityId);

  console.log(`\nChecking Gmail connection for entity: ${entityId}`);

  // Check if already connected
  try {
    const conn = await entity.getConnection({ app: "gmail" });
    if (conn?.status === "ACTIVE") {
      console.log("✅  Gmail is already connected and active!");
      return;
    }
  } catch {
    // No connection yet — proceed to set one up
  }

  const connReq = await entity.initiateConnection({
    appName:  "gmail",
    authMode: "OAUTH2",
  });

  console.log("\n🔗  Open this URL in your browser to authorize Gmail access:\n");
  console.log("   " + connReq.redirectUrl);
  console.log("\n⏳  Waiting for you to complete the authorization…\n");

  const connected = await connReq.waitUntilActive(120);
  console.log(`✅  Gmail connected! Connection ID: ${connected.id}`);
  console.log("    You can now run the server and start sending invoices.\n");
}

main().catch((err) => {
  console.error("❌  Auth setup failed:", err);
  process.exit(1);
});
