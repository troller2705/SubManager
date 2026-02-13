import React, { useEffect, useState } from "react";
import { subscriptionServiceClient } from "@submanager/gen-client";
import { Tier, RootRole } from "@submanager/gen-shared";

const App: React.FC = () => {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [roles, setRoles] = useState<RootRole[]>([]);

  useEffect(() => {
    // Single call to get all necessary data for the UI
    subscriptionServiceClient.getTiers().then(res => {
      setTiers(res.tiers);
      setRoles(res.roles);
    });
  }, []);

  const handleSave = async (tierId: string, roleId: string, provider: string) => {
    await subscriptionServiceClient.saveMapping({ tierId, roleId, provider });
    alert("Role mapping updated!");
  };

  return (
    <div style={{ padding: "20px", color: "#fff", background: "#1a1a1a" }}>
      <h2>SubManager Dashboard</h2>
      {tiers.map(tier => (
        <div key={tier.id} style={{ border: "1px solid #333", padding: "10px", margin: "10px 0" }}>
          <strong>{tier.name}</strong>
          <select 
            style={{ marginLeft: "10px" }}
            onChange={(e) => handleSave(tier.id, e.target.value, tier.provider)}
          >
            <option value="">Link to Root Role...</option>
            {roles.map(role => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
};

export default App;