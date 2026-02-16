import { rootServer, RootAppStartState } from "@rootsdk/server-app";
import { subService } from "./subService";
import { handlePatreonWebhook } from "./webhookService";
import express from "express";
import knex from "knex";
import path from "path";

const app = express();
app.use(express.json());

// Handle the Patreon webhook using standard Express routing
app.post("/webhooks/patreon/:communityId", async (req, res) => {
  const { communityId } = req.params;
  try {
    // Pass the webhook data to your existing handler logic
    console.log(`Received Patreon webhook for community: ${communityId}`);
    // await handlePatreonWebhook(req.body, communityId); 
    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).send("Internal Server Error");
  }
});

async function onStarting(state: RootAppStartState) {
  // 1. Initialize the database FIRST
  const db = knex({
    client: "sqlite3",
    connection: { 
        filename: path.join(process.cwd(), "rootsdk.sqlite3") 
    },
    useNullAsDefault: true,
  });

  // Attach to rootServer so your service can find it
  (rootServer as any).database = db;

  // 2. Create tables before registering services
  if (!(await db.schema.hasTable("role_mappings"))) {
    await db.schema.createTable("role_mappings", (table) => {
      table.increments("id").primary();
      table.string("community_id");
      table.string("tier_id");
      table.string("role_id");
      table.string("provider");
    });
    console.log("Database: role_mappings table created.");
  }

  if (!(await db.schema.hasTable("user_links"))) {
    await db.schema.createTable("user_links", (table) => {
      table.string("root_user_id").primary();
      table.string("patreon_id").nullable();
      table.string("substar_id").nullable();
    });
  }

  if (!(await db.schema.hasTable("community_settings"))) {
    await db.schema.createTable("community_settings", (table) => {
      table.string("community_id").primary();
      table.string("patreon_webhook_secret").nullable();
      table.string("substar_webhook_secret").nullable();
      table.string("patreon_client_id").nullable();
      table.string("patreon_client_secret").nullable();
    });
  }

  // 3. REGISTER THE SERVICE
  // This line is critical to fix the "Endpoint handler is missing" error
  rootServer.lifecycle.addService(subService);

  // Logic to register the public webhook URL
  // Start the Express server on a separate port (e.g., 3001)
  app.listen(3001, () => {
    console.log("Express webhook server running on port 3001");
  });
}

(async () => {
  await rootServer.lifecycle.start(onStarting);
})();