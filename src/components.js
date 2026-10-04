import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { displayWidth } from './ansi.js';
import { sanitize } from './paste.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function Spinner({ label }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % FRAMES.length), 100);
    return () => clearInterval(t);
  }, []);
  return <Text color="cyan">{FRAMES[i]} {label}</Text>;
}

export const SLASH_COMMANDS = ['help', 'clear', 'compact', 'model', 'config', 'cost', 'sessions', 'resume', 'exit', 'auto', 'memory', 'undo', 'copy', 'git'];

const CURSOR_CELL = '\x1b[7m \x1b[27m';

function cellW(ch) {
  return displayWidth(ch);
}

export function PromptInput({ value, onChange, onSubmit, onEscape, running, history }) {
  const doc = useRef({ text: '', cursor: 0 });
  const histIdx = useRef(-1);
  const [disp, setDisp] = useState({ lines: [''], cursor: [0, 0] });
  const [, force] = useState(0);

  function recompute() {
    const { text, cursor } = doc.current;
    const before = text.slice(0, cursor);
    const li = before.split('\n').length - 1;
    const ci = cursor - (before.lastIndexOf('\n') + 1);
    const lines = text.split('\n');
    const cols = (process.stdout.columns || 80) - 4;
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const bare = line.slice(0, ci) + '\u0000' + line.slice(ci);
      let s = '';
      let w = 0;
      for (const ch of bare) {
        const cw = cellW(ch) || 1;
        if (w + cw > cols - 1) { s = '…' + s.slice(-cols + 3); w = cols - 2; }
        s += ch; w += cw;
      }
      out.push(s.replace('\u0000', CURSOR_CELL));
    }
    setDisp({ lines: out, cursor: [li, ci] });
  }

  function setDoc(text, cursor) {
    doc.current = { text, cursor: Math.max(0, Math.min(cursor, text.length)) };
    recompute();
    force((x) => x + 1);
    if (onChange) onChange(text);
  }

  useEffect(() => {
    // 父级只在提交后传 ''（清空）；打字期间 value 恒为 undefined，不动
    if (value === '') setDoc('', 0);
  }, [value]);

  function recall(dir) {
    if (!history.length) return;
    histIdx.current = dir < 0
      ? (histIdx.current < 0 ? history.length - 1 : Math.max(0, histIdx.current - 1))
      : (histIdx.current < 0 ? -1 : Math.min(history.length, histIdx.current + 1));
    if (histIdx.current < 0 || histIdx.current >= history.length) { setDoc('', 0); return; }
    const h = history[histIdx.current];
    setDoc(h, h.length);
  }

  useInput((ch, key) => {
    if (running) return;
    const { text: v, cursor: c } = doc.current;

    if (key.return || ch === '\r' || ch === '\n') {
      if (key.ctrl && ch === 'j') {
        setDoc(v.slice(0, c) + '\n' + v.slice(c), c + 1);
      } else {
        onSubmit(v);
        setDoc('', 0);
        histIdx.current = -1;
      }
      return;
    }
    if (key.escape) { onEscape?.(); return; }
    if (key.backspace || key.delete) {
      if (c === 0) {
        if (v.startsWith('\n')) setDoc(v.slice(1), 0);
        return;
      }
      setDoc(v.slice(0, c - 1) + v.slice(c), c - 1);
    } else if (key.leftArrow) setDoc(v, c - 1);
    else if (key.rightArrow) setDoc(v, c + 1);
    else if (key.upArrow) {
      const nl = v.lastIndexOf('\n', c - 1);
      if (nl >= 0) setDoc(v, nl);
      else recall(-1);
    } else if (key.downArrow) {
      const nl = v.indexOf('\n', c);
      if (nl >= 0) setDoc(v, nl + 1);
      else recall(1);
    } else if (key.ctrl && ch === 'u') setDoc('', 0);
    else if (ch && !key.ctrl && !key.meta) {
      histIdx.current = -1;
      const ins = sanitize(ch);
      if (ins) setDoc(v.slice(0, c) + ins + v.slice(c), c + [...ins].length);
    }
  }, { isActive: !running });

  return (
    <Box flexDirection="column">
      {disp.lines.map((l, i) => (
        <Text key={i}>{i === 0 ? <Text color="green">❯ </Text> : '  '}{l}</Text>
      ))}
    </Box>
  );
}

export function Completion({ value }) {
  if (!value.startsWith('/') || value.includes(' ') || value.includes('\n')) return null;
  const word = value.slice(1);
  if (!word) return <Text color="gray">  {SLASH_COMMANDS.join('  ')}</Text>;
  const hits = SLASH_COMMANDS.filter((c) => c.startsWith(word));
  if (!hits.length) return null;
  return <Text color="gray">  /{hits.join('  /')}</Text>;
}

const ICON = { pending: '○', in_progress: '◐', done: '●' };
const COLOR = { pending: 'gray', in_progress: 'yellow', done: 'green' };

export function TodoPanel({ todos }) {
  if (!todos?.length) return null;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      {todos.map((t, i) => (
        <Text key={i} color={COLOR[t.status]} wrap="truncate-end">
          {ICON[t.status]} {t.status === 'done' ? <Text strikethrough>{t.content}</Text> : t.content}
        </Text>
      ))}
    </Box>
  );
}

export function DiffPreview({ diff }) {
  if (!diff) return null;
  const lines = diff.split('\n').slice(0, 25);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      {lines.map((l, i) => (
        <Text key={i} wrap="truncate-end">
          {l.startsWith('+') ? <Text color="green">{l}</Text>
            : l.startsWith('-') ? <Text color="red">{l}</Text>
            : <Text color="gray">{l}</Text>}
        </Text>
      ))}
    </Box>
  );
}
