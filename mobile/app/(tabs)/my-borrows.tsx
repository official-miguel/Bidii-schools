/**
 * My Books — Student's currently borrowed books and history
 */

import React from 'react';
// Full borrow list is shown in my-card.tsx; this is a dedicated tab
// that deep-links directly to the borrow list for easy access.
import MyCardScreen from './my-card';

export default function MyBorrowsScreen() {
  // Reuse the my-card screen — it contains the full borrow list.
  // Students can also access their card from this tab.
  return <MyCardScreen />;
}
