import React, { useEffect, useState } from "react";
import { subscriptionServiceClient } from "@submanager/gen-client";
import '../App.css';
import { ProviderIcon } from "../BrandIcons";

const Users: React.FC = () => {
    const [isLinked, setIsLinked] = useState(false);

    // Make sure these match your Patreon Client settings
    const PATREON_CLIENT_ID = "mOJtHYhxNEfozwf8petnM8BsyE6_UUt_6TH9_vvJazmH2e0QuWS6JsRcK-Z5SBcq";
    const REDIRECT_URI = encodeURIComponent("http://localhost:5173/api/auth/patreon/callback");

    const handleLinkPatreon = () => {
        // Scopes required for standard users to check their pledges
        const scope = "identity identity.memberships";
        window.location.href = `https://www.patreon.com/oauth2/authorize?response_type=code&client_id=${PATREON_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${scope}`;
    };

    useEffect(() => {
        // 1. Handle OAuth Callback
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        if (code) {
            const linkAccount = async () => {
                try {
                    const res = await subscriptionServiceClient.linkPatreonAccount({ code });
                    if (res.success) {
                        setIsLinked(true);
                        alert("Patreon Account linked successfully! Your roles will be synced.");
                    }
                } catch (err) {
                    console.error("Linking failed", err);
                } finally {
                    // Clean the code out of the URL
                    window.history.replaceState({}, document.title, "/");
                }
            };
            linkAccount();
        }

        // 2. Fetch Initial State (Check if already linked)
        subscriptionServiceClient.getTiers().then(res => {
            setIsLinked(res.isPatreonLinked);
        });
    }, []);

    return (
        <div className="app-container">
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
                {isLinked ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                        <div style={{ color: "#059669", display: "flex", alignItems: "center", gap: "8px", fontSize: "1.2rem", fontWeight: "bold" }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 11.08V12a10 10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                            Patreon Successfully Linked
                        </div>
                        <p style={{ color: "var(--text-secondary)" }}>Your roles are automatically managed by the system.</p>
                    </div>
                ) : (
                    <>
                        <p>Link your Patreon account to sync your active tiers.</p>
                        <button className="button-patreon" onClick={handleLinkPatreon} style={{ padding: "12px 24px", fontSize: "1.1rem" }}>
                            <ProviderIcon provider="patreon" size={24}/>
                            Link Patreon Account
                        </button>
                    </>
                )}

                {/* Placeholder for SubscribeStar for standard users */}
                <button className="button-substar" disabled={isLinked} style={{ opacity: isLinked ? 0.5 : 1 }}>
                    <ProviderIcon provider="substar" size={24}/>
                    <span>Link SubscribeStar</span>
                </button>
            </div>
        </div>
    );
};

export default Users;