import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Exercises from './pages/Exercises';
import Flashcards from './pages/Flashcards';
import Grammar from './pages/Grammar';
import Readings from './pages/Readings';
import Settings from './pages/Settings';
import Words from './pages/Words';
import { useAppStore } from './stores/appStore';

export default function App() {
  const { theme } = useAppStore();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="flashcards" element={<Flashcards />} />
          <Route path="exercises" element={<Exercises />} />
          <Route path="readings" element={<Readings />} />
          <Route path="readings/:id" element={<Readings />} />
          <Route path="grammar" element={<Grammar />} />
          <Route path="words" element={<Words />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}