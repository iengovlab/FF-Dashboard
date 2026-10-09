// Local preview only (not needed on GitHub Pages): node serve.js, then open http://127.0.0.1:8765
const http=require('http'),fs=require('fs'),path=require('path');
const root=__dirname;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.csv':'text/csv','.gpkg':'application/octet-stream','.json':'application/json'};
http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';
const f=path.join(root,path.normalize(p));if(!f.startsWith(root)){res.writeHead(403);return res.end();}
fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);return res.end('not found');}res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});res.end(d);});
}).listen(8765,'127.0.0.1',()=>console.log('serving on http://127.0.0.1:8765'));
