(function(){
  // Enable the hidden-first animated mode ONLY if we can animate safely.
  // If anything below throws or the observer never fires, content stays visible.
  var ANIM = 'IntersectionObserver' in window;
  if(ANIM){ document.documentElement.classList.add('js-anim'); }

  // Hard safety net: no matter what, reveal everything after 1.2s so the page
  // can never be left blank by a stalled observer or a JS error.
  function revealAll(){
    document.querySelectorAll('.rise').forEach(function(e){e.classList.add('on');});
  }
  var safety = setTimeout(revealAll, 1200);

  // c245 · inline figures in running prose should read as data, not just words.
  // Mark numeric facts automatically so CMS/copy edits inherit the treatment without
  // hand-wrapping every 36,4%, 2025 or +1,7 procentpunt in the section HTML.
  function markInlineData(){
    var selector = '.mast p, .prose';
    var numberRE = /([+\-\u2212]?\d{1,4}(?:[,.]\d+)?(?:\s?(?:%|pp|procent(?:punt(?:en)?)?))?)/g;
    Array.prototype.slice.call(document.querySelectorAll(selector)).forEach(function(root){
      if(root.dataset.inlineDataMarked === '1') return;
      root.dataset.inlineDataMarked = '1';
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode:function(node){
          if(!/\d/.test(node.nodeValue || '')) return NodeFilter.FILTER_REJECT;
          var p = node.parentElement;
          if(!p || p.closest('.inline-data,script,style,svg,canvas,input,textarea')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var nodes = [], n;
      while((n = walker.nextNode())) nodes.push(n);
      nodes.forEach(function(node){
        var text = node.nodeValue;
        numberRE.lastIndex = 0;
        if(!numberRE.test(text)) return;
        numberRE.lastIndex = 0;
        var frag = document.createDocumentFragment();
        var last = 0, m;
        while((m = numberRE.exec(text))){
          if(m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
          var value = m[0];
          var span = document.createElement('span');
          span.className = 'inline-data';
          if(/^(?:19|20)\d{2}$/.test(value)) span.className += ' is-year';
          span.textContent = m[0];
          frag.appendChild(span);
          last = m.index + m[0].length;
        }
        if(last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        node.parentNode.replaceChild(frag, node);
      });
    });
  }
  markInlineData();

  try{
    // ── progressive reveal for living/simple forms ──
    if(ANIM){
      var io=new IntersectionObserver(function(es){
        es.forEach(function(e){ if(e.isIntersecting){
          var host=e.target; var items=[].slice.call(host.querySelectorAll('.rise'));
          items.sort(function(a,b){return (+a.dataset.at)-(+b.dataset.at);});
          items.forEach(function(el){ var at=+el.dataset.at||0; setTimeout(function(){el.classList.add('on');}, at*110); });
          io.unobserve(host);
        }});
      },{threshold:.2});
      document.querySelectorAll('.live-bento, .brow, .fband, .rail').forEach(function(b){io.observe(b);});
    } else {
      revealAll();
    }

  // ── reading form: active act drives the rail (anchor restat + scene swap)
  const railData={
    'p02':{s1:['2008','het charter ging van start in 2008',false],
           s2:['81','%','75 van de 93 organisaties — 81% respons'],
           s3:['81','75 van de 93 gevraagde organisaties vulden de tool in',true]},
  };
  var QUOTE_SPOTS = ['qspot-a','qspot-b','qspot-c','qspot-d','qspot-e'];
  var quoteSpotDeck = [], quoteSpotByScene = {}, lastQuoteSpot = '';
  function refillQuoteSpotDeck(){
    quoteSpotDeck = QUOTE_SPOTS.slice();
    for(var i=quoteSpotDeck.length-1;i>0;i--){
      var j = Math.floor(Math.random() * (i + 1));
      var t = quoteSpotDeck[i]; quoteSpotDeck[i] = quoteSpotDeck[j]; quoteSpotDeck[j] = t;
    }
    if(lastQuoteSpot && quoteSpotDeck.length > 1 && quoteSpotDeck[quoteSpotDeck.length-1] === lastQuoteSpot){
      var swap = quoteSpotDeck[0];
      quoteSpotDeck[0] = quoteSpotDeck[quoteSpotDeck.length-1];
      quoteSpotDeck[quoteSpotDeck.length-1] = swap;
    }
  }
  function quoteSpotFor(key){
    key = key || 'quote';
    if(quoteSpotByScene[key]) return quoteSpotByScene[key];
    if(!quoteSpotDeck.length) refillQuoteSpotDeck();
    var spot = quoteSpotDeck.pop();
    quoteSpotByScene[key] = spot;
    lastQuoteSpot = spot;
    return spot;
  }
  function setupReading(sec){
    const sid=sec.id;
    const acts=[...sec.querySelectorAll('.act')];
    const scenes=[...sec.querySelectorAll('.scene')];
    const aStat=document.getElementById(sid+'-astat');
    const aSub=document.getElementById(sid+'-asub');
    const scrolly=sec.querySelector('.scrolly');   // c143: scrollytelling figure — focus a level per act
    // per-section anchor relabel maps (kept inline per section for clarity)
    function quoteLayer(){
      var layer=document.getElementById('quote-layer');
      if(!layer){
        layer=document.createElement('div');
        layer.id='quote-layer';
        layer.className='quote-layer';
        layer.setAttribute('aria-hidden','true');
        document.body.appendChild(layer);
      }
      return layer;
    }
    var quoteClearTimer = 0, quoteExitCallbacks = [];
    function clearQuoteTimer(){
      if(quoteClearTimer){ clearTimeout(quoteClearTimer); quoteClearTimer = 0; }
      quoteExitCallbacks = [];
    }
    function finishQuoteExit(layer){
      quoteClearTimer=0;
      if(layer.dataset.owner===sid&&layer.classList.contains('exit')){
        layer.className='quote-layer';
        layer.innerHTML='';
        delete layer.dataset.owner;
        delete layer.dataset.quoteScene;
        delete layer.dataset.quoteSpot;
        delete layer.dataset.quoteFit;
      }
      var callbacks = quoteExitCallbacks.slice();
      quoteExitCallbacks = [];
      callbacks.forEach(function(fn){ if(fn)fn(); });
    }
    function fitQuoteLayer(layer){
      if(!layer)return;
      layer.classList.remove('quote-wide','quote-xwide');
      layer.dataset.quoteFit = '';
      var q = layer.querySelector('.quote-copy');
      if(!q)return;
      function lines(){
        var cs = getComputedStyle(q);
        var lh = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) * 1.24) || 42;
        return q.getBoundingClientRect().height / lh;
      }
      // First measure the normal spot width. If it reads as a narrow stack, give it more
      // horizontal room; measure again so only truly long/tall quotes get the extra-wide lane.
      if(lines() > 4.7) layer.classList.add('quote-wide');
      if(lines() > 5.8) layer.classList.add('quote-xwide');
      layer.dataset.quoteFit = ['quote-wide','quote-xwide'].filter(function(c){
        return layer.classList.contains(c);
      }).join(' ');
    }
    function showQuoteLayer(src){
      if(!src)return;
      clearQuoteTimer();
      var layer=quoteLayer();
      var step=src.closest&&src.closest('.quote-step');
      var key=step&&step.dataset.scene;
      if(layer.dataset.quoteScene!==key){
        layer.innerHTML=src.outerHTML;
        layer.dataset.quoteScene=key||'';
      }
      var spot = quoteSpotFor(key);
      layer.className='quote-layer enter from-left '+spot;
      layer.dataset.owner=sid;
      layer.dataset.quoteSpot=spot;
      fitQuoteLayer(layer);
      void layer.offsetWidth;
      layer.classList.add('is-active');
    }
    function primeQuoteLayer(src){
      if(!src)return false;
      var layer=quoteLayer();
      var step=src.closest&&src.closest('.quote-step');
      var key=step&&step.dataset.scene;
      if(layer.dataset.quoteScene!==key){
        layer.innerHTML=src.outerHTML;
        layer.dataset.quoteScene=key||'';
      }
      var spot = quoteSpotFor(key);
      layer.className='quote-layer primed from-left '+spot;
      layer.dataset.owner=sid;
      layer.dataset.quoteSpot=spot;
      fitQuoteLayer(layer);
      return true;
    }
    function primeQuoteForSource(act){
      var cluster=act&&act.parentElement;
      if(!cluster||!cluster.classList||!cluster.classList.contains('quote-cluster'))return false;
      var q=cluster.querySelector('.quote-step[data-phase="enter"] .quote-sweep');
      return primeQuoteLayer(q);
    }
    function sectionCanOwnQuote(){
      var r=sec.getBoundingClientRect();
      return r.top<window.innerHeight*.92&&r.bottom>window.innerHeight*.08;
    }
    function hideQuoteLayer(){
      var layer=document.getElementById('quote-layer');
      if(layer&&layer.dataset.owner===sid){
        clearQuoteTimer();
        layer.className='quote-layer';
        layer.innerHTML='';
        delete layer.dataset.owner;
        delete layer.dataset.quoteScene;
        delete layer.dataset.quoteSpot;
        delete layer.dataset.quoteFit;
      }
    }
    function exitQuoteLayer(done){
      var layer=document.getElementById('quote-layer');
      if(!layer||layer.dataset.owner!==sid||!layer.innerHTML){
        if(done)done();
        return;
      }
      if(layer.classList.contains('exit')){
        if(done)quoteExitCallbacks.push(done);
        return;
      }
      clearQuoteTimer();
      if(done)quoteExitCallbacks.push(done);
      var spot = layer.dataset.quoteSpot || '';
      var fit = layer.dataset.quoteFit || '';
      layer.className=('quote-layer exit fade-out '+spot+' '+fit).trim();
      void layer.offsetWidth;
      layer.classList.add('is-active');
      quoteClearTimer=setTimeout(function(){
        finishQuoteExit(layer);
      },220);
    }
    const maps={
      'p02':{s1:{t:'2008',u:false,s:'sinds 2008 — meetbare doelen, elk jaar gemonitord'},
             s2:{t:'3',u:false,s:'niveaus die de monitor volgt: top, subtop, organisatie'},
             s3:{t:'81',u:true,s:'75 van de 93 gevraagde organisaties — 81% respons'}},
      'p03':{s1:{t:'36,4',u:true,s:''},
             s2:{t:'40,7',u:true,s:''},
             s3:{t:'46,6',u:true,s:''},
             s4:{t:'36,4',u:true,s:''}},
      'p04':{s1:{t:'34,1',u:true,s:''},
             s2:{t:'43,9',u:true,s:''},
             s3:{t:'42,5',u:true,s:''}},
      'p07':{s1:{t:'9',u:false,s:'plaatsingen vrouw in 2025 — rvb daalt naar 41%'},
             s2:{t:'47',u:true,s:'long/shortlist'},
             s3:{t:'44',u:true,s:'plaatsingen vrouw'},
             s4:{t:'11',u:false,s:'meestal geen vraag'},
             s5:{t:'18',u:false,s:'kaarten het zélf aan'}},
      'p08':{s1:{t:'2018',u:false,s:'culturele diversiteit toegevoegd aan de monitor'},
             s2:{t:'6,3',u:true,s:'andere culturele achtergrond in de top, eind 2024'},
             s3:{t:'10,7',u:true,s:'gemiddeld streefcijfer — van 4% tot 17%'},
             s4:{t:'3',u:false,s:'leiderschap het verst; kennis het minst ontwikkeld'}},
    };
    window.__READING_MAPS = window.__READING_MAPS || maps;   // mobile.js reads per-beat stats from here
    const map=maps[sid]||{};  // c142: morphing companion ON — the rail's stat re-labels per act
    let cur=null, pagerDrivenUntil=0;
    function activate(k){
      if(k===cur)return;
      const prev=cur ? acts.find(a=>a.dataset.scene===cur) : null;
      const prevQuote=!!(prev&&prev.classList.contains('quote-step')&&prev.dataset.phase!=='exit');
      cur=k;
      const aa=acts.find(a=>a.dataset.scene===k);
      const quote=!!(aa&&aa.classList.contains('quote-step')&&aa.dataset.phase!=='exit');
      const source=quote ? acts.find(a=>a.dataset.scene===aa.dataset.quoteSource) : null;
      const companionKey=source ? source.dataset.scene : k;
      if(sectionCanOwnQuote()){
        if(quote){
          showQuoteLayer(aa.querySelector('.quote-sweep'));
        }else if(prevQuote){
          exitQuoteLayer(function(){
            if(cur===k&&!primeQuoteForSource(aa)) hideQuoteLayer();
          });
        }else if(!primeQuoteForSource(aa)){
          hideQuoteLayer();
        }
      }
      scenes.forEach(s=>s.classList.toggle('on',s.dataset.for===k));
      acts.forEach(a=>a.classList.toggle('active',a.dataset.scene===k));
      const m=map[companionKey]; if(m&&aStat){ aStat.innerHTML=m.t+(m.u?'<span class="u">%</span>':''); aSub.textContent=m.s; }
      if(scrolly){
        acts.forEach(a=>{
          const isSource=!!(source&&a===source);
          a.classList.toggle('quote-source-held',isSource);
          a.classList.toggle('is-quoted-away',quote&&isSource);
        });
        const figure=scrolly.querySelector('.figwrap');
        if(figure) figure.classList.toggle('is-quoted-away',quote);
        // A quote overlaps the preceding evidence, but never changes the sticky figure.
        const rowSource=source || aa;
        if(rowSource&&rowSource.dataset.row) scrolly.setAttribute('data-active',rowSource.dataset.row);
      }
    }
    function onScroll(){
      if(!sectionCanOwnQuote()){ hideQuoteLayer(); return; }
      if(Date.now()<pagerDrivenUntil)return;
      // c243 · phones pin the figure to the TOP (54vh) and the active (snapped) beat sits just under it;
      // the reading line is ~0.62vh — low enough to be the snapped beat, high enough not to grab the peek.
      var mob = window.matchMedia && window.matchMedia('(max-width: 820px)').matches;
      const vc=window.innerHeight*(mob?0.62:0.42); let best=null,bd=1e9;
      for(const a of acts){
        if(a.classList&&a.classList.contains('quote-step'))continue;
        const r=a.getBoundingClientRect(),c=r.top+r.height/2,d=Math.abs(c-vc);
        if(d<bd){bd=d;best=a;}
      }
      if(best) activate(best.dataset.scene);
    }
    window.addEventListener('factsheet:beat', function(e){
      const beat=e.detail&&e.detail.el;
      if(!beat||!sec.contains(beat)||!beat.dataset||!beat.dataset.scene)return;
      pagerDrivenUntil=Date.now()+1200;
      if(e.detail&&e.detail.mode==='quote-fade-out'){
        exitQuoteLayer();
        return;
      }
      activate(beat.dataset.scene);
    });
    window.addEventListener('scroll',onScroll,{passive:true});
    activate(acts[0].dataset.scene); onScroll();
  }
  document.querySelectorAll('.read-frame, .scrolly').forEach(f=>setupReading(f.closest('.page')));

  // c211 · p07's quote-stage behaviour now lives in sections/p07/section.js (it owns it).
  // The engine still discovers its .qstep spacers as pager beats generically (via SEL).

  // ── c145: the c136 void carousel — pastel backdrop that crossfades as you
  // scroll between sections. A never-fading FLOOR holds the destination void;
  // the outgoing void rides a VEIL above it that fades out (a true crossfade,
  // so the bedrock never shows through). Ported verbatim from c136.
  var VOIDS=['void-blauw','void-lila','void-mint','void-teal','void-roze','void-perzik'];
  var VOID_SWAP={4:'void-blauw',6:'void-roze'}; // p05 M/V ↔ p07 Executive Search
  function voidForIdx(i){ return VOID_SWAP[i] || VOIDS[((i%VOIDS.length)+VOIDS.length)%VOIDS.length]; }
  var VoidDeck=(function(){
    var deck,floor,current=null; var FADE_MS=1100;
    function ensure(){ if(deck)return; deck=document.createElement('div'); deck.id='void-deck'; deck.setAttribute('aria-hidden','true'); floor=document.createElement('div'); floor.className='void-layer void-floor'; deck.appendChild(floor); document.body.insertBefore(deck,document.body.firstChild); }
    // c239 · mirror the live floor gradient into --void-now so the text shields (.pd-shield, a
    // viewport-anchored echo of the void) match whatever pastel the floor currently shows.
    function setVoidVar(){ try{ document.documentElement.style.setProperty('--void-now', getComputedStyle(floor).backgroundImage); }catch(e){} }
    function show(vc){ ensure(); if(!vc||vc===current)return;
      if(current===null){ floor.classList.add(vc); current=vc; setVoidVar(); return; }   // first paint — seat the floor, no fade
      Array.prototype.slice.call(deck.querySelectorAll('.void-veil')).forEach(function(v){ if(v.parentNode)v.parentNode.removeChild(v); });
      var veil=document.createElement('div'); veil.className='void-layer void-veil '+current; deck.appendChild(veil);
      floor.classList.remove(current); floor.classList.add(vc); current=vc; setVoidVar();
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ veil.style.opacity='0'; }); });
      setTimeout(function(){ if(veil.parentNode)veil.parentNode.removeChild(veil); },FADE_MS+80);
    }
    return { show:show };
  })();
  window.__voidDeck = VoidDeck;   // mobile.js drives the per-chapter void crossfade through this

  // ── nav dots: highlight section in view
  const dots=[...document.querySelectorAll('.dots a')];
  const dwrap=document.getElementById('dots');
  const secs=dots.map(d=>document.getElementById(d.dataset.sec));
  // c184 · the active section is the one the reading line is actually INSIDE — not the
  // nearest "centre", which mis-fired for a tall section scrolled near its bottom (the
  // last beat of a scrolly handed the highlight to the next chapter too early).
  function activeSection(list){
    var line = window.scrollY + window.innerHeight*0.4, idx = -1, bd = 1e9, near = 0;
    for (var i=0;i<list.length;i++){
      var s = list[i]; if (!s) continue;
      var r = s.getBoundingClientRect(), top = r.top + window.scrollY, bot = top + r.height;
      if (line >= top && line < bot) idx = i;                       // reading line inside → active
      var d = Math.min(Math.abs(line-top), Math.abs(line-bot));
      if (d < bd){ bd = d; near = i; }                              // nearest edge, for the gaps
    }
    return idx < 0 ? near : idx;
  }
  function navScroll(){
    var idx = activeSection(secs);
    dots.forEach((d,i)=>d.classList.toggle('on',i===idx));
    dwrap.classList.toggle('show', window.scrollY>window.innerHeight*0.6);
    VoidDeck.show(voidForIdx(idx));   // c145: crossfade the void to the section in view
  }
  window.addEventListener('scroll',navScroll,{passive:true});
  window.addEventListener('resize',navScroll); navScroll();

  // ── c144: the real c136 sidebar markup. data-page is the visible number;
  // data-sec is the actual section id, so authored order can diverge from pNN ids.
  var reduceMo = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sbItems=[...document.querySelectorAll('#sb .sb-nav li[data-page]')];
  const sbSecs=sbItems.map(li=>document.getElementById(li.dataset.sec || ('p'+li.dataset.page)));
  sbItems.forEach(function(li){ li.addEventListener('click',function(){ var s=document.getElementById(li.dataset.sec || ('p'+li.dataset.page)); if(s) s.scrollIntoView({behavior:reduceMo?'auto':'smooth'}); }); });
  function sbScroll(){
    var idx = activeSection(sbSecs);
    sbItems.forEach(function(li,i){ li.classList.toggle('active',i===idx); });
  }
  if(sbItems.length){ window.addEventListener('scroll',sbScroll,{passive:true}); window.addEventListener('resize',sbScroll); sbScroll(); }

    // everything wired up fine — let the observer/scene logic drive reveals.
    // (safety timer still fires harmlessly; .on is idempotent.)
  }catch(err){
    // any failure: clear animated mode and show everything immediately.
    clearTimeout(safety);
    document.documentElement.classList.remove('js-anim');
    revealAll();
    document.querySelectorAll('.scene').forEach(function(s,i){ if(i===0||s.dataset.for==='s1') s.classList.add('on'); });
  }
})();

