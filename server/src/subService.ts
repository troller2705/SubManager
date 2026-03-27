import { Client, CommunityMemberRoleAddRequest, CommunityMemberRoleRemoveRequest, rootServer } from "@rootsdk/server-app";
import { TierList, MappingRequest, SyncResponse, LinkPatreonRequest, LinkPatreonResponse, SettingsRequest } from "@submanager/gen-shared";
import { SubscriptionServiceBase } from "@submanager/gen-server";
import axios from 'axios';
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
    const db = (rootServer as any).database;
    const userId = client.userId;
    const communityId = client.communityId;

    // 1. Fetch Root Community Roles
    const communityRoles = await rootServer.community.communityRoles.list();
    const roles = communityRoles.map(r => ({ id: r.id, name: r.name }));

    // 2. Fetch existing mappings for the dropdowns
    const savedMappings = await db("role_mappings")
        .where({ community_id: communityId })
        .select("tier_id as tierId", "role_id as roleId", "provider");

    // 3. Check User Linking Status
    const linkedAccount = await db("user_links")
        .where({ root_user_id: userId, provider: 'patreon' })
        .first();

    // 4. Fetch the Creator's Tiers (if the admin linked their creator account)
    // We use the helper to automatically refresh the creator's token if it expired
    const validCreatorToken = await this.getValidCreatorAccessToken(communityId);
    const tiers = validCreatorToken
        ? await this.getPatreonCommunityTiers(validCreatorToken)
        : [];

    const isAdmin = await isAdminAuthorized(userId, "communityManageApps");

    return {
      tiers,
      roles,
      existingMappings: savedMappings,
      isPatreonLinked: !!linkedAccount,
      isAdmin: isAdmin
    };
  }

  async linkCreatorPatreon(request: LinkPatreonRequest, client: Client): Promise<LinkPatreonResponse> {
    const isAuthorized = await isAdminAuthorized(client.userId, "communityManageApps");
    if (!isAuthorized) throw new Error("Unauthorized");

    const db = (rootServer as any).database;

    try {
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

      return { success: true };
    } catch (error) {
      console.error("Creator Patreon link failed:", error);
      return { success: false };
    }
  }

  async linkPatreonAccount(request: LinkPatreonRequest, client: Client): Promise<LinkPatreonResponse> {
    const db = (rootServer as any).database;

    try {
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

      return { success: true };
    } catch (error) {
      console.error("Member Patreon link failed:", error);
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
      // In the SaaS model, we only need to save the webhook secret!
      // The client ID/Secret are globally managed by the .env file.
      await db("community_settings")
          .insert({
            community_id: client.communityId,
            patreon_webhook_secret: request.patreonWebhookSecret,
            substar_webhook_secret: request.substarWebhookSecret
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

    const db = (rootServer as any).database;
    const communityId = client.communityId;

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

        const link = await db("user_links").where({ root_user_id: currentUserId }).first();
        if (!link) continue;

        const activeExternalTierIds = await this.getExternalUserTiers(currentUserId as any);

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
      console.error("Manual Sync failed:", error);
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

  private async getExternalUserTiers(userId: string): Promise<string[]> {
    const accessToken = await this.getValidAccessToken(userId);
    if (!accessToken) return [];

    try {
      return await this.fetchPatreonTiers(accessToken);
    } catch (err) {
      console.error(`Failed to fetch Patreon tiers for ${userId}`, err);
      return [];
    }
  }

  private async fetchPatreonTiers(accessToken: string): Promise<string[]> {
    const response = await axios.get(
        "https://www.patreon.com/api/oauth2/v2/identity?include=memberships.currently_entitled_tiers&fields[tier]=title",
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    return response.data.included
        ?.filter((obj: any) => obj.type === 'tier')
        ?.map((tier: any) => tier.id) || [];
  }

  private async getPatreonCommunityTiers(accessToken: string) {
    const response = await fetch(
        "https://www.patreon.com/api/oauth2/v2/campaigns?include=tiers&fields[tier]=title,description",
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const data = await response.json();
    return data.included
        ?.filter((obj: any) => obj.type === "tier")
        .map((tier: any) => ({
          id: tier.id,
          name: tier.attributes.title,
          provider: "patreon"
        })) || [];
  }

  private async getValidAccessToken(userId: string): Promise<string | null> {
    const db = (rootServer as any).database;
    const link = await db("user_links").where({ root_user_id: userId, provider: 'patreon' }).first();
    if (!link) return null;

    if (new Date(link.expires_at).getTime() >= (Date.now() + 5 * 60 * 1000)) {
      return link.access_token;
    }

    try {
      const response = await axios.post('https://www.patreon.com/api/oauth2/token',
          new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: link.refresh_token,
            client_id: process.env.GLOBAL_PATREON_CLIENT_ID!,
            client_secret: process.env.GLOBAL_PATREON_CLIENT_SECRET!,
          }).toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const { access_token, refresh_token, expires_in } = response.data;
      await db("user_links").where({ root_user_id: userId, provider: 'patreon' }).update({
        access_token,
        refresh_token,
        expires_at: new Date(Date.now() + expires_in * 1000)
      });

      return access_token;
    } catch (error) {
      console.error("Failed to refresh User Patreon token:", error);
      return null;
    }
  }

  private async getValidCreatorAccessToken(communityId: string): Promise<string | null> {
    const db = (rootServer as any).database;
    const config = await db("community_settings").where({ community_id: communityId }).first();
    if (!config || !config.patreon_access_token) return null;

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
  }
}

export const subService = new SubService();