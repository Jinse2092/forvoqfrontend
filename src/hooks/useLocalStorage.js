
import { useState, useEffect } from 'react';

const useLocalStorage = (key, initialValue) => {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      // If item doesn't exist or is invalid JSON, initialize it
      if (item === null) {
         window.localStorage.setItem(key, JSON.stringify(initialValue));
         return initialValue;
      }
      try {
        return JSON.parse(item);
      } catch (parseError) {
         console.warn(`Error parsing localStorage key “${key}”, resetting to initial value:`, parseError);
         window.localStorage.setItem(key, JSON.stringify(initialValue));
         return initialValue;
      }
    } catch (error) {
      console.error(`Error reading localStorage key “${key}”:`, error);
      // If reading fails entirely, reset to initial value
      window.localStorage.setItem(key, JSON.stringify(initialValue));
      return initialValue;
    }
  });

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(`Error setting localStorage key “${key}”:`, error);
    }
  };

  // Effect to ensure initial value is set if localStorage is empty or cleared
  useEffect(() => {
    const item = window.localStorage.getItem(key);
    if (item === null) {
      setValue(initialValue);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]); // Removed initialValue dependency to avoid unnecessary resets


  return [storedValue, setValue];
};

export default useLocalStorage;
  