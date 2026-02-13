import React, { useEffect, useState } from "react";
import { subscriptionServiceClient } from "@submanager/gen-client";
import { Tier } from "@submanager/gen-shared";

const App: React.FC = () => {
  const [tiers, setTiers] = useState<Tier[]>([]);

  const handleSave = async (tierId: string, roleId: string, provider: string) => {
    await subscriptionServiceClient.saveMapping({
      tierId,  // Maps to tier_id in proto
      roleId,  // Maps to role_id in proto
      provider
    });
    alert("Mapping saved successfully!");
  };

  useEffect(() => {
    // Zero arguments for rootsdk.Void
    subscriptionServiceClient.getTiers().then(res => setTiers(res.tiers));
  }, []);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h2>Subscription Manager</h2>
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button onClick={() => alert("Redirecting to Patreon OAuth...")}>Connect Patreon</button>
        <button onClick={() => alert("Redirecting to SubscribeStar OAuth...")}>Connect SubscribeStar</button>
      </div>
      <h3>Mapped Tiers</h3>
      {tiers.map(tier => (
        <div key={tier.id} style={{ border: "1px solid #444", margin: "5px 0", padding: "10px", borderRadius: "4px" }}>
          <strong>[{tier.provider}]</strong> {tier.name}
          <button style={{ float: "right" }}>Assign Root Role</button>
        </div>
      ))}
    </div>
  );
};

export default App;