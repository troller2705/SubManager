const PATREON_CLIENT_ID = "mOJtHYhxNEfozwf8petnM8BsyE6_UUt_6TH9_vvJazmH2e0QuWS6JsRcK-Z5SBcq";
const PATREON_REDIRECT_URI = encodeURIComponent("http://localhost:5173/api/auth/patreon/callback");
const PATREON_SCOPE = "identity identity.memberships";

const SUBSTAR_CLIENT_ID = "lxaGo_Yasit7XJgjsCO0AgdfbMfPROOeZPHD7XhJfmw";
const SUBSTAR_REDIRECT_URI = encodeURIComponent("http://localhost:5173/api/auth/substar/callback");
const SUBSTAR_SCOPE = "user.read+user.subscriptions.read";


export { PATREON_CLIENT_ID, PATREON_REDIRECT_URI, PATREON_SCOPE, SUBSTAR_CLIENT_ID, SUBSTAR_REDIRECT_URI, SUBSTAR_SCOPE };