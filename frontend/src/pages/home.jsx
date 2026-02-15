import React, { useContext, useState } from 'react';
import withAuth from '../utils/withAuth';
import { useNavigate } from 'react-router-dom';
import RestoreIcon from '@mui/icons-material/Restore';
import { IconButton, Button, TextField } from '@mui/material'
import VideoCallImg from '../assets/calling.svg'

import '../styles/home.css'
import { AuthContext } from '../context/AuthContext';
function HomeComponent(){

    let navigate = useNavigate();
    const [meetingCode, setMeetingCode] = useState("");
    
    const {addToUserHistory} = useContext(AuthContext);
    let handleJoinVideoCall = async () => {
        await addToUserHistory(meetingCode)
        navigate(`/${meetingCode}`)
    }
    return (
        <>
            <div className='navbar'>
                <div style={{display: "flex", alignItems: "center"}}>
                    <a href="/"><h2>Apna Video Call</h2></a>
                </div>
                <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
                    <div style={{display: "flex", alignItems: "center"}}>
                        <IconButton onClick={() => navigate("/history")}>
                            <RestoreIcon/>
                            <p style={{margin: 0}}>History</p>
                        </IconButton>
                    </div>
                    <Button onClick={() => {
                        localStorage.removeItem("token")
                        navigate("/auth")
                    }}>Logout</Button>
                </div>
            </div>
            <div className="meetContainer">
                <div className="left-panel">
                    <div>
                        <h2>Providing quality video call just like quality education </h2>

                        <div className='meet-code'>
                            <TextField onChange={e => setMeetingCode(e.target.value)} id='outline-basic' label='Meeting Code' variant='outlined' />
                            <Button onClick={handleJoinVideoCall}>Join</Button>
                        </div>
                    </div>
                </div>
                <div className="right-panel">
                    <img src={VideoCallImg} alt="Video Call" />
                </div>
            </div>
        </>
    )
}

export default withAuth(HomeComponent)