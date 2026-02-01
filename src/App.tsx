import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { SongPage } from './pages/SongPage';
import { SetlistsPage } from './pages/SetlistsPage';
import { SetlistDetailPage } from './pages/SetlistDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import './App.scss';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/song/:id" element={<SongPage />} />
        <Route path="/setlists" element={<SetlistsPage />} />
        <Route path="/setlist/:id" element={<SetlistDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
