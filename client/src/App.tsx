import React, { useState, useEffect } from 'react';
import { subscriptionServiceClient } from "@submanager/gen-client";
import Admins from './pages/Admins';
import Users from './pages/Users';
import Nav, { PageView } from "./Nav";
import './App.css';

const App: React.FC = () => {
    const [activePage, setActivePage] = useState<PageView>('user');
    const [isAdmin, setIsAdmin] = useState<boolean>(false);

    // Fetch permission status when the app loads
    useEffect(() => {
        subscriptionServiceClient.getTiers().then(res => {
            setIsAdmin(res.isAdmin);
        }).catch(err => console.error("Failed to load initial data", err));
    }, []);

    const renderContent = () => {
        // Double-check permission before rendering the admin page
        if (activePage === 'admin' && isAdmin) return <Admins />;
        return <Users />;
    };

    return (
        <div className="main-layout" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <Nav
                activePage={activePage}
                onNavigate={setActivePage}
                isAdmin={isAdmin} // Pass the status to the Nav
            />
            <main className="content-area" style={{ flex: 1, overflowY: 'auto' }}>
                {renderContent()}
            </main>
        </div>
    );
};

export default App;