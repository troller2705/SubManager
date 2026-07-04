import React, { useState, useEffect } from 'react';
import { subscriptionServiceClient } from "@submanager/gen-client";
import Admins from './pages/Admins';
import Users from './pages/Users';
import Nav, { PageView } from "./Nav";
import './App.css';

const App: React.FC = () => {
    const [activePage, setActivePage] = useState<PageView>('user');
    const [isAdmin, setIsAdmin] = useState<boolean>(false);

    useEffect(() => {
        // 1. Process OAuth Callbacks Globally
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state'); // e.g. "creator-patreon" or "user-patreon"

        if (code && state) {
            // Split the state into its two parts
            const [userType, provider] = state.split('-');

            if (userType === 'creator') {
                // Pass BOTH the code and the provider down to the backend!
                subscriptionServiceClient.linkCreatorAccount({ code, provider }).then((res) => {
                    if (res.success) {
                        alert(`Creator ${provider} account linked!`);
                        setActivePage('admin');
                    }
                }).finally(() => {
                    window.history.replaceState({}, document.title, "/");
                });
            } else {
                subscriptionServiceClient.linkUserAccount({ code, provider }).then((res) => {
                    if (res.success) alert(`Member ${provider} account linked!`);
                }).finally(() => {
                    window.history.replaceState({}, document.title, "/");
                });
            }
        }

        // 2. Fetch Initial Permissions
        subscriptionServiceClient.getTiers().then(res => {
            setIsAdmin(res.isAdmin);
        }).catch(err => console.error("Failed to load initial data", err));
    }, []);

    const renderContent = () => {
        if (activePage === 'admin' && isAdmin) return <Admins />;
        return <Users />;
    };

    return (
        <div className="main-layout" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <Nav activePage={activePage} onNavigate={setActivePage} isAdmin={isAdmin} />
            <main className="content-area" style={{ flex: 1 }}>
                {renderContent()}
            </main>
        </div>
    );
};

export default App;