// ── c182: authored beat pager — one gesture, one beat ───────────────────────────
// The deck is finite, authored content, so the AUTHOR places the snaps; scrolling is
// just transport between meaningful beats, never dead travel. c161 was a gap-corrector
// that still let you free-scroll through 64vh of centred emptiness — ~6 wheel notches to
// cross a one-line paragraph, 18+ to clear a 3-beat section. That ambiguity (which ticks
// advance the plot? which are dead?) is what confused the reader. This replaces it with a
// pager: every wheel notch / arrow / swipe advances EXACTLY one beat — a composed frame
// where the chapter header, the sticky figure and the text all settle together — and a
// gesture's momentum is swallowed so one physical flick can never overshoot. The beats are
// the composed frames: the hero, each scrollytelling act, each bento row/figure band, each
// award pair, the colophon. Long-text reading isn't special-cased because there's no long
// text here; if a beat ever overflowed we'd let it scroll before advancing. It stays
// cursor-INDEPENDENT (window-level) and interruptible, off on phones (free scroll), and
// hands the wheel back whenever the reflection modal owns the scroll.
(function(){
  try{
    if (window.matchMedia && window.matchMedia('(max-width: 820px)').matches) return; // free scroll on phones
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var SEL = '.read-col .act, .scrolly .step, [data-free-scroll-beat], .section-voices, .brow, .fband, .live-stage';   // each chapter's closing quote remains a beat within that chapter
    var scroller = document.scrollingElement || document.documentElement;
    var beats = [], anchors = [], idx = 0, appendixEl = null, appendixTop = Infinity;
    var freePassages = [];   // Free-scroll passages (Reflectie/Joop) that live inside the authored pager without becoming snap cards.

    function maxY(){ return Math.max(0, scroller.scrollHeight - window.innerHeight); }
    // c200 · the reading line (mid-viewport) is inside the colofon appendix → we're "in" it.
    function inAppendix(){ return appendixEl && (window.scrollY + window.innerHeight*0.5) > appendixTop; }
    // A beat's anchor is the scrollY that CENTRES it — the sticky figure and the chapter
    // header are centred / pinned to match, so the whole frame composes at one position.
    function measure(){
      // c200 · the colofon appendix is a one-way EXIT — never a pager beat.
      beats = [].slice.call(document.querySelectorAll(SEL)).filter(function(el){
        return !el.closest('#colofon') && !el.matches('.quote-step[data-phase="exit"]');
      });
      var vh = window.innerHeight, max = maxY();
      var freeMetas = [].slice.call(document.querySelectorAll('[data-free-until-unhook]')).map(function(fwFig){
        var fwCont = fwFig.parentElement;       // the sticky containing block
        if(!fwCont) return null;
        var freeSection = fwFig.closest('.page') || fwCont;
        var beatEl = fwFig.closest('[data-free-scroll-beat]') || fwCont;
        var topPx = parseFloat(getComputedStyle(fwFig).top) || 0;
        var Hpx   = fwFig.getBoundingClientRect().height;
        var padB  = parseFloat(getComputedStyle(fwCont).paddingBottom) || 0;   // sits below the grid row
        var areaBottomAbs = (fwCont.getBoundingClientRect().bottom + window.scrollY) - padB;
        var unhook = areaBottomAbs - topPx - Hpx;
        var sectionTop = freeSection.getBoundingClientRect().top + window.scrollY;
        var startAt = Math.max(0, sectionTop - 2);
        return {
          beatEl: beatEl,
          start: startAt,
          anchor: startAt,
          end: Math.max(startAt + 1, unhook - vh * 0.2)
        };
      }).filter(Boolean);
      function freeMetaFor(el){
        for(var j=0;j<freeMetas.length;j++){
          if(freeMetas[j].beatEl === el) return freeMetas[j];
        }
        return null;
      }
      anchors = beats.map(function(el){
        var fm = freeMetaFor(el);
        if(fm) return Math.max(0, Math.min(max, fm.anchor));
        var r = el.getBoundingClientRect(), top = r.top + window.scrollY;
        var c = top + r.height/2 - vh/2;
        return Math.max(0, Math.min(max, c));
      });
      freePassages = freeMetas.map(function(fm){
        var bi = beats.indexOf(fm.beatEl);
        fm.index = bi;
        var nextAnchor = bi > -1 && bi < anchors.length - 1 ? anchors[bi + 1] : max;
        fm.nextAnchor = nextAnchor;
        fm.prevAnchor = bi > 0 ? anchors[bi - 1] : 0;
        fm.end = Math.max(fm.anchor + 1, Math.min(fm.end, nextAnchor - 8));
        return fm;
      });
      // c231 · quote beats are now REAL positions on the scroll timeline (one playhead),
      // not source-shared overlay triggers. Each quote-step gets its own centred anchor like
      // any other beat; the (viewport-fixed) overlay is shown/hidden by activate() as you
      // arrive/leave, and forward-only is kept by directionalIndex skipping it on the way back.
      // No anchor-sharing, no wall-clock hold — the dwell is simply the beat you're parked on.
      appendixEl = document.getElementById('colofon');
      appendixTop = appendixEl ? (appendixEl.getBoundingClientRect().top + window.scrollY) : Infinity;
      idx = nearest();
    }
    function nearest(){
      var y = window.scrollY, best = 0, bd = Infinity;
      for (var i=0;i<anchors.length;i++){ var d = Math.abs(anchors[i]-y); if (d<bd){ bd=d; best=i; } }
      return best;
    }

    var animating = false, raf = 0, busy = false, tail = 0, lastWheelAt = 0;
    var quoteHoldUntil = 0, quoteLeaving = false, quoteLeaveTimer = 0;
    var QUOTE_ENTER_MS = 900, QUOTE_HOLD_MS = 900, QUOTE_EXIT_FADE_MS = 220;
    function setY(y){ window.scrollTo({ top: y, behavior: 'instant' }); }
    // busy is held for the whole gesture: through the ease AND a short settle tail.
    // The tail is armed ONCE and counts down on its own — incoming wheel events during
    // the gesture must NOT postpone it. (The old code did clearTimeout()+reset on every
    // swallowed event, so continuous scrolling — events <160ms apart — perpetually reset
    // the timer and `busy` never cleared: after a single beat the pager locked solid until
    // you physically stopped scrolling. That was the "impossible to scroll through" bug.)
    function armTail(){
      if (tail) return;                                       // already counting down → leave it alone
      tail = setTimeout(function(){
        tail = 0;
        if (animating||quoteLeaving){ armTail(); return; }    // ease / quote-exit still running → keep waiting
        busy = false;
      }, 160);
    }
    var handoffEaseActive = false;
    function dispatchSectionHandoff(phase, detail){
      try{
        var d = detail || {};
        d.phase = phase;
        window.dispatchEvent(new CustomEvent('factsheet:section-handoff',{detail:d}));
      }catch(e){}
    }
    function easeTo(target, done, opts){
      var start = window.scrollY, dist = target - start;
      if (Math.abs(dist) < 2){ if(done)done(); armTail(); return; }
      if (reduce){ setY(target); if(done)done(); armTail(); return; }
      animating = true;
      handoffEaseActive = !!(opts && opts.sectionHandoff && dist > 0);
      if(handoffEaseActive) dispatchSectionHandoff('start',{start:start,target:target,dist:dist});
      // c183 · only a handful of beats per section, so each transition is precious —
      // make the slide noticeably slower and gentler (was 300–680ms).
      var fast = opts && opts.quoteSectionHandoff;
      var t0 = 0, dur = fast
        ? Math.min(720, Math.max(460, Math.abs(dist) * 0.48))
        : Math.min(1150, Math.max(540, Math.abs(dist) * 0.95));
      function frame(ts){
        if (!animating) return;
        if (!t0) t0 = ts;
        var p = (ts - t0) / dur; if (p > 1) p = 1;
        var e = p < 0.5 ? 4*p*p*p : 1 - Math.pow(-2*p+2, 3)/2;   // easeInOutCubic — gentle in and out
        var y = start + dist * e;
        setY(y);
        if(handoffEaseActive) dispatchSectionHandoff('update',{progress:p,eased:e,offsetY:start-y,scrollY:y,start:start,target:target,dist:dist});
        if (p < 1) raf = requestAnimationFrame(frame);
        else {
          if(handoffEaseActive) dispatchSectionHandoff('end',{progress:1,eased:1,offsetY:start-target,scrollY:target,start:start,target:target,dist:dist});
          handoffEaseActive = false;
          animating = false; raf = 0; if(done)done(); armTail();
        }
      }
      raf = requestAnimationFrame(frame);
    }
    function stopEase(){
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if(handoffEaseActive) dispatchSectionHandoff('cancel',{offsetY:0});
      handoffEaseActive = false;
      animating = false;
    }
    function dispatchBeat(el,i,mode){
      try{ window.dispatchEvent(new CustomEvent('factsheet:beat',{detail:{el:el,index:i,mode:mode||'beat'}})); }catch(e){}
    }
    function freePassageForIndex(i){
      for(var p=0;p<freePassages.length;p++){
        if(freePassages[p].index === i) return freePassages[p];
      }
      return null;
    }
    function leaveQuoteThenGo(el,i){
      if(quoteLeaving)return;
      if(quoteLeaveTimer) clearTimeout(quoteLeaveTimer);
      quoteLeaving = true;
      var target = beats[i];
      var sectionHandoff = !!(el && target && el.closest && target.closest && el.closest('.page') !== target.closest('.page'));
      dispatchBeat(el,idx,'quote-fade-out');
      quoteLeaveTimer = setTimeout(function(){
        quoteLeaveTimer = 0;
        quoteLeaving = false;
        go(i,{quoteSectionHandoff:sectionHandoff,sectionHandoff:sectionHandoff});
      },QUOTE_EXIT_FADE_MS);
    }
    function isQuoteBeat(el){
      return !!(el&&el.matches&&el.matches('.quote-step[data-phase="enter"]'));
    }
    function sourceQuoteIndex(from){
      var next = beats[from + 1];
      return isQuoteBeat(next) ? from + 1 : -1;
    }
    function quoteReadyAtSource(threshold){
      if(isQuoteBeat(beats[idx])) return null;
      var limit = threshold || 180;
      var y = window.scrollY, nb = nearest();
      var candidates = [idx, nb];
      for(var c=0;c<candidates.length;c++){
        var src = candidates[c];
        if(src == null || src < 0 || src >= beats.length) continue;
        if(c && src === candidates[c-1]) continue;
        var qi = sourceQuoteIndex(src);
        if(qi > -1 && Math.abs(y - anchors[src]) <= limit){
          return { source: src, quote: qi };
        }
      }
      return null;
    }
    function triggerQuoteAtSource(threshold){
      var ready = quoteReadyAtSource(threshold);
      if(!ready) return false;
      stopEase();
      setY(anchors[ready.source]);
      idx = ready.source;
      go(ready.quote);
      return true;
    }
    function directionalIndex(from,dir){
      var i = Math.max(0, Math.min(beats.length - 1, from + dir));
      // Quotes are forward-only interruptions: source → quote happens on scroll-down.
      // On scroll-back from the following beat, skip the quote and return to its source.
      if(dir < 0 && isQuoteBeat(beats[i])) i = Math.max(0, i - 1);
      return i;
    }
    function go(i,opts){
      i = Math.max(0, Math.min(beats.length - 1, i));
      opts = opts || {};
      var fromIndex = idx;
      var from = beats[fromIndex];
      idx = i;
      var target=beats[i];
      if(!opts.sectionHandoff && from && target && i > fromIndex && from.closest && target.closest && from.closest('.page') !== target.closest('.page')){
        opts.sectionHandoff = true;
      }
      if(isQuoteBeat(target)) quoteHoldUntil = Date.now() + QUOTE_ENTER_MS + QUOTE_HOLD_MS;
      else quoteHoldUntil = 0;
      dispatchBeat(target,i,'beat');
      var targetAnchor = anchors[i];
      var freeTarget = freePassageForIndex(i);
      // c245 · land on the edge we're actually approaching, decided by POSITION not the
      // (possibly stale) prior index: below the reading end → settle at the end (bottom),
      // otherwise the top. The old `i < fromIndex` read an idx left stale by a free-scroll
      // and could pick the far edge, easing the wrong way once on entry/exit (the jolt).
      if(freeTarget) targetAnchor = (window.scrollY > freeTarget.end) ? freeTarget.end : freeTarget.anchor;
      easeTo(targetAnchor,null,opts);
    }
    // c203 · snap onto the nearest beat first if we're off one (after a free-scroll / drag), else advance one.
    function freePassageBoundaryTarget(dir){
      var y = window.scrollY, vh = window.innerHeight;
      for(var p=0;p<freePassages.length;p++){
        var fp = freePassages[p];
        if(fp.index < 0) continue;
        var slack = Math.max(140, vh * 0.18);
        if(dir > 0 && y >= fp.end - 28 && y <= fp.end + slack){
          return Math.min(beats.length - 1, fp.index + 1);
        }
        if(dir < 0 && y >= fp.start - slack && y <= fp.start + 28){
          return Math.max(0, fp.index - 1);
        }
      }
      return null;
    }
    // c245 · the runway gap below a free passage's reading end (the empty padding under the
    // signature, before the next centred beat). A gesture that settles here must stay
    // direction-true; the generic nearest-snap below would pick the nearest CENTRED beat,
    // which can sit the WRONG way — the one-time up-boost / down-snap on entering/leaving
    // the Reflectie passage. We keep the read zone itself on native free-scroll (handled in
    // the wheel/key paths); this only owns the dead runway between the two.
    function freePassageRunwayFor(y){
      for(var p=0;p<freePassages.length;p++){
        var fp = freePassages[p];
        if(fp.index < 0) continue;
        if(y > fp.end + 8 && y < fp.nextAnchor - 4) return fp;
      }
      return null;
    }
    function step(dir){
      var freeTarget = freePassageBoundaryTarget(dir);
      if(freeTarget != null){ go(freeTarget); return; }
      var runway = freePassageRunwayFor(window.scrollY);
      if(runway){
        // down → on to the next beat; up → back into the passage (go() lands on the reading
        // end by position). Never the generic nearest-snap, which jolted the wrong way once.
        if(dir > 0) go(Math.min(beats.length - 1, runway.index + 1));
        else go(runway.index);
        return;
      }
      var nb = nearest();
      var active = beats[idx];
      if(dir > 0 && triggerQuoteAtSource()) return;
      if(isQuoteBeat(active)&&Math.abs(window.scrollY - anchors[idx]) <= 18){
        // c231 · no wall-clock hold — your next scroll fades the quote and advances at once.
        leaveQuoteThenGo(active,directionalIndex(idx,dir));
        return;
      }
      if(idx>=0&&idx<anchors.length&&Math.abs(window.scrollY - anchors[idx]) <= 90){
        go(directionalIndex(idx,dir));
        return;
      }
      if (Math.abs(window.scrollY - anchors[nb]) > 36){
        var next = beats[nb + dir];
        if(dir>0&&isQuoteBeat(next)) go(nb + dir);
        else if(dir<0&&isQuoteBeat(next)) go(directionalIndex(nb,dir));
        else go(nb);
      }
      else {
        go(directionalIndex(nb,dir));
      }
    }
    function advance(dir){
      if (busy){
        if(dir > 0 && !quoteLeaving && (!animating || quoteReadyAtSource(110)) && triggerQuoteAtSource(animating ? 110 : 180)) armTail();
        return;
      }
      busy = true; step(dir); armTail();
    }

    function paused(){ return document.documentElement.classList.contains('reflect-lock'); }
    function freePassageNative(dir){
      var y = window.scrollY;
      for(var i=0;i<freePassages.length;i++){
        var p = freePassages[i];
        if(dir > 0 && y >= p.start - 10 && y < p.end - 6) return true;
        if(dir < 0 && y > p.start + 8 && y <= p.end + 10) return true;
      }
      return false;
    }
    addEventListener('wheel', function(e){
      var now = Date.now(), wheelGap = lastWheelAt ? now - lastWheelAt : 9999;
      lastWheelAt = now;
      if (paused()) return;                                   // modal open → it owns the wheel
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;   // horizontal intent → leave it native
      if (freePassageNative(e.deltaY > 0 ? 1 : -1)) return;   // free-scroll Reflectie (don't hijack)
      e.preventDefault();                                     // from here the page scroll is ours
      if (inAppendix()){                                      // c200 · colofon exit: one-way
        if (e.deltaY < 0 && !busy){ busy = true; go(beats.length-1); armTail(); }
        return;
      }
      if (busy){
        if (e.deltaY > 0 && !quoteLeaving && (!animating || wheelGap > 220) && triggerQuoteAtSource(animating ? 110 : 180)){ armTail(); return; }
        armTail(); return;
      }                                                       // mid-gesture / inertia → swallow + extend
      busy = true; step(e.deltaY > 0 ? 1 : -1); armTail();
    }, { passive:false });
    addEventListener('keydown', function(e){
      if (paused()) return;
      var k = e.key;
      if (inAppendix()){                                      // c200 · colofon exit: up returns, down is swallowed
        if (k==='ArrowUp'||k==='PageUp'||k==='Home'){ e.preventDefault(); if(!busy){ busy=true; go(beats.length-1); armTail(); } }
        else if (k==='ArrowDown'||k==='PageDown'||k===' '||k==='Spacebar'){ e.preventDefault(); }
        return;
      }
      if (k==='ArrowDown'||k==='PageDown'||k===' '||k==='Spacebar'){
        if (freePassageNative(1)) return; e.preventDefault(); advance(1); }
      else if (k==='ArrowUp'||k==='PageUp'){ if (freePassageNative(-1)) return; e.preventDefault(); advance(-1); }
      else if (k==='Home'){ e.preventDefault(); if(!busy){ busy=true; easeTo(0); armTail(); } }   // c203 · to the very top (hero)
      else if (k==='End'){ e.preventDefault(); if(!busy){ busy=true; go(beats.length-1); armTail(); } }
    });
    var tsY = 0;
    addEventListener('touchstart', function(e){ tsY = e.touches[0].clientY; }, { passive:true });
    addEventListener('touchend', function(e){
      if (paused()) return;
      var dy = tsY - e.changedTouches[0].clientY;
      if (Math.abs(dy) <= 40) return;
      if (freePassageNative(dy > 0 ? 1 : -1)) return;         // free-scroll Reflectie
      advance(dy > 0 ? 1 : -1);
    }, { passive:true });

    // Re-sync the index after any scroll we didn't drive (sidebar / dots / anchor / focus).
    var sync = 0;
    addEventListener('scroll', function(){
      if (animating || busy) return;
      if (sync) clearTimeout(sync);
      sync = setTimeout(function(){ idx = nearest(); }, 120);
    }, { passive:true });

    addEventListener('resize', measure);
    measure();
    setTimeout(measure, 450);   // re-measure once fonts / reveals have settled the layout

    // ── c200 · colofon one-way exit: reachable only by the cue or the set-apart sidebar
    // item; scroll/▲ returns to the deck. Never paginated to, never in the dots/nav.
    var cueEl = document.getElementById('colofon-cue');
    var sbColofon = document.getElementById('sb-colofon');
    var apxBack = document.getElementById('apx-back');
    function gotoColofon(){ if (appendixEl) appendixEl.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }
    function gotoDeck(){ if (!busy){ busy = true; go(beats.length - 1); armTail(); } }
    if (cueEl) cueEl.addEventListener('click', gotoColofon);
    if (sbColofon) sbColofon.addEventListener('click', gotoColofon);
    if (apxBack) apxBack.addEventListener('click', gotoDeck);
    function cueSync(){
      if (!cueEl) return;
      var atEnd = anchors.length && window.scrollY >= anchors[anchors.length - 1] - 6;   // settled on the last beat
      cueEl.classList.toggle('show', !!atEnd && !inAppendix());                           // hide once you're in the colofon
    }
    addEventListener('scroll', cueSync, { passive:true });
    cueSync();

    // ── c187: our own scrollbar (the native one is hidden in CSS) ──────────────────
    // A thin indigo thumb that floats over the void on the right edge: it reflects the
    // scroll position and can be dragged to scrub, settling onto the nearest beat on
    // release (so the composed-frame invariant holds). Hidden while the modal owns scroll.
    var bar = document.createElement('div'); bar.className = 'vbar';
    var thumb = document.createElement('div'); thumb.className = 'vbar-thumb';
    bar.appendChild(thumb); document.body.appendChild(bar);
    var MINTH = 44;
    function updateBar(){
      var vh = window.innerHeight, sh = scroller.scrollHeight, trackH = bar.clientHeight, span = sh - vh;
      if (span <= 2 || paused()){ bar.classList.remove('show'); return; }   // nothing to scroll / modal open
      bar.classList.add('show');
      var th = Math.max(MINTH, Math.round(trackH * vh / sh));
      var ty = (window.scrollY / span) * (trackH - th);
      thumb.style.height = th + 'px';
      thumb.style.transform = 'translateY(' + Math.max(0, Math.min(trackH - th, ty)) + 'px)';
    }
    addEventListener('scroll', updateBar, { passive:true });
    addEventListener('resize', updateBar);

    // drag → free scrub. Listen on the document (not the thumb) for the duration so the
    // pointer can leave the thin thumb without losing the drag (no pointer-capture quirks).
    var dragging = false, dragOff = 0;
    function onMove(e){
      if (!dragging) return;
      var trackH = bar.clientHeight, th = thumb.offsetHeight, trackTop = bar.getBoundingClientRect().top;
      var ty = Math.max(0, Math.min(trackH - th, e.clientY - dragOff - trackTop));
      setY((ty / (trackH - th)) * (scroller.scrollHeight - window.innerHeight));
    }
    function onUp(){
      if (!dragging) return;
      dragging = false; bar.classList.remove('drag');
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      idx = nearest(); easeTo(anchors[idx]);     // settle onto the nearest beat
    }
    thumb.addEventListener('pointerdown', function(e){
      if (paused()) return;
      dragging = true; bar.classList.add('drag');
      dragOff = e.clientY - thumb.getBoundingClientRect().top;
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      e.preventDefault();
    });
    updateBar();
    setTimeout(updateBar, 500);
  }catch(e){ /* never break scrolling */ }
})();

