import React from "react";
import './App.css';
import Admins from "./pages/Admins.tsx";
// import Users from "./pages/Users.tsx";
import Nav from "./Nav.tsx";

const App: React.FC = () => {
    return(
        <div>
            <Nav/>
            <Admins/>
        </div>
    )
}

export default App;