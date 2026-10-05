import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import HostSetup from "./pages/HostSetup.jsx";
import HostRoom from "./pages/HostRoom.jsx";
import BankManager from "./pages/BankManager.jsx";
import RoundEditor from "./pages/RoundEditor.jsx";
import PlayerJoin from "./pages/PlayerJoin.jsx";
import PlayerGame from "./pages/PlayerGame.jsx";
import PresentationScreen from "./pages/PresentationScreen.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/host" element={<HostSetup />} />
        <Route path="/host/room/:code" element={<HostRoom />} />
        <Route path="/bank" element={<BankManager />} />
        <Route path="/bank/:id" element={<RoundEditor />} />
        <Route path="/join" element={<PlayerJoin />} />
        <Route path="/join/:code" element={<PlayerJoin />} />
        <Route path="/play/:code" element={<PlayerGame />} />
        <Route path="/present/:code" element={<PresentationScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