// ── c164: dissolve ONLY the prose into the void under the sticky chapter title ──
// c163 punched the hole with a full-width void echo, but that also sliced the
// sticky figures and the bento tiles — masking those blocks looked ugly. Instead
// we mask just the text sections (.act / .step) with a viewport-anchored top fade.
// A text block has no background, so masking it to transparent reveals the REAL
// void (z-1) directly behind it — the prose melts into the actual moving backdrop,
// while the sticky figures, charts and tiles are never touched.
(function(){
  try{
    if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) return; // headers static on phones
    var texts = [].slice.call(document.querySelectorAll('.fw-body'));
    if (!texts.length) return;
    var raf = 0;
    function clearMask(el){ if (el.style.maskImage || el.style.webkitMaskImage){ el.style.maskImage=''; el.style.webkitMaskImage=''; } }
    function update(){
      raf = 0;
      var vh = window.innerHeight;
      for (var i=0;i<texts.length;i++){
        var el = texts[i], r = el.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= vh){ clearMask(el); continue; }   // off-screen → leave it alone
        var page = el.closest('.page'); var ph = page && page.querySelector('.phead');
        if (!ph){ clearMask(el); continue; }
        var phr = ph.getBoundingClientRect();   // the header's ACTUAL viewport box (sticky offset included)
        // 0%-visible at the header's DIVIDER (its bottom border line) so the whole header band
        // stays clean, then a gentle dissolve back to full just below the line.
        var cut = phr.bottom - r.top;            // element-local y of the header's bottom divider
        if (cut <= 1){ clearMask(el); continue; }         // header not over this block yet
        var g = 'linear-gradient(180deg,transparent '+cut+'px,#000 '+(cut + 80)+'px)';
        el.style.webkitMaskImage = g; el.style.maskImage = g;
      }
    }
    function onScroll(){ if (!raf) raf = requestAnimationFrame(update); }
    addEventListener('scroll', onScroll, {passive:true});
    addEventListener('resize', onScroll);
    update();
  }catch(e){ /* never break scrolling */ }
})();

