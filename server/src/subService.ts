import { Client, CommunityMemberRoleAddRequest, CommunityMemberRoleRemoveRequest, rootServer } from "@rootsdk/server-app";
import { TierList, MappingRequest, SyncResponse, LinkAccountRequest, LinkAccountResponse, SettingsRequest, UnlinkRequest } from "@submanager/gen-shared";
import { SubscriptionServiceBase } from "@submanager/gen-server";
import axios from 'axios';
import cron from 'node-cron';
import { isAdminAuthorized } from "./securityService";

interface RoleMappingRow {
  tier_id: string;
  role_id: string;
  provider: string;
}

export class SubService extends SubscriptionServiceBase {

  // ==========================================
  // PUBLIC RPC METHODS (Called by Frontend)
  // ==========================================

  async getTiers(client: Client): Promise<TierList> {
    try {
      const db = (rootServer as any).database;
      const userId = client.userId;
      const communityId = client.communityId;
      const config = await db("community_settings").where({ community_id: communityId }).first();

      // 1. Fetch Root Community Roles
      const communityRoles = await rootServer.community.communityRoles.list();
      const roles = communityRoles.map((r: any) => ({ id: r.id, name: r.name }));

      // 2. Fetch existing mappings for the dropdowns
      const savedMappings = await db("role_mappings")
        .where({ community_id: communityId })
        .select("tier_id as tierId", "role_id as roleId", "provider");

      // 3. Check User Linking Status
      const patreonLinked = await db("user_links")
        .where({ root_user_id: userId, provider: 'patreon' })
        .first();

      const substarLinked = await db("user_links")
        .where({ root_user_id: userId, provider: 'substar' })
        .first();

      // 4. Fetch the Creator's Tiers safely from BOTH providers
      let tiers: any[] = [];

      const validPatreonToken = await this.getValidCreatorAccessToken(communityId, 'patreon');
      if (validPatreonToken) {
        const pTiers = await this.getPatreonCommunityTiers(validPatreonToken);
        tiers = tiers.concat(pTiers);
      }

      const validSubstarToken = await this.getValidCreatorAccessToken(communityId, 'substar');
      if (validSubstarToken) {
        const sTiers = await this.getSubscribeStarCommunityTiers(validSubstarToken);
        tiers = tiers.concat(sTiers);
      }

      // 5. Admin Check
      const isAdmin = await isAdminAuthorized(userId, "communityManageApps");

      return {
        tiers,
        roles,
        existingMappings: savedMappings,
        isPatreonLinked: !!patreonLinked,
        isSubstarLinked: !!substarLinked,
        isAdmin: isAdmin,
        isPollingEnabled: !!config?.enable_polling,
        isCreatorPatreonLinked: !!config?.patreon_access_token,
        isCreatorSubstarLinked: !!config?.substar_access_token
      };

    } catch (error) {
      console.error("CRITICAL ERROR IN getTiers:", error);

      return {
        tiers: [],
        roles: [],
        existingMappings: [],
        isPatreonLinked: false,
        isSubstarLinked: false,
        isAdmin: false,
        isPollingEnabled: false,
        isCreatorPatreonLinked: false,
        isCreatorSubstarLinked: false
      };
    }
  }

  async unlinkUserAccount(request: UnlinkRequest, client: Client): Promise<void> {
    const db = (rootServer as any).database;

    try {
      await db("user_links")
        .where({ root_user_id: client.userId, provider: request.provider })
        .delete();

      console.log(`Unlinked ${request.provider} for user ${client.userId}`);
    } catch (error) {
      console.error(`Failed to unlink user account:`, error);
      throw error;
    }
  }

