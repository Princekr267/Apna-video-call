import React, { useContext, useState } from 'react';
import withAuth from '../utils/withAuth';
import { useNavigate } from 'react-router-dom';
import RestoreIcon from '@mui/icons-material/Restore';
import { IconButton, Button, TextField } from '@mui/material';
import VideoCallImg from '../assets/calling.svg';
import Navbar from './components/Navbar';
import '../styles/home.css';
import { AuthContext } from '../context/AuthContext';
import AddIcon from '@mui/icons-material/Add';

// Meeting codes: exactly 10 lowercase alphanumeric characters
const MEETING_CODE_LENGTH = 10;
const MEETING_CODE_REGEX  = /^[a-z0-9]{10}$/;

const generateMeetingCode = () => {
    const chars  = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < MEETING_CODE_LENGTH; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
};

function HomeComponent() {

    const navigate = useNavigate();
    const { addToUserHistory } = useContext(AuthContext);

    const [meetingCode,      setMeetingCode]      = useState('');
    const [meetingCodeError, setMeetingCodeError] = useState('');

    const validateCode = (code) => {
        if (!code.trim()) return 'Please enter a meeting code.';
        if (!MEETING_CODE_REGEX.test(code)) return `Code must be exactly ${MEETING_CODE_LENGTH} lowercase letters/numbers (e.g. abc1234567).`;
        return '';
    };

    const handleCodeChange = (e) => {
        // Only allow lowercase alphanumeric; silently ignore other chars
        const cleaned = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '');
        setMeetingCode(cleaned);
        if (meetingCodeError) setMeetingCodeError('');
    };

    const handleJoinVideoCall = async () => {
        const error = validateCode(meetingCode);
        if (error) { setMeetingCodeError(error); return; }
        await addToUserHistory(meetingCode);
        navigate(`/${meetingCode}`);
    };

    const handleCreateNewMeeting = async () => {
        const code = generateMeetingCode();
        await addToUserHistory(code);
        navigate(`/${code}`);
    };

    const textFieldSx = {
        '& .MuiOutlinedInput-root': {
            color: 'var(--text-primary)',
            '& fieldset':             { borderColor: 'var(--glass-border)' },
            '&:hover fieldset':       { borderColor: 'var(--text-secondary)' },
            '&.Mui-focused fieldset': { borderColor: 'var(--accent-primary)' },
        },
        '& .MuiInputLabel-root':             { color: 'var(--text-secondary)' },
        '& .MuiInputLabel-root.Mui-focused': { color: 'var(--accent-primary)' },
    };

    return (
        <>
            <Navbar />
            <div className="meetContainer">
                <div className="left-panel">
                    <div>
                        <h2>Providing quality video call just like quality education</h2>

                        <Button className="new-meet" onClick={handleCreateNewMeeting}>
                            <AddIcon /> Create an instant meeting
                        </Button>

                        <div className="meet-code">
                            <TextField
                                value={meetingCode}
                                onChange={handleCodeChange}
                                id="outline-basic"
                                label="Meeting Code"
                                variant="outlined"
                                error={!!meetingCodeError}
                                helperText={
                                    meetingCodeError
                                        ? meetingCodeError
                                        : `${meetingCode.length} / ${MEETING_CODE_LENGTH} characters`
                                }
                                inputProps={{ maxLength: MEETING_CODE_LENGTH }}
                                sx={textFieldSx}
                            />
                            <Button
                                onClick={handleJoinVideoCall}
                                variant="contained"
                                sx={{
                                    background: 'var(--accent-gradient)',
                                    borderRadius: '8px',
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    fontSize: '1.1rem',
                                    px: 4,
                                    height: '56px',
                                    alignSelf: 'flex-start',
                                    boxShadow: '0 8px 16px rgba(0, 136, 255, 0.3)',
                                    '&:hover': {
                                        transform: 'translateY(-2px)',
                                        boxShadow: '0 12px 24px rgba(0, 136, 255, 0.4)',
                                    },
                                }}
                            >
                                Join
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="right-panel">
                    <img src={VideoCallImg} alt="Video Call" />
                </div>
            </div>
        </>
    );
}

export default withAuth(HomeComponent);