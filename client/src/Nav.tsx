import './Nav.css';
import React, { useState } from "react";

const Nav: React.FC = () => {
    const [activeTab, setActiveTab] = useState('user');
    const tabs = ['user', 'admin', 'settings'];

    return (
        <div className="nav-container">
            <div className="nav-wrap">
                <div className="bubble active"></div>
                <div className="bubble hover"></div>
                <nav className="nav">
                    {tabs.map((tab) => (
                        <a
                            key={tab}
                            href="#"
                            className={activeTab === tab ? 'active' : ''}
                            onClick={(e) => {
                                e.preventDefault();
                                setActiveTab(tab);
                            }}
                        >
                            {/* Capitalize the first letter */}
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </a>
                    ))}
                </nav>
            </div>
        </div>
    );
}

export default Nav;