import { createContext, useContext } from "react";

export interface UndoOffer {
  /** What happened, in plain words: "Deleted “Raise prices”." */
  message: string;
  /** Puts it back. May throw: the toast then says it could not. */
  onUndo: () => Promise<void>;
}

/** How long "Undo" stays on screen. The delete itself is already a soft delete on the server, so this is just the window to change your mind. */
export const UNDO_SECONDS = 8;

export const UndoContext = createContext<(offer: UndoOffer) => void>(() => undefined);

/** `const offerUndo = useUndo(); offerUndo({ message, onUndo })` */
export function useUndo(): (offer: UndoOffer) => void {
  return useContext(UndoContext);
}
