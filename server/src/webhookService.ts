import { rootServer } from "@rootsdk/server-app";
import { verifyPatreonSignature } from "./webhookUtils";
import { subService } from "./subService";

// Conceptual Webhook Handler
export async function handlePatreonWebhook(req: any, res: any) {
  const signature = req.headers['x-patreon-signature'];
  const rawBody = req.rawBody; // Use the raw body for signature verification
  const communityId = req.params.communityId;

  const db = (rootServer as any).database;
  const config = await db("community_settings").where({ community_id: communityId }).first();

  if (!verifyPatreonSignature(signature, rawBody, config.patreon_webhook_secret)) {
    return res.status(401).send("Invalid Signature");
  }

  const payload = JSON.parse(rawBody);
  const patreonUserId = payload.data.relationships.user.data.id;
  const currentTiers = payload.data.relationships.currently_entitled_tiers.data.map((t: any) => t.id);

  // Trigger the unified sync logic
  await subService.syncMemberRoles(communityId, patreonUserId, currentTiers);
  
  res.status(200).send("OK");
}