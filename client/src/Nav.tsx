import './Nav.css';
import React from "react";

// Define the exact strings we expect for the pages
export type PageView = 'user' | 'admin';

// Tell TypeScript what props this component accepts
interface NavProps {
    activePage: PageView;
    onNavigate: (page: PageView) => void;
    isAdmin: boolean;
}

const Nav: React.FC<NavProps> = ({ activePage, onNavigate, isAdmin }) => {
    // We use your PageView types as the IDs
    // Base tabs that everyone sees
    const tabs: { id: PageView, label: string }[] = [
        { id: 'user', label: 'User' }
    ];

    // Conditionally push the admin tab into the array
    if (isAdmin) {
        tabs.push({ id: 'admin', label: 'Admin' });
    }

    return (
        <div className="nav-container">
            <div className="nav-wrap">
                <div className="bubble active"></div>
                <div className="bubble hover"></div>
                <nav className="nav">
                    {tabs.map((tab) => (
                        <a
                            key={tab.id}
                            href={`#${tab.id}`} // Dummy link just for valid HTML
                            className={activePage === tab.id ? 'active' : ''}
                            onClick={(e) => {
                                e.preventDefault();
                                onNavigate(tab.id); // Tell App.tsx to change the page
                            }}
                        >
                            {tab.label}
                        </a>
                    ))}
                </nav>
            </div>
        </div>
    );
}

export default Nav;