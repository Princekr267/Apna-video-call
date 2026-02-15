import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

function LandingPage() {
    const router = useNavigate();
    const handleGetStarted =() => {
        const token = localStorage.getItem("token");
        if(token) {
            router("/home");
        } else {
            router("/auth");
        }
    }
    return ( 
        <div className='landingPageContainer'>
            <nav>
                <div className="navHeader">
                    <h2>Apna Video Call</h2>
                </div>
                <div className="navList">
                    <p onClick={() => {
                        router("/guest_join")
                    }}>Join as guest</p>
                    <p onClick={() => {
                        router("/auth")
                    }}>Register</p>
                    <div role='button'>
                        <p onClick={() => {
                            router("/auth")
                        }}>Login</p>
                    </div>
                </div>
            </nav>
            <div className="landingMainContainer">
                <div>
                    <h1><span style={{color: "#ff9839"}}>Connect</span> with your loved ones</h1>
                    <p>Cover a distance with Apna video call</p>
                    <div role='button' onClick={handleGetStarted}>
                        <p style={{cursor: 'pointer'}}>Get Started</p>
                    </div>
                </div>
                <div>
                    <img src="mobile.png" alt="" />
                </div>
            </div>
        </div>
     );
}

export default LandingPage;