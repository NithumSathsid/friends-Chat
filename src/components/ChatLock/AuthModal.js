import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField } from '@mui/material';

const AuthModal = ({ open, onClose, onAuthenticated }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  // In a real app, you'd want to store this securely
  // This is just for demonstration
  const correctPassword = localStorage.getItem('chatLockPassword') || '1234';
  
  const handleSubmit = () => {
    if (password === correctPassword) {
      setError('');
      onAuthenticated();
      onClose();
    } else {
      setError('Incorrect password');
    }
  };
  
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Unlock Chats</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Password"
          type="password"
          fullWidth
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={!!error}
          helperText={error || 'Enter your chat lock password'}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} color="primary">
          Unlock
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AuthModal;