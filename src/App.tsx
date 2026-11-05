import { NavLink, Route, Routes } from 'react-router-dom'
import BooksPage from './pages/BooksPage'
import SalePage from './pages/SalePage'
import SettingsPage from './pages/SettingsPage'
import Placeholder from './pages/Placeholder'

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
          <Route path="/goods" element={<Placeholder title="周邊" note="周邊在第二階段加入：貼文字解析、詞庫、預購、運費均攤。" />} />
          <Route path="/doujin" element={<Placeholder title="同人" note="同人誌與同人周邊在第二階段加入。" />} />
          <Route path="/sale" element={<SalePage />} />
          <Route path="/paste" element={<Placeholder title="貼文字入庫" note="貼上訂單文字自動拆分品項，在第二階段加入。" />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
