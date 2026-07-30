import { authApi } from './api';

export const getSession = () => authApi.getSession();
export const signIn = (input) => authApi.signIn(input);
export const signUp = (input) => authApi.signUp(input);
export const sendPasswordReset = (email) => authApi.sendPasswordReset(email);
export const signOut = () => authApi.signOut();
export const subscribeToAuthChanges = (onChange) => authApi.subscribeToAuthChanges(onChange);
