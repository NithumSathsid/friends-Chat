// Add these imports at the top of your existing ChatList.js file
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { useState, useEffect } from 'react';
import { chatLockService } from '../services/chatLockService';
import AuthModal from './ChatLock/AuthModal';

// Add these states to your ChatList component
const [lockedChats, setLockedChats] = useState([]);
const [authModalOpen, setAuthModalOpen] = useState(false);
const [authenticated, setAuthenticated] = useState(false);
const [selectedChatId, setSelectedChatId] = useState(null);

// Add this useEffect to load locked chats
useEffect(() => {
  const fetchLockedChats = async () => {
    const chats = await chatLockService.getLockedChats();
    setLockedChats(chats);
  };
  
  fetchLockedChats();
}, []);

// Add these functions to your component
const handleLockToggle = async (e, chatId) => {
  e.stopPropagation();
  
  const isCurrentlyLocked = lockedChats.includes(chatId);
  
  // If locking a chat or not authenticated, show auth modal
  if (!isCurrentlyLocked || !authenticated) {
    setAuthModalOpen(true);
    setSelectedChatId(chatId);
    return;
  }
  
  // If unlocking and already authenticated
  await chatLockService.toggleChatLock(chatId, false);
  setLockedChats(lockedChats.filter(id => id !== chatId));
};

const handleAuthenticated = async () => {
  setAuthenticated(true);
  
  // Auto-expire authentication after 5 minutes
  setTimeout(() => setAuthenticated(false), 5 * 60 * 1000);
  
  if (selectedChatId) {
    const isCurrentlyLocked = lockedChats.includes(selectedChatId);
    
    if (isCurrentlyLocked) {
      // Unlock
      await chatLockService.toggleChatLock(selectedChatId, false);
      setLockedChats(lockedChats.filter(id => id !== selectedChatId));
    } else {
      // Lock
      await chatLockService.toggleChatLock(selectedChatId, true);
      setLockedChats([...lockedChats, selectedChatId]);
    }
    
    setSelectedChatId(null);
  }
};

// Modify your chat rendering to include lock icons
// Inside your map function for chats:
{chats.map((chat) => (
  <ListItem 
    button 
    key={chat.id} 
    selected={selectedChat?.id === chat.id}
    onClick={() => {
      // Only allow opening locked chats if authenticated
      if (lockedChats.includes(chat.id) && !authenticated) {
        setAuthModalOpen(true);
        setSelectedChatId(chat.id);
        return;
      }
      onSelectChat(chat);
    }}
  >
    {/* Your existing chat item content */}
    
    {/* Add lock icon */}
    <ListItemSecondaryAction>
      <IconButton edge="end" onClick={(e) => handleLockToggle(e, chat.id)}>
        {lockedChats.includes(chat.id) ? <LockIcon /> : <LockOpenIcon />}
      </IconButton>
    </ListItemSecondaryAction>
  </ListItem>
))}

// Add auth modal to your component's return
<AuthModal 
  open={authModalOpen} 
  onClose={() => setAuthModalOpen(false)} 
  onAuthenticated={handleAuthenticated} 
/>