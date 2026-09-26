(function(){
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap=!!window.gsap;
  if(hasGsap) gsap.registerPlugin(ScrollTrigger);

  // Inertial smooth scrolling, kept in sync with ScrollTrigger.
  let lenis=null;
  if(hasGsap && window.Lenis && !reduceMotion){
    lenis=new Lenis({duration:1.15,smoothWheel:true});
    lenis.on('scroll',ScrollTrigger.update);
    gsap.ticker.add(t=>lenis.raf(t*1000));
    gsap.ticker.lagSmoothing(0);
  }

  document.querySelectorAll('a[href^="#"]').forEach(link=>{
    link.addEventListener('click',e=>{
      const target=document.querySelector(link.getAttribute('href'));
      if(!target) return;
      e.preventDefault();
      if(lenis) lenis.scrollTo(target,{duration:1.4});
      else target.scrollIntoView({behavior:'smooth',block:'start'});
    });
  });

  // Nav switches between light and dark styling depending on the section under it.
  const themed=[...document.querySelectorAll('[data-nav]')].filter(el=>el!==document.body);
  function updateNav(){
    let theme='light';
    for(const s of themed){
      const r=s.getBoundingClientRect();
      if(r.top<=40 && r.bottom>40){theme=s.dataset.nav;break;}
    }
    document.body.dataset.nav=theme;
  }
  window.addEventListener('scroll',updateNav,{passive:true});
  updateNav();

  // Videos only run while they are on screen.
  function whileVisible(el,onIn,onOut){
    new IntersectionObserver(([entry])=>entry.isIntersecting?onIn():onOut()).observe(el);
  }
  const heroVideo=document.querySelector('.p-hero-video');
  let heroInView=true;
  if(heroVideo){
    // The film plays once and then holds its final product shot.
    const resumeHero=()=>{if(heroInView && !heroVideo.ended) heroVideo.play().catch(()=>{});};
    whileVisible(heroVideo.closest('.p-hero'),()=>{heroInView=true;resumeHero();},()=>{heroInView=false;heroVideo.pause();});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden) resumeHero();});
  }
  document.querySelectorAll('.next video').forEach(v=>{
    whileVisible(v.closest('.next'),()=>{
      if(!v.getAttribute('src')) v.src=v.dataset.src;
      v.play().catch(()=>{});
    },()=>v.pause());
  });

  // Viewer: the product film with sound, or a gallery image at full size.
  const viewer=document.getElementById('viewer');
  const viewerBody=viewer.querySelector('.viewer-body');
  const viewerClose=viewer.querySelector('.viewer-close');
  let opener=null;
  function openViewer(node,from){
    viewerBody.replaceChildren(node);
    viewer.hidden=false;
    opener=from;
    if(lenis) lenis.stop();
    viewerClose.focus();
  }
  function closeViewer(){
    const v=viewerBody.querySelector('video');
    if(v) v.pause();
    viewerBody.replaceChildren();
    viewer.hidden=true;
    if(lenis) lenis.start();
    if(opener) opener.focus();
  }
  document.querySelectorAll('[data-film]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const v=document.createElement('video');
      v.src=btn.dataset.film;
      v.controls=true;
      v.playsInline=true;
      openViewer(v,btn);
      v.play().catch(()=>{});
    });
  });
  document.querySelectorAll('[data-image]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const img=document.createElement('img');
      img.src=btn.dataset.image;
      img.alt=btn.querySelector('img').alt;
      openViewer(img,btn);
    });
  });
  viewer.addEventListener('click',e=>{if(e.target===viewer || e.target===viewerBody) closeViewer();});
  viewerClose.addEventListener('click',closeViewer);
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && !viewer.hidden) closeViewer();});

  // Gallery arrows (hidden when everything already fits).
  const track=document.querySelector('.gallery-track');
  if(track){
    const nav=document.querySelector('.gallery-nav');
    const sync=()=>{nav.hidden=track.scrollWidth<=track.clientWidth+4;};
    track.querySelectorAll('img').forEach(img=>img.addEventListener('load',sync));
    window.addEventListener('resize',sync);
    sync();
    document.querySelectorAll('[data-gallery]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        track.scrollBy({left:Number(btn.dataset.gallery)*track.clientWidth*.7,behavior:'smooth'});
      });
    });
  }

  if(!hasGsap || reduceMotion) return;

  // Intro
  gsap.timeline({defaults:{ease:'expo.out'}})
    .from('.nav',{y:-30,opacity:0,duration:1},.1)
    .from('.p-title .ln>span',{yPercent:115,duration:1.2},.25)
    .from('.p-hero-copy .back-link,.p-hero-copy .badge',{opacity:0,y:12,duration:.9,stagger:.06},.3)
    .from('.p-lead',{opacity:0,y:16,duration:.9},.45)
    .from('.p-actions>*',{opacity:0,y:16,duration:.9,stagger:.08},.55)
    .from('.p-facts li',{opacity:0,x:20,duration:.9,stagger:.08},.6);

  // The hero drifts away as you scroll past it.
  gsap.timeline({scrollTrigger:{trigger:'.p-hero',start:'top top',end:'bottom top',scrub:true}})
    .to('.p-hero-video',{scale:1.12,ease:'none'},0)
    .to('.p-hero-copy,.p-facts',{y:-80,opacity:0,ease:'none'},0);

  gsap.from('.details-title .ln>span',{
    yPercent:115,duration:1.2,ease:'expo.out',stagger:.09,
    scrollTrigger:{trigger:'.details',start:'top 75%'}
  });
  gsap.utils.toArray('.spec-row').forEach(row=>{
    gsap.from(row,{opacity:0,y:40,duration:1,ease:'expo.out',scrollTrigger:{trigger:row,start:'top 88%'}});
  });
  gsap.from('.gallery-title',{opacity:0,y:30,duration:1,ease:'expo.out',scrollTrigger:{trigger:'.gallery',start:'top 75%'}});
  gsap.from('.g-item',{opacity:0,x:80,duration:1.1,ease:'expo.out',stagger:.08,scrollTrigger:{trigger:'.gallery',start:'top 70%'}});
  gsap.from('.next-name',{yPercent:40,opacity:0,duration:1.2,ease:'expo.out',scrollTrigger:{trigger:'.next',start:'top 70%'}});

  gsap.timeline({scrollTrigger:{trigger:'.contact-inner',start:'top 75%'},defaults:{ease:'expo.out'}})
    .from('.contact .badge',{opacity:0,y:12,duration:.9},0)
    .from('.contact-title .ln>span',{yPercent:115,duration:1.2,stagger:.09},.05)
    .from('.contact-lead',{opacity:0,y:16,duration:.9},.3)
    .from('.contact-actions>*',{opacity:0,y:16,duration:.9,stagger:.08},.4)
    .from('.c-card',{opacity:0,y:40,duration:1,stagger:.1},.2);
  gsap.from('.footer-mark',{yPercent:40,opacity:0,duration:1.4,ease:'expo.out',scrollTrigger:{trigger:'.footer-bar',start:'top 95%'}});

  // Cursor follower (mouse devices only).
  if(matchMedia('(hover:hover) and (pointer:fine)').matches){
    const cursor=document.querySelector('.cursor');
    const cx=gsap.quickTo(cursor,'x',{duration:.35,ease:'power3'});
    const cy=gsap.quickTo(cursor,'y',{duration:.35,ease:'power3'});
    window.addEventListener('mousemove',e=>{cx(e.clientX);cy(e.clientY);cursor.style.opacity=1;});
    document.addEventListener('mouseleave',()=>{cursor.style.opacity=0;});
    document.querySelectorAll('a,button').forEach(el=>{
      el.addEventListener('mouseenter',()=>cursor.classList.add('is-hover'));
      el.addEventListener('mouseleave',()=>cursor.classList.remove('is-hover'));
    });
  }
})();
