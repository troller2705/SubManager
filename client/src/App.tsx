import React, { useEffect, useState, useRef } from "react";
import { subscriptionServiceClient } from "@submanager/gen-client";
import { Tier, RootRole } from "@submanager/gen-shared";
import './App.css';

const App: React.FC = () => {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [roles, setRoles] = useState<RootRole[]>([]);
  
  // Use an object to track values per Tier ID
  // Format: { [tierId: string]: roleId }
  const [mappings, setMappings] = useState<Record<string, string>>({});

  useEffect(() => {
    subscriptionServiceClient.getTiers().then(res => {
      setTiers(res.tiers || []);
      setRoles(res.roles || []);
      
      // OPTIONAL: If your API eventually returns existing mappings, 
      // you would initialize the state here.
    });
  }, []);

  const handleManualSync = async () => {
    await subscriptionServiceClient.triggerManualSync();
    alert("Role sync triggered!");
  };

  const handleDropdownChange = (tier: Tier, selectedRoleId: string) => {
    // 1. Update the local UI state for just this specific tier
    setMappings(prev => ({
      ...prev,
      [tier.id]: selectedRoleId
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
          <button className="button-primary" onClick={handleManualSync}>Sync My Roles</button>
        </div>
      </header>

      {tiers.map(tier => (
        <div key={tier.id} style={{ border: "1px solid #333", padding: "10px", margin: "10px 0", borderRadius: "12px", justifyContent: "space-between", display: "flex", alignItems: "center" }}>
          <strong>{tier.provider.charAt(0).toUpperCase() + tier.provider.slice(1)} | {tier.name}</strong>
          <Dropdown
            options={[
              { value: '', label: 'Map to Root Role...' },
              ...roles.map(r => ({ value: r.id, label: r.name }))
            ]}
            // Pass the specific value for this specific tier
            value={mappings[tier.id] || ''}
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
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
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