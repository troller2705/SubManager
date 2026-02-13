import React, { useEffect, useState } from "react";
import { subscriptionServiceClient } from "@submanager/gen-client";
import { Tier } from "@submanager/gen-shared";
import { rootClient } from "@rootsdk/client-app";

const App: React.FC = () => {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [availableRoles, setAvailableRoles] = useState<{ id: string; name: string }[]>([]);

  // 1. Fetch data on load
  useEffect(() => {
    // 1. Fetch available tiers from your SubService backend
    subscriptionServiceClient.getTiers().then((res) => setTiers(res.tiers));
  
    
  }, []);

  // 2. Handle OAuth Redirection
  const handleConnectPatreon = () => {
    // Construct the Patreon Authorize URL
    const clientId = "YOUR_PATREON_CLIENT_ID"; // Ideally fetched from a config RPC
    const redirectUri = encodeURIComponent("https://your-app-domain.com/patreon/callback");
    const scope = encodeURIComponent("identity identity[email] campaigns campaigns.members");
    
    const authUrl = `https://www.patreon.com/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;
    
    // Redirect the browser to Patreon
    window.location.href = authUrl;
  };

  // 3. Save Mappings
  const handleSaveMapping = async (tierId: string, roleId: string, provider: string) => {
    try {
      await subscriptionServiceClient.saveMapping({
        tierId,
        roleId,
        provider
      });
      alert("Mapping saved successfully!");
    } catch (err) {
      console.error("Failed to save mapping:", err);
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", color: "#fff", background: "#1a1a1a" }}>
      <h2>Subscription Manager</h2>
      
      <div style={{ display: "flex", gap: "10px", marginBottom: "30px" }}>
        <button 
          onClick={handleConnectPatreon}
          style={{ padding: "10px 20px", cursor: "pointer", background: "#f96854", border: "none", borderRadius: "4px", color: "white" }}
        >
          Connect Patreon
        </button>
        <button 
          onClick={() => alert("SubscribeStar OAuth logic here")}
          style={{ padding: "10px 20px", cursor: "pointer", background: "#00b2ff", border: "none", borderRadius: "4px", color: "white" }}
        >
          Connect SubscribeStar
        </button>
      </div>

      <h3>Tier to Role Mappings</h3>
      <div style={{ display: "grid", gap: "15px" }}>
        {tiers.map((tier) => (
          <div key={tier.id} style={{ border: "1px solid #444", padding: "15px", borderRadius: "8px", background: "#252525" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: "0.8em", color: "#888", display: "block" }}>{tier.provider.toUpperCase()}</span>
                <strong>{tier.name}</strong>
              </div>
              
              <div style={{ display: "flex", gap: "10px" }}>
                <select 
                  id={`role-select-${tier.id}`}
                  style={{ padding: "5px", borderRadius: "4px", background: "#333", color: "#fff", border: "1px solid #555" }}
                >
                  <option value="">Select Root Role...</option>
                  {availableRoles.map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
                
                <button 
                  onClick={() => {
                    const select = document.getElementById(`role-select-${tier.id}`) as HTMLSelectElement;
                    if (select.value) {
                      handleSaveMapping(tier.id, select.value, tier.provider);
                    } else {
                      alert("Please select a role first.");
                    }
                  }}
                  style={{ padding: "5px 15px", borderRadius: "4px", background: "#4caf50", color: "white", border: "none", cursor: "pointer" }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {tiers.length === 0 && (
        <p style={{ color: "#888" }}>No tiers found. Connect an account above to pull your tiers.</p>
      )}
    </div>
  );
};

export default App;