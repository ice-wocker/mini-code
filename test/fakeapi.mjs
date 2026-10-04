import http from 'http';
import fs from 'fs';

const ROUND_FILE = new URL('../.round', import.meta.url).pathname;
let round = 0;
try { round = parseInt(fs.readFileSync(ROUND_FILE, 'utf8'), 10) || 0; } catch {}

const server = http.createServer((req, res) => {
  try {
    handle(req, res);
  } catch (e) {
    console.error('[fakeapi handler error]', e.stack || e);
    try { res.writeHead(500); res.end('err'); } catch {}
  }
});
server.on('clientError', (e) => console.error('[clientError]', e.message));
process.on('uncaughtException', (e) => console.error('[uncaught]', e.stack || e));

function handle(req, res) {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', async () => {
    try {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.writeHead(200);
      const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
      const finish = () => res.write('data: [DONE]\n\n') + res.end();
      const roundNow = round++;
      fs.writeFileSync(ROUND_FILE, String(round));

      if (roundNow === 0) {
        send({ choices: [{ delta: { content: '我先运行命令。' } }] });
        send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'run_command', arguments: '{"comm' } }] } }] });
        send({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'and":"echo hi && git status -sb' } }] } }] });
        send({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '}' } }] } }] });
        send({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
        send({ usage: { prompt_tokens: 500, completion_tokens: 50 } });
        finish();
      } else if (roundNow === 1) {
        send({ choices: [{ delta: { content: '完成。' } }] });
        send({ choices: [{ delta: {}, finish_reason: 'stop' }] });
        send({ usage: { prompt_tokens: 900, completion_tokens: 30 } });
        finish();
      } else {
        send({ choices: [{ delta: { content: `第 ${roundNow} 轮。` } }] });
        send({ choices: [{ delta: {}, finish_reason: 'stop' }] });
        send({ usage: { prompt_tokens: 1000, completion_tokens: 20 } });
        finish();
      }
    } catch (e) { console.error('[stream]', e.stack || e); try { res.end(); } catch {} }
  });
}
server.listen(8799, '127.0.0.1', () => console.log('fakeapi :8799'));
