import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { isAiTestId } from '../lib/aiTestIsolation'

export function DesktopHomePage() {
  const navigate = useNavigate()
  const newestConversation = useLiveQuery(() => db.conversations.orderBy('updatedAt').reverse().filter((item) => !isAiTestId(item.id)).first(), [])
  useEffect(() => {
    if (newestConversation) void navigate(`/chat/${newestConversation.id}`, { replace: true })
  }, [navigate, newestConversation])
  return <div className="desktop-empty-pane"><div><img src="./app-icon.png" alt="" /><h2>Talk</h2><p>从左侧选择一个会话，或添加新的联系人。</p></div></div>
}
