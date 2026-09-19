import React from 'react';

export interface ToastMessage {
  id: string;
  message: string;
  isError?: boolean;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  if (!toast) {
    // Render hidden toast element to satisfy DOM ID requirement
    return (
      <div
        id="toast"
        className="fixed bottom-6 right-6 pointer-events-none opacity-0 transition-all duration-300 z-50 px-4 py-2.5 rounded-lg text-xs font-medium shadow-2xl"
        aria-live="polite"
      />
    );
  }

  return (
    <div
      id="toast"
      onClick={onDismiss}
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs font-medium shadow-2xl cursor-pointer transition-all duration-300 transform translate-y-0 opacity-100 ${
        toast.isError
          ? 'bg-[#1a1315] border border-red-500/50 text-red-200'
          : 'bg-[#14161c] border border-[#fbbf24]/50 text-white'
      }`}
      role="alert"
    >
      <span className={`w-2 h-2 rounded-full ${toast.isError ? 'bg-red-500 animate-ping' : 'bg-[#fbbf24] animate-pulse'}`} />
      <span className="font-semibold">{toast.message}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="ml-2 text-[#63666d] hover:text-white text-xs cursor-pointer font-bold"
      >
        ✕
      </button>
    </div>
  );
};
