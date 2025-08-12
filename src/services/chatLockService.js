import { auth } from '../firebase/firebase';
import { getDatabase, ref, update, get } from 'firebase/database';

class ChatLockService {
  constructor() {
    this.db = getDatabase();
  }

  // Toggle lock status (lock/unlock)
  async toggleChatLock(chatId, isLocked) {
    const userId = auth.currentUser?.uid;
    if (!userId) return false;
    
    await update(ref(this.db, `users/${userId}/lockedChats`), {
      [chatId]: isLocked ? true : null
    });
    return true;
  }

  // Check if a chat is locked
  async isChatLocked(chatId) {
    const userId = auth.currentUser?.uid;
    if (!userId) return false;
    
    const snapshot = await get(ref(this.db, `users/${userId}/lockedChats/${chatId}`));
    return snapshot.exists() && snapshot.val() === true;
  }

  // Get all locked chats
  async getLockedChats() {
    const userId = auth.currentUser?.uid;
    if (!userId) return [];
    
    const snapshot = await get(ref(this.db, `users/${userId}/lockedChats`));
    
    if (snapshot.exists()) {
      const lockedChats = snapshot.val();
      return Object.keys(lockedChats).filter(chatId => lockedChats[chatId] === true);
    }
    return [];
  }
}

export const chatLockService = new ChatLockService();