  async unlinkCreatorAccount(request: UnlinkRequest, client: Client): Promise<void> {
    const isAuthorized = await isAdminAuthorized(client.userId, "communityManageApps");
    if (!isAuthorized) throw new Error("Unauthorized");

    const db = (rootServer as any).database;

    try {
      if (request.provider === 'patreon') {
        await db("community_settings")
          .where({ community_id: client.communityId })
          .update({
            patreon_access_token: null,
            patreon_refresh_token: null,
            patreon_expires_at: null
          });
      } else if (request.provider === 'substar') {
        await db("community_settings")
          .where({ community_id: client.communityId })
          .update({
            substar_access_token: null,
            substar_refresh_token: null,
            substar_expires_at: null
          });
      }

      console.log(`Unlinked Creator ${request.provider} for community ${client.communityId}`);
    } catch (error) {
      console.error(`Failed to unlink creator account:`, error);
      throw error;
    }
  }

  async linkCreatorAccount(request: LinkAccountRequest, client: Client): Promise<LinkAccountResponse> {
    const isAuthorized = await isAdminAuthorized(client.userId, "communityManageApps");
    if (!isAuthorized) throw new Error("Unauthorized");

    const db = (rootServer as any).database;

    try {
      if (request.provider === 'patreon') {
        const response = await axios.post('https://www.patreon.com/api/oauth2/token',
          new URLSearchParams({
            code: request.code,
            grant_type: 'authorization_code',
            client_id: process.env.GLOBAL_PATREON_CLIENT_ID!,
            client_secret: process.env.GLOBAL_PATREON_CLIENT_SECRET!,
            redirect_uri: process.env.PATREON_REDIRECT_URI!,
          }).toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const { access_token, refresh_token, expires_in } = response.data;

        await db("community_settings")
          .insert({
            community_id: client.communityId,
            patreon_access_token: access_token,
            patreon_refresh_token: refresh_token,
            patreon_expires_at: new Date(Date.now() + expires_in * 1000)
          })
          .onConflict("community_id")
          .merge();

      } else if (request.provider === 'substar') {
        const response = await axios.post('https://www.subscribestar.com/oauth2/token',
          new URLSearchParams({
            code: request.code,
            grant_type: 'authorization_code',
            client_id: process.env.GLOBAL_SUBSTAR_CLIENT_ID!,
            client_secret: process.env.GLOBAL_SUBSTAR_CLIENT_SECRET!,
            redirect_uri: process.env.SUBSTAR_REDIRECT_URI!,
          }).toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const { access_token, refresh_token, expires_in } = response.data;

        await db("community_settings")
          .insert({
            community_id: client.communityId,
            substar_access_token: access_token,
            substar_refresh_token: refresh_token,
            substar_expires_at: new Date(Date.now() + (expires_in || 3600) * 1000)
          })
          .onConflict("community_id")
          .merge();
      }

      return { success: true };
    } catch (error) {
      console.error(`Creator ${request.provider} link failed:`, error);
      return { success: false };
    }
  }

  async linkUserAccount(request: LinkAccountRequest, client: Client): Promise<LinkAccountResponse> {
    const db = (rootServer as any).database;

    try {
      if (request.provider === 'patreon') {
        const response = await axios.post('https://www.patreon.com/api/oauth2/token',
          new URLSearchParams({
            code: request.code,
            grant_type: 'authorization_code',
            client_id: process.env.GLOBAL_PATREON_CLIENT_ID!,
            client_secret: process.env.GLOBAL_PATREON_CLIENT_SECRET!,
            redirect_uri: process.env.PATREON_REDIRECT_URI!,
          }).toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const { access_token, refresh_token, expires_in } = response.data;

        const userRes = await axios.get('https://www.patreon.com/api/oauth2/v2/identity', {
          headers: { Authorization: `Bearer ${access_token}` }
        });

        await db("user_links")
          .insert({
            root_user_id: client.userId,
            external_id: userRes.data.data.id,
            provider: 'patreon',
            access_token,
            refresh_token,
            expires_at: new Date(Date.now() + expires_in * 1000)
          })
          .onConflict("root_user_id")
          .merge();

      } else if (request.provider === 'substar') {
        const response = await axios.post('https://www.subscribestar.com/oauth2/token',
          new URLSearchParams({
            code: request.code,
            grant_type: 'authorization_code',
            client_id: process.env.GLOBAL_SUBSTAR_CLIENT_ID!,
            client_secret: process.env.GLOBAL_SUBSTAR_CLIENT_SECRET!,
            redirect_uri: process.env.SUBSTAR_REDIRECT_URI!,
          }).toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const { access_token, refresh_token, expires_in } = response.data;

        const userRes = await axios.post('https://www.subscribestar.com/api/graphql/v1',
          { query: 'query { user { id } }' },
          { headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' } }
        );

        const externalId = userRes.data.data.user.id;

        await db("user_links")
          .insert({
            root_user_id: client.userId,
            external_id: externalId,
            provider: 'substar',
            access_token,
            refresh_token,
            expires_at: new Date(Date.now() + expires_in * 1000)
          })
          .onConflict("root_user_id")
          .merge();
      }

      return { success: true };
    } catch (error) {
      console.error(`Member ${request.provider} link failed:`, error);
      return { success: false };
    }
  }

  async saveMapping(request: MappingRequest, client: Client): Promise<void> {
    const isAuthorized = await isAdminAuthorized(client.userId, "communityManageApps");
    if (!isAuthorized) throw new Error("Unauthorized");

    const db = (rootServer as any).database;

    try {
      if (!request.roleId) {
        await db("role_mappings")
          .where({ community_id: client.communityId, tier_id: request.tierId, provider: request.provider })
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
        .onConflict(['community_id', 'tier_id', 'provider'])
        .merge();

      return;
    } catch (error) {
      console.error("Failed to save mapping:", error);
      throw error;
    }
  }

  async saveSettings(request: SettingsRequest, client: Client): Promise<void> {
    const isAuthorized = await isAdminAuthorized(client.userId, "communityManageApps");
    if (!isAuthorized) throw new Error("Unauthorized");

    const db = (rootServer as any).database;

    try {
      await db("community_settings")
        .insert({
          community_id: client.communityId,
          patreon_webhook_secret: request.patreonWebhookSecret,
          substar_webhook_secret: request.substarWebhookSecret,
          enable_polling: request.enablePolling
        })
        .onConflict("community_id")
        .merge();

      return;
    } catch (error) {
      console.error("Failed to save webhook settings:", error);
      throw error;
    }
  }

  async triggerManualSync(client: Client): Promise<SyncResponse> {
    const isAuthorized = await isAdminAuthorized(client.userId, "communityManageApps");
    if (!isAuthorized) throw new Error("Unauthorized");

    return await this.runCommunitySync(client.communityId);
  }

  startBackgroundPolling() {
    console.log("Starting background polling...");
    cron.schedule('*/30 * * * *', async () => {
      console.log("[Auto-Sync] Waking up to poll communities on the half-hour...");
      const db = (rootServer as any).database;

      try {
        const activeCommunities = await db("community_settings").where({ enable_polling: true });

        for (const community of activeCommunities) {
          console.log(`[Auto-Sync] Running sync for community: ${community.community_id}`);
          await this.runCommunitySync(community.community_id);
        }
      } catch (error) {
        console.error("[Auto-Sync] Critical failure during polling loop:", error);
      }
    });
  }

  async runCommunitySync(communityId: string): Promise<SyncResponse> {
    const db = (rootServer as any).database;

    try {
      const allMembers = await rootServer.community.communityMembers.listAll();
      const mappings: RoleMappingRow[] = await db("role_mappings")
        .where({ community_id: communityId })
        .select("tier_id", "role_id", "provider");

      const managedRoleIds = mappings.map((m: RoleMappingRow) => m.role_id);
      let totalAddedCount = 0;
      let totalRemovedCount = 0;

      for (const member of allMembers) {
        const currentUserId = member.userId;

        // Fetch the user link object
        const link = await db("user_links").where({ root_user_id: currentUserId }).first();
        if (!link) continue;

        // Pass the entire link object to check their active tiers!
        const activeExternalTierIds = await this.getExternalUserTiers(link);

        const targetRoleIds = mappings
          .filter((m: RoleMappingRow) => activeExternalTierIds.includes(m.tier_id))
          .map((m: RoleMappingRow) => m.role_id);

        const currentRolesRes = await rootServer.community.communityMemberRoles.list({ userId: currentUserId as any });
        const currentRoleIds = currentRolesRes.communityRoleIds?.map(r => r as string) || [];

        const rolesToAdd = targetRoleIds.filter(id => !currentRoleIds.includes(id));
        const rolesToRemove = managedRoleIds.filter(id => currentRoleIds.includes(id) && !targetRoleIds.includes(id));

        for (const roleId of rolesToAdd) {
          await rootServer.community.communityMemberRoles.add({ communityRoleId: roleId as any, userIds: [currentUserId as any] });
          totalAddedCount++;
        }

        for (const roleId of rolesToRemove) {
          await rootServer.community.communityMemberRoles.remove({ communityRoleId: roleId as any, userIds: [currentUserId as any] });
          totalRemovedCount++;
        }

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      return {
        success: true,
        message: `Global sync complete. Processed ${allMembers.length} members.`,
        rolesAdded: [totalAddedCount.toString()],
        rolesRemoved: [totalRemovedCount.toString()]
      };
    } catch (error) {
      console.error(`Sync failed for community ${communityId}:`, error);
      return { success: false, message: "Sync failed", rolesAdded: [], rolesRemoved: [] };
    }
  }

  // ==========================================
  // INTERNAL HELPERS (Used by Webhooks & Sync)
  // ==========================================

  async syncMemberRoles(communityId: string, externalId: string, activeTiers: string[]) {
    const db = (rootServer as any).database;

    const link = await db("user_links").where({ external_id: externalId, provider: 'patreon' }).first();
    if (!link) return;

    const mappings = await db("role_mappings").where({ community_id: communityId });

    for (const mapping of mappings) {
      // Check if this mapping belongs to Patreon and if they have the tier
      if (mapping.provider !== 'patreon') continue;

      const isSubscribed = activeTiers.includes(mapping.tier_id);

      if (isSubscribed) {
        await rootServer.community.communityMemberRoles.add({
          communityRoleId: mapping.role_id,
          userIds: [link.root_user_id]
        });
      } else {
        await rootServer.community.communityMemberRoles.remove({
          communityRoleId: mapping.role_id,
          userIds: [link.root_user_id]
        });
      }
    }
  }

  private async getPatreonCommunityTiers(accessToken: string) {
    try {
      const response = await axios.get(
        "https://www.patreon.com/api/oauth2/v2/campaigns?include=tiers&fields[tier]=title,description",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      return response.data.included
        ?.filter((obj: any) => obj.type === "tier")
        .map((tier: any) => ({
          id: tier.id.toString(),
          name: tier.attributes.title,
          provider: "patreon"
        })) || [];
    } catch (err) {
      console.error("Failed to fetch community tiers:", err);
      return [];
    }
  }

  private async getSubscribeStarCommunityTiers(accessToken: string) {
    try {
      const response = await axios.post('https://www.subscribestar.com/api/graphql/v1',
        { query: 'query { content_provider_profile { tiers { nodes { id title } } } }' },
        { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
      );

      const tiersList = response.data.data.content_provider_profile.tiers.nodes || [];
      return tiersList.map((tier: any) => ({
        id: tier.id.toString(),
        name: tier.title,
        provider: "substar"
      }));
    } catch (err) {
      console.error("Failed to fetch SubscribeStar tiers:", err);
      return [];
    }
  }

  private async getExternalUserTiers(userLink: any): Promise<string[]> {
    const accessToken = await this.getValidUserAccessToken(userLink);
    if (!accessToken) return [];

    try {
      if (userLink.provider === 'patreon') {
        const response = await axios.get(
          "https://www.patreon.com/api/oauth2/v2/identity?include=memberships.currently_entitled_tiers",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!response.data.included) return [];
        return response.data.included
          .filter((item: any) => item.type === 'tier')
          .map((tier: any) => tier.id.toString());

      } else if (userLink.provider === 'substar') {
        const response = await axios.post('https://www.subscribestar.com/api/graphql/v1',
          { query: 'query { user { subscriptions { nodes { tier_id } } } }' },
          { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
        );
        const subscriptions = response.data.data?.user?.subscriptions?.nodes || [];
        return subscriptions.map((sub: any) => sub.tier_id.toString());
      }
      return [];
    } catch (error) {
      console.error(`Failed to fetch active tiers for user ${userLink.root_user_id} (${userLink.provider}):`, error);
      return [];
    }
  }

  private async getValidUserAccessToken(userLink: any): Promise<string | null> {
    const db = (rootServer as any).database;

    // Check if token is still valid
    if (new Date(userLink.expires_at).getTime() >= (Date.now() + 5 * 60 * 1000)) {
      return userLink.access_token;
    }

    try {
      let endpoint = '';
      let payload: any = {};

      if (userLink.provider === 'patreon') {
        endpoint = 'https://www.patreon.com/api/oauth2/token';
        payload = {
          grant_type: 'refresh_token',
          refresh_token: userLink.refresh_token,
          client_id: process.env.GLOBAL_PATREON_CLIENT_ID!,
          client_secret: process.env.GLOBAL_PATREON_CLIENT_SECRET!
        };
      } else if (userLink.provider === 'substar') {
        endpoint = 'https://www.subscribestar.com/oauth2/token';
        payload = {
          grant_type: 'refresh_token',
          refresh_token: userLink.refresh_token,
          client_id: process.env.GLOBAL_SUBSTAR_CLIENT_ID!,
          client_secret: process.env.GLOBAL_SUBSTAR_CLIENT_SECRET!
        };
      }

      const response = await axios.post(endpoint, new URLSearchParams(payload).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const { access_token, refresh_token, expires_in } = response.data;

      await db("user_links")
        .where({ root_user_id: userLink.root_user_id, provider: userLink.provider })
        .update({
          access_token,
          refresh_token,
          expires_at: new Date(Date.now() + expires_in * 1000)
        });

      return access_token;
    } catch (error) {
      console.error(`Failed to refresh User ${userLink.provider} token:`, error);
      return null;
    }
  }

  private async getValidCreatorAccessToken(communityId: string, provider: 'patreon' | 'substar'): Promise<string | null> {
    const db = (rootServer as any).database;
    const config = await db("community_settings").where({ community_id: communityId }).first();
    if (!config) return null;

    if (provider === 'patreon') {
      if (!config.patreon_access_token) return null;
      if (new Date(config.patreon_expires_at).getTime() >= (Date.now() + 5 * 60 * 1000)) {
        return config.patreon_access_token;
      }

      try {
        const response = await axios.post('https://www.patreon.com/api/oauth2/token',
          new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: config.patreon_refresh_token,
            client_id: process.env.GLOBAL_PATREON_CLIENT_ID!,
            client_secret: process.env.GLOBAL_PATREON_CLIENT_SECRET!,
          }).toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const { access_token, refresh_token, expires_in } = response.data;
        await db("community_settings").where({ community_id: communityId }).update({
          patreon_access_token: access_token,
          patreon_refresh_token: refresh_token,
          patreon_expires_at: new Date(Date.now() + expires_in * 1000)
        });
        return access_token;
      } catch (error) {
        console.error("Failed to refresh Creator Patreon token:", error);
        return null;
      }
    } else if (provider === 'substar') {
      if (!config.substar_access_token) return null;
      if (new Date(config.substar_expires_at).getTime() >= (Date.now() + 5 * 60 * 1000)) {
        return config.substar_access_token;
      }

      try {
        const response = await axios.post('https://www.subscribestar.com/oauth2/token',
          new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: config.substar_refresh_token,
            client_id: process.env.GLOBAL_SUBSTAR_CLIENT_ID!,
            client_secret: process.env.GLOBAL_SUBSTAR_CLIENT_SECRET!,
          }).toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const { access_token, refresh_token, expires_in } = response.data;
        await db("community_settings").where({ community_id: communityId }).update({
          substar_access_token: access_token,
          substar_refresh_token: refresh_token,
          substar_expires_at: new Date(Date.now() + expires_in * 1000)
        });
        return access_token;
      } catch (error) {
        console.error("Failed to refresh Creator SubscribeStar token:", error);
        return null;
      }
    }
    return null;
  }
}

export const subService = new SubService();