import { Client, CommunityMemberRoleAddRequest, CommunityMemberRoleRemoveRequest, rootServer } from "@rootsdk/server-app";
import { TierList, MappingRequest, SyncResponse, LinkPatreonRequest, LinkPatreonResponse } from "@submanager/gen-shared";
import { SubscriptionServiceBase } from "@submanager/gen-server";
import axios from 'axios';

interface RoleMappingRow {
  tier_id: string;
  role_id: string;
  provider: string;
}

export class SubService extends SubscriptionServiceBase {
  async getTiers(client: Client): Promise<TierList> {
    const db = (rootServer as any).database;
    const config = await db("community_settings").where({ community_id: client.communityId }).first();
  
    // 1. Fetch Roles
    const communityRoles = await rootServer.community.communityRoles.list();
    const roles = communityRoles.map(r => ({ id: r.id, name: r.name }));
  
    // 2. Fetch ALL mappings for this community
    const savedMappings = await db("role_mappings")
      .where({ community_id: client.communityId })
      .select("tier_id as tierId", "role_id as roleId", "provider");
  
    // 3. Aggregate Tiers from multiple sources
    // const patreonTiers = await this.fetchPatreonTiers(client);
    // const subscribeStarTiers = await this.fetchSubscribeStarTiers(client);

    const tiers = config?.patreon_access_token 
      ? await this.getPatreonCommunityTiers(config.patreon_access_token)
      : [
          { id: "local_1", name: "Premium Tier", provider: "subscribestar" },
          { id: "local_2", name: "Basic Tier", provider: "patreon" }
        ];
  
    return {
      tiers,
      roles,
      existingMappings: savedMappings
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
    const db = (rootServer as any).database;
  
    try {
      if (!request.roleId) {
        await db("role_mappings")
          .where({ 
            community_id: client.communityId, 
            tier_id: request.tierId, 
            provider: request.provider 
          })
          .delete();
        return;
      }

      await db("role_mappings")
        .insert({
          community_id: client.communityId,
          tier_id: request.tierId,
          role_id: request.roleId,
          provider: request.provider
        })
        // Use onConflict to allow updating existing mappings
        .onConflict(['community_id', 'tier_id', 'provider'])
        .merge();
        
      console.log(`Saved mapping: Tier ${request.tierId} -> Role ${request.roleId}`);
      // The function MUST return (resolve) to notify the client the request succeeded
      return; 
    } catch (error) {
      console.error("Failed to save mapping:", error);
      // Re-throwing ensures the client receives an error instead of hanging
      throw error; 
    }
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

  async triggerManualSync(client: Client): Promise<SyncResponse> {
    const db = (rootServer as any).database;
    const communityId = client.communityId;
  
    try {
      // 1. Fetch EVERY member in the community
      // listAll returns CommunityMember[], so no nested property access needed
      const allMembers = await rootServer.community.communityMembers.listAll();
  
      // 2. Fetch defined role mappings once
      const mappings: RoleMappingRow[] = await db("role_mappings")
        .where({ community_id: communityId })
        .select("tier_id", "role_id", "provider");
      
      const managedRoleIds = mappings.map((m: RoleMappingRow) => m.role_id);
  
      let totalAddedCount = 0;
      let totalRemovedCount = 0;
  
      // 3. Process the loop
      for (const member of allMembers) {
        const currentUserId = member.userId;
  
        // 4. Get active external tiers (Patreon/SubStar)
        const activeExternalTierIds = await this.getExternalUserTiers(currentUserId as any); 
  
        // 5. Determine target roles
        const targetRoleIds = mappings
          .filter((m: RoleMappingRow) => activeExternalTierIds.includes(m.tier_id))
          .map((m: RoleMappingRow) => m.role_id);
  
        // 6. Get CURRENT roles using the specific member GUID
        const currentRolesRes = await rootServer.community.communityMemberRoles.list({ 
          userId: currentUserId as any 
        });
        const currentRoleIds = currentRolesRes.communityRoleIds?.map(r => r as string) || [];
  
        // 7. Calculate Diff
        const rolesToAdd = targetRoleIds.filter(id => !currentRoleIds.includes(id));
        const rolesToRemove = managedRoleIds.filter(id => 
          currentRoleIds.includes(id) && !targetRoleIds.includes(id)
        );
  
        // 8. Apply Additions
        for (const roleId of rolesToAdd) {
          await rootServer.community.communityMemberRoles.add({
            communityRoleId: roleId as any, 
            userIds: [currentUserId as any]
          });
          totalAddedCount++;
        }
        
        // 9. Apply Removals
        for (const roleId of rolesToRemove) {
          await rootServer.community.communityMemberRoles.remove({
            communityRoleId: roleId as any,
            userIds: [currentUserId as any]
          });
          totalRemovedCount++;
        }
  
        // Small pause to prevent hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 50));
      }
  
      return { 
        success: true, 
        message: `Global sync complete. Processed ${allMembers.length} members.`, 
        rolesAdded: [totalAddedCount.toString()], 
        rolesRemoved: [totalRemovedCount.toString()] 
      };
    } catch (error) {
      console.error("Manual Sync failed:", error);
      return { success: false, message: "Sync failed", rolesAdded: [], rolesRemoved: [] };
    }
  }
  
  private async getExternalUserTiers(userId: string): Promise<string[]> {
    const db = (rootServer as any).database;
  
    // 1. Look up the user's linked account
    const link = await db("user_links")
      .where({ root_user_id: userId })
      .first();
  
    if (!link) {
      return []; // User hasn't linked an account, so they get no sub-roles
    }
  
    // 2. Call the external API (Patreon Example)
    if (link.provider === 'patreon') {
      try {
        // We'll use a library like 'axios' to hit Patreon's /identity endpoint
        // fetching "memberships.currently_entitled_tiers"
        const tiers = await this.fetchPatreonTiers(link.access_token);
        return tiers; 
      } catch (err) {
        // If token is expired, we would handle refresh logic here
        console.error(`Failed to fetch Patreon tiers for ${userId}`);
        return [];
      }
    }
  
    return [];
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

  async linkPatreonAccount(request: LinkPatreonRequest, client: Client): Promise<LinkPatreonResponse> {
    const db = (rootServer as any).database;
    const userId = client.userId;
    const code = request.code;

    try {
      // 1. Exchange code for tokens
      const response = await axios.post('https://www.patreon.com/api/oauth2/token', 
        new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          client_id: process.env.PATREON_CLIENT_ID!,
          client_secret: process.env.PATREON_CLIENT_SECRET!,
          redirect_uri: process.env.PATREON_REDIRECT_URI!,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const { access_token, refresh_token, expires_in } = response.data;

      // 2. Fetch User Info to get Patreon ID
      const userRes = await axios.get('https://www.patreon.com/api/oauth2/v2/identity', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      const externalId = userRes.data.data.id;

      // 3. Save to user_links table
      await db("user_links")
        .insert({
          root_user_id: userId,
          external_id: externalId,
          provider: 'patreon',
          access_token,
          refresh_token,
          expires_at: new Date(Date.now() + expires_in * 1000)
        })
        .onConflict("root_user_id")
        .merge();

      return { success: true };
    } catch (error) {
      console.error("Patreon link failed:", error);
      return { success: false };
    }
  }

  // Update the real fetcher we left as a black box earlier
  private async fetchPatreonTiers(accessToken: string): Promise<string[]> {
    const url = "https://www.patreon.com/api/oauth2/v2/identity?include=memberships.currently_entitled_tiers&fields[tier]=title";
    
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    // Extract Tier IDs from the 'included' section of the V2 response
    const tiers = response.data.included
      ?.filter((obj: any) => obj.type === 'tier')
      ?.map((tier: any) => tier.id) || [];

    return tiers;
  }
}

export const subService = new SubService();