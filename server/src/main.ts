import { rootServer, RootAppStartState } from "@rootsdk/server-app";
import { subService } from "./subService";
import { handlePatreonWebhook } from "./webhookService";
import knex from "knex";
import path from "path";

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
  // Replace with the specific Root SDK method for public HTTP routes
  (rootServer as any).registerHttpHandler("/webhooks/patreon/:communityId", handlePatreonWebhook);
}

(async () => {
  await rootServer.lifecycle.start(onStarting);
})();