import { NavLink, Route, Routes } from 'react-router-dom'
import BooksPage from './pages/BooksPage'
import SalePage from './pages/SalePage'
import SettingsPage from './pages/SettingsPage'
import GoodsPage from './pages/GoodsPage'
import PastePage from './pages/PastePage'
import GlossaryPage from './pages/GlossaryPage'
import DoujinPage from './pages/DoujinPage'

const tabs = [
  { to: '/', label: '書', icon: '📚' },
  { to: '/goods', label: '周邊', icon: '🎴' },
  { to: '/doujin', label: '同人', icon: '🎨' },
  { to: '/sale', label: '出清', icon: '🏷️' },
  { to: '/paste', label: '貼文字', icon: '📋' },
  { to: '/settings', label: '設定', icon: '⚙️' },
]

export default function App() {
  return (
    <div className="wrap">
      <nav className="nav" aria-label="主選單">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end className={({ isActive }) => (isActive ? 'on' : '')}>
            <span className="ic" aria-hidden="true">{t.icon}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<BooksPage />} />
          <Route path="/goods" element={<GoodsPage />} />
          <Route path="/doujin" element={<DoujinPage />} />
          <Route path="/sale" element={<SalePage />} />
          <Route path="/paste" element={<PastePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/glossary" element={<GlossaryPage />} />
        </Routes>
      </main>
    </div>
  )
}
