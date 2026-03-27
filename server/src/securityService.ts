import { CommunityMember, rootServer, CommunityRole } from "@rootsdk/server-app";

// 1. Extract the specific keys from the SDK's role permission object.
// NonNullable ensures we drop any 'undefined' or 'null' union types so keyof works perfectly.
type PermissionKey = keyof NonNullable<CommunityRole["communityPermission"]>;

// 2. Set 'perm' to use our new highly-specific type
export async function isAdminAuthorized(userId: any, perm: PermissionKey): Promise<boolean> {
    try {
        const member: CommunityMember = await rootServer.community.communityMembers.get({ userId });

        if (!member.communityRoleIds || member.communityRoleIds.length === 0) {
            return false;
        }

        for (const roleId of member.communityRoleIds) {
            const role: CommunityRole = await rootServer.community.communityRoles.get({ id: roleId });

            if (role.communityPermission && role.communityPermission[perm]) {
                return true;
            }
        }

        return false;

    } catch (error) {
        console.error("Permission check failed:", error);
        return false;
    }
}