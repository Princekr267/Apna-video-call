import React from 'react';
import { Link } from 'react-router-dom';

function LandingPage() {
    return ( 
        <div className='landingPageContainer'>
            <nav>
                <div className="navHeader">
                    <h2>Apna Video Call</h2>
                </div>
                <div className="navList">
                    <p>Join as guest</p>
                    <p>Register</p>
                    <div role='button'>
                        <p>Login</p>
                    </div>
                </div>
            </nav>
            <div className="landingMainContainer">
                <div>
                    <h1><span style={{color: "#ff9839"}}>Connect</span> with your loved ones</h1>
                    <p>Cover a distance with Apna video call</p>
                    <div role='button'>
                        <Link to={"/auth"}>Get Started</Link>
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