// ── c241: group each reading UNIT's text so the void shield backs the whole thing at once ──────
// The carousel mask uses each .pd-grp box as one reading unit: eyebrow + title + paragraph together, not
// each element separately. A reading act/step is text-only (its figure lives in a separate sticky
// rail), and its box is ~2–3× the content height (content is vertically centred), so we wrap the
// text children in a .pd-grp that shrink-wraps the content — the PhotoDrift mask then hugs the group,
// not the tall column. Desktop only (the roamer is off on phones). Structural, so it runs once at init.
(function(){
  try{
    if (window.matchMedia && window.matchMedia('(max-width: 820px)').matches) return;
    var units = [].slice.call(document.querySelectorAll('.read-col .act, .scrolly .step'));
    units.forEach(function(u){
      if (u.firstElementChild && u.firstElementChild.classList.contains('pd-grp')) return;
      var g = document.createElement('div'); g.className = 'pd-grp';
      while (u.firstChild) g.appendChild(u.firstChild);
      u.appendChild(g);
    });
  }catch(e){ /* decorative — never break the page */ }
})();

// ── c168: a focused reading surface for long reflections ──────────────────────
// An inline accordion is the wrong tool for a big message (it clips/janks). The
// full statement lifts into a card that MORPHS up from the quote (FLIP) over the
// softly blurred void and scrolls internally, however long. Gated on .js-anim in
// CSS, so without JS the text just shows inline. Own IIFE — independent of the rest.
// c177/c178: opening no longer lurches the site. The page scrolls on <body>
// (overflow-x:hidden propagates the scroll to the viewport), so the scroll-lock's
// overflow:hidden removes the vertical scrollbar and the viewport widens by its
// width — shifting the centred page AND the viewport-anchored fixed UI (the sidebar
// card sits at left:calc(50% - 634px); the nav dots at right:16px). c177 padded the
// body, which held the flow content but NOT the fixed cards — they still twitched.
// c178 fixes the real cause: it reserves the removed scrollbar's gutter on <html>
// for the lock's duration (scrollbar-gutter:stable), so the viewport/ICB width never
// changes and nothing — flow or fixed — moves. Only space-taking scrollbars cause
// this, so it's gated on sbw>0 (overlay scrollbars reserve nothing). Older engines
// without scrollbar-gutter fall back to the c177 body-padding (flow content only).
// The focus() calls pass {preventScroll:true} so focus can't nudge the page either.
(function(){
  var stage, card, scrollEl, back, lastBtn, srcRect;
  // Keep the viewport width invariant while scroll is locked, so hiding the scrollbar
  // can't shift the centred page or the fixed sidebar/dots. A space-taking scrollbar
  // (sbw>0) gets its gutter reserved on <html>; overlay scrollbars (sbw=0) need nothing.
  function lockScroll(){
    var sbw = window.innerWidth - document.body.clientWidth;   // 0 with overlay scrollbars
    if (sbw > 0){
      if (window.CSS && CSS.supports && CSS.supports('scrollbar-gutter', 'stable')){
        document.documentElement.style.scrollbarGutter = 'stable';   // holds flow AND fixed UI
      } else {
        document.body.style.paddingRight = sbw + 'px';               // fallback: holds flow content
      }
    }
    document.documentElement.classList.add('reflect-lock');
  }
  function unlockScroll(){
    document.documentElement.classList.remove('reflect-lock');
    document.documentElement.style.scrollbarGutter = '';
    document.body.style.paddingRight = '';
  }
  function build(){
    stage = document.createElement('div'); stage.className = 'reflect-stage'; stage.hidden = true; stage.setAttribute('aria-hidden','true');
    stage.innerHTML = '<div class="reflect-scrim" data-rc></div><div class="reflect-frame"><div class="reflect-back" data-rc></div><div class="reflect-cardwrap"><div class="reflect-card" role="dialog" aria-modal="true" aria-label="Volledige reflectie" tabindex="-1"><button class="reflect-close" type="button" data-rc aria-label="Sluiten">×</button><div class="reflect-scroll"></div></div></div></div>';
    document.body.appendChild(stage);
    card = stage.querySelector('.reflect-card'); scrollEl = stage.querySelector('.reflect-scroll'); back = stage.querySelector('.reflect-back');
    stage.addEventListener('click', function(e){ if (e.target.closest('[data-rc]')) close(); });   // × or anywhere outside the card
  }
  function fill(tile, page){
    // c173: the QUOTE stays in the section; the card carries only the elaboration
    // (with a light eyebrow + winner header for context).
    scrollEl.innerHTML = '';
    ['.eyebrow', '.winner'].forEach(function(sel){ var n = tile.querySelector(sel); if (n) scrollEl.appendChild(n.cloneNode(true)); });
    var src = tile.querySelector('.reflect-src');
    if (src){ Array.prototype.forEach.call(src.children, function(ch){ scrollEl.appendChild(ch.cloneNode(true)); }); }
    scrollEl.scrollTop = 0;
    // the offset image card = this section's own image (the live site shows behind it)
    back.innerHTML = '';
    var img = page && page.querySelector('.imgph');
    if (img) back.appendChild(img.cloneNode(true));
  }
  function flip(toSource){
    var last = card.getBoundingClientRect();
    var dx = (srcRect.left + srcRect.width/2) - (last.left + last.width/2);
    var dy = (srcRect.top + srcRect.height/2) - (last.top + last.height/2);
    var s = Math.max(0.4, Math.min(1, srcRect.width / last.width));
    return 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ')';
  }
  function open(trigger){
    if (!stage) build();
    var page = trigger.closest('.page'); if (!page) return;
    var tile = page.querySelector('.award-q'); if (!tile || !tile.querySelector('.reflect-src')) return;
    lastBtn = page.querySelector('.reflect-open') || trigger;       // focus returns to the button
    fill(tile, page); srcRect = trigger.getBoundingClientRect();    // morph from whatever was clicked
    stage.dataset.reflectPage = page.id || '';
    stage.hidden = false; stage.setAttribute('aria-hidden','false');
    lockScroll();                                                  // c178: keep the viewport width — nothing shifts
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      stage.classList.add('open'); card.style.transform = 'none'; card.style.opacity = '1';
    } else {
      card.style.transition = 'none'; card.style.transform = 'none'; card.style.opacity = '1';
      card.style.transformOrigin = 'center center';
      card.style.transform = flip(true); card.style.opacity = '0';
      requestAnimationFrame(function(){ requestAnimationFrame(function(){
        stage.classList.add('open');
        card.style.transition = 'transform .5s cubic-bezier(.2,.7,.2,1),opacity .4s ease';
        card.style.transform = 'none'; card.style.opacity = '1';
      });});
    }
    setTimeout(function(){ try{ card.focus({preventScroll:true}); }catch(e){} }, 60);   // c177: don't scroll on focus
    document.addEventListener('keydown', onKey);
  }
  function close(){
    if (!stage || stage.hidden) return;
    document.removeEventListener('keydown', onKey);
    stage.classList.remove('open');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && srcRect){
      card.style.transition = 'transform .42s cubic-bezier(.4,0,.2,1),opacity .35s ease';
      card.style.transform = flip(true); card.style.opacity = '0';
    }
    setTimeout(function(){
      stage.hidden = true; stage.setAttribute('aria-hidden','true');
      delete stage.dataset.reflectPage;
      unlockScroll();                                             // c178: release the lock + the reserved gutter
      card.style.transition = 'none'; card.style.transform = 'none'; card.style.opacity = '';
      if (lastBtn){ try{ lastBtn.focus({preventScroll:true}); }catch(e){} lastBtn = null; }
    }, reduce ? 0 : 430);
  }
  function onKey(e){
    if (e.key === 'Escape'){ close(); return; }
    if (e.key === 'Tab'){
      var f = stage.querySelectorAll('button,[href],[tabindex]:not([tabindex="-1"])');
      if (!f.length) return; var first = f[0], lastF = f[f.length-1];
      if (e.shiftKey && document.activeElement === first){ e.preventDefault(); lastF.focus(); }
      else if (!e.shiftKey && document.activeElement === lastF){ e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('click', function(e){
    // c174: the button, the quote and the image are all hitboxes for the reflection
    var t = e.target.closest && e.target.closest('.reflect-open, .reflect-hit'); if (!t) return;
    var page = t.closest('.page'); if (!page || !page.querySelector('.reflect-src')) return;   // only reflectable sections
    e.preventDefault(); open(t);
  }, false);
})();

// ── c241 · Figure-note tooltips — keep sticky cards clean without losing the receipts ─────────
(function(){
  try{
    var hover = window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
    var active = null, closeTimer = 0;
    var pop = document.createElement('div');
    pop.className = 'fc-tip-popover';
    pop.setAttribute('role','tooltip');
    pop.setAttribute('aria-hidden','true');
    var safe = document.createElement('div');
    safe.className = 'fc-tip-safezone';
    document.body.appendChild(safe);
    document.body.appendChild(pop);

    function esc(s){ return String(s||'').replace(/[&<>"']/g,function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
    function cancel(){ if(closeTimer){ clearTimeout(closeTimer); closeTimer = 0; } }
    function schedule(){ cancel(); closeTimer = setTimeout(close, 180); }
    function close(){
      cancel();
      if(active) active.classList.remove('is-active');
      active = null;
      pop.classList.remove('is-open');
      pop.setAttribute('aria-hidden','true');
      safe.classList.remove('is-visible');
    }
    function place(btn){
      var r = btn.getBoundingClientRect();
      var vw = window.innerWidth, gap = 12;
      pop.style.left = Math.min(Math.max(16, r.right - pop.offsetWidth), vw - pop.offsetWidth - 16) + 'px';
      pop.style.top = Math.round(r.top - pop.offsetHeight - gap) + 'px';
      if(pop.getBoundingClientRect().top < 10){
        pop.classList.add('below');
        pop.style.top = Math.round(r.bottom + gap) + 'px';
      }else{
        pop.classList.remove('below');
      }
      var pr = pop.getBoundingClientRect();
      var x = Math.min(r.left, pr.left) - 18, y = Math.min(r.top, pr.top) - 18;
      var right = Math.max(r.right, pr.right) + 18, bottom = Math.max(r.bottom, pr.bottom) + 18;
      safe.style.left = x + 'px'; safe.style.top = y + 'px';
      safe.style.width = (right - x) + 'px'; safe.style.height = (bottom - y) + 'px';
      safe.classList.add('is-visible');
    }
    function show(btn){
      cancel();
      if(active && active !== btn) active.classList.remove('is-active');
      active = btn; btn.classList.add('is-active');
      var lines = (btn.dataset.tip || '').split('\n').map(function(s){ return s.trim(); }).filter(Boolean);
      pop.innerHTML = '<div class="fc-tip-kicker">Toelichting</div>' + lines.map(function(s){ return '<p>'+esc(s)+'</p>'; }).join('');
      pop.setAttribute('aria-hidden','false');
      pop.classList.add('is-open');
      place(btn);
      requestAnimationFrame(function(){ if(active === btn) place(btn); });
    }
    function wireTip(el){
      if(hover){
        el.addEventListener('mouseenter', function(){ show(el); });
        el.addEventListener('mouseleave', schedule);
        el.addEventListener('focus', function(){ show(el); });
        el.addEventListener('blur', schedule);
      }
      el.addEventListener('click', function(e){
        e.preventDefault(); e.stopPropagation();
        if(active === el) close(); else show(el);
      });
      el.addEventListener('keydown', function(e){
        if(e.key === 'Escape') close();
        if(e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          if(active === el) close(); else show(el);
        }
      });
    }

    pop.addEventListener('mouseenter', cancel);
    pop.addEventListener('mouseleave', schedule);
    safe.addEventListener('mouseenter', cancel);
    safe.addEventListener('mouseleave', schedule);
    document.addEventListener('click', function(e){
      if(active && !e.target.closest('.fc-tip-trigger') && !e.target.closest('.fc-tip-popover')) close();
    }, true);
    window.addEventListener('scroll', function(){ if(active) place(active); }, {passive:true});
    window.addEventListener('resize', function(){ if(active) place(active); });

    function groupFor(note){
      return note.closest('.pane') || note.closest('.figcard') || note.closest('.figwrap') || note.closest('.live-stage');
    }
    var groups = new Map();
    Array.prototype.slice.call(document.querySelectorAll('.figwrap .fcap, .figwrap .radial-foot, .live-stage .fcap')).forEach(function(note){
      var text = (note.textContent || '').replace(/\s+/g,' ').trim();
      if(!text) return;
      var g = groupFor(note); if(!g) return;
      if(!groups.has(g)) groups.set(g, []);
      groups.get(g).push(text);
      note.remove();
    });
    groups.forEach(function(lines, g){
      g.classList.add('has-fc-tip');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fc-tip-trigger';
      btn.dataset.tip = lines.join('\n');
      btn.setAttribute('aria-label','Toelichting bij deze visual');
      btn.innerHTML = '<span aria-hidden="true">i</span>';
      wireTip(btn);
      g.appendChild(btn);
    });
    function parseNum(s){
      var m = String(s || '').replace('−','-').replace(',','.').match(/[+-]?\d+(?:\.\d+)?/);
      return m ? parseFloat(m[0]) : NaN;
    }
    function pct(n){ return n.toFixed(1).replace('.',',') + '%'; }
    function pp(n){
      if(Math.abs(n) < .05) return '0,0 procentpunt';
      return (n > 0 ? '+' : '−') + Math.abs(n).toFixed(1).replace('.',',') + ' procentpunt';
    }
    function compactDelta(n){
      if(Math.abs(n) < .05) return '0,0';
      return (n > 0 ? '+' : '−') + Math.abs(n).toFixed(1).replace('.',',');
    }
    function leftPct(el){
      var m = String(el && el.style && el.style.left || '').match(/-?\d+(?:\.\d+)?/);
      return m ? parseFloat(m[0]) : 50;
    }
    function scrollToDumbStep(row, lvl){
      var scrolly = row.closest('.scrolly');
      if(!scrolly || !lvl) return;
      if(scrolly.getAttribute('data-active') === 'goal') return;
      var target = scrolly.querySelector('.step[data-row="' + lvl + '"]');
      if(!target) return;
      scrolly.setAttribute('data-active', lvl);
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    }
    var dumbHoverLastAt = 0, dumbHoverLastLvl = '', dumbHoverColdUntil = 0;
    function coolDumbHover(ms){ dumbHoverColdUntil = Date.now() + (ms || 650); }
    addEventListener('wheel', function(){ coolDumbHover(900); }, {passive:true,capture:true});
    addEventListener('scroll', function(){ coolDumbHover(220); }, {passive:true});
    Array.prototype.slice.call(document.querySelectorAll('.dumb .lvl')).forEach(function(row){
      var name = row.querySelector('.lvl-name');
      var val = row.querySelector('.lvl-val');
      var deltaEl = row.querySelector('.lvl-delta');
      var track = row.querySelector('.track');
      var d24 = row.querySelector('.dot.d24');
      var d25 = row.querySelector('.dot.d25');
      if(!name || !val || !deltaEl || !track || !d24 || !d25) return;
      var lvl = row.dataset && row.dataset.lvl;
      var current = parseNum(val.textContent);
      var delta = parseNum(deltaEl.textContent);
      if(!isFinite(current) || !isFinite(delta)) return;
      var previous = current - delta;
      var dir = delta > .05 ? 'Stijging' : (delta < -.05 ? 'Daling' : 'Stabiel');
      var cls = delta > .05 ? 'pos' : (delta < -.05 ? 'neg' : 'flat');
      var glyph = delta > .05 ? '↗' : (delta < -.05 ? '↘' : '→');
      var x25 = leftPct(d25);
      var trackW = track.getBoundingClientRect().width || track.clientWidth || 0;
      var rightRoom = trackW ? trackW - (trackW * x25 / 100) : Infinity;
      // On tablet-sized cards the value label can collide with the fixed delta lane
      // even before it crosses the desktop "far right" threshold. Use the real track
      // width so labels near ~70% flip left only when the available right-side lane
      // is actually cramped; desktop keeps the roomier placement.
      var crampedRightLane = trackW && trackW < 340 && rightRoom < 118;
      var side = (delta < -.05 || x25 > 72 || crampedRightLane) ? 'side-left' : 'side-right';
      row.classList.add('dumb-labelled');
      if(lvl && row.closest('.scrolly') && row.closest('.scrolly').querySelector('.step[data-row="' + lvl + '"]')){
        row.classList.add('dumb-nav');
        row.tabIndex = 0;
        row.setAttribute('role','button');
        row.setAttribute('title','Ga naar de bijbehorende tekst');
        function hoverJump(){
          if(!hover) return;
          var now = Date.now();
          if(now < dumbHoverColdUntil) return;
          if(dumbHoverLastLvl === lvl && now - dumbHoverLastAt < 900) return;
          dumbHoverLastLvl = lvl;
          dumbHoverLastAt = now;
          scrollToDumbStep(row, lvl);
        }
        row.addEventListener('pointerenter', hoverJump);
        row.addEventListener('focus', function(){ scrollToDumbStep(row, lvl); });
        row.addEventListener('click', function(){ scrollToDumbStep(row, lvl); });
        row.addEventListener('keydown', function(e){
          if(e.key === 'Enter' || e.key === ' '){
            e.preventDefault();
            scrollToDumbStep(row, lvl);
          }
        });
      }
      row.setAttribute('aria-label', name.textContent.trim() + ': ' + dir.toLowerCase() + '. 2024: ' + pct(previous) + '. 2025: ' + pct(current) + '. ' + dir + ': ' + pp(delta) + '.');
      var label = document.createElement('span');
      label.className = 'dumb-data-label ' + cls + ' ' + side;
      label.setAttribute('aria-hidden','true');
      label.style.left = x25 + '%';
      label.innerHTML = '<span class="ddl-val">' + pct(current) + '</span>';
      track.appendChild(label);
      var deltaLabel = document.createElement('span');
      deltaLabel.className = 'dumb-delta-label ' + cls;
      deltaLabel.setAttribute('aria-hidden','true');
      deltaLabel.innerHTML = glyph + ' ' + compactDelta(delta);
      track.appendChild(deltaLabel);
    });
  }catch(e){ /* explanatory only — never break the deck */ }
})();

// ── c239 · PhotoDrift — ONE roaming "vibe impression." Picture the viewport as a tic-tac-toe grid:
// a single feathered photo block parks in a random OUTER cell (never the centre), crossfades through
// a few images as a DECK OF CARDS (only the top card fades; the next is primed at full opacity beneath
// it, so the void never shines through mid-fade), then fades out and reappears in a DIFFERENT cell —
// perpetually. It steps aside for front-photos (.imgph) and quote overlays, and never has to dodge
// text: on-void text carries its own void echo (.pd-shield), so the roamer can pass behind the words.
// Decorative + progressive: it builds its own element + <img> layers; without JS the void stays clean.
(function(){
  try{
    if (!('IntersectionObserver' in window)) return;                                  // no observer → leave the void clean
    if (window.__MOBILE_DECK) return;                                                 // the standalone mobile frame owns the phone
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function normalizeAssetBase(base){
      if (!base) return '';
      return /\/$/.test(base) ? base : base + '/';
    }
    function findOwnScript(){
      var current = document.currentScript;
      if (current && current.src && /\/?app\.js(?:\?|$)/.test(current.getAttribute('src') || current.src)) return current;
      var scripts = document.getElementsByTagName('script');
      for (var i=scripts.length-1;i>=0;i--){
        var src = scripts[i].getAttribute('src') || scripts[i].src || '';
        if (/\/?app\.js(?:\?|$)/.test(src)) return scripts[i];
      }
      return current || null;
    }
    function deriveAssetBase(script){
      var src = script && script.src;
      if (!src) return '';
      return src.replace(/app\.js(?:\?.*)?$/, 'assets/web/');
    }
    var ownScript = findOwnScript();
    var BASE = normalizeAssetBase(ownScript && ownScript.getAttribute && ownScript.getAttribute('data-asset-base')) ||
               normalizeAssetBase(document.documentElement.dataset && document.documentElement.dataset.assetBase) ||
               normalizeAssetBase(window.FACTSHEET_ASSET_BASE) ||
               normalizeAssetBase(deriveAssetBase(ownScript)) ||
               'assets/web/'; // root homepage uses data-asset-base; archive derives from this script URL
    // Themed sets, here pooled into one weighted picker the roamer draws from at random (meaning
    // isn't required — they're ambient impressions). Kept as named sets so a future placement could
    // theme, and so the 2026 PostNL batch can be tuned as a set instead of by raw image count.
    var SETS = {
      // the talent on stage — speakers, panels, commission (hero)
      'stage-a':['black-woman-on-stage','two-people-on-stage-talking-into-mic',
                 'two-women-on-stage-talking-to-each-other','commission-on-stage-in-front-of-audience',
                 'two-people-on-stage-laughing-at-each-other','women-on-stage-photographed-from-behind-facing-audience'],
      // the room — the participating organisations watching (inleiding)
      'audience-a':['audience-at-keynote','crowd-looking-at-screen','keynote-speech-crowd-looks-at-screen-slides',
                 'close-up-frontrow','audience-applauding','crowd-from-behind-down-the-aisle-looking-at-screen'],
      // the ceremony peak — winners, certificates, trophies (aansprekende voorbeelden)
      'awards':['diamond-award-winners-but-not-this-year','diamond-award-winners-posing-with-commission-not-this-year',
                 'four-women-standing-outside-on-stairs-posing-with-certificate','new-member-signing-a-paper-on-stage',
                 'close-up-of-the-diamond-award-trophies'],
      // people connecting — a warm close (colofon)
      'networking':['people-networking-at-the-event','people-networking-at-the-event-2','women-networking',
                 'women-some-collaborating-partners','event-guests-standing-around-a-table',
                 'two-women-in-the-audience-talking-to-each-other'],
      // TNDT Jaarcongres 2026 / PostNL batch — intentionally adjustable as one source group.
      'postnl-2026':['tndt-jaarcongres-2026-postnl-005','tndt-jaarcongres-2026-postnl-006',
                 'tndt-jaarcongres-2026-postnl-007','tndt-jaarcongres-2026-postnl-008',
                 'tndt-jaarcongres-2026-postnl-009','tndt-jaarcongres-2026-postnl-010',
                 'tndt-jaarcongres-2026-postnl-011','tndt-jaarcongres-2026-postnl-012',
                 'tndt-jaarcongres-2026-postnl-013','tndt-jaarcongres-2026-postnl-014',
                 'tndt-jaarcongres-2026-postnl-015','tndt-jaarcongres-2026-postnl-019',
                 'tndt-jaarcongres-2026-postnl-021','tndt-jaarcongres-2026-postnl-022',
                 'tndt-jaarcongres-2026-postnl-023','tndt-jaarcongres-2026-postnl-024',
                 'tndt-jaarcongres-2026-postnl-025','tndt-jaarcongres-2026-postnl-030',
                 'tndt-jaarcongres-2026-postnl-031','tndt-jaarcongres-2026-postnl-034',
                 'tndt-jaarcongres-2026-postnl-037','tndt-jaarcongres-2026-postnl-038',
                 'tndt-jaarcongres-2026-postnl-044','tndt-jaarcongres-2026-postnl-053',
                 'tndt-jaarcongres-2026-postnl-054','tndt-jaarcongres-2026-postnl-057',
                 'tndt-jaarcongres-2026-postnl-058','tndt-jaarcongres-2026-postnl-060',
                 'tndt-jaarcongres-2026-postnl-078','tndt-jaarcongres-2026-postnl-082',
                 'tndt-jaarcongres-2026-postnl-085','tndt-jaarcongres-2026-postnl-086',
                 'tndt-jaarcongres-2026-postnl-094','tndt-jaarcongres-2026-postnl-110-copy',
                 'tndt-jaarcongres-2026-postnl-115','tndt-jaarcongres-2026-postnl-121',
                 'tndt-jaarcongres-2026-postnl-130','tndt-jaarcongres-2026-postnl-137',
                 'tndt-jaarcongres-2026-postnl-138','tndt-jaarcongres-2026-postnl-141',
                 'tndt-jaarcongres-2026-postnl-156','tndt-jaarcongres-2026-postnl-164',
                 'tndt-jaarcongres-2026-postnl-172','tndt-jaarcongres-2026-postnl-182',
                 'tndt-jaarcongres-2026-postnl-185','tndt-jaarcongres-2026-postnl-188',
                 'tndt-jaarcongres-2026-postnl-193','tndt-jaarcongres-2026-postnl-206',
                 'tndt-jaarcongres-2026-postnl-208','tndt-jaarcongres-2026-postnl-209',
                 'tndt-jaarcongres-2026-postnl-211','tndt-jaarcongres-2026-postnl-213',
                 'tndt-jaarcongres-2026-postnl-215','tndt-jaarcongres-2026-postnl-218',
                 'tndt-jaarcongres-2026-postnl-219','tndt-jaarcongres-2026-postnl-221',
                 'tndt-jaarcongres-2026-postnl-228','tndt-jaarcongres-2026-postnl-235',
                 'tndt-jaarcongres-2026-postnl-247','tndt-jaarcongres-2026-postnl-248',
                 'tndt-jaarcongres-2026-postnl-249','tndt-jaarcongres-2026-postnl-250',
                 'tndt-jaarcongres-2026-postnl-251','tndt-jaarcongres-2026-postnl-253',
                 'tndt-jaarcongres-2026-postnl-254','tndt-jaarcongres-2026-postnl-258',
                 'tndt-jaarcongres-2026-postnl-260']
    };
    function shuffle(a){ for (var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)), t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
    function url(n){ return BASE + n + '.webp'; }
    var OLD_SET_NAMES = Object.keys(SETS).filter(function(k){ return k !== 'postnl-2026'; });
    var SOURCE_GROUPS = {
      old: OLD_SET_NAMES.reduce(function(out,k){ return out.concat(SETS[k]); }, []),
      'postnl-2026': SETS['postnl-2026']
    };
    var PHOTO_DRIFT_SOURCE_WEIGHTS = { old:1, 'postnl-2026':2 };
    // Subject anchors are generic composition points, not identity data: roughly the eye-line centre
    // for clear foreground speakers/posed groups. Crowd texture, backs-of-heads, rooms and objects stay
    // untagged so they keep the old centered ambient crop.
    var PHOTO_DRIFT_FOCUS = {
      'black-woman-on-stage-2':[.31,.24],
      'black-woman-on-stage':[.67,.27],
      'close-up-of-speaker-talking-to-black-woman':[.34,.25],
      'diamond-award-winners-but-not-this-year':[.48,.22],
      'diamond-award-winners-posing-with-commission-not-this-year':[.57,.27],
      'event-guests-standing-around-a-table':[.52,.26],
      'four-women-standing-outside-on-stairs-posing-with-certificate':[.56,.25],
      'joop-addressing-the-crowd':[.62,.30],
      'joop-portrait-for-voorwoord':[.43,.30],
      'joop-schippers-reflectie':[.50,.35],
      'maurice-van-der-meijs':[.44,.27],
      'new-member-signing-a-paper-on-stage':[.40,.26],
      'people-networking-at-the-event':[.40,.25],
      'two-people-on-stage-laughing-at-each-other':[.55,.28],
      'two-people-on-stage-talking-into-mic':[.53,.28],
      'two-women-in-the-audience-talking-to-each-other':[.72,.25],
      'two-women-on-stage-appearing-to-invite-more-over':[.43,.25],
      'two-women-on-stage-talking-to-each-other':[.54,.28],
      'woman-with-mic-talking-to-black-woman-on-stage':[.42,.31],
      'women-networking':[.54,.33],
      'women-some-collaborating-partners':[.55,.27],
      'tndt-jaarcongres-2026-postnl-006':[.66,.31],
      'tndt-jaarcongres-2026-postnl-007':[.36,.26],
      'tndt-jaarcongres-2026-postnl-009':[.56,.30],
      'tndt-jaarcongres-2026-postnl-011':[.45,.27],
      'tndt-jaarcongres-2026-postnl-012':[.55,.27],
      'tndt-jaarcongres-2026-postnl-014':[.66,.27],
      'tndt-jaarcongres-2026-postnl-019':[.51,.28],
      'tndt-jaarcongres-2026-postnl-030':[.55,.31],
      'tndt-jaarcongres-2026-postnl-031':[.48,.28],
      'tndt-jaarcongres-2026-postnl-038':[.63,.27],
      'tndt-jaarcongres-2026-postnl-044':[.61,.29],
      'tndt-jaarcongres-2026-postnl-053':[.63,.31],
      'tndt-jaarcongres-2026-postnl-082':[.54,.29],
      'tndt-jaarcongres-2026-postnl-085':[.31,.27],
      'tndt-jaarcongres-2026-postnl-094':[.58,.26],
      'tndt-jaarcongres-2026-postnl-115':[.54,.29],
      'tndt-jaarcongres-2026-postnl-130':[.57,.24],
      'tndt-jaarcongres-2026-postnl-138':[.56,.28],
      'tndt-jaarcongres-2026-postnl-164':[.60,.25],
      'tndt-jaarcongres-2026-postnl-185':[.51,.28],
      'tndt-jaarcongres-2026-postnl-193':[.49,.29],
      'tndt-jaarcongres-2026-postnl-206':[.61,.28],
      'tndt-jaarcongres-2026-postnl-208':[.61,.25],
      'tndt-jaarcongres-2026-postnl-209':[.58,.26],
      'tndt-jaarcongres-2026-postnl-215':[.58,.31],
      'tndt-jaarcongres-2026-postnl-218':[.62,.30],
      'tndt-jaarcongres-2026-postnl-219':[.42,.25],
      'tndt-jaarcongres-2026-postnl-228':[.63,.28],
      'tndt-jaarcongres-2026-postnl-235':[.54,.23],
      'tndt-jaarcongres-2026-postnl-249':[.55,.31],
      'tndt-jaarcongres-2026-postnl-250':[.60,.28],
      'tndt-jaarcongres-2026-postnl-251':[.45,.25],
      'tndt-jaarcongres-2026-postnl-258':[.62,.28],
      'tndt-jaarcongres-2026-postnl-260':[.50,.22]
    };
    var PHOTO_DRIFT_FOCUS_TARGETS = {
      'pd-tl':[.34,.44], 'pd-tr':[.66,.44],
      'pd-mr':[.68,.38],
      'pd-bl':[.34,.38], 'pd-bc':[.50,.38], 'pd-br':[.66,.38]
    };
    var PHOTO_DRIFT_FOCUS_MAX_SCALE = 1.10;
    function clamp(n,min,max){ return Math.min(max, Math.max(min, n)); }
    function weightedSources(){
      var out = [];
      Object.keys(PHOTO_DRIFT_SOURCE_WEIGHTS).forEach(function(k){
        var w = PHOTO_DRIFT_SOURCE_WEIGHTS[k], set = SOURCE_GROUPS[k];
        if (!set || !set.length || w <= 0) return;
        for (var i=0;i<w;i++) out.push(k);
      });
      return out;
    }
    var SOURCE_POOL = weightedSources();
    if (!SOURCE_POOL.length) return;
    var sourceBag = shuffle(SOURCE_POOL.slice()), si = 0, imageBags = {}, lastImg = null;
    function nextSource(){
      if (si >= sourceBag.length){ sourceBag = shuffle(SOURCE_POOL.slice()); si = 0; }
      return sourceBag[si++];
    }
    function nextFromSource(source){
      var set = SOURCE_GROUPS[source] || [];
      if (!set.length) return null;
      for (var tries=0; tries<set.length + 2; tries++){
        var bag = imageBags[source];
        if (!bag || bag.i >= bag.items.length){
          bag = imageBags[source] = { items:shuffle(set.slice()), i:0 };
        }
        var n = bag.items[bag.i++];
        if (n !== lastImg || set.length < 2) return n;
      }
      return set[0];
    }
    function nextImg(){
      var n = null;
      for (var tries=0; tries<SOURCE_POOL.length + 2 && !n; tries++) n = nextFromSource(nextSource());
      lastImg = n; return n;
    }
    function preload(name, cb){                          // DECODE before we ever fade it in → no stutter
      var im = new Image(); im.src = url(name);
      if (im.decode){ im.decode().then(cb, cb); }
      else if (im.complete){ cb(); }
      else { im.onload = cb; im.onerror = cb; }
    }

    // ── c242 · Ken Burns drift. The moment a photo becomes the visible card it eases from a hair
    // zoomed-in to flush (a ~4.5% ZOOM-OUT) over 8s, then HOLDS still for the rest of its dwell.
    // Linear + 8s on purpose: a longer, back-loaded ease left a tail so slow it crawled per pixel
    // and read as a stutter. Constant velocity over a shorter span reads as smooth motion instead.
    // Scale only ever travels DOWN toward 1, and the host clips + carries the feather mask, so the
    // block on the void never grows — only the image content inside the mask moves. Skipped under
    // reduced-motion. WAAPI so it composites on the GPU and re-arms cleanly per image (cancel → run).
    var KB_FROM = 1.045, KB_MS = 8000;
    function focusTransform(focus, zoom){
      return 'translate(' + focus.tx.toFixed(1) + 'px,' + focus.ty.toFixed(1) + 'px) scale(' + (focus.s * zoom).toFixed(4) + ')';
    }
    function resetFocus(img, name){
      img._pdFocusName = name || '';
      img._pdFocusCell = '';
      img._pdFocus = { tx:0, ty:0, s:1 };
      img.dataset.pdName = name || '';
      img.dataset.pdFocus = '0';
      img.style.objectPosition = 'center';
      img.style.transformOrigin = 'center';
      img.style.transform = focusTransform(img._pdFocus, 1);
    }
    function solveFocus(img, name, cell){
      var point = PHOTO_DRIFT_FOCUS[name], target = PHOTO_DRIFT_FOCUS_TARGETS[cell];
      if (!point || !target) return resetFocus(img, name);
      img._pdFocusName = name; img._pdFocusCell = cell;
      img.dataset.pdName = name; img.dataset.pdFocus = '1';
      var host = img.parentNode;
      var cw = host && host.clientWidth, ch = host && host.clientHeight;
      var iw = img.naturalWidth, ih = img.naturalHeight;
      if (!cw || !ch || !iw || !ih){
        resetFocus(img, name);
        img._pdFocusCell = cell || '';
        var pending = name + '|' + cell;
        img._pdFocusPending = pending;
        img.addEventListener('load', function once(){
          img.removeEventListener('load', once);
          if (img._pdFocusPending === pending) solveFocus(img, name, cell);
        }, { once:true });
        return;
      }
      var cover = Math.max(cw / iw, ch / ih), rw = iw * cover, rh = ih * cover;
      var fx = (cw - rw) / 2 + point[0] * rw;
      var fy = (ch - rh) / 2 + point[1] * rh;
      var goalX = target[0] * cw, goalY = target[1] * ch;
      var cx = cw / 2, cy = ch / 2;
      var best = null;
      for (var s = 1; s <= PHOTO_DRIFT_FOCUS_MAX_SCALE + .0001; s += .005){
        var tx = goalX - (cx + (fx - cx) * s);
        var ty = goalY - (cy + (fy - cy) * s);
        var mx = (s - 1) * cw / 2, my = (s - 1) * ch / 2;
        tx = clamp(tx, -mx, mx); ty = clamp(ty, -my, my);
        var ax = cx + (fx - cx) * s + tx;
        var ay = cy + (fy - cy) * s + ty;
        var score = Math.pow(ax - goalX, 2) + Math.pow(ay - goalY, 2) + Math.pow(s - 1, 2) * 18000;
        if (!best || score < best.score) best = { tx:tx, ty:ty, s:s, score:score };
      }
      img._pdFocus = best || { tx:0, ty:0, s:1 };
      img.style.objectPosition = 'center';
      img.style.transformOrigin = 'center';
      img.style.transform = focusTransform(img._pdFocus, 1);
    }
    function kenBurns(img){
      if (reduce || !img || !img.animate) return;
      if (img._kb){ try{ img._kb.cancel(); }catch(e){} }
      var focus = img._pdFocus || { tx:0, ty:0, s:1 };
      img._kb = img.animate(
        [{ transform: focusTransform(focus, KB_FROM) }, { transform: focusTransform(focus, 1) }],
        { duration: KB_MS, easing: 'linear', fill: 'forwards' }
      );
    }

    // the tic-tac-toe grid MINUS centre, top-centre, AND middle-left: the left text lane is sacred.
    // Allowed cells: two top corners, middle-right, and the whole bottom row.
    // c244 · on phones the sticky figure owns the TOP 54vh (its opaque void-echo would hide any top-cell
    // roamer), so keep the wash in the LOWER band where it reads behind the scrolling text — exactly
    // where the multiply type meets it. (mid-right straddles the seam, so it stays for variety.)
    var mob = window.matchMedia && window.matchMedia('(max-width: 820px)').matches;
    var CELLS = mob ? ['pd-mr','pd-bl','pd-bc','pd-br']
                    : ['pd-tl','pd-tr','pd-mr','pd-bl','pd-bc','pd-br'];

    // TWO slots so the change of guard OVERLAPS: the incoming slot fades in at a new cell while the
    // outgoing one fades out at its old cell. Each slot is a host + a two-card crossfade deck.
    function makeSlot(){
      var host = document.createElement('div');
      host.className = 'photo-drift'; host.setAttribute('aria-hidden','true');
      document.body.appendChild(host);
      host.addEventListener('transitionend', function(e){
        if(e.propertyName === 'opacity') scheduleMasks();
      });
      var a = new Image(), b = new Image();
      a.className='pd-card'; b.className='pd-card'; a.alt=''; b.alt=''; a.decoding='async'; b.decoding='async';
      a.style.zIndex='2'; b.style.zIndex='1'; host.appendChild(b); host.appendChild(a);
      var mask = document.createElement('div');
      mask.className = 'pd-mask-layer';
      host.appendChild(mask);
      return { host:host, top:a, under:b, mask:mask, cyc:0 };
    }
    var slotA = makeSlot(), slotB = makeSlot(), active = null;

    // Text protection is drawn INSIDE each carousel host, not on the page itself.
    // So the real void is never painted over; only carousel pixels get blanked.
    var maskQueued = false;
    function visibleRect(r){
      if(!r || r.width <= 0 || r.height <= 0) return false;
      var visibleY = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      var visibleX = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
      return visibleY >= 18 && visibleX >= 18;
    }
    function overlapEnough(a,b){
      var w = Math.min(a.right,b.right) - Math.max(a.left,b.left);
      var h = Math.min(a.bottom,b.bottom) - Math.max(a.top,b.top);
      return w >= 12 && h >= 12 && (w * h) >= 260;
    }
    function subtractRect(rect, cut){
      if(!cut || cut.r <= rect.l || cut.l >= rect.r || cut.b <= rect.t || cut.t >= rect.b) return [rect];
      var out = [];
      var ix1 = Math.max(rect.l, cut.l), ix2 = Math.min(rect.r, cut.r);
      var iy1 = Math.max(rect.t, cut.t), iy2 = Math.min(rect.b, cut.b);
      if(cut.t > rect.t) out.push({l:rect.l,t:rect.t,r:rect.r,b:iy1});
      if(cut.b < rect.b) out.push({l:rect.l,t:iy2,r:rect.r,b:rect.b});
      if(cut.l > rect.l) out.push({l:rect.l,t:iy1,r:ix1,b:iy2});
      if(cut.r < rect.r) out.push({l:ix2,t:iy1,r:rect.r,b:iy2});
      return out.filter(function(r){ return r.r - r.l > 4 && r.b - r.t > 4; });
    }
    function addMaskPart(mask, rect, radius, kind){
      var m = document.createElement('span');
      m.className = 'pd-mask' + (kind ? ' ' + kind : '');
      m.style.left = rect.l + 'px';
      m.style.top = rect.t + 'px';
      m.style.width = (rect.r - rect.l) + 'px';
      m.style.height = (rect.b - rect.t) + 'px';
      m.style.setProperty('--pd-mask-radius', radius + 'px');
      mask.appendChild(m);
    }
    function addMask(mask, hostRect, targetRect, pad, radius, cutout, kind){
      var rect = {
        l: Math.max(0, targetRect.left - hostRect.left - pad.l),
        t: Math.max(0, targetRect.top - hostRect.top - pad.t),
        r: Math.min(hostRect.width, targetRect.right - hostRect.left + pad.r),
        b: Math.min(hostRect.height, targetRect.bottom - hostRect.top + pad.b)
      };
      if (rect.l >= rect.r || rect.t >= rect.b) return;
      subtractRect(rect, cutout).forEach(function(part){ addMaskPart(mask, part, radius, kind); });
    }
    function updateMaskFor(slot){
      if(!slot || !slot.host || !slot.mask) return;
      var hostRect = slot.host.getBoundingClientRect();
      slot.mask.innerHTML = '';
      if(hostRect.width <= 0 || hostRect.height <= 0) return;
      var cutout = null, sb = document.getElementById('sb');
      if(sb){
        var scs = getComputedStyle(sb), sr = sb.getBoundingClientRect();
        if(scs.display !== 'none' && sr.width > 0 && sr.height > 0){
          // Do not draw expensive text-frost underneath the sidebar's own backdrop blur.
          // Expand by roughly the mask glow, so no hidden feather leaks under the panel.
          var bleed = 30;
          cutout = {
            l: sr.left - hostRect.left - bleed,
            t: sr.top - hostRect.top - bleed,
            r: sr.right - hostRect.left + bleed,
            b: sr.bottom - hostRect.top + bleed
          };
        }
      }
      var bodyPad = {t:96,r:92,b:96,l:92};
      var headPad = {t:220,r:660,b:34,l:148};
      function actuallyVisible(r){
        return visibleRect(r);
      }
      Array.prototype.slice.call(document.querySelectorAll('.pd-grp,.fw-body,.appendix .apx-col')).forEach(function(el){
        var r = el.getBoundingClientRect();
        if(!actuallyVisible(r)) return;
        addMask(slot.mask, hostRect, r, bodyPad, 64, cutout);
      });
      if(!slot.host.classList.contains('pd-tr')){
        Array.prototype.slice.call(document.querySelectorAll('.phead h2')).forEach(function(el){
          var r = el.getBoundingClientRect();
          if(!actuallyVisible(r)) return;
          addMask(slot.mask, hostRect, r, headPad, 56, cutout, 'pd-mask-head');
        });
      }
    }
    function updateTextContrast(){
      var photoRects = [slotA,slotB].map(function(slot){
        if(!slot || !slot.host) return null;
        var cs = getComputedStyle(slot.host);
        var opacity = parseFloat(cs.opacity || '0');
        var activeish = slot.host.classList.contains('in') || slot.host.classList.contains('pd-page-exit') || opacity > .08;
        if(!activeish || cs.display === 'none') return null;
        var r = slot.host.getBoundingClientRect();
        return visibleRect(r) ? r : null;
      }).filter(Boolean);
      var targets = Array.prototype.slice.call(document.querySelectorAll(
        '.pd-grp,.fw-body,.appendix .apx-col,.phead h2,.phead .meta,.mast .kick,.mast h1,.mast p,.mast .hint'
      ));
      targets.forEach(function(el){
        var r = el.getBoundingClientRect();
        var hit = visibleRect(r) && photoRects.some(function(pr){ return overlapEnough(r, pr); });
        el.classList.toggle('pd-over-photo', !!hit);
      });
    }
    function updateMasks(){ maskQueued = false; updateMaskFor(slotA); updateMaskFor(slotB); updateTextContrast(); }
    function scheduleMasks(){
      if(maskQueued) return;
      maskQueued = true;
      requestAnimationFrame(updateMasks);
    }
    window.addEventListener('scroll', scheduleMasks, {passive:true});
    function refocusSlot(slot){
      if(!slot) return;
      [slot.top, slot.under].forEach(function(img){
        if(img && img._pdFocusName) solveFocus(img, img._pdFocusName, img._pdFocusCell || slot.cell);
      });
    }
    window.addEventListener('resize', function(){ refocusSlot(slotA); refocusSlot(slotB); scheduleMasks(); });
    setTimeout(scheduleMasks, 0);

    // ── suppression: the roamer never shares the screen with a FOTO front-image or a quote overlay ──
    var anyPhoto = false;
    var fotos = [].slice.call(document.querySelectorAll('.imgph.has-img'));
    if (fotos.length){
      var seen = new Set();
      var fio = new IntersectionObserver(function(es){
        es.forEach(function(e){ if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); });
        anyPhoto = seen.size > 0; reactGate();
      }, { threshold: 0, rootMargin: '-6% 0px -6% 0px' });
      fotos.forEach(function(f){ fio.observe(f); });
    }
    function quoteActive(){ var q = document.getElementById('quote-layer'); return !!(q && q.classList.contains('is-active') && q.innerHTML); }
    function blocked(){ return anyPhoto || quoteActive(); }

    var CELL_POS = {
      'pd-tl':[0,0], 'pd-tr':[2,0],
      'pd-ml':[0,1], 'pd-mr':[2,1],
      'pd-bl':[0,2], 'pd-bc':[1,2], 'pd-br':[2,2]
    };
    function adjacentCell(a,b){
      if(!a||!b)return false;
      var pa=CELL_POS[a], pb=CELL_POS[b]; if(!pa||!pb)return false;
      return Math.abs(pa[0]-pb[0]) + Math.abs(pa[1]-pb[1]) === 1;
    }
    var lastCell = null, state = 'run', chapterHandoff = false, handoffSlots = [];
    function pickCell(){
      var pool = CELLS.filter(function(c){ return c !== lastCell && !adjacentCell(c,lastCell); });
      if(!pool.length) pool = CELLS.filter(function(c){ return c !== lastCell; });
      var c = pool[Math.floor(Math.random()*pool.length)];
      lastCell = c;
      return c;
    }
    function leave(slot){ if (!slot) return; if (slot.cyc){ clearTimeout(slot.cyc); slot.cyc = 0; } slot.host.classList.remove('in'); }
    function visibleSlots(){
      return [slotA,slotB].filter(function(s){ return s && s.host && s.host.classList.contains('in'); });
    }
    window.addEventListener('factsheet:section-handoff', function(e){
      var d = (e && e.detail) || {};
      if(d.phase === 'start'){
        chapterHandoff = true;
        handoffSlots = visibleSlots();
        handoffSlots.forEach(function(s){
          if(s.cyc){ clearTimeout(s.cyc); s.cyc = 0; }
          s.host.classList.add('pd-page-exit');
          s.host.style.translate = '0 0';
        });
        return;
      }
      if(!chapterHandoff) return;
      if(d.phase === 'update'){
        var y = Math.min(0, Math.max(-window.innerHeight * 1.15, d.offsetY || 0));
        handoffSlots.forEach(function(s){ s.host.style.translate = '0 ' + y + 'px'; });
        scheduleMasks();
        return;
      }
      if(d.phase === 'cancel'){
        handoffSlots.forEach(function(s){
          s.host.style.translate = '';
          s.host.classList.remove('pd-page-exit');
        });
        handoffSlots = [];
        chapterHandoff = false;
        return;
      }
      if(d.phase === 'end'){
        var retiring = handoffSlots.slice();
        retiring.forEach(function(s){ leave(s); });
        active = null;
        setTimeout(function(){
          retiring.forEach(function(s){
            s.host.style.translate = '';
            s.host.classList.remove('pd-page-exit');
          });
          handoffSlots = [];
          chapterHandoff = false;
          if(state === 'run' && !blocked()) setTimeout(function(){ advance(null); }, 350);
        }, 520);
      }
    });

    // crossfade ONE image to the next within a slot (deck-of-cards; the next is decoded first → smooth)
    function crossfade(slot, name, done){
      preload(name, function(){
        if (state !== 'run' || chapterHandoff || active !== slot) return;
        slot.under.src = url(name);
        solveFocus(slot.under, name, slot.cell);
        kenBurns(slot.under);                              // the primed card starts its zoom-out before it surfaces
        var settled = false;
        function settle(){
          if (settled) return; settled = true;
          slot.top.removeEventListener('transitionend', settle);
          slot.under.style.zIndex='2'; slot.top.style.zIndex='1';
          slot.top.classList.remove('pd-out'); slot.top.style.opacity='1';
          void slot.top.offsetWidth;
          var t = slot.top; slot.top = slot.under; slot.under = t;   // swap — the primed card is now top
          if (done) done();
        }
        slot.top.classList.add('pd-out');
        slot.top.addEventListener('transitionend', settle);
        requestAnimationFrame(function(){ requestAnimationFrame(function(){ slot.top.style.opacity='0'; }); });
        setTimeout(settle, 3200);                          // fallback > the (doubled) crossfade duration
      });
    }

    // ONE pass of a few distinct images in this slot (no looping in place), then hand off
    function runCycle(slot, onDone){
      var shows = 2 + Math.floor(Math.random()*2);         // 2 or 3 images, shown once
      var n = 1;
      function step(){
        if (state !== 'run' || chapterHandoff || active !== slot) return;
        if (n >= shows){ onDone(); return; }
        crossfade(slot, nextImg(), function(){ n++; slot.cyc = setTimeout(step, 6500 + Math.random()*3500); });
      }
      slot.cyc = setTimeout(step, 6500 + Math.random()*3500);   // doubled dwell per slide
    }

    // bring a fresh slot IN at a new cell; fade `prev` OUT at the same moment (the overlapping handoff)
    function advance(prev){
      if (state !== 'run' || chapterHandoff) return;
      var slot = (active === slotA) ? slotB : slotA;
      var cell = pickCell(), first = nextImg();
      slot.cell = cell;
      slot.host.className = 'photo-drift ' + cell;          // reposition while invisible (no slide)
      scheduleMasks();
      preload(first, function(){
        if (state !== 'run' || chapterHandoff) return;
        slot.top.src = url(first); slot.top.style.opacity='1'; slot.top.style.zIndex='2'; slot.under.style.zIndex='1';
        solveFocus(slot.top, first, cell);
        kenBurns(slot.top);                                // first image of this slot: zoom-out as it fades in
        void slot.host.offsetWidth;
        scheduleMasks();
        slot.host.classList.add('in');                      // fade IN …
        if (prev && prev !== slot) leave(prev);             // … while the old one fades OUT (overlap)
        active = slot;
        if (reduce) return;                                 // reduced motion: hold one impression, no cycling
        runCycle(slot, function(){ advance(slot); });
      });
    }

    // gate: pause (hide both, drop timers) while a FOTO/quote is up; resume on a clear screen
    function reactGate(){
      if (chapterHandoff) return;
      if (blocked()){
        if (state !== 'pause'){ state = 'pause'; leave(slotA); leave(slotB); active = null; }
      } else if (state !== 'run'){
        state = 'run'; advance(null);
      }
    }
    setInterval(reactGate, 300);                            // also catches quote overlays (no observer of their own)

    if (blocked()) state = 'pause';
    setTimeout(function(){ if (state === 'run') advance(null); }, 1100);   // first appearance once settled
  }catch(e){ /* decorative — never break the page */ }
})();

// ── c244 · mobile segment breadcrumb ─────────────────────────────────────────────────────────
// Phones hide BOTH the sidebar and the dot-nav (≤820px). Instead of a scroll-progress hairline (which
// only told you how far through the WHOLE deck you were), a row of dots at the top tells you how far
// through the CURRENT chapter's subsections you are: one dot per beat, filled up to and emphasising the
// active beat. Beat-less stretches (hero, award interludes, colofon) carry no dots and the row fades out.
// It piggybacks on the reading engine's own `.active` beat flag, so it stays in lock-step with the snap.
// Always built; CSS shows it only on phones. rAF-throttled + passive — it can't cost a frame.
(function(){
  try{
    var host = document.createElement('div'); host.className = 'mbc'; host.setAttribute('aria-hidden','true');
    document.body.appendChild(host);
    var SEGS = null;                                   // de-duped chapter pages that run the reading engine
    function segments(){
      var roots = [].slice.call(document.querySelectorAll('.scrolly, .read-frame, .read-col')), pages = [];
      roots.forEach(function(r){ var pg = r.closest('.page') || r; if (pages.indexOf(pg) < 0) pages.push(pg); });
      return pages;
    }
    function beatsOf(page){
      return [].slice.call(page.querySelectorAll('.act:not(.quote-step)'))
        .filter(function(b){ return b.getClientRects().length; });   // only the visible subsection beats
    }
    var lastKey = '', ticking = false;
    function paint(){
      ticking = false;
      if (!SEGS) SEGS = segments();
      var line = window.innerHeight * 0.5, cur = null;               // the chapter the reading line sits in
      for (var i = 0; i < SEGS.length; i++){ var r = SEGS[i].getBoundingClientRect(); if (r.top <= line && r.bottom > line){ cur = SEGS[i]; break; } }
      if (!cur){ host.classList.remove('show'); lastKey = ''; return; }
      var beats = beatsOf(cur);
      if (beats.length < 2){ host.classList.remove('show'); lastKey = ''; return; }
      var act = -1;                                                   // engine-driven active beat
      for (var j = 0; j < beats.length; j++) if (beats[j].classList.contains('active')){ act = j; break; }
      if (act < 0){                                                   // fallback: nearest to the reading line
        var vc = window.innerHeight * 0.62, bd = 1e9;
        for (var k = 0; k < beats.length; k++){ var rr = beats[k].getBoundingClientRect(), c = rr.top + rr.height / 2, d = Math.abs(c - vc); if (d < bd){ bd = d; act = k; } }
      }
      var key = (cur.id || '') + '|' + beats.length + '|' + act;
      if (key !== lastKey){
        lastKey = key;
        if (host.childNodes.length !== beats.length){
          host.innerHTML = '';
          for (var n = 0; n < beats.length; n++){ var dot = document.createElement('span'); dot.className = 'mbc-dot'; host.appendChild(dot); }
        }
        for (var m = 0; m < host.childNodes.length; m++)
          host.childNodes[m].className = 'mbc-dot' + (m < act ? ' done' : '') + (m === act ? ' now' : '');
      }
      host.classList.add('show');
    }
    addEventListener('scroll', function(){ if (!ticking){ ticking = true; requestAnimationFrame(paint); } }, { passive:true });
    addEventListener('resize', function(){ SEGS = null; lastKey = ''; paint(); });
    paint(); setTimeout(paint, 400); setTimeout(paint, 1500);          // catch late font/image reflow
  }catch(e){ /* wayfinding nicety — never break the page */ }
})();

// ── c243 · mixed scroll-snap classifier (phones) ────────────────────────────────────────────
// CSS scroll-snap-type is container-global, so "cards snap firmly, long text snaps gently" can't be
// expressed per-element in CSS alone. This measures every beat against the LIVE viewport and tags it:
//   .snap-card  a discrete card (figure / recap tile) that fits the screen → align:start + stop:always
//   .snap-flow  prose, or a passage taller than the screen → align:start + stop:normal (flingable)
//   .snap-tall  (+ on a too-tall beat) generous top/bottom room so a card-snap can't yank a long read
// Re-runs on resize / orientation / late font reflow, and strips the tags off ≥821px so a resize back
// to desktop is clean. Awards + chapter heads are start-aligned in CSS; empty quote-step shells skip.
(function(){
  try{
    var mq = window.matchMedia ? window.matchMedia('(max-width: 820px)') : null;
    // The snap targets are the BEATS (text steps/acts) and the discrete tiles. The figure cards are
    // sticky on phones (they pin and morph per beat) so they are NEVER snap targets — each beat plus
    // the figure-state it drives is one composed frame, and snapping the beat composes the frame.
    var BEAT_SEL = '.scrolly .step, .read-col .act, .live-stage > .live-bento:not(.award-bento), .live-stage .brow';
    function strip(el){ el.classList.remove('snap-card','snap-flow','snap-tall'); }
    function classify(){
      var on = !mq || mq.matches;
      var vh = window.innerHeight || 800, fit = vh * 0.9;
      // re-query every run — beats/tiles can be created or removed by section reflows after load
      [].slice.call(document.querySelectorAll(BEAT_SEL)).forEach(function(el){
        strip(el); if(!on) return;
        if(el.matches('.quote-step[data-phase="exit"]')) return; // forward-only quote shells: never a stop
        var h = el.offsetHeight;
        if(h < vh * 0.16) return;                                // collapsed / empty beats
        if((el.textContent || '').trim().length < 12 && !el.querySelector('img,canvas,svg,.imgph')) return;
        if(h <= fit) el.classList.add('snap-card');              // fits → firm composed frame, can't be flung past
        else el.classList.add('snap-flow','snap-tall');          // taller than screen → gentle, no trap
      });
    }
    var t;
    function schedule(){ clearTimeout(t); t = setTimeout(classify, 160); }
    window.__snapReclass = schedule;                             // section reflows call this after restructuring
    classify();
    addEventListener('load', schedule);
    addEventListener('resize', schedule);
    addEventListener('orientationchange', schedule);
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  }catch(e){ /* snap is an enhancement — never break the page */ }
})();
// Page-to-page slide: scrollytell is left of the login screen. The fixed void
// stays in place and only its color variables animate toward the next page.
(function(){
  var KEY = 'tttRouteTransition';
  var DURATION = 520;
  var LOGIN_VOID = ['#e2ecf2', '#d1e2ed', '#eff4f8'];
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function readIntent(){
    try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); }
    catch (e) { return null; }
  }

  function writeIntent(to){
    try { sessionStorage.setItem(KEY, JSON.stringify({ from: 'scrollytell', to: to })); }
    catch (e) {}
  }

  function clearIntent(){
    try { sessionStorage.removeItem(KEY); }
    catch (e) {}
  }

  function getFloor(){
    return document.querySelector('#void-deck .void-floor');
  }

  function setFloor(colors){
    var floor = getFloor();
    if (!floor) return null;
    floor.style.setProperty('--void-a', colors[0]);
    floor.style.setProperty('--void-b', colors[1]);
    floor.style.setProperty('--void-c', colors[2]);
    return floor;
  }

  function clearFloor(floor){
    if (!floor) return;
    floor.style.removeProperty('--void-a');
    floor.style.removeProperty('--void-b');
    floor.style.removeProperty('--void-c');
  }

  function animateVoidFromLogin(){
    var floor = setFloor(LOGIN_VOID);
    if (!floor) {
      setTimeout(animateVoidFromLogin, 40);
      return;
    }
    floor.style.transition = 'none';
    void floor.offsetWidth;
    floor.style.transition = '';
    requestAnimationFrame(function(){
      clearFloor(floor);
    });
  }

  function setup(){
    var root = document.documentElement;
    var intent = readIntent();

    if (intent && intent.to === 'scrollytell') {
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
      window.scrollTo(0, 0);
      if (reduceMotion) {
        clearIntent();
      } else {
        root.classList.add('route-transitioning', 'route-enter-from-login');
        animateVoidFromLogin();
        setTimeout(function(){
          root.classList.remove('route-transitioning', 'route-enter-from-login');
          clearIntent();
        }, DURATION + 120);
      }
    }

    document.addEventListener('click', function(e){
      var link = e.target.closest && e.target.closest('[data-route-transition="login"]');
      if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      e.preventDefault();
      writeIntent('login');

      window.location.href = link.href;
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
