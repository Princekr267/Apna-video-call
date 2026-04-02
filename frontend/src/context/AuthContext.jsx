import axios from 'axios';
import { Children, createContext, useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import httpStatus from 'http-status';
import servers from '../enviroment';

export const AuthContext = createContext({});

const client = axios.create({
    baseURL: `${servers}/api/v1/users`,
    withCredentials: true
});

// Add request interceptor to include token in headers
client.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add response interceptor to handle token expiration
client.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401 && error.response?.data?.expired) {
            // Token expired - clear storage and redirect to login
            localStorage.removeItem('token');
            window.location.href = '/auth';
        }
        return Promise.reject(error);
    }
);

export const AuthProvider = ({children}) => {
    const authContext = useContext(AuthContext);

    const [userData, setUserData] = useState(authContext);

    const router = useNavigate();

    const handleRegister  = async (name, username, password) => {
        try{
            let request = await client.post("/register", { 
                name: name,
                username: username, 
                password: password
            })
            if(request.status === httpStatus.CREATED){
                return request.data.message;
            }
        } catch (err){
            throw err;
        }
    }
    
    const handleLogin = async (username, password) => {
        try {
            let request = await client.post("/login", {
                username: username,
                password: password
            });
            if(request.status === httpStatus.OK){
                localStorage.setItem("token", request.data.token);
                router("/home");
            }
        } catch (err) {
            throw err;
        }
    }

    const getHistoryOfUser = async() => {
        try{
            // Token is automatically added via interceptor
            let request = await client.get("/get_all_activity");
            return request.data;
        } catch (err){
            throw err;
        }
    }

    const addToUserHistory = async(meetingCode) => {
        try { 
            // Token is automatically added via interceptor
            let request = await client.post("/add_to_activity", {
                meetingCode: meetingCode
            });
            return request

        } catch(e){
            throw e;
        }
    }

    const getUserProfile = async () => {
        try {
            // Token is automatically added via interceptor
            let request = await client.get("/profile");
            return request.data;
        } catch (err) {
            throw err;
        }
    }

    const data = {
        userData, setUserData, getHistoryOfUser, handleRegister, handleLogin, addToUserHistory, getUserProfile
    }
    return (
        <AuthContext.Provider value={data}>
            {children}
        </AuthContext.Provider>
    )
}

