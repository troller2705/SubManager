import { Client, CommunityMemberRoleAddRequest, CommunityMemberRoleRemoveRequest, rootServer } from "@rootsdk/server-app";
import { TierList, MappingRequest } from "@submanager/gen-shared";
import { SubscriptionServiceBase } from "@submanager/gen-server";

export class SubService extends SubscriptionServiceBase {
  async getTiers(client: Client): Promise<TierList> {
    const db = (rootServer as any).database;
    const config = await db("community_settings").where({ community_id: client.communityId }).first();
  
    // 1. Fetch Root Community Roles using server-side SDK
    const communityRoles = await rootServer.community.communityRoles.list();
    const formattedRoles = communityRoles.map(r => ({
      id: r.id,
      name: r.name
    }));
  
    // 2. Fetch or Generate Tiers (using dummy data for local testing)
    const patreonTiers = config?.patreon_access_token 
      ? await this.getPatreonCommunityTiers(config.patreon_access_token)
      : [
          { id: "local_1", name: "Premium Tier", provider: "patreon" },
          { id: "local_2", name: "Basic Tier", provider: "patreon" }
        ];
  
    return {
      tiers: patreonTiers,
      roles: formattedRoles // Pass both to the client
    };
  }
  async getPatreonCommunityTiers(accessToken: string) {
    // Use the campaigns endpoint to fetch all tiers available in the community
    const response = await fetch(
      "https://www.patreon.com/api/oauth2/v2/campaigns?include=tiers&fields[tier]=title,description",
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    
    const data = await response.json();
  
    // Extract tiers from the 'included' array
    return data.included
      ?.filter((obj: any) => obj.type === "tier")
      .map((tier: any) => ({
        id: tier.id,
        name: tier.attributes.title,
        provider: "patreon"
      })) || [];
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

  async handlePatreonCallback(code: string, rootUserId: string, communityId: string) {
    const db = (rootServer as any).database;
    const config = await db("community_settings").where({ community_id: communityId }).first();
  
    // 1. Exchange 'code' for an access token
    const response = await fetch("https://www.patreon.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: config.patreon_client_id,
        client_secret: config.patreon_client_secret,
        redirect_uri: "http://localhost:5173/patreon/callback", // TODO: Replace with your app's callback URL
      }),
    });
  
    const tokenData = await response.json();
  
    // 2. Fetch the user's Patreon ID using the identity endpoint
    const userResponse = await fetch("https://www.patreon.com/api/oauth2/v2/identity", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userResponse.json();
    const patreonId = userData.data.id;
  
    // 3. Link the IDs in the user_links table
    await db("user_links")
      .insert({ root_user_id: rootUserId, patreon_id: patreonId })
      .onConflict("root_user_id")
      .merge();
  }
}

export const subService = new SubService();