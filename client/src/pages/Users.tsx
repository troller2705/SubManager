import React, { useEffect, useState } from "react";
import { subscriptionServiceClient } from "@submanager/gen-client";
import '../App.css';
import './Users.css';
import { ProviderIcon } from "../BrandIcons";
// Make sure you import the Substar vars here!
import { PATREON_CLIENT_ID, PATREON_REDIRECT_URI, PATREON_SCOPE, SUBSTAR_CLIENT_ID, SUBSTAR_REDIRECT_URI } from '../vars.ts';

const Users: React.FC = () => {
    const [isPatreonLinked, setIsPatreonLinked] = useState(false);
    // You can add an isSubstarLinked state here later once we update the backend protocol to return it!
    const [isSubstarLinked, setIsSubstarLinked] = useState(false);

    const handleLinkUserPatreon = () => {
        window.location.href = `https://www.patreon.com/oauth2/authorize?response_type=code&client_id=${PATREON_CLIENT_ID}&redirect_uri=${PATREON_REDIRECT_URI}&scope=${PATREON_SCOPE}&state=user-patreon`;
    };

    const handleLinkUserSubstar = () => {
        const scope = "user.read"; // Standard user scope
        window.location.href = `https://subscribestar.com/oauth2/authorize?response_type=code&client_id=${SUBSTAR_CLIENT_ID}&redirect_uri=${SUBSTAR_REDIRECT_URI}&scope=${scope}&state=user-substar`;
    };

    const handleLogout = async (e: React.MouseEvent<HTMLButtonElement>) => {
        const buttonClassName = e.currentTarget.className;
        const match = buttonClassName.match(/button-([a-zA-Z0-9\-]+)/);

        if (match) {
            const provider = match[1]; // "patreon" or "substar"

            const confirmUnlink = confirm(`Are you sure you want to unlink your Creator ${provider} account?`);
            if (!confirmUnlink) return;

            try {
                // Call the new RPC
                await subscriptionServiceClient.unlinkUserAccount({ provider });

                // If it's Patreon, update the UI state
                if (provider === 'patreon') {
                    setIsPatreonLinked(false);
                }
                else if (provider === 'substar') {
                    setIsSubstarLinked(false);
                }
                alert(`Successfully unlinked ${provider}!`);
            } catch (err) {
                alert("Failed to unlink account.");
            }
        }
    }

    useEffect(() => {
        subscriptionServiceClient.getTiers().then(res => {
            setIsPatreonLinked(res.isPatreonLinked);
            setIsSubstarLinked(res.isSubstarLinked);
        });
    }, []);

    return (
      <div>
          <header className="app-header">
              <div className="header-content">
                  <div className="header-text">
                      <h1 className="app-title">Link Your Memberships</h1>
                      <p style={{ color: "var(--text-secondary)", marginTop: "5px" }}>
                          Connect your accounts to automatically receive your roles in the community.
                      </p>
                  </div>
              </div>
          </header>

          <div className="component-section" style={{ margin: "20px 0", display: "flex", flexDirection: "column", gap: "15px", alignItems: "center", padding: "30px" }}>
              {isPatreonLinked ? (
                <>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "15px", backgroundColor: "rgba(35, 203, 167, 0.1)", border: "1px solid #23cba7", borderRadius: "8px", width: "100%" }}>
                        <div style={{ color: "var(--rootsdk-success)", display: "flex", alignItems: "center", gap: "8px", fontSize: "1.2rem", fontWeight: "bold" }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                            Patreon Successfully Linked
                        </div>
                        <p style={{ color: "var(--text-secondary)" }}>Your roles are automatically managed by the system.</p>
                    </div>
                    <button className="button-patreon" onClick={handleLogout} style={{ padding: "12px 24px", fontSize: "1.1rem", opacity: 0.5 }}>
                        <ProviderIcon provider="patreon" size={24}/>
                        Disconnect Patreon
                    </button>
                </>
              ) : isSubstarLinked ? (
                    <>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "15px", backgroundColor: "rgba(35, 203, 167, 0.1)", border: "1px solid #23cba7", borderRadius: "8px", width: "100%" }}>
                            <div style={{ color: "var(--rootsdk-success)", display: "flex", alignItems: "center", gap: "8px", fontSize: "1.2rem", fontWeight: "bold" }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                </svg>
                                SubscribeStar Successfully Linked
                            </div>
                            <p style={{ color: "var(--text-secondary)" }}>Your roles are automatically managed by the system.</p>
                        </div>
                        <button className="button-substar" onClick={handleLogout} style={{ padding: "12px 24px", fontSize: "1.1rem", opacity: 0.5 }}>
                            <ProviderIcon provider="substar" size={24}/>
                            Disconnect SubscribeStar
                        </button>
                    </>
                  ): (
                    <>
                        <p>Link your Patreon account to sync your active tiers.</p>
                        <button className="button-patreon" onClick={handleLinkUserPatreon} style={{ padding: "12px 24px", fontSize: "1.1rem" }}>
                            <ProviderIcon provider="patreon" size={24}/>
                            Link Patreon Account
                        </button>
                        <p style={{ marginTop: "10px" }}>Or link your SubscribeStar account:</p>
                        <button
                          className="button-substar"
                          onClick={handleLinkUserSubstar}
                          style={{ padding: "12px 24px", fontSize: "1.1rem" }}
                        >
                            <ProviderIcon provider="substar" size={24}/>
                            <span>Link SubscribeStar</span>
                        </button>
                    </>
                  )}

          </div>
      </div>
    );
};

export default Users;