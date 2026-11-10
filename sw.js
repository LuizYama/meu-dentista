/* IADent — service worker.
   Tem um trabalho só: fazer o sistema abrir instalado e não deixar a tela
   em branco quando a rede cai. Tudo o que é clínico continua vindo do
   Supabase, ao vivo, sempre.

   Três regras, nesta ordem:

   1. NADA do Supabase passa por aqui. Ficha, agenda, estoque e financeiro
      nunca são guardados no aparelho. Devolver uma ficha velha do cache
      seria pior do que não devolver nada: o dentista leria um dado antigo
      como se fosse o de agora. Mesma coisa para qualquer método que não
      seja GET.

   2. A página é REDE PRIMEIRO. É o que preserva a maior vantagem de
      publicar na web: eu corrijo um defeito e em um minuto está no
      aparelho de todo mundo, sem loja e sem atualização manual. O cache
      da página só entra quando a rede falhou.

   3. Ícone, manifesto e fontes são cache primeiro — não mudam, e carregar
      do aparelho tira meio segundo da abertura.
*/
const CACHE = "iadent-v40";
const CASCA = "./";

self.addEventListener("install", ev => {
  ev.waitUntil((async () => {
    const c = await caches.open(CACHE);
    /* addAll falha inteiro se um arquivo falhar; aqui cada um é
       independente, porque um ícone que não baixou não é motivo para
       o aplicativo não instalar */
    await Promise.all(["./", "./manifest.json", "./icone-192.png",
                       "./icone-512.png", "./apple-touch-icon.png"]
      .map(u => c.add(new Request(u, {cache:"reload"})).catch(()=>{})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", ev => {
  ev.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", ev => {
  const req = ev.request;
  if(req.method !== "GET") return;
  let url; try{ url = new URL(req.url); }catch(e){ return; }

  // regra 1: o banco da clínica nunca encosta no cache
  if(url.hostname.endsWith(".supabase.co")) return;

  // regra 2: a página, sempre da rede quando há rede
  if(req.mode === "navigate"){
    ev.respondWith((async () => {
      try{
        const r = await fetch(req);
        if(r && r.ok){ (await caches.open(CACHE)).put(CASCA, r.clone()); }
        return r;
      }catch(e){
        const c = await caches.open(CACHE);
        return (await c.match(CASCA)) || (await c.match("./index.html")) ||
               new Response("<meta charset=utf-8><p style='font:16px sans-serif;padding:24px'>"+
                 "Sem conexão e sem cópia guardada. Abra uma vez com internet.",
                 {headers:{"Content-Type":"text/html; charset=utf-8"}});
      }
    })());
    return;
  }

  // regra 3: estáticos — cache primeiro, revalidando por baixo
  const meu = url.origin === self.location.origin;
  const fonte = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if(!meu && !fonte) return;

  ev.respondWith((async () => {
    const c = await caches.open(CACHE);
    const guardado = await c.match(req);
    const rede = fetch(req).then(r => {
      if(r && (r.ok || r.type === "opaque")) c.put(req, r.clone());
      return r;
    }).catch(() => null);
    return guardado || (await rede) ||
           new Response("", {status:504, statusText:"sem rede"});
  })());
});
