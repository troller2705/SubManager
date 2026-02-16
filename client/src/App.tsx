import React, { useEffect, useState } from "react";
import { subscriptionServiceClient } from "@submanager/gen-client";
import { Tier, RootRole } from "@submanager/gen-shared";

const App: React.FC = () => {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [roles, setRoles] = useState<RootRole[]>([]);

  useEffect(() => {
    // Initial data fetch pattern from ProtobufService sample
    subscriptionServiceClient.getTiers().then(res => {
      setTiers(res.tiers || []);
      setRoles(res.roles || []);
    });
  }, []);

  const handleManualSync = async () => {
    await subscriptionServiceClient.triggerManualSync();
    alert("Role sync triggered!");
  };

  return (
    <div style={{ padding: "20px", color: "#fff", background: "#1a1a1a" }}>
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>Subscription Manager</h2>
        <button onClick={handleManualSync}>Sync My Roles</button>
      </header>

      {tiers.map(tier => (
        <div key={tier.id} style={{ border: "1px solid #333", padding: "10px", margin: "10px 0" }}>
          <strong>{tier.name}</strong>
          <select onChange={(e) => subscriptionServiceClient.saveMapping({ 
            tierId: tier.id, 
            roleId: e.target.value, 
            provider: tier.provider 
          })}>
            <option value="">Map to Root Role...</option>
            {roles.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
};

export default App; // Ensure this export exists