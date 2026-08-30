import { useEffect, useRef } from "react";
import { metadataCache } from "../store.js";

interface Node {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export function GraphView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const edges = metadataCache.getGraphEdges();
    const nodeIds = new Set<string>();
    for (const e of edges) {
      nodeIds.add(e.source);
      nodeIds.add(e.target);
    }

    const nodes: Node[] = [...nodeIds].map((id, i) => {
      const angle = (i / nodeIds.size) * Math.PI * 2;
      return {
        id,
        x: canvas.width / 2 + Math.cos(angle) * 120,
        y: canvas.height / 2 + Math.sin(angle) * 120,
        vx: 0,
        vy: 0,
      };
    });

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    let frame = 0;
    const tick = () => {
      frame++;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      for (const n of nodes) {
        n.vx += (cx - n.x) * 0.001;
        n.vy += (cy - n.y) * 0.001;
        for (const o of nodes) {
          if (o.id === n.id) continue;
          const dx = n.x - o.x;
          const dy = n.y - o.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 80) {
            n.vx += (dx / dist) * 2;
            n.vy += (dy / dist) * 2;
          }
        }
        n.vx *= 0.85;
        n.vy *= 0.85;
        n.x += n.vx;
        n.y += n.vy;
      }

      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--boke-bg-tertiary").trim() || "#111";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--boke-border").trim() || "#45475a";
      ctx.lineWidth = 1;
      for (const e of edges) {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (!s || !t) continue;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
      }

      const accent = getComputedStyle(document.documentElement).getPropertyValue("--boke-accent").trim() || "#b56a32";
      const textColor = getComputedStyle(document.documentElement).getPropertyValue("--boke-text").trim() || "#cdd6f4";
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.fill();
        ctx.fillStyle = textColor;
        ctx.font = "11px sans-serif";
        const label = n.id.split("/").pop()?.replace(/\.md$/, "") ?? n.id;
        ctx.fillText(label, n.x + 10, n.y + 4);
      }

      requestAnimationFrame(tick);
    };
    const raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="boke-graph" />;
}
