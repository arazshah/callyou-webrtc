import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from './i18n';
import { HomePage } from './pages/HomePage';
import { RoomPage } from './pages/RoomPage';
export function App() {
  return (
    <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/:slug" element={<RoomPage />} />
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  );
}
