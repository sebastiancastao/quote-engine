"use client";
import { useEffect, useRef, type ReactNode } from "react";
export function Modal({
  children,
  onClose,
  label,
  className = "",
  busy = false,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  className?: string;
  busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={label}
      className={className}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || busy) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
    >
      {children}
    </dialog>
  );
}
