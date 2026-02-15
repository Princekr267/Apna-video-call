import React from 'react';
import { useContext } from 'react';
import {AuthContext} from '../context/AuthContext.jsx'
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { IconButton } from '@mui/material';
import Home from '@mui/icons-material/Home'


export default function History(){

    const {getHistoryOfUser} = useContext(AuthContext);

    const [meetings, setMeetings] = useState([]);

    const routeTo = useNavigate();

    useEffect(() => {
        const fetchHistory = async () => {
            try{
                const history = await getHistoryOfUser();
                setMeetings(history);
            } catch(e){

            }
        }
        fetchHistory();
    }, [])


    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', padding: '20px' }}>
                <IconButton onClick={() => routeTo("/home")}>
                    <Home/>
                </IconButton>
                <Typography variant="h4" style={{ marginLeft: '10px' }}>Meeting History</Typography>
            </div>
            <div style={{ padding: '20px' }}>
            {
                meetings && meetings.length > 0 ? (
                    meetings.map((meeting, index) => (
                         <Box key={index} sx={{ minWidth: 275, marginBottom: 2 }}>
                            <Card variant="outlined">
                                <CardContent>
                                    <Typography variant="h6" component="div">
                                        Meeting Code: {meeting.meetingCode || meeting.meeting_code || 'N/A'}
                                    </Typography>
                                    <Typography sx={{ color: 'text.secondary', mb: 1.5 }}>
                                        Date: {meeting.date ? new Date(meeting.date).toLocaleString() : new Date(meeting.createdAt).toLocaleString()}
                                    </Typography>
                                </CardContent>
                                <CardActions>
                                    <Button size="small" onClick={() => routeTo(`/${meeting.meetingCode || meeting.meeting_code}`)}>Join Again</Button>
                                </CardActions>
                            </Card>
                        </Box>
                    ))
                ) : (
                    <Typography variant="body1" color="text.secondary">
                        No meeting history found. Join a meeting to see it here!
                    </Typography>
                )
            }
            </div>
        </div>
    )
}