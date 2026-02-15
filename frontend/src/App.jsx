import LandingPage from './pages/landing'
import './App.css'
import {Route, BrowserRouter as Router, Routes} from "react-router-dom"
import Authentication from './pages/authentication'
import { AuthProvider } from './context/AuthContext'
import VideoMeetComponent from './pages/VideoMeet'
import HomeComponent from './pages/home'
import History from './pages/history'

function App() {

  return (
    <>
      <Router>
        <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage/>}/>
          <Route path='/auth' element={<Authentication/>}/>
          <Route path='/home' element={<HomeComponent/>}/>
          <Route path="/:url" element={<VideoMeetComponent/>}/>
          <Route path='/history' element={<History/>}/>
        </Routes>
        </AuthProvider>
      </Router>
    </>
  )
}

export default App
