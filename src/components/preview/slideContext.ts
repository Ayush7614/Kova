import { createContext } from 'react';

// Context passed to child components so they can adapt for thumbnail vs full rendering
export interface SlideCtxValue { isThumbnail: boolean; hideOverflowBadge: boolean; textColor: string; mermaidInit: string; onDiagramReady?: () => void; onNavigateTo?: (slideIndex: number) => void }
export const SlideCtx = createContext<SlideCtxValue>({ isThumbnail: false, hideOverflowBadge: false, textColor: '#1a1a1a', mermaidInit: '' });
