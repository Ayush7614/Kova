import { useCallback, useEffect, useMemo, useRef } from 'react';
import mermaid from 'mermaid';
import type { Slide } from '../../engine/types';
import type { Theme } from '../../engine/theme';
import { themeToVars, resolveTemplate, DEFAULT_THEME, isLightHex } from '../../engine/theme';
import './SlideRenderer.css';
import { buildExportMermaidInit } from '../../engine/export/mermaidExportTheme';
import { SlideCtx, type SlideCtxValue } from './slideContext';
import { SlideLayout } from './layouts';

mermaid.initialize({ startOnLoad: false, theme: 'base', securityLevel: 'strict' });

// Header/footer text. A `|` in the *theme template* splits it into left | center | right
// parts (issue #30). Segments are pre-split from the template before variable resolution
// so a doc title containing `|` (e.g. "Costs | Benefits") is never treated as a separator.
function BarText({ segments, className }: { segments: string[]; className: string }) {
  if (segments.length <= 1) return <span className={className}>{segments[0] ?? ''}</span>;
  const [left = '', center = '', ...rest] = segments;
  const right = rest.join(' | ');
  return (
    <span className={`${className} sl-bar-parts`}>
      <span>{left}</span>
      <span>{center}</span>
      <span>{right}</span>
    </span>
  );
}

interface Props {
  slide: Slide;
  theme?: Theme;
  slideNumber?: number;
  totalSlides?: number;
  docTitle?: string;
  docDate?: string;
  scale?: number;
  isThumbnail?: boolean;
  hideOverflowBadge?: boolean;
  onAllDiagramsReady?: () => void;
  onNavigateTo?: (slideIndex: number) => void;
}

export function SlideRenderer({ slide, theme = DEFAULT_THEME, slideNumber, totalSlides, docTitle = '', docDate = '', scale = 1, isThumbnail: isThumbnailProp, hideOverflowBadge = false, onAllDiagramsReady, onNavigateTo }: Props) {
  const vars = themeToVars(theme);

  // Signal export-readiness when all Mermaid diagrams on this slide have rendered.
  const mermaidCount = useMemo(() => slide.elements.filter((e) => e.type === 'mermaid').length, [slide.elements]);
  const diagramReadyCount = useRef(0);
  const onAllDiagramsReadyRef = useRef(onAllDiagramsReady);
  useEffect(() => { onAllDiagramsReadyRef.current = onAllDiagramsReady; });
  const onDiagramReady = useCallback(() => {
    diagramReadyCount.current += 1;
    if (diagramReadyCount.current >= mermaidCount) onAllDiagramsReadyRef.current?.();
  }, [mermaidCount]);
  useEffect(() => {
    if (onAllDiagramsReady && mermaidCount === 0) onAllDiagramsReady();
  }, [onAllDiagramsReady, mermaidCount]);

  const templateVars = { title: docTitle, date: docDate, slideNumber, totalSlides };
  const headerSegs = theme.header.show
    ? theme.header.text.split('|').map((s) => resolveTemplate(s.trim(), templateVars))
    : null;
  const footerSegs = theme.footer.show
    ? theme.footer.text.split('|').map((s) => resolveTemplate(s.trim(), templateVars))
    : null;

  // Show the floating logo whenever its position doesn't match a visible bar —
  // e.g. logo_position='bottom-right' with only header.show=true still floats.
  const logoInHeader = theme.header.show && theme.logo && ['top-left', 'top-right'].includes(theme.logo_position);
  const logoInFooter = theme.footer.show && theme.logo && ['bottom-left', 'bottom-right'].includes(theme.logo_position);
  const showFloatingLogo = theme.logo && !logoInHeader && !logoInFooter;

  const ctxValue = useMemo<SlideCtxValue>(
    () => ({ isThumbnail: isThumbnailProp ?? scale !== 1, hideOverflowBadge, textColor: theme.colors.text, mermaidInit: buildExportMermaidInit(theme), onDiagramReady: onAllDiagramsReady ? onDiagramReady : undefined, onNavigateTo }),
    [isThumbnailProp, scale, hideOverflowBadge, theme, onAllDiagramsReady, onDiagramReady, onNavigateTo],
  );

  return (
    <SlideCtx.Provider value={ctxValue}>
    <div
      className={`slide-frame layout-${slide.layout}`}
      style={{ ...vars, ...(scale !== 1 ? { transform: `scale(${scale})`, transformOrigin: 'top left' } : {}) }}
      data-layout={slide.layout}
      data-code-scheme={isLightHex(theme.colors.code_bg) ? 'light' : 'dark'}
    >
      {/* Header bar */}
      {theme.header.show && (
        <div className="sl-header-bar">
          {theme.logo && ['top-left', 'top-right'].includes(theme.logo_position) && (
            <img src={theme.logo} alt="Logo" className="sl-logo"
              style={{
                opacity: theme.logo_opacity,
                ...(theme.logo_position === 'top-right' ? { marginLeft: 'auto', order: 2 } : {}),
              }} />
          )}
          {headerSegs?.some(Boolean) && <BarText segments={headerSegs} className="sl-header-text" />}
        </div>
      )}

      {/* Floating logo (when no header/footer) */}
      {showFloatingLogo && (
        <img
          src={theme.logo}
          alt="Logo"
          className={`sl-logo-float pos-${theme.logo_position}`}
          style={{ opacity: theme.logo_opacity }}
        />
      )}

      {/* Main content area */}
      <div
        className="sl-content-area"
        style={slide.backgroundImage ? {
          backgroundImage: `url("${slide.backgroundImage.src}")`,
          backgroundSize: slide.backgroundImage.size,
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        } : undefined}
      >
        <SlideLayout slide={slide} />
        {slide.references.length > 0 && (
          <div className="sl-references">
            {slide.references.map((ref, i) => (
              <div key={i} className="sl-reference">{ref}</div>
            ))}
          </div>
        )}
      </div>

      {/* Footer bar */}
      {theme.footer.show && (
        <div className="sl-footer-bar">
          {theme.logo && ['bottom-left', 'bottom-right'].includes(theme.logo_position) && (
            <img src={theme.logo} alt="Logo" className="sl-logo-footer"
              style={{
                opacity: theme.logo_opacity,
                ...(theme.logo_position === 'bottom-right' ? { marginLeft: 'auto', order: 2 } : {}),
              }} />
          )}
          {footerSegs?.some(Boolean) && <BarText segments={footerSegs} className="sl-footer-text" />}
          {theme.footer.show_slide_number && slideNumber !== undefined && (
            <span className="sl-slide-num">{slideNumber}</span>
          )}
        </div>
      )}
    </div>
    </SlideCtx.Provider>
  );
}
