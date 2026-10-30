'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { usePipelineStore } from '@/store/pipeline-store';

export function TerminalLog() {
  const { logs } = usePipelineStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (scrollRef.current && !isCollapsed) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isCollapsed]);

  if (logs.length === 0) return null;

  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-5xl mx-auto mt-6"
    >
      <div className="rounded-2xl bg-charcoal-dark border border-gray-700/50 overflow-hidden shadow-2xl">
        {/* Terminal header */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-gray-800 to-gray-900 border-b border-gray-700/50 cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <div className="flex items-center gap-1.5 ml-3">
              <Terminal size={13} className="text-gray-400" />
              <span className="text-xs font-mono text-gray-400">
                maxsport-ai-pipeline — {logs.length} записів
              </span>
            </div>
          </div>
          {isCollapsed ? (
            <ChevronDown size={14} className="text-gray-400" />
          ) : (
            <ChevronUp size={14} className="text-gray-400" />
          )}
        </button>

        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div
                ref={scrollRef}
                className="terminal-log max-h-52 overflow-y-auto p-4 space-y-0.5"
              >
                {logs.map((log, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex gap-2 font-mono text-[11px] leading-relaxed"
                  >
                    <span className="log-timestamp shrink-0">[{log.timestamp}]</span>
                    <span className="log-module shrink-0">[{log.module}]</span>
                    <span className={
                      log.type === 'success' ? 'log-success' :
                      log.type === 'warning' ? 'log-warning' :
                      log.type === 'error' ? 'text-red-400' :
                      'text-gray-300'
                    }>
                      {log.message}
                    </span>
                  </motion.div>
                ))}
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-gray-500 text-[11px] font-mono">$</span>
                  <span className="animate-terminal-cursor text-sport-red text-[11px] font-mono">▋</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
