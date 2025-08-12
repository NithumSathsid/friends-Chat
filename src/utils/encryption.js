// Simple encryption/decryption for local storage
export const encrypt = (text) => {
  return btoa(text);
};

export const decrypt = (encryptedText) => {
  try {
    return atob(encryptedText);
  } catch (e) {
    return '';
  }
};