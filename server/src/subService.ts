import { Client, CommunityMemberRoleAddRequest, CommunityMemberRoleRemoveRequest, rootServer } from "@rootsdk/server-app";
import { TierList, MappingRequest } from "@submanager/gen-shared";
import { SubscriptionServiceBase } from "@submanager/gen-server";

export class SubService extends SubscriptionServiceBase {
  async getTiers(client: Client): Promise<TierList> {
    // In a real app, you would fetch these from Patreon/SubStar APIs
    return {
      tiers: [
        { id: "p1", name: "Patreon Gold", provider: "patreon" },
        { id: "p2", name: "Patreon Silver", provider: "patreon" },
        { id: "s1", name: "SubStar Premium", provider: "substar" }
      ]
    };
  }

  async saveMapping(request: MappingRequest, client: Client): Promise<void> {
    const db = (rootServer as any).database; // Use the knex instance initialized in main.ts
    await db("role_mappings").insert({
      community_id: client.communityId,
      tier_id: request.tierId,
      role_id: request.roleId,
      provider: request.provider
    });
  }

  async syncMemberRoles(communityId: string, externalId: string, activeTiers: string[]) {
    const db = (rootServer as any).database;
    
    // 1. Find the Root user linked to this Patreon/SubStar ID
    const link = await db("user_links").where({ patreon_id: externalId }).first();
    if (!link) return;

    // 2. Fetch all mappings for this specific community
    const mappings = await db("role_mappings").where({ community_id: communityId });

    for (const mapping of mappings) {
      const isSubscribed = activeTiers.includes(mapping.tier_id);
      
      if (isSubscribed) {
        const addReq: CommunityMemberRoleAddRequest = {
          communityRoleId: mapping.role_id,
          userIds: [link.root_user_id]
        };
        await rootServer.community.communityMemberRoles.add(addReq);
      } else {
        const removeReq: CommunityMemberRoleRemoveRequest = {
          communityRoleId: mapping.role_id,
          userIds: [link.root_user_id]
        };
        await rootServer.community.communityMemberRoles.remove(removeReq);
      }
    }
  }

  async triggerManualSync(client: Client): Promise<void> {
    const db = (rootServer as any).database;
    const userLink = await db("user_links").where({ root_user_id: client.userId }).first();
    
    if (userLink?.patreon_id) {
      // Fetch latest status from Patreon API and call your syncMemberRoles logic
      await this.syncMemberRoles(client.communityId, userLink.patreon_id, ["tier_id_from_api"]);
    }
  }

  async handlePatreonCallback(code: string, rootUserId: string) {
    // 1. Exchange 'code' for an access token via Patreon API
    // 2. Call /api/oauth2/api/current_user to get their Patreon ID
    const patreonId = "fetched_id_from_api";

    const db = (rootServer as any).database;
    await db("user_links")
      .insert({ root_user_id: rootUserId, patreon_id: patreonId })
      .onConflict("root_user_id")
      .merge();
  }
}

export const subService = new SubService();