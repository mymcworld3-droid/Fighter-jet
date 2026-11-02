import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleRoomRequest, MemoryRoomStore } from './server/room-service.js';

const root=path.dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
export function createGameServer(store=new MemoryRoomStore()) {
  return http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/api/multiplayer'){
        if(req.method!=='POST'){res.writeHead(405);res.end();return;}
        let text='';for await(const chunk of req){text+=chunk;if(text.length>4096){res.writeHead(413);res.end();return;}}
        const response=await handleRoomRequest(new Request(url,{method:'POST',body:text}),store);
        res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
      }
      if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
      const pathname=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);
      if(!['/index.html','/styles.css'].includes(pathname)&&!/^\/src\/[a-z0-9-]+\.js$/.test(pathname)){res.writeHead(404);res.end();return;}
      const file=path.join(root,pathname),body=await readFile(file);
      res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-cache'});res.end(req.method==='HEAD'?undefined:body);
    }catch(error){res.writeHead(error.code==='ENOENT'?404:500);res.end();}
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT)||8080;
  createGameServer().listen(port,'0.0.0.0',()=>console.log(`SKYWARD running on port ${port}`));
}
