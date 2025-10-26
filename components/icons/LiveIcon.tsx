// Fix: Implementing the LiveIcon component.
import React from 'react';

export const LiveIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5a6 6 0 00-6-6 6 6 0 00-6 6v1.5a6 6 0 006 6z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75a1.5 1.5 0 01-1.5-1.5v-1.5a1.5 1.5 0 013 0v1.5a1.5 1.5 0 01-1.5 1.5z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5.25v-1.5m0 16.5v-1.5m-8.25-8.25h-1.5m16.5 0h-1.5" />
    </svg>
);
