import React, { useEffect, useState, useRef } from "react";
import { subscriptionServiceClient } from "@submanager/gen-client";
import { Tier, RootRole } from "@submanager/gen-shared";
import './App.css';
import { ProviderIcon } from "./BrandIcons";

const App: React.FC = () => {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [roles, setRoles] = useState<RootRole[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [isLinked, setIsLinked] = useState(false);

  const PATREON_CLIENT_ID = "mOJtHYhxNEfozwf8petnM8BsyE6_UUt_6TH9_vvJazmH2e0QuWS6JsRcK-Z5SBcq";
  const REDIRECT_URI = encodeURIComponent("http://localhost:5173/api/auth/patreon/callback");

  const handleLinkPatreon = () => {
    // Scopes required for identity and membership info
    const scope = "identity identity.memberships";
    window.location.href = `https://www.patreon.com/oauth2/authorize?response_type=code&client_id=${PATREON_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${scope}`;
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      const linkAccount = async () => {
        try {
          const res = await subscriptionServiceClient.linkPatreonAccount({ code });
          if (res.success) {
            setIsLinked(true);
            alert("Account linked successfully!");
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
    subscriptionServiceClient.getTiers().then(res => {
      setTiers(res.tiers || []);
      setRoles(res.roles || []);

      // Auto-populate the dropdowns with existing mappings from the database
      const initialMappings: Record<string, string> = {};
      res.existingMappings?.forEach(m => {
        initialMappings[`${m.provider}-${m.tierId}`] = m.roleId;
      });
      setMappings(initialMappings);

      setIsLinked(res.isPatreonLinked);
      
      // OPTIONAL: If your API eventually returns existing mappings, 
      // you would initialize the state here.
    });
  }, []);

  const handleManualSync = async () => {
    const confirmSync = confirm("This will sync roles for ALL members in the community. Continue?");
    if (!confirmSync) return;
  
    try {
      const res = await subscriptionServiceClient.triggerManualSync();
      alert(`${res.message}\nAdded: ${res.rolesAdded.length-1}\nRemoved: ${res.rolesRemoved.length-1}`);
    } catch (err) {
      alert("Sync request failed.");
    }
  };

  const handleDropdownChange = (tier: Tier, selectedRoleId: string) => {
    const combinedKey = `${tier.provider}-${tier.id}`;

    // 1. Update the local UI state for just this specific tier
    setMappings(prev => ({
      ...prev,
      [combinedKey]: selectedRoleId
    }));

    // 2. Call the backend service
    subscriptionServiceClient.saveMapping({ 
      tierId: tier.id, 
      roleId: selectedRoleId, 
      provider: tier.provider 
    });
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="header-text">
            <h1 className="app-title">Subscription Manager</h1>
          </div>
          {isLinked ? (
            <button className="button-patreon" disabled>
              <ProviderIcon provider="patreon" size={22}/> 
              Patreon Linked
            </button>
          ) : (
            <button className="button-patreon" onClick={handleLinkPatreon}>
              <ProviderIcon provider="patreon" size={22}/> 
              Link Patreon Account
            </button>
          )}

          <button className="button-substar">
            <ProviderIcon provider="substar" size={32}/>
            <span>Sign into SubscribeStar</span>
          </button>
          <button className="button-primary" onClick={handleManualSync}>
            <svg width="14" height="18" viewBox="0 0 14 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.99999 2.33149V0.83982C6.99999 0.46482 6.54999 0.281487 6.29166 0.548154L3.95833 2.87315C3.79166 3.03982 3.79166 3.29815 3.95833 3.46482L6.28333 5.78982C6.54999 6.04815 6.99999 5.86482 6.99999 5.48982V3.99815C9.75833 3.99815 12 6.23982 12 8.99815C12 9.65649 11.875 10.2982 11.6333 10.8732C11.5083 11.1732 11.6 11.5148 11.825 11.7398C12.25 12.1648 12.9667 12.0148 13.1917 11.4565C13.5 10.6982 13.6667 9.86482 13.6667 8.99815C13.6667 5.31482 10.6833 2.33149 6.99999 2.33149ZM6.99999 13.9982C4.24166 13.9982 1.99999 11.7565 1.99999 8.99815C1.99999 8.33982 2.12499 7.69815 2.36666 7.12315C2.49166 6.82315 2.39999 6.48149 2.17499 6.25649C1.74999 5.83149 1.03333 5.98149 0.808328 6.53982C0.499995 7.29815 0.333328 8.13149 0.333328 8.99815C0.333328 12.6815 3.31666 15.6648 6.99999 15.6648V17.1565C6.99999 17.5315 7.45 17.7148 7.70833 17.4482L10.0333 15.1232C10.2 14.9565 10.2 14.6982 10.0333 14.5315L7.70833 12.2065C7.45 11.9482 6.99999 12.1315 6.99999 12.5065V13.9982Z" fill="currentColor"/>
            </svg>
            <span>Sync Users' Tiers</span>
          </button>
        </div>
      </header>

      {tiers.map(tier => (
        <div className="component-section" key={`${tier.provider}-${tier.id}`} style={{ margin: "10px 0", justifyContent: "space-between", display: "flex", alignItems: "center"}}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <ProviderIcon provider={tier.provider} size={32}/>
            <strong>{tier.name}</strong>
          </div>
          <Dropdown
            options={[
              { value: '', label: 'Map to Root Role...' },
              ...roles.map(r => ({ value: r.id, label: r.name }))
            ]}
            // Pass the specific value for this specific tier
            value={mappings[`${tier.provider}-${tier.id}`] || ''}
            onChange={(selectedRoleId) => handleDropdownChange(tier, selectedRoleId)}
            placeholder="Select an option"
          />
        </div>
      ))}
    </div>
  );
};
interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div className="dropdown-container" ref={dropdownRef}>
      <button
        type="button"
        className={`dropdown-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="dropdown-trigger-text">
          {selectedOption?.label || placeholder}
        </span>
        <span className="dropdown-trigger-chevron">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="#fff" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </button>

      {isOpen && (
        <div className="dropdown-menu" role="listbox">
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              className={`dropdown-option ${option.value === value ? 'selected' : ''}`}
              onClick={() => handleSelect(option.value)}
              role="option"
              aria-selected={option.value === value}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default App; // Ensure this export exists