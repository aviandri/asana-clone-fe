import { createContext, useContext } from 'react';

/** Opens a FILE attachment of the current task in the viewer (the section and comments share one). */
export const OpenAttachmentContext = createContext<(attachmentId: string) => void>(() => undefined);

export const useOpenAttachment = () => useContext(OpenAttachmentContext);
