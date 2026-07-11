import { Maximize2, Minimize2, RotateCcw, ScanLine, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const DEFAULT_ZOOM = 0.75
const FIT_ZOOM = 1
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.25

type MermaidRenderState =
  | { chart: string; status: 'loading' }
  | { chart: string; status: 'ready'; svg: string }
  | { chart: string; status: 'error' }

type MermaidApi = typeof import('mermaid')['default']
type FullscreenMode = 'none' | 'native' | 'overlay'

let mermaidPromise: Promise<MermaidApi> | null = null
let mermaidRenderSequence = 0

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        look: 'classic',
        theme: 'base',
        htmlLabels: true,
        fontFamily: "'Inter', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        themeVariables: {
          background: '#fffdf8',
          primaryColor: '#fff8ec',
          primaryTextColor: '#352d26',
          primaryBorderColor: '#c8a77d',
          secondaryColor: '#edf3ff',
          secondaryTextColor: '#2f3d55',
          secondaryBorderColor: '#9fb8db',
          tertiaryColor: '#f5ede3',
          tertiaryTextColor: '#493d32',
          tertiaryBorderColor: '#cdb8a0',
          lineColor: '#8a7562',
          textColor: '#3d342c',
          edgeLabelBackground: '#fffdf8',
          clusterBkg: '#fbf5ec',
          clusterBorder: '#d8c4aa',
          fontFamily: "'Inter', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
          fontSize: '15px',
        },
        themeCSS: `
          .node rect,
          .node circle,
          .node ellipse,
          .node polygon,
          .node path {
            stroke-width: 1.5px;
            filter: drop-shadow(0 2px 3px rgba(82, 62, 42, 0.12));
          }

          .edgePath .path,
          .flowchart-link {
            stroke-width: 1.6px;
          }

          .edgeLabel {
            color: #5f5144;
            font-size: 13px;
          }

          .edgeLabel rect,
          .labelBkg {
            fill: #fffdf8;
            opacity: 0.96;
          }
        `,
        flowchart: {
          curve: 'rounded',
          diagramPadding: 24,
          nodeSpacing: 56,
          rankSpacing: 70,
          wrappingWidth: 220,
        },
      })

      return mermaid
    })
  }

  return mermaidPromise
}

function createRenderId() {
  mermaidRenderSequence += 1
  return `md-reader-mermaid-${mermaidRenderSequence}`
}

interface MermaidDiagramProps {
  chart: string
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const figureRef = useRef<HTMLElement | null>(null)
  const [renderState, setRenderState] = useState<MermaidRenderState>({ chart, status: 'loading' })
  const [zoomState, setZoomState] = useState({ chart, zoom: DEFAULT_ZOOM })
  const [fullscreenMode, setFullscreenMode] = useState<FullscreenMode>('none')
  const visibleRenderState: MermaidRenderState =
    renderState.chart === chart ? renderState : { chart, status: 'loading' }
  const zoom = zoomState.chart === chart ? zoomState.zoom : DEFAULT_ZOOM
  const isFullscreen = fullscreenMode !== 'none'

  useEffect(() => {
    let isDisposed = false
    const renderId = createRenderId()

    void loadMermaid()
      .then((mermaid) => mermaid.render(renderId, chart))
      .then(({ svg }) => {
        if (!isDisposed) {
          setRenderState({ chart, status: 'ready', svg })
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setRenderState({ chart, status: 'error' })
        }
      })

    return () => {
      isDisposed = true
    }
  }, [chart])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreenMode((currentMode) => {
        if (document.fullscreenElement === figureRef.current) {
          return 'native'
        }

        return currentMode === 'overlay' ? currentMode : 'none'
      })
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  useEffect(() => {
    if (fullscreenMode === 'none') {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      if (document.fullscreenElement === figureRef.current && document.exitFullscreen) {
        void document.exitFullscreen()
      } else {
        setFullscreenMode('none')
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [fullscreenMode])

  function updateZoom(nextZoom: number) {
    setZoomState({
      chart,
      zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom)),
    })
  }

  async function toggleFullscreen() {
    const figure = figureRef.current

    if (!figure) {
      return
    }

    if (fullscreenMode !== 'none') {
      if (fullscreenMode === 'native' && document.exitFullscreen) {
        await document.exitFullscreen()
      } else {
        setFullscreenMode('none')
      }

      return
    }

    if (typeof figure.requestFullscreen === 'function') {
      try {
        await figure.requestFullscreen()
        setFullscreenMode(document.fullscreenElement === figure ? 'native' : 'overlay')
        return
      } catch {
        // 原生全屏不可用时继续使用应用内覆盖层。
      }
    }

    setFullscreenMode('overlay')
  }

  if (visibleRenderState.status === 'ready') {
    const diagramFigure = (
      <figure
        ref={figureRef}
        className="mermaid-diagram"
        aria-label="Mermaid 流程图"
        data-fullscreen={isFullscreen ? 'true' : undefined}
      >
        <div className="mermaid-diagram__toolbar" role="toolbar" aria-label="流程图查看工具">
          <button
            type="button"
            className="mermaid-diagram__tool"
            aria-label="缩小流程图"
            title="缩小"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => updateZoom(zoom - ZOOM_STEP)}
          >
            <ZoomOut size={16} aria-hidden="true" />
          </button>
          <output className="mermaid-diagram__zoom" aria-label="当前缩放比例">
            {Math.round(zoom * 100)}%
          </output>
          <button
            type="button"
            className="mermaid-diagram__tool"
            aria-label="放大流程图"
            title="放大"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => updateZoom(zoom + ZOOM_STEP)}
          >
            <ZoomIn size={16} aria-hidden="true" />
          </button>
          <span className="mermaid-diagram__toolbar-divider" aria-hidden="true" />
          <button
            type="button"
            className="mermaid-diagram__tool"
            aria-label="适应流程图宽度"
            title="适应宽度"
            onClick={() => updateZoom(FIT_ZOOM)}
          >
            <ScanLine size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="mermaid-diagram__tool"
            aria-label="重置流程图缩放"
            title="重置缩放"
            onClick={() => updateZoom(DEFAULT_ZOOM)}
          >
            <RotateCcw size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="mermaid-diagram__tool"
            aria-label={isFullscreen ? '退出流程图全屏' : '全屏查看流程图'}
            title={isFullscreen ? '退出全屏' : '全屏查看'}
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreen ? (
              <Minimize2 size={16} aria-hidden="true" />
            ) : (
              <Maximize2 size={16} aria-hidden="true" />
            )}
          </button>
        </div>
        <div className="mermaid-diagram__viewport">
          <div className="mermaid-diagram__canvas" style={{ width: `${zoom * 100}%` }}>
            <div
              className="mermaid-diagram__surface"
              dangerouslySetInnerHTML={{ __html: visibleRenderState.svg }}
            />
          </div>
        </div>
      </figure>
    )

    if (fullscreenMode === 'overlay') {
      return createPortal(diagramFigure, document.body)
    }

    return diagramFigure
  }

  if (visibleRenderState.status === 'error') {
    return (
      <figure className="mermaid-diagram mermaid-diagram--error">
        <figcaption role="alert">流程图渲染失败，请检查 Mermaid 语法。</figcaption>
        <pre>
          <code className="language-mermaid">{chart}</code>
        </pre>
      </figure>
    )
  }

  return (
    <div className="mermaid-diagram mermaid-diagram--loading" role="status" aria-live="polite">
      正在渲染流程图…
    </div>
  )
}
