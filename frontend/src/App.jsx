import LandingPage from './pages/landing'
import './App.css'
import {Route, BrowserRouter as Router, Routes} from "react-router-dom"
import Authentication from './pages/authentication'
import { AuthProvider } from './context/AuthContext'

function App() {

  return (
    <>
      <Router>
        <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage/>}/>
          <Route path='/auth' element={<Authentication/>}/>
        </Routes>
        </AuthProvider>
      </Router>
    </>
  )
}

export default App
