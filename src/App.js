// Add this near the top of your main App component

// Set a default chat lock password if none exists
useEffect(() => {
  if (!localStorage.getItem('chatLockPassword')) {
    localStorage.setItem('chatLockPassword', '1234');
    console.log('Default chat lock password set: 1234');
  }
}